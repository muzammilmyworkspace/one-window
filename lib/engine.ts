import { all, batch, getKv, lease, one, release, run, setKv } from './db'
import { dailyCapacity, deliver, noteError, noteOk, pickProvider } from './providers'
import { allowedBy } from './plan'
import { renderEmail } from './email'
import { getSettings, isLive } from './settings'
import { preflight } from './preflight'
import { imapConfigured, syncInbox } from './inbox'

const INBOX_EVERY = 2 * 60 * 1000
const DAY = 24 * 3600 * 1000
export const SAFETY = { bounce: 0.05, minBounce: 50, complaint: 0.003, minComplaint: 100, ackStep: 3 }

function audience(c: { states?: unknown; follow_up_of?: unknown }) {
  const states = String(c.states || '').split(',').filter(Boolean)
  const args: (string | number)[] = []
  let where = "c.status = 'active'"
  if (states.length) { where += ` AND c.state IN (${states.map(() => '?').join(',')})`; args.push(...states) }
  if (c.follow_up_of) {
    where += ' AND c.id IN (SELECT contact_id FROM sends WHERE campaign_id = ? AND sent_at IS NOT NULL AND replied_at IS NULL AND bounced_at IS NULL)'
    args.push(Number(c.follow_up_of))
  }
  return { where, args }
}
export async function audienceCount(c: { states?: unknown; follow_up_of?: unknown }): Promise<number> {
  const { where, args } = audience(c)
  return Number((await one<{ n: number }>(`SELECT COUNT(*) n FROM contacts c WHERE ${where}`, args))?.n || 0)
}

/** Moves a draft into the queue: everyone it applies to gets one queued row. */
export async function startCampaign(id: number): Promise<number> {
  const c = await one('SELECT * FROM campaigns WHERE id = ?', [id])
  if (!c || c.status !== 'draft') throw new Error('Only a draft can be started')
  if (isLive()) {
    const blocked = (await preflight()).find((x) => x.blocking && !x.ok)
    if (blocked) throw new Error(`${blocked.label}: ${blocked.help}`)
  }
  const { where, args } = audience(c)
  const r = await run(`INSERT OR IGNORE INTO sends (campaign_id, contact_id, email) SELECT ?, c.id, c.email FROM contacts c WHERE ${where}`, [id, ...args])
  if (!r.changes) throw new Error('Nobody matches this campaign')
  await run("UPDATE campaigns SET status = 'running', started_at = ? WHERE id = ?", [Date.now(), id])
  return r.changes
}

export interface TickResult { sent: number; running: boolean; waiting?: 'gap' | 'busy' | 'caps' | 'batch'; inbox?: number }

/** One step of the engine: send at most one email, and now and then read the inbox. */
export async function tick(): Promise<TickResult> {
  const out: TickResult = { sent: 0, running: false }
  try {
    const last = Number((await getKv('inbox_last')) || 0)
    if (imapConfigured() && Date.now() - last > INBOX_EVERY) {
      await setKv('inbox_last', String(Date.now()))
      out.inbox = (await syncInbox()).added
    }
  } catch { /* the error is kept and shown in the Inbox */ }

  const settings = await getSettings()
  const gap = Math.max(1, Number(settings.gap_seconds) || 30) * 1000
  if (isLive() && Date.now() - Number((await getKv('last_sent')) || 0) < gap) {
    out.running = !!(await one("SELECT 1 x FROM campaigns WHERE status = 'running' LIMIT 1"))
    out.waiting = 'gap'
    return out
  }

  if (!(await lease('send_lock', 60000))) { out.running = true; out.waiting = 'busy'; return out }
  try {
    // we hold the only lease, so a row still marked 'sending' was left by a crash
    await run("UPDATE sends SET status = 'queued' WHERE status = 'sending'")

    await safetyStop()
    const held = await heldForBatch()

    const next = await one(`SELECT s.id, s.contact_id, s.attempts, ct.email, ct.first_name, ct.last_name, ct.state, ct.status contact_status,
        cp.subject, cp.html, cp.preheader
      FROM sends s JOIN campaigns cp ON cp.id = s.campaign_id JOIN contacts ct ON ct.id = s.contact_id
      WHERE s.status = 'queued' AND cp.status = 'running'${held.length ? ` AND cp.id NOT IN (${held.join(',')})` : ''} ORDER BY cp.started_at, s.id LIMIT 1`)
    if (!next) {
      await run(`UPDATE campaigns SET status = 'completed', completed_at = ? WHERE status = 'running'
        AND NOT EXISTS (SELECT 1 FROM sends s WHERE s.campaign_id = campaigns.id AND s.status = 'queued')`, [Date.now()])
      if (held.length) { out.running = true; out.waiting = 'batch' }
      return out
    }
    out.running = true

    if (next.contact_status !== 'active') {
      await run("UPDATE sends SET status = 'skipped', last_error = ? WHERE id = ?", [`Contact ${next.contact_status}`, next.id])
      return out
    }
    const provider = await pickProvider()
    if (!provider) { out.waiting = 'caps'; return out }

    const domain = settings.from_email.split('@')[1] || 'localhost'
    const messageId = `<${crypto.randomUUID()}@${domain}>`
    await run("UPDATE sends SET status = 'sending', attempts = attempts + 1 WHERE id = ?", [next.id])
    try {
      const mail = await renderEmail({ subject: next.subject, html: next.html, preheader: next.preheader }, next as never, settings)
      await deliver(provider.name, { from: `"${settings.from_name}" <${settings.from_email}>`, to: next.email, replyTo: settings.reply_to, messageId, ...mail })
      await run("UPDATE sends SET status = 'sent', provider = ?, message_id = ?, sent_at = ?, last_error = NULL WHERE id = ?", [provider.name, messageId, Date.now(), next.id])
      await noteOk(provider.name)
      await setKv('last_sent', String(Date.now()))
      out.sent = 1
    } catch (e) {
      const err = e as Error & { responseCode?: number }
      const code = err.responseCode || 0
      if (code >= 550 && code < 560 && /user|mailbox|recipient|address|exist|unknown/i.test(err.message)) {
        await batch([
          { sql: "UPDATE sends SET status = 'failed', provider = ?, last_error = ?, bounced_at = ? WHERE id = ?", args: [provider.name, err.message.slice(0, 300), Date.now(), next.id] },
          { sql: "UPDATE contacts SET status = 'bounced' WHERE id = ?", args: [next.contact_id] },
        ])
      } else {
        const giveUp = Number(next.attempts) + 1 >= 3
        await run('UPDATE sends SET status = ?, provider = ?, last_error = ? WHERE id = ?', [giveUp ? 'failed' : 'queued', provider.name, err.message.slice(0, 300), next.id])
        await noteError(provider.name, err.message)
      }
    }
    return out
  } finally {
    await release('send_lock')
  }
}

/** Warm-up campaigns that have finished today's batch and wait for the next one. */
async function heldForBatch(): Promise<number[]> {
  const rows = await all(`SELECT c.id, c.started_at, (SELECT COUNT(*) FROM sends s WHERE s.campaign_id = c.id AND s.sent_at IS NOT NULL) sent
    FROM campaigns c WHERE c.status = 'running' AND c.warmup = 1`)
  if (!rows.length) return []
  const capacity = await dailyCapacity()
  return rows.filter((r) => Number(r.sent) >= allowedBy(Math.floor((Date.now() - Number(r.started_at)) / DAY), capacity)).map((r) => Number(r.id))
}

/** A list going bad hurts the domain for good, so a running campaign stops itself in time. */
async function safetyStop() {
  const rows = await all(`SELECT c.id, c.safety_ack,
      SUM(s.sent_at IS NOT NULL) sent, SUM(s.bounced_at IS NOT NULL) bounced, SUM(s.complained_at IS NOT NULL) complained
    FROM campaigns c JOIN sends s ON s.campaign_id = c.id WHERE c.status = 'running' GROUP BY c.id`)
  for (const r of rows) {
    const sent = Number(r.sent), bounced = Number(r.bounced), complained = Number(r.complained)
    if (bounced + complained < Number(r.safety_ack) + SAFETY.ackStep) continue
    let reason = ''
    if (sent >= SAFETY.minBounce && bounced / sent > SAFETY.bounce) reason = `Paused automatically: ${bounced} of ${sent} emails bounced, over the ${SAFETY.bounce * 100}% safety limit.`
    if (sent >= SAFETY.minComplaint && complained / sent > SAFETY.complaint) reason = `Paused automatically: ${complained} of ${sent} people marked this as spam, over the ${SAFETY.complaint * 100}% safety limit.`
    if (reason) await run("UPDATE campaigns SET status = 'paused', pause_reason = ? WHERE id = ?", [reason, Number(r.id)])
  }
}

export async function campaignStats(id?: number) {
  const r = await one(`SELECT COUNT(*) total,
    SUM(status IN ('queued','sending')) queued,
    SUM(sent_at IS NOT NULL) sent,
    SUM(delivered_at IS NOT NULL) delivered,
    SUM(opened_at IS NOT NULL) opened,
    SUM(replied_at IS NOT NULL) replied,
    SUM(bounced_at IS NOT NULL) bounced,
    SUM(complained_at IS NOT NULL) complained,
    SUM(status = 'failed') failed,
    SUM(status = 'skipped') skipped
    FROM sends ${id ? 'WHERE campaign_id = ?' : ''}`, id ? [id] : [])
  const n = (k: string) => Number(r?.[k] || 0)
  return { total: n('total'), queued: n('queued'), sent: n('sent'), delivered: n('delivered'), opened: n('opened'), replied: n('replied'), bounced: n('bounced'), complained: n('complained'), failed: n('failed'), skipped: n('skipped') }
}

/** Back in the queue: everyone who failed for a passing reason, not bad addresses. */
export async function retryFailed(id: number): Promise<number> {
  const r = await run("UPDATE sends SET status = 'queued', attempts = 0, last_error = NULL WHERE campaign_id = ? AND status = 'failed' AND bounced_at IS NULL", [id])
  if (r.changes) await run("UPDATE campaigns SET status = 'running', completed_at = NULL WHERE id = ? AND status = 'completed'", [id])
  return r.changes
}

export async function duplicateCampaign(id: number): Promise<number> {
  const c = await one('SELECT * FROM campaigns WHERE id = ?', [id])
  if (!c) throw new Error('Campaign not found')
  const r = await run('INSERT INTO campaigns (name, subject, preheader, html, states, follow_up_of, warmup, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [`${c.name} (copy)`, c.subject as string, c.preheader as string, c.html as string, c.states as string, (c.follow_up_of ?? null) as number | null, Number(c.warmup), Date.now()])
  return r.id
}

export async function dailySends(days = 14) {
  const rows = await all<{ d: string; n: number }>(
    "SELECT date(sent_at / 1000, 'unixepoch', 'localtime') d, COUNT(*) n FROM sends WHERE sent_at > ? GROUP BY d", [Date.now() - days * 86400e3])
  const map = new Map(rows.map((r) => [r.d, Number(r.n)]))
  const out: { day: string; n: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(Date.now() - i * 86400e3)
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    out.push({ day: key, n: map.get(key) || 0 })
  }
  return out
}

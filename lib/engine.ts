import { all, batch, getKv, lease, one, release, run, setKv } from './db'
import { dailyCapacity, deliver, noteError, noteOk, pickProvider } from './providers'
import { dayLimit, type PlanContext } from './plan'
import { TEMPLATES } from './seed'
import { reasonFor } from './lists'
import { openHours } from './hours'
import { renderEmail } from './email'
import { getSettings, isLive } from './settings'
import { preflight } from './preflight'
import { imapConfigured, syncInbox } from './inbox'

const INBOX_EVERY = 2 * 60 * 1000
const DAY = 24 * 3600 * 1000
export const SAFETY = { bounce: 0.05, minBounce: 50, complaint: 0.003, minComplaint: 100, ackStep: 3 }

function audience(c: { states?: unknown; follow_up_of?: unknown; list_name?: unknown }) {
  const states = String(c.states || '').split(',').filter(Boolean)
  const args: (string | number)[] = []
  let where = "c.status = 'active'"
  if (c.list_name && !c.follow_up_of) { where += ' AND c.list_name = ?'; args.push(String(c.list_name)) }
  if (states.length) { where += ` AND c.state IN (${states.map(() => '?').join(',')})`; args.push(...states) }
  if (c.follow_up_of) {
    where += ' AND c.id IN (SELECT contact_id FROM sends WHERE campaign_id = ? AND sent_at IS NOT NULL AND replied_at IS NULL AND bounced_at IS NULL)'
    args.push(Number(c.follow_up_of))
  }
  return { where, args }
}
export async function audienceCount(c: { states?: unknown; follow_up_of?: unknown; list_name?: unknown }): Promise<number> {
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
  const r = await run(`INSERT OR IGNORE INTO sends (campaign_id, contact_id, email) SELECT ?, c.id, c.email FROM contacts c WHERE ${where}
    ORDER BY CASE c.list_name WHEN 'clients' THEN 0 WHEN 'business' THEN 1 ELSE 2 END, c.id`, [id, ...args])
  if (!r.changes) throw new Error('Nobody matches this campaign')
  await run("UPDATE campaigns SET status = 'running', started_at = ? WHERE id = ?", [Date.now(), id])
  const series = c.sequence ? (JSON.parse(String(c.sequence)) as { subject: string; preheader: string; html: string; day: number }[]) : []
  if (series.length) await attachSeries(id, c, series)
  else if (c.followup_key && Number(c.followup_days) > 0) await attachFollowup(id, String(c.followup_key), Number(c.followup_days))
  return r.changes
}

/** Links each email of a series to the one before it, so only people who did not answer move on. */
async function attachSeries(parentId: number, p: Record<string, unknown>, series: { subject: string; preheader: string; html: string; day: number }[]) {
  let previous = parentId, lastDay = 1
  for (const [i, step] of series.entries()) {
    const r = await run(`INSERT INTO campaigns (name, subject, preheader, html, status, follow_up_of, list_name, reason, followup_days, warmup, auto_child, created_at, started_at)
      VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, 1, ?, ?)`,
      [`${p.name} (email ${i + 2})`, step.subject, step.preheader, step.html, previous, String(p.list_name), String(p.reason || ''), Math.max(1, step.day - lastDay), Number(p.warmup), Date.now(), Date.now()])
    previous = r.id
    lastDay = step.day
  }
}

/** Adds an automatic follow-up to a campaign, also one that has already gone out. */
export async function attachFollowup(parentId: number, key: string, days: number) {
  const t = TEMPLATES.find((x) => x.key === key)
  const p = await one('SELECT * FROM campaigns WHERE id = ?', [parentId])
  if (!t || !p) throw new Error('Follow-up template not found')
  if (await one('SELECT 1 x FROM campaigns WHERE follow_up_of = ? AND auto_child = 1', [parentId])) throw new Error('This campaign already has an automatic follow-up')
  await run(`INSERT INTO campaigns (name, subject, preheader, html, status, follow_up_of, list_name, reason, followup_days, warmup, auto_child, created_at, started_at)
    VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, 1, ?, ?)`,
    [`${p.name} (auto follow-up)`, t.subject, t.preheader, t.html, parentId, String(p.list_name), String(p.reason || ''), Math.max(1, days), Number(p.warmup), Date.now(), Date.now()])
}

/** Queues the follow-up for everyone whose first email is old enough and who has not answered. */
async function enqueueFollowups() {
  if (Date.now() - Number((await getKv('followups_last')) || 0) < 5 * 60 * 1000) return
  await setKv('followups_last', String(Date.now()))
  for (const c of await all("SELECT id, follow_up_of, followup_days FROM campaigns WHERE auto_child = 1 AND status = 'running'")) {
    await run(`INSERT OR IGNORE INTO sends (campaign_id, contact_id, email)
      SELECT ?, s.contact_id, s.email FROM sends s JOIN contacts ct ON ct.id = s.contact_id
      WHERE s.campaign_id = ? AND s.sent_at IS NOT NULL AND s.sent_at < ? AND s.replied_at IS NULL AND s.bounced_at IS NULL AND ct.status = 'active'`,
      [Number(c.id), Number(c.follow_up_of), Date.now() - Number(c.followup_days) * DAY])
  }
}

export interface TickResult { sent: number; running: boolean; waiting?: 'gap' | 'busy' | 'caps' | 'batch' | 'hours'; inbox?: number }

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
    await enqueueFollowups()
    const held = await heldForBatch()
    // practice mode ignores the clock, real emails only go out during the day
    const hours = isLive() ? openHours(Number(settings.send_from), Number(settings.send_to)) : ''
    if (hours === null) {
      out.running = !!(await one("SELECT 1 x FROM campaigns WHERE status = 'running' LIMIT 1"))
      out.waiting = 'hours'
      return out
    }

    const next = await one(`SELECT s.id, s.contact_id, s.attempts, ct.email, ct.first_name, ct.last_name, ct.state, ct.status contact_status,
        ct.company, ct.list_name contact_list, cp.subject, cp.html, cp.preheader, cp.reason
      FROM sends s JOIN campaigns cp ON cp.id = s.campaign_id JOIN contacts ct ON ct.id = s.contact_id
      WHERE s.status = 'queued' AND cp.status = 'running'${hours}${held.length ? ` AND cp.id NOT IN (${held.join(',')})` : ''} ORDER BY cp.auto_child DESC, cp.started_at, s.id LIMIT 1`)
    if (!next) {
      await run(`UPDATE campaigns SET status = 'completed', completed_at = ? WHERE status = 'running'
        AND NOT EXISTS (SELECT 1 FROM sends s WHERE s.campaign_id = campaigns.id AND s.status = 'queued')
        AND (auto_child = 0 OR EXISTS (SELECT 1 FROM campaigns p WHERE p.id = campaigns.follow_up_of AND p.status = 'completed'
          AND p.completed_at < ? - campaigns.followup_days * 86400000 - 3600000))`, [Date.now(), Date.now()])
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
      const mail = await renderEmail({ subject: next.subject, html: next.html, preheader: next.preheader, reason: next.reason || reasonFor(String(next.contact_list)) }, next as never, settings)
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

/** What the domain has done so far. Campaigns started earlier than `before` go first. */
export async function planContext(before?: number): Promise<PlanContext> {
  const now = Date.now()
  const [capacity, first, used, ahead] = await Promise.all([
    dailyCapacity(),
    one<{ t: number | null }>('SELECT MIN(sent_at) t FROM sends'),
    one<{ n: number }>('SELECT COUNT(*) n FROM sends WHERE sent_at > ?', [now - DAY]),
    one<{ n: number }>(`SELECT COUNT(*) n FROM sends s JOIN campaigns c ON c.id = s.campaign_id
      WHERE s.status IN ('queued','sending') AND c.status = 'running' AND c.started_at < ?`, [before ?? now + 1]),
  ])
  return { capacity, warmDay: first?.t ? Math.floor((now - Number(first.t)) / DAY) : 0, usedToday: Number(used?.n || 0), ahead: Number(ahead?.n || 0) }
}

/** Warm-up is for the whole domain: once today's amount is out, every warm-up campaign waits. */
async function heldForBatch(): Promise<number[]> {
  const rows = await all("SELECT id FROM campaigns WHERE status = 'running' AND warmup = 1")
  if (!rows.length) return []
  const c = await planContext()
  return c.usedToday >= dayLimit(c.warmDay, c.capacity, true) ? rows.map((r) => Number(r.id)) : []
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
    SUM(clicked_at IS NOT NULL) clicked,
    SUM(replied_at IS NOT NULL) replied,
    SUM(bounced_at IS NOT NULL) bounced,
    SUM(complained_at IS NOT NULL) complained,
    SUM(status = 'failed') failed,
    SUM(status = 'skipped') skipped
    FROM sends ${id ? 'WHERE campaign_id = ?' : ''}`, id ? [id] : [])
  const n = (k: string) => Number(r?.[k] || 0)
  return { total: n('total'), queued: n('queued'), sent: n('sent'), delivered: n('delivered'), opened: n('opened'), clicked: n('clicked'), replied: n('replied'), bounced: n('bounced'), complained: n('complained'), failed: n('failed'), skipped: n('skipped') }
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
  const r = await run('INSERT INTO campaigns (name, subject, preheader, html, states, follow_up_of, warmup, list_name, reason, followup_key, followup_days, sequence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [`${c.name} (copy)`, c.subject as string, c.preheader as string, c.html as string, c.states as string, (c.follow_up_of ?? null) as number | null, Number(c.warmup), c.list_name as string, c.reason as string, c.followup_key as string, Number(c.followup_days), c.sequence as string, Date.now()])
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

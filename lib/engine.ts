import { all, batch, getKv, lease, one, release, run, setKv } from './db'
import { deliver, noteError, noteOk, pickProvider } from './providers'
import { renderEmail } from './email'
import { getSettings, isLive } from './settings'
import { imapConfigured, syncInbox } from './inbox'

const INBOX_EVERY = 2 * 60 * 1000

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
  // recipients need a public unsubscribe link, which a localhost address is not
  if (isLive() && !(process.env.APP_URL || '').startsWith('https://')) throw new Error('Put the tool online first: real campaigns need a public https address for the unsubscribe link')
  const { where, args } = audience(c)
  const r = await run(`INSERT OR IGNORE INTO sends (campaign_id, contact_id, email) SELECT ?, c.id, c.email FROM contacts c WHERE ${where}`, [id, ...args])
  if (!r.changes) throw new Error('Nobody matches this campaign')
  await run("UPDATE campaigns SET status = 'running', started_at = ? WHERE id = ?", [Date.now(), id])
  return r.changes
}

export interface TickResult { sent: number; running: boolean; waiting?: 'gap' | 'busy' | 'caps'; inbox?: number }

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

    const next = await one(`SELECT s.id, s.contact_id, s.attempts, ct.email, ct.first_name, ct.last_name, ct.state, ct.status contact_status,
        cp.subject, cp.html, cp.preheader
      FROM sends s JOIN campaigns cp ON cp.id = s.campaign_id JOIN contacts ct ON ct.id = s.contact_id
      WHERE s.status = 'queued' AND cp.status = 'running' ORDER BY cp.started_at, s.id LIMIT 1`)
    if (!next) {
      await run(`UPDATE campaigns SET status = 'completed', completed_at = ? WHERE status = 'running'
        AND NOT EXISTS (SELECT 1 FROM sends s WHERE s.campaign_id = campaigns.id AND s.status = 'queued')`, [Date.now()])
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

export async function campaignStats(id?: number) {
  const r = await one(`SELECT COUNT(*) total,
    SUM(status IN ('queued','sending')) queued,
    SUM(sent_at IS NOT NULL) sent,
    SUM(delivered_at IS NOT NULL) delivered,
    SUM(opened_at IS NOT NULL) opened,
    SUM(replied_at IS NOT NULL) replied,
    SUM(bounced_at IS NOT NULL) bounced,
    SUM(status = 'failed') failed,
    SUM(status = 'skipped') skipped
    FROM sends ${id ? 'WHERE campaign_id = ?' : ''}`, id ? [id] : [])
  const n = (k: string) => Number(r?.[k] || 0)
  return { total: n('total'), queued: n('queued'), sent: n('sent'), delivered: n('delivered'), opened: n('opened'), replied: n('replied'), bounced: n('bounced'), failed: n('failed'), skipped: n('skipped') }
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

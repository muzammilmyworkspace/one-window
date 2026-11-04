import { ImapFlow } from 'imapflow'
import { simpleParser, type ParsedMail } from 'mailparser'
import { batch, getKv, lease, one, release, run, setKv } from './db'

export const imapConfigured = () => !!(process.env.IMAP_USER && process.env.IMAP_PASS)
const MAX_PER_SYNC = 40

export type ReplyKind = 'reply' | 'auto' | 'unsubscribe' | 'bounce'

export function classify(m: { from: string; subject: string; text: string; headers: Map<string, unknown> }): ReplyKind {
  if (/^(mailer-daemon|postmaster|mail-daemon)@/i.test(m.from) || /delivery (status|failure)|undeliverable|returned mail|failure notice/i.test(m.subject)) return 'bounce'
  const auto = String(m.headers.get('auto-submitted') || '').toLowerCase()
  if ((auto && auto !== 'no') || /out of (the )?office|automatic reply|auto.?reply|vacation/i.test(m.subject)) return 'auto'
  const firstLines = m.text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('>')).slice(0, 3).join(' ').slice(0, 300)
  const said = `${m.subject.replace(/^(re|fwd?):.*$/i, '')} ${firstLines}`.trim()
  if (/\bunsubscribe\b|\bremove me\b|\bno thanks\b|\bnot interested\b|\bstop (emailing|sending|contacting)\b|^stop\b/i.test(said)) return 'unsubscribe'
  return 'reply'
}

function bounceTarget(text: string): string | null {
  const m = text.match(/(?:final-recipient|original-recipient)\s*:\s*(?:rfc822;)?\s*([^\s<>;]+@[^\s<>;]+)/i)
    || text.match(/<([^\s<>]+@[^\s<>]+)>/)
    || text.match(/([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})/)
  return m ? m[1].toLowerCase() : null
}

/** Stores one inbox message if it belongs to the outreach, and applies what it means. */
export async function ingest(parsed: ParsedMail, fallbackId: string): Promise<boolean> {
  const addr = parsed.from?.value?.[0]
  const from = (addr?.address || '').toLowerCase()
  if (!from) return false
  const subject = parsed.subject || ''
  const text = (parsed.text || '').slice(0, 20000)
  const messageId = parsed.messageId || fallbackId
  const kind = classify({ from, subject, text, headers: parsed.headers as Map<string, unknown> })

  const lookup = kind === 'bounce' ? bounceTarget(text) : from
  const refs = [parsed.inReplyTo, ...(Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [])].filter(Boolean) as string[]

  let send: { id: number; campaign_id: number; contact_id: number } | undefined
  for (const id of refs) {
    send = await one('SELECT id, campaign_id, contact_id FROM sends WHERE message_id = ?', [id])
    if (send) break
  }
  if (!send && lookup) {
    send = await one('SELECT id, campaign_id, contact_id FROM sends WHERE email = ? AND sent_at IS NOT NULL ORDER BY sent_at DESC LIMIT 1', [lookup])
  }
  // Only mail tied to someone we actually emailed. Everything else in the inbox stays private.
  if (!send) return false

  const received = parsed.date?.getTime() || Date.now()
  const ins = await run(`INSERT OR IGNORE INTO replies (message_id, contact_id, campaign_id, send_id, from_email, from_name, subject, body, kind, received_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [messageId, send.contact_id, send.campaign_id, send.id, from, addr?.name || '', subject, text, kind, received])
  if (!ins.changes) return false

  if (kind === 'reply' || kind === 'unsubscribe') await run('UPDATE sends SET replied_at = COALESCE(replied_at, ?) WHERE id = ?', [received, send.id])
  if (kind === 'unsubscribe') await run("UPDATE contacts SET status = 'unsubscribed' WHERE id = ?", [send.contact_id])
  // someone who answered belongs to the sales team now, so no more campaign emails
  if (kind === 'reply') await run("UPDATE contacts SET status = 'replied' WHERE id = ? AND status = 'active'", [send.contact_id])
  if (kind === 'bounce') {
    await batch([
      { sql: 'UPDATE sends SET bounced_at = COALESCE(bounced_at, ?) WHERE id = ?', args: [received, send.id] },
      { sql: "UPDATE contacts SET status = 'bounced' WHERE id = ? AND status = 'active'", args: [send.contact_id] },
    ])
  }
  return true
}

/** Reads new INBOX mail. The mailbox is opened read-only, so nothing changes in Hostinger. */
export async function syncInbox(): Promise<{ added: number; scanned: number }> {
  if (!imapConfigured()) throw new Error('Inbox login is not set up yet (IMAP_PASS)')
  if (!(await lease('inbox_lock', 50000))) return { added: 0, scanned: 0 }
  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'imap.hostinger.com', port: Number(process.env.IMAP_PORT || 993), secure: true,
    auth: { user: process.env.IMAP_USER!, pass: process.env.IMAP_PASS! }, logger: false, socketTimeout: 30000,
  })
  client.on('error', () => {})
  let added = 0, scanned = 0
  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX', { readOnly: true })
    try {
      const box = client.mailbox as unknown as { uidValidity?: bigint }
      const validity = String(box.uidValidity ?? '')
      let lastUid = Number((await getKv('imap_uid')) || 0)
      if ((await getKv('imap_validity')) !== validity) lastUid = 0

      const criteria = lastUid ? { uid: `${lastUid + 1}:*` } : { since: new Date(Date.now() - 30 * 86400e3) }
      const found = ((await client.search(criteria, { uid: true })) || []) as number[]
      const uids = found.filter((u) => u > lastUid).sort((a, b) => a - b).slice(0, MAX_PER_SYNC)

      if (uids.length) {
        // fetch first, then process: imap commands cannot run inside the fetch loop
        const msgs: { uid: number; source?: Buffer }[] = []
        for await (const m of client.fetch(uids, { uid: true, source: true }, { uid: true })) msgs.push({ uid: m.uid, source: m.source })
        for (const m of msgs) {
          scanned++
          if (m.source && (await ingest(await simpleParser(m.source), `uid-${validity}-${m.uid}`))) added++
          lastUid = Math.max(lastUid, m.uid)
        }
      }
      await setKv('imap_uid', String(lastUid))
      await setKv('imap_validity', validity)
    } finally { lock.release() }
    await client.logout()
    await setKv('inbox_error', '')
    await setKv('inbox_synced', String(Date.now()))
    return { added, scanned }
  } catch (e) {
    const err = e as Error & { authenticationFailed?: boolean; responseText?: string }
    await setKv('inbox_error', err.authenticationFailed ? 'Hostinger rejected the login. Check IMAP_PASS.' : (err.responseText || err.message).slice(0, 300))
    // repeated wrong logins can lock the mailbox: wait an hour before the next automatic try
    if (err.authenticationFailed) await setKv('inbox_last', String(Date.now() + 3600e3))
    try { client.close() } catch { /* already closed */ }
    throw e
  } finally {
    await release('inbox_lock')
  }
}

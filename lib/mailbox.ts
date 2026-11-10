import { all, one, run, type Row } from './db'
import { personalize, renderEmail } from './email'
import { reasonFor } from './lists'
import type { Settings } from './settings'

export type FolderKey = 'inbox' | 'sent' | 'unsubscribe' | 'auto' | 'bounce'
export const FOLDERS: { key: FolderKey; label: string; icon: string; kind?: string }[] = [
  { key: 'inbox', label: 'Inbox', icon: 'inbox', kind: 'reply' },
  { key: 'sent', label: 'Sent', icon: 'send' },
  { key: 'unsubscribe', label: 'Unsubscribes', icon: 'x', kind: 'unsubscribe' },
  { key: 'auto', label: 'Auto-replies', icon: 'clock', kind: 'auto' },
  { key: 'bounce', label: 'Bounces', icon: 'alert', kind: 'bounce' },
]
export const SENT_PAGE = 50

const like = (q: string) => `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
export const fullName = (r: Row | undefined) => `${r?.first_name || ''} ${r?.last_name || ''}`.trim()

/** Splits what the person wrote from the quoted email under it. */
export function splitQuote(body: string): [string, string] {
  const m = body.search(/^(On .+wrote:|>|-{2,} ?Original Message|From: .+|Sent from my )/m)
  return m > 0 ? [body.slice(0, m).trim(), body.slice(m).trim()] : [body.trim(), '']
}

export async function folderCounts(): Promise<Record<FolderKey, { total: number; unread: number }>> {
  const [kinds, sent, bounces] = await Promise.all([
    all('SELECT kind, COUNT(DISTINCT contact_id) n, COUNT(DISTINCT CASE WHEN is_read = 0 THEN contact_id END) unread FROM replies GROUP BY kind'),
    one('SELECT (SELECT COUNT(*) FROM sends WHERE sent_at IS NOT NULL) + (SELECT COUNT(*) FROM answers) n'),
    one(`SELECT COUNT(DISTINCT contact_id) n FROM (SELECT contact_id FROM sends WHERE bounced_at IS NOT NULL
      UNION ALL SELECT contact_id FROM replies WHERE kind = 'bounce' AND contact_id IS NOT NULL)`),
  ])
  const out = { sent: { total: Number(sent?.n || 0), unread: 0 } } as Record<FolderKey, { total: number; unread: number }>
  for (const f of FOLDERS) if (f.kind) {
    const k = kinds.find((r) => r.kind === f.kind)
    out[f.key] = { total: Number(k?.n || 0), unread: Number(k?.unread || 0) }
  }
  out.bounce.total = Number(bounces?.n || 0)
  out.bounce.unread = 0   // bounces are not messages to read: always show the total, the same number as the dashboard
  return out
}

/** One row per person who wrote back, newest conversation first. */
export async function listThreads(kind: string, q: string) {
  return all(`WITH t AS (
      SELECT contact_id, MAX(received_at) last, SUM(is_read = 0) unread FROM replies WHERE kind = ? AND contact_id IS NOT NULL GROUP BY contact_id)
    SELECT t.contact_id, t.last, t.unread, r.from_name, r.from_email, r.subject, r.body, ct.first_name, ct.last_name, ct.status,
      (SELECT COUNT(*) FROM sends s WHERE s.contact_id = t.contact_id AND s.sent_at IS NOT NULL)
      + (SELECT COUNT(*) FROM replies x WHERE x.contact_id = t.contact_id)
      + (SELECT COUNT(*) FROM answers a JOIN replies y ON y.id = a.reply_id WHERE y.contact_id = t.contact_id) total
    FROM t
    JOIN replies r ON r.id = (SELECT z.id FROM replies z WHERE z.contact_id = t.contact_id AND z.kind = ? ORDER BY z.received_at DESC, z.id DESC LIMIT 1)
    LEFT JOIN contacts ct ON ct.id = t.contact_id
    WHERE ? = '' OR r.from_email LIKE ? ESCAPE '\\' OR r.from_name LIKE ? ESCAPE '\\' OR r.subject LIKE ? ESCAPE '\\' OR r.body LIKE ? ESCAPE '\\'
      OR (ct.first_name || ' ' || ct.last_name) LIKE ? ESCAPE '\\'
    ORDER BY t.last DESC LIMIT 200`, [kind, kind, q, like(q), like(q), like(q), like(q), like(q)])
}

/**
 * Every address that bounced, from all three places a bounce can come from:
 * Brevo or Resend reporting it, the address being refused while sending, or a
 * "delivery failed" email landing in info@. One row per person, newest first.
 */
export async function listBounces(q: string) {
  const rows = await all(`SELECT b.contact_id, MAX(b.at) last, SUM(b.unread) unread, b.reason, b.subject, b.src,
      ct.first_name, ct.last_name, ct.email, ct.state, ct.company, ct.status
    FROM (
      SELECT s.contact_id, s.bounced_at at, 0 unread, COALESCE(s.last_error, '') reason, c.subject, COALESCE(s.provider, '') src
      FROM sends s JOIN campaigns c ON c.id = s.campaign_id WHERE s.bounced_at IS NOT NULL
      UNION ALL
      SELECT r.contact_id, r.received_at, r.is_read = 0, r.body, r.subject, 'mail'
      FROM replies r WHERE r.kind = 'bounce' AND r.contact_id IS NOT NULL) b
    LEFT JOIN contacts ct ON ct.id = b.contact_id
    WHERE ? = '' OR ct.email LIKE ? ESCAPE '\\' OR (ct.first_name || ' ' || ct.last_name) LIKE ? ESCAPE '\\' OR b.reason LIKE ? ESCAPE '\\'
    GROUP BY b.contact_id ORDER BY last DESC LIMIT 200`, [q, like(q), like(q), like(q)])
  // SQLite takes the bare columns (reason, subject, src) from the row with the newest bounce
  return rows.map((r): Row => ({
    ...r,
    subject: r.src === 'mail' ? String(r.subject) : personalize(String(r.subject), { email: String(r.email), first_name: r.first_name, last_name: r.last_name, state: r.state, company: r.company }),
    body: bounceReason(String(r.reason), String(r.src)),
  }))
}

/** A short, readable reason for a bounce. */
export function bounceReason(reason: string, src: string): string {
  const text = reason.replace(/\s+/g, ' ').trim()
  if (src === 'mail') return `Delivery failed notice in info@: ${text.slice(0, 160)}`
  if (!text) return `Reported as bounced by ${src === 'resend' ? 'Resend' : 'Brevo'}`
  return /^(brevo|resend):/i.test(text) ? text : `Refused while sending: ${text}`
}

/** Everything that went out: campaign emails and your own replies, newest first. */
export async function listSent(q: string, page: number) {
  const rows = await all(`SELECT * FROM (
      SELECT 'campaign' type, s.id, s.contact_id, s.email, s.sent_at at, c.subject, c.name label,
        s.opened_at, s.clicked_at, s.replied_at, s.bounced_at, ct.first_name, ct.last_name, ct.state, ct.company
      FROM sends s JOIN campaigns c ON c.id = s.campaign_id LEFT JOIN contacts ct ON ct.id = s.contact_id
      WHERE s.sent_at IS NOT NULL
      UNION ALL
      SELECT 'answer', a.id, r.contact_id, r.from_email, a.sent_at, r.subject, a.body,
        NULL, NULL, NULL, NULL, ct.first_name, ct.last_name, ct.state, ct.company
      FROM answers a JOIN replies r ON r.id = a.reply_id LEFT JOIN contacts ct ON ct.id = r.contact_id)
    WHERE ? = '' OR email LIKE ? ESCAPE '\\' OR (first_name || ' ' || last_name) LIKE ? ESCAPE '\\' OR subject LIKE ? ESCAPE '\\'
    ORDER BY at DESC LIMIT ? OFFSET ?`, [q, like(q), like(q), like(q), SENT_PAGE + 1, (page - 1) * SENT_PAGE])
  return {
    more: rows.length > SENT_PAGE,
    rows: rows.slice(0, SENT_PAGE).map((r): Row => ({
      ...r,
      subject: r.type === 'answer' ? (/^re:/i.test(String(r.subject)) ? String(r.subject) : `Re: ${r.subject}`)
        : personalize(String(r.subject), { email: String(r.email), first_name: r.first_name, last_name: r.last_name, state: r.state, company: r.company }),
    })),
  }
}

export interface Message {
  key: string
  dir: 'in' | 'out'
  type: 'campaign' | 'reply' | 'answer'
  at: number
  fromName: string
  fromEmail: string
  to: string
  subject: string
  text: string          // what was written (plain text)
  quoted?: string       // the older email quoted under a reply
  html?: string         // full campaign email, shown as it arrived
  kind?: string         // reply | auto | unsubscribe | bounce
  campaign?: string
  stats?: { delivered?: number; opened?: number; clicked?: number; bounced?: number }
  note?: string         // why it bounced
}

/** The whole conversation with one person, oldest first. */
export async function thread(contactId: number, s: Settings) {
  const [contact, sends, replies, answers] = await Promise.all([
    one('SELECT * FROM contacts WHERE id = ?', [contactId]),
    all(`SELECT s.id, s.email, s.provider, s.sent_at, s.delivered_at, s.opened_at, s.clicked_at, s.bounced_at, s.last_error, c.subject, c.html, c.preheader, c.reason, c.name campaign
      FROM sends s JOIN campaigns c ON c.id = s.campaign_id WHERE s.contact_id = ? AND (s.sent_at IS NOT NULL OR s.bounced_at IS NOT NULL)`, [contactId]),
    all('SELECT * FROM replies WHERE contact_id = ?', [contactId]),
    all('SELECT a.*, r.subject, r.from_email FROM answers a JOIN replies r ON r.id = a.reply_id WHERE r.contact_id = ?', [contactId]),
  ])
  if (!contact && !replies.length) return null
  const email = String(contact?.email || replies[0]?.from_email || '')
  const name = fullName(contact) || String(replies[0]?.from_name || '') || email
  const me = { fromName: s.from_name, fromEmail: s.from_email }
  const person = { email, first_name: contact?.first_name, last_name: contact?.last_name, state: contact?.state, company: contact?.company }

  const messages: Message[] = []
  for (const r of sends) {
    const mail = await renderEmail({ subject: String(r.subject), html: String(r.html), preheader: String(r.preheader || ''), reason: String(r.reason || '') || reasonFor(String(contact?.list_name || '')) }, person, s)
    messages.push({
      key: `s${r.id}`, dir: 'out', type: 'campaign', at: Number(r.sent_at || r.bounced_at), ...me, to: email, subject: mail.subject,
      note: r.bounced_at ? bounceReason(String(r.last_error || ''), String(r.provider || 'brevo')) : undefined,
      text: mail.text, html: mail.html, campaign: String(r.campaign),
      stats: { delivered: Number(r.delivered_at) || undefined, opened: Number(r.opened_at) || undefined, clicked: Number(r.clicked_at) || undefined, bounced: Number(r.bounced_at) || undefined },
    })
  }
  for (const r of replies) {
    const [said, quoted] = splitQuote(String(r.body))
    messages.push({
      key: `r${r.id}`, dir: 'in', type: 'reply', at: Number(r.received_at), fromName: String(r.from_name || '') || name, fromEmail: String(r.from_email),
      to: s.reply_to, subject: String(r.subject), text: said, quoted, kind: String(r.kind),
    })
  }
  for (const a of answers) {
    messages.push({
      key: `a${a.id}`, dir: 'out', type: 'answer', at: Number(a.sent_at), ...me, to: String(a.from_email),
      subject: /^re:/i.test(String(a.subject)) ? String(a.subject) : `Re: ${a.subject}`, text: String(a.body),
    })
  }
  messages.sort((a, b) => a.at - b.at)

  // a reply goes back on the newest message they sent us; bounces are from a mail server, not the person
  const target = [...replies].filter((r) => r.kind !== 'bounce').sort((a, b) => Number(b.received_at) - Number(a.received_at))[0]
  const unread = replies.filter((r) => !r.is_read).length
  if (unread) await run('UPDATE replies SET is_read = 1 WHERE contact_id = ? AND is_read = 0', [contactId])
  const latestReply = [...replies].sort((a, b) => Number(b.received_at) - Number(a.received_at))[0]

  return {
    contact, email, name, messages,
    subject: messages[0]?.subject || '(no subject)',
    campaigns: [...new Set(sends.map((r) => String(r.campaign)))],
    replyTo: target ? { id: Number(target.id), subject: String(target.subject) } : null,
    latestReplyId: latestReply ? Number(latestReply.id) : 0,
  }
}

import { fail, route } from '@/lib/api'
import { all } from '@/lib/db'

const iso = (v: unknown) => (v ? new Date(Number(v)).toISOString() : '')

// A cell starting with = + - @ runs as a formula in Excel, so it gets a leading quote.
function cell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csv = (head: string[], rows: unknown[][]) => [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')

export const GET = route(async (req: Request) => {
  const q = new URL(req.url).searchParams
  let text: string, name: string
  if (q.get('type') === 'contacts') {
    const rows = await all('SELECT first_name, last_name, email, state, status FROM contacts ORDER BY state, last_name, first_name')
    text = csv(['First Name', 'Last Name', 'Email', 'State', 'Status'], rows.map((r) => [r.first_name, r.last_name, r.email, r.state, r.status]))
    name = 'contacts.csv'
  } else if (q.get('type') === 'replied') {
    const rows = await all(`SELECT ct.first_name, ct.last_name, r.from_email, ct.state, ct.company, c.name campaign, r.received_at, r.body
      FROM replies r LEFT JOIN contacts ct ON ct.id = r.contact_id LEFT JOIN campaigns c ON c.id = r.campaign_id
      WHERE r.kind = 'reply' ORDER BY r.received_at DESC`)
    text = csv(['First Name', 'Last Name', 'Email', 'State', 'Company', 'Campaign', 'Replied', 'Message'],
      rows.map((r) => [r.first_name, r.last_name, r.from_email, r.state, r.company, r.campaign, iso(r.received_at), String(r.body || '').split(/\n\s*(?:On .+wrote:|>)/)[0].trim().slice(0, 1000)]))
    name = 'replies-for-sales.csv'
  } else if (q.get('type') === 'campaign' && q.get('id')) {
    const id = Number(q.get('id'))
    const rows = await all(`SELECT ct.first_name, ct.last_name, s.email, ct.state, s.status, s.provider, s.sent_at, s.delivered_at, s.opened_at, s.replied_at, s.bounced_at, s.last_error
      FROM sends s JOIN contacts ct ON ct.id = s.contact_id WHERE s.campaign_id = ? ORDER BY s.id`, [id])
    text = csv(['First Name', 'Last Name', 'Email', 'State', 'Status', 'Sender', 'Sent', 'Delivered', 'Opened', 'Replied', 'Bounced', 'Error'],
      rows.map((r) => [r.first_name, r.last_name, r.email, r.state, r.status, r.provider, iso(r.sent_at), iso(r.delivered_at), iso(r.opened_at), iso(r.replied_at), iso(r.bounced_at), r.last_error]))
    name = `campaign-${id}.csv`
  } else return fail('Unknown export')
  return new Response(`﻿${text}`, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"` } })
})

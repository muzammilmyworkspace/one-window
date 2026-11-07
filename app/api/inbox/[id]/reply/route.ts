import { fail, json, route } from '@/lib/api'
import { one, run } from '@/lib/db'
import { splitQuote } from '@/lib/mailbox'
import { deliver, pickProvider } from '@/lib/providers'
import { getSettings, isLive } from '@/lib/settings'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const angle = (id: unknown) => (String(id || '').startsWith('<') ? String(id) : '')

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const id = Number((await ctx.params).id)
  const body = String((await req.json()).body || '').replace(/\r\n/g, '\n').trim()
  if (!body) return fail('Write a message first')
  if (body.length > 20000) return fail('That message is too long')
  const r = await one('SELECT * FROM replies WHERE id = ?', [id])
  if (!r) return fail('Message not found', 404)

  const provider = await pickProvider()
  if (!provider) return fail('No sender has room right now. Connect one, or try after the daily limit resets.')
  const s = await getSettings()
  const subject = /^re:/i.test(String(r.subject)) ? String(r.subject) : `Re: ${r.subject}`

  // Thread headers: the person's mail app shows this under the same conversation.
  const sent = r.send_id ? await one('SELECT message_id FROM sends WHERE id = ?', [Number(r.send_id)]) : undefined
  const inReply = angle(r.message_id) || undefined
  const references = [angle(sent?.message_id), angle(r.message_id)].filter(Boolean).join(' ') || undefined

  // Quote what they wrote, the way a normal mail app does.
  const [said] = splitQuote(String(r.body))
  const date = new Date(Number(r.received_at)).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' })
  const who = `${r.from_name ? `${r.from_name} ` : ''}<${r.from_email}>`
  const quoteText = said ? `\n\nOn ${date}, ${who} wrote:\n${said.split('\n').map((l) => `> ${l}`).join('\n')}` : ''
  const quoteHtml = said ? `<br><div style="color:#666666;">On ${esc(date)}, ${esc(who)} wrote:</div>
<blockquote style="margin:4px 0 0 0;border-left:2px solid #cccccc;padding-left:10px;color:#555555;white-space:pre-wrap;">${esc(said)}</blockquote>` : ''

  try {
    await deliver(provider.name, {
      from: `"${s.from_name}" <${s.from_email}>`, to: String(r.from_email), replyTo: s.reply_to,
      bcc: s.reply_to,   // keeps a copy in the info@ mailbox
      messageId: `<${crypto.randomUUID()}@${s.from_email.split('@')[1]}>`, subject,
      text: body + quoteText,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222222;"><div style="white-space:pre-wrap;">${esc(body)}</div>${quoteHtml}</div>`,
      inReplyTo: inReply, references,
    })
  } catch (e) { return fail((e as Error).message, 502) }
  await run('INSERT INTO answers (reply_id, body, provider, sent_at) VALUES (?, ?, ?, ?)', [id, body, provider.name, Date.now()])
  return json({ ok: true, practice: !isLive() })
})

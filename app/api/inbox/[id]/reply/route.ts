import { fail, json, route } from '@/lib/api'
import { one, run } from '@/lib/db'
import { deliver, pickProvider } from '@/lib/providers'
import { getSettings, isLive } from '@/lib/settings'

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const id = Number((await ctx.params).id)
  const body = String((await req.json()).body || '').trim()
  if (!body) return fail('Write a message first')
  const r = await one('SELECT * FROM replies WHERE id = ?', [id])
  if (!r) return fail('Message not found', 404)

  const provider = await pickProvider()
  if (!provider) return fail('No sender has room right now. Connect one, or try after the daily limit resets.')
  const s = await getSettings()
  const subject = /^re:/i.test(String(r.subject)) ? String(r.subject) : `Re: ${r.subject}`
  const inReply = String(r.message_id).startsWith('<') ? String(r.message_id) : undefined
  try {
    await deliver(provider.name, {
      from: `"${s.from_name}" <${s.from_email}>`, to: String(r.from_email), replyTo: s.reply_to,
      bcc: s.reply_to,   // keeps a copy in the info@ mailbox
      messageId: `<${crypto.randomUUID()}@${s.from_email.split('@')[1]}>`, subject, text: body,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;white-space:pre-wrap;">${esc(body)}</div>`,
      inReplyTo: inReply, references: inReply,
    })
  } catch (e) { return fail((e as Error).message, 502) }
  await run('INSERT INTO answers (reply_id, body, provider, sent_at) VALUES (?, ?, ?, ?)', [id, body, provider.name, Date.now()])
  return json({ ok: true, practice: !isLive() })
})

import { fail, json, route } from '@/lib/api'
import { EMAIL_RE, renderEmail } from '@/lib/email'
import { deliver, missingCreds, type ProviderName } from '@/lib/providers'
import { getSettings, isLive } from '@/lib/settings'

export const POST = route(async (req: Request) => {
  const b = await req.json()
  const to = String(b.to || '').trim()
  if (!EMAIL_RE.test(to)) return fail('Enter a valid email address')
  // whichever sender is connected
  const provider: ProviderName = missingCreds('brevo').length ? 'resend' : 'brevo'
  if (!isLive()) return json({ ok: true, message: 'Practice mode: the test was built but not sent.' })
  const miss = missingCreds(provider)
  if (miss.length) return fail(`${provider} is not connected yet (${miss.join(', ')})`)
  const s = await getSettings()
  const mail = await renderEmail({ subject: b.subject, html: b.html, preheader: b.preheader, reason: b.reason }, { email: to, first_name: b.first_name || 'Friend', state: b.state || '', company: 'Your Company' }, s)
  try {
    await deliver(provider, {
      from: `"${s.from_name}" <${s.from_email}>`, to, replyTo: s.reply_to,
      messageId: `<${crypto.randomUUID()}@${s.from_email.split('@')[1]}>`, ...mail, subject: `[TEST] ${mail.subject}`,
    })
  } catch (e) { return fail((e as Error).message) }
  return json({ ok: true, message: `Test sent to ${to} through ${provider}. Check the inbox and the spam folder.` })
})

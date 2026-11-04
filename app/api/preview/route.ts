import { json, route } from '@/lib/api'
import { renderEmail } from '@/lib/email'
import { getSettings } from '@/lib/settings'

export const POST = route(async (req: Request) => {
  const b = await req.json()
  const mail = await renderEmail({ subject: b.subject || '', html: b.html || '', preheader: b.preheader || '' }, { email: 'sarah@example.com', first_name: 'Sarah', last_name: 'Johnson', state: 'TX' }, await getSettings())
  return json({ subject: mail.subject, html: mail.html })
})

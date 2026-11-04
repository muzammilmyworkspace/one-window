import { json, route } from '@/lib/api'
import { testLogin } from '@/lib/providers'
import { run } from '@/lib/db'

export const POST = route(async (req: Request) => {
  const { name } = await req.json()
  const r = await testLogin(name === 'resend' ? 'resend' : 'brevo')
  if (r.ok) await run('UPDATE providers SET paused_until = 0, errors = 0, last_error = NULL WHERE name = ?', [name])
  return json(r)
})

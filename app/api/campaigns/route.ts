import { fail, json, route } from '@/lib/api'
import { run } from '@/lib/db'

export const POST = route(async (req: Request) => {
  const b = await req.json()
  if (!String(b.name || '').trim() || !String(b.subject || '').trim() || !String(b.html || '').trim()) return fail('Name, subject and body are required')
  const r = await run('INSERT INTO campaigns (name, subject, preheader, html, states, follow_up_of, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [b.name.trim(), b.subject.trim(), String(b.preheader || '').trim(), b.html, (b.states || []).join(','), b.follow_up_of ? Number(b.follow_up_of) : null, Date.now()])
  return json({ id: r.id })
})

import { fail, json, route } from '@/lib/api'
import { run } from '@/lib/db'

export const POST = route(async (req: Request) => {
  const b = await req.json()
  if (!String(b.name || '').trim()) return fail('Give the campaign a name')
  const r = await run('INSERT INTO campaigns (name, subject, preheader, html, states, follow_up_of, warmup, list_name, reason, followup_key, followup_days, sequence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [b.name.trim(), b.subject.trim(), String(b.preheader || '').trim(), b.html, (b.states || []).join(','), b.follow_up_of ? Number(b.follow_up_of) : null, b.warmup ? 1 : 0, b.list_name || '', String(b.reason || '').trim(), b.followup_key || '', Math.max(0, Number(b.followup_days) || 0), JSON.stringify(b.sequence?.length ? b.sequence : '').replace(/^""$/, ''), Date.now()])
  return json({ id: r.id })
})

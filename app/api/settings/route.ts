import { json, route } from '@/lib/api'
import { run } from '@/lib/db'
import { saveSettings } from '@/lib/settings'

export const POST = route(async (req: Request) => {
  const b = await req.json()
  if (b.settings) await saveSettings(b.settings)
  for (const name of ['brevo', 'resend']) {
    const p = b.providers?.[name]
    if (!p) continue
    if (p.daily_cap !== undefined) await run('UPDATE providers SET daily_cap = ? WHERE name = ?', [Math.max(0, Math.floor(Number(p.daily_cap) || 0)), name])
    if (p.enabled !== undefined) await run('UPDATE providers SET enabled = ?, paused_until = 0, errors = 0 WHERE name = ?', [p.enabled ? 1 : 0, name])
  }
  return json({ ok: true })
})

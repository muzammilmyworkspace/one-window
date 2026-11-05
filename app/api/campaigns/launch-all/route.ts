import { fail, json, route } from '@/lib/api'
import { all } from '@/lib/db'
import { startCampaign } from '@/lib/engine'

// Warm lists first, the large cold list last: the queue runs in this order.
const ORDER = ['GA', 'TX', 'AL', 'FL', 'NC', 'MS', 'LA', 'IL']

export const POST = route(async (req: Request) => {
  if (!(await req.json()).permission) return fail('Confirm first that you are allowed to email these people')
  const drafts = await all("SELECT id, name, states FROM campaigns WHERE status = 'draft' AND auto_child = 0 AND sequence != ''")
  const rank = (s: unknown) => { const i = ORDER.indexOf(String(s)); return i < 0 ? ORDER.length : i }
  drafts.sort((a, b) => rank(a.states) - rank(b.states))
  const launched: string[] = []
  for (const d of drafts) {
    await startCampaign(Number(d.id))   // stops at the first problem, so nothing half-launches silently
    launched.push(String(d.name))
    await new Promise((r) => setTimeout(r, 5))
  }
  return json({ launched })
})

import { fail, json, route } from '@/lib/api'
import { one, run } from '@/lib/db'
import { audienceCount, startCampaign } from '@/lib/engine'

type Ctx = { params: Promise<{ id: string }> }

export const GET = route(async (_: Request, ctx: Ctx) => {
  const c = await one('SELECT * FROM campaigns WHERE id = ?', [Number((await ctx.params).id)])
  if (!c) return fail('Not found', 404)
  return json({ audience: await audienceCount(c) })
})

export const PUT = route(async (req: Request, ctx: Ctx) => {
  const id = Number((await ctx.params).id)
  const b = await req.json()
  if (!String(b.name || '').trim() || !String(b.subject || '').trim() || !String(b.html || '').trim()) return fail('Name, subject and body are required')
  const r = await run("UPDATE campaigns SET name = ?, subject = ?, preheader = ?, html = ?, states = ?, follow_up_of = ? WHERE id = ? AND status = 'draft'",
    [b.name.trim(), b.subject.trim(), String(b.preheader || '').trim(), b.html, (b.states || []).join(','), b.follow_up_of ? Number(b.follow_up_of) : null, id])
  if (!r.changes) return fail('Only a draft can be edited')
  return json({ ok: true })
})

export const POST = route(async (req: Request, ctx: Ctx) => {
  const id = Number((await ctx.params).id)
  const { action } = await req.json()
  if (action === 'start') return json({ queued: await startCampaign(id) })
  if (action === 'pause') await run("UPDATE campaigns SET status = 'paused' WHERE id = ? AND status = 'running'", [id])
  else if (action === 'resume') await run("UPDATE campaigns SET status = 'running' WHERE id = ? AND status = 'paused'", [id])
  else return fail('Unknown action')
  return json({ ok: true })
})

export const DELETE = route(async (_: Request, ctx: Ctx) => {
  const r = await run("DELETE FROM campaigns WHERE id = ? AND status = 'draft'", [Number((await ctx.params).id)])
  if (!r.changes) return fail('Only a draft can be deleted')
  return json({ ok: true })
})

import { fail, json, route } from '@/lib/api'
import { one, run } from '@/lib/db'
import { attachFollowup, audienceCount, campaignStats, duplicateCampaign, retryFailed, startCampaign } from '@/lib/engine'
import { preflight } from '@/lib/preflight'

type Ctx = { params: Promise<{ id: string }> }

export const GET = route(async (_: Request, ctx: Ctx) => {
  const c = await one('SELECT * FROM campaigns WHERE id = ?', [Number((await ctx.params).id)])
  if (!c) return fail('Not found', 404)
  return json({ audience: await audienceCount(c), checks: await preflight() })
})

export const PUT = route(async (req: Request, ctx: Ctx) => {
  const id = Number((await ctx.params).id)
  const b = await req.json()
  if (!String(b.name || '').trim()) return fail('Give the campaign a name')
  const r = await run("UPDATE campaigns SET name = ?, subject = ?, preheader = ?, html = ?, states = ?, follow_up_of = ?, warmup = ?, list_name = ?, reason = ?, followup_key = ?, followup_days = ?, sequence = ? WHERE id = ? AND status = 'draft'",
    [b.name.trim(), b.subject.trim(), String(b.preheader || '').trim(), b.html, (b.states || []).join(','), b.follow_up_of ? Number(b.follow_up_of) : null, b.warmup ? 1 : 0, b.list_name || '', String(b.reason || '').trim(), b.followup_key || '', Math.max(0, Number(b.followup_days) || 0), b.sequence?.length ? JSON.stringify(b.sequence) : '', id])
  if (!r.changes) return fail('Only a draft can be edited')
  return json({ ok: true })
})

export const POST = route(async (req: Request, ctx: Ctx) => {
  const id = Number((await ctx.params).id)
  const { action, key, days } = await req.json()
  if (action === 'followup') { await attachFollowup(id, String(key), Number(days) || 5); return json({ ok: true }) }
  if (action === 'start') return json({ queued: await startCampaign(id) })
  if (action === 'pause') await run("UPDATE campaigns SET status = 'paused' WHERE id = ? AND status = 'running'", [id])
  else if (action === 'resume') {
    const s = await campaignStats(id)
    await run("UPDATE campaigns SET status = 'running', pause_reason = NULL, safety_ack = ? WHERE id = ? AND status = 'paused'", [s.bounced + s.complained, id])
  }
  else if (action === 'retry') return json({ queued: await retryFailed(id) })
  else if (action === 'duplicate') return json({ id: await duplicateCampaign(id) })
  else return fail('Unknown action')
  return json({ ok: true })
})

export const DELETE = route(async (_: Request, ctx: Ctx) => {
  const r = await run("DELETE FROM campaigns WHERE id = ? AND status = 'draft'", [Number((await ctx.params).id)])
  if (!r.changes) return fail('Only a draft can be deleted')
  return json({ ok: true })
})

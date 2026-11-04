import { fail, json, route } from '@/lib/api'
import { run } from '@/lib/db'

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const { status } = await req.json()
  if (!['active', 'unsubscribed'].includes(status)) return fail('Unknown status')
  await run('UPDATE contacts SET status = ? WHERE id = ?', [status, Number(id)])
  return json({ ok: true })
})

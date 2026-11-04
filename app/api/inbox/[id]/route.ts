import { json, route } from '@/lib/api'
import { run } from '@/lib/db'

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { is_read } = await req.json()
  await run('UPDATE replies SET is_read = ? WHERE id = ?', [is_read ? 1 : 0, Number((await ctx.params).id)])
  return json({ ok: true })
})

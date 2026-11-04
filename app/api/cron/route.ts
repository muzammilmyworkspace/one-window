import { safeEqual } from '@/lib/auth'
import { fail, json, route } from '@/lib/api'
import { setKv } from '@/lib/db'
import { tick } from '@/lib/engine'

// Called every minute by an outside scheduler once the tool is live, so sending continues with the browser closed.
export const GET = route(async (req: Request) => {
  const token = new URL(req.url).searchParams.get('token') || ''
  if (!process.env.CRON_SECRET || !safeEqual(token, process.env.CRON_SECRET)) return fail('Forbidden', 403)
  await setKv('cron_last', String(Date.now()))
  return json(await tick())
})

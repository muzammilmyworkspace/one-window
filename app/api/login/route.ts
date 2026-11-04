import { COOKIE, makeSession, safeEqual } from '@/lib/auth'
import { fail, json, route } from '@/lib/api'
import { getKv, setKv } from '@/lib/db'

const MAX_FAILS = 10, LOCK_MS = 15 * 60 * 1000

// With no ADMIN_PASSWORD set, the login button alone signs in.
export const POST = route(async (req: Request) => {
  if (!process.env.AUTH_SECRET) return fail('AUTH_SECRET is not set up yet', 500)
  const expected = process.env.ADMIN_PASSWORD
  if (expected) {
    const [count, since] = ((await getKv('login_fails')) || '0:0').split(':').map(Number)
    if (count >= MAX_FAILS && Date.now() - since < LOCK_MS) return fail('Too many wrong attempts. Try again in 15 minutes.', 429)
    const { password } = await req.json().catch(() => ({ password: '' }))
    if (!safeEqual(String(password || ''), expected)) {
      await setKv('login_fails', `${Date.now() - since < LOCK_MS ? count + 1 : 1}:${Date.now()}`)
      await new Promise((r) => setTimeout(r, 500))
      return fail('Wrong password', 401)
    }
    await setKv('login_fails', '0:0')
  }
  const { value, maxAge } = await makeSession()
  const res = json({ ok: true })
  res.cookies.set(COOKIE, value, { httpOnly: true, sameSite: 'lax', secure: (process.env.APP_URL || '').startsWith('https'), path: '/', maxAge })
  return res
})

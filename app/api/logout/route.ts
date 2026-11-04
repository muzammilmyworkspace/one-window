import { COOKIE } from '@/lib/auth'
import { json } from '@/lib/api'

export async function POST() {
  const res = json({ ok: true })
  res.cookies.delete(COOKIE)
  return res
}

import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE, validSession } from '@/lib/auth'

const PUBLIC = [/^\/login$/, /^\/api\/login$/, /^\/u\//, /^\/api\/webhooks\//, /^\/api\/cron$/]

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next()
  if (await validSession(req.cookies.get(COOKIE)?.value)) return NextResponse.next()
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  return NextResponse.redirect(new URL('/login', req.url))
}

export const config = { matcher: ['/((?!_next/|favicon.ico|logo.svg).*)'] }

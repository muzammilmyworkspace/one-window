// Web Crypto only: this file also runs in proxy.ts.
export const COOKIE = 'one_window_session'
const DAYS = 14

const secret = () => process.env.AUTH_SECRET || ''
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export async function sign(value: string, salt = 'session'): Promise<string> {
  if (!secret()) throw new Error('AUTH_SECRET is not set')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`${salt}:${secret()}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)))
}
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}
export async function makeSession(): Promise<{ value: string; maxAge: number }> {
  const maxAge = DAYS * 86400
  const exp = String(Date.now() + maxAge * 1000)
  return { value: `${exp}.${await sign(exp)}`, maxAge }
}
export async function validSession(token?: string): Promise<boolean> {
  if (!token || !secret()) return false
  const [exp, mac] = token.split('.')
  if (!exp || !mac || +exp < Date.now()) return false
  return safeEqual(mac, await sign(exp))
}

// Unsubscribe links carry the address plus a signature, so nobody can unsubscribe someone else.
export async function unsubToken(email: string): Promise<string> {
  const e = btoa(email).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${e}.${(await sign(email, 'unsub')).slice(0, 24)}`
}
export async function readUnsubToken(token: string): Promise<string | null> {
  const [e, mac] = token.split('.')
  if (!e || !mac) return null
  let email: string
  try { email = atob(e.replace(/-/g, '+').replace(/_/g, '/')) } catch { return null }
  return safeEqual(mac, (await sign(email, 'unsub')).slice(0, 24)) ? email : null
}

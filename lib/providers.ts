import nodemailer from 'nodemailer'
import { resolveCname, resolveTxt, resolveMx } from 'node:dns/promises'
import { all, one, run } from './db'
import { isLive } from './settings'

export type ProviderName = 'brevo' | 'resend'
export interface ProviderRow { name: ProviderName; daily_cap: number; enabled: number; errors: number; paused_until: number; last_error: string | null }

export const PROVIDER_LABEL: Record<ProviderName, string> = { brevo: 'Brevo', resend: 'Resend' }
const DAY = 24 * 3600 * 1000

function creds(name: ProviderName) {
  if (name === 'brevo') return { host: 'smtp-relay.brevo.com', port: 587, user: process.env.BREVO_SMTP_LOGIN, pass: process.env.BREVO_SMTP_KEY }
  return { host: 'smtp.resend.com', port: 465, user: 'resend', pass: process.env.RESEND_API_KEY }
}
export function missingCreds(name: ProviderName): string[] {
  const c = creds(name), miss: string[] = []
  if (!c.user) miss.push('BREVO_SMTP_LOGIN')
  if (!c.pass) miss.push(name === 'brevo' ? 'BREVO_SMTP_KEY' : 'RESEND_API_KEY')
  return miss
}
function transport(name: ProviderName) {
  const c = creds(name)
  return nodemailer.createTransport({
    host: c.host, port: c.port, secure: c.port === 465, auth: { user: c.user, pass: c.pass },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
  })
}

export async function providers(): Promise<ProviderRow[]> {
  return all<ProviderRow>('SELECT * FROM providers ORDER BY daily_cap DESC')
}
export async function usedToday(name: string): Promise<number> {
  const r = await one<{ n: number }>('SELECT COUNT(*) n FROM sends WHERE provider = ? AND sent_at > ?', [name, Date.now() - DAY])
  return Number(r?.n || 0)
}
/** The configured, unpaused provider with the most room left in its rolling 24h cap. */
export async function pickProvider(): Promise<{ name: ProviderName; left: number } | null> {
  let best: { name: ProviderName; left: number } | null = null
  for (const p of await providers()) {
    if (!p.enabled || p.paused_until > Date.now() || (isLive() && missingCreds(p.name).length)) continue
    const left = p.daily_cap - (await usedToday(p.name))
    if (left > 0 && (!best || left > best.left)) best = { name: p.name, left }
  }
  return best
}

export interface Outgoing {
  from: string; to: string; replyTo: string; subject: string; html: string; text: string
  messageId: string; headers?: Record<string, string>
}
export async function deliver(name: ProviderName, m: Outgoing): Promise<void> {
  if (!isLive()) { await new Promise((r) => setTimeout(r, 40)); return }
  const t = transport(name)
  try { await t.sendMail(m) } finally { t.close() }
}

export async function noteError(name: string, message: string) {
  await run('UPDATE providers SET errors = errors + 1, last_error = ? WHERE name = ?', [message.slice(0, 300), name])
  // three failures in a row: rest this provider for an hour, the other keeps going
  await run('UPDATE providers SET paused_until = ?, errors = 0 WHERE name = ? AND errors >= 3', [Date.now() + 3600e3, name])
}
export async function noteOk(name: string) {
  await run('UPDATE providers SET errors = 0, last_error = NULL WHERE name = ?', [name])
}

export async function testLogin(name: ProviderName): Promise<{ ok: boolean; message: string }> {
  const miss = missingCreds(name)
  if (miss.length) return { ok: false, message: `Missing in settings file: ${miss.join(', ')}` }
  const t = transport(name)
  try {
    await t.verify()
    return { ok: true, message: 'Login works' }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  } finally { t.close() }
}

const has = async (fn: () => Promise<unknown[]>) => { try { return (await fn()).length > 0 } catch { return false } }

/** Public DNS only: are the domain's sending records in place? */
export async function domainChecks(domain: string) {
  const anyRecord = async (host: string) =>
    (await has(() => resolveTxt(host))) || (await has(() => resolveCname(host)))
  const txt = async (host: string) => { try { return (await resolveTxt(host)).map((r) => r.join('')) } catch { return [] as string[] } }
  const root = await txt(domain)
  return {
    resend: (await anyRecord(`resend._domainkey.${domain}`)) && (await has(() => resolveMx(`send.${domain}`))),
    brevo: (await anyRecord(`brevo1._domainkey.${domain}`)) || root.some((r) => r.startsWith('brevo-code')),
    dmarc: (await txt(`_dmarc.${domain}`)).some((r) => r.toLowerCase().startsWith('v=dmarc1')),
    spf: root.some((r) => r.toLowerCase().startsWith('v=spf1')),
  }
}

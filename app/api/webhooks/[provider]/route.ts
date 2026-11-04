import { safeEqual } from '@/lib/auth'
import { fail, json, route } from '@/lib/api'
import { one, run, setKv } from '@/lib/db'

type Event = 'delivered' | 'opened' | 'bounced' | 'complained' | 'unsubscribed'

const BREVO: Record<string, Event> = {
  delivered: 'delivered', opened: 'opened', unique_opened: 'opened', proxy_open: 'opened',
  hard_bounce: 'bounced', invalid_email: 'bounced', blocked: 'bounced', spam: 'complained', unsubscribed: 'unsubscribed',
}
const RESEND: Record<string, Event> = {
  'email.delivered': 'delivered', 'email.opened': 'opened', 'email.bounced': 'bounced', 'email.complained': 'complained',
}

async function apply(provider: string, email: string, messageId: string | undefined, ev: Event) {
  const now = Date.now()
  const send = (messageId ? await one('SELECT id, contact_id FROM sends WHERE message_id = ?', [messageId]) : undefined)
    || await one('SELECT id, contact_id FROM sends WHERE email = ? AND provider = ? AND sent_at IS NOT NULL ORDER BY sent_at DESC LIMIT 1', [email.toLowerCase(), provider])
  if (!send) return
  if (ev === 'delivered') await run('UPDATE sends SET delivered_at = COALESCE(delivered_at, ?) WHERE id = ?', [now, send.id])
  if (ev === 'opened') await run('UPDATE sends SET opened_at = COALESCE(opened_at, ?) WHERE id = ?', [now, send.id])
  if (ev === 'bounced') {
    await run('UPDATE sends SET bounced_at = COALESCE(bounced_at, ?) WHERE id = ?', [now, send.id])
    await run("UPDATE contacts SET status = 'bounced' WHERE id = ? AND status = 'active'", [send.contact_id])
  }
  if (ev === 'complained' || ev === 'unsubscribed') await run("UPDATE contacts SET status = 'unsubscribed' WHERE id = ?", [send.contact_id])
}

export const POST = route(async (req: Request, ctx: { params: Promise<{ provider: string }> }) => {
  const token = new URL(req.url).searchParams.get('token') || ''
  if (!process.env.CRON_SECRET || !safeEqual(token, process.env.CRON_SECRET)) return fail('Forbidden', 403)
  const { provider } = await ctx.params
  const body = await req.json()
  await setKv('webhooks_seen', '1')
  if (provider === 'brevo') {
    for (const e of Array.isArray(body) ? body : [body]) {
      const ev = BREVO[e.event]
      if (ev && e.email) await apply('brevo', e.email, e['message-id'], ev)
    }
  } else if (provider === 'resend') {
    const ev = RESEND[body.type]
    const to = body.data?.to?.[0]
    if (ev && to) await apply('resend', to, undefined, ev)
  } else return fail('Unknown provider', 404)
  return json({ ok: true })
})

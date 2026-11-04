import { getKv, one } from './db'
import { imapConfigured } from './inbox'
import { domainChecks, missingCreds } from './providers'
import { getSettings, isLive } from './settings'

export interface Check { label: string; ok: boolean; blocking: boolean; help: string }

/** What has to be true before real emails go out. Blocking items stop a live start. */
export async function preflight(): Promise<Check[]> {
  const s = await getSettings()
  const domain = s.from_email.split('@')[1] || ''
  const dns = await domainChecks(domain)
  const contacts = Number((await one<{ n: number }>("SELECT COUNT(*) n FROM contacts WHERE status = 'active'"))?.n || 0)
  const brevo = !missingCreds('brevo').length && dns.brevo
  const resend = !missingCreds('resend').length && dns.resend
  const https = (process.env.APP_URL || '').startsWith('https://')
  const scheduler = Date.now() - Number((await getKv('cron_last')) || 0) < 15 * 60 * 1000

  return [
    { label: 'Contacts', ok: contacts > 0, blocking: true, help: 'Import a contact list first.' },
    { label: 'Sender ready', ok: brevo || resend, blocking: true, help: 'Connect Brevo or Resend and add its domain records.' },
    { label: 'Public address', ok: https, blocking: true, help: 'The unsubscribe link needs a public https address, so real campaigns run from the live site.' },
    { label: 'DMARC record', ok: dns.dmarc, blocking: true, help: 'Gmail and Yahoo expect it for bulk mail.' },
    { label: 'Footer address', ok: s.address.trim().length > 10, blocking: true, help: 'US law requires a real postal address in Settings.' },
    { label: 'Scheduler', ok: scheduler, blocking: false, help: 'Set up cron-job.org from Settings. Without it, batches only go out while this tool is open.' },
    { label: 'Both senders', ok: brevo && resend, blocking: false, help: 'With one sender the campaign takes longer.' },
    { label: 'Reply inbox', ok: imapConfigured(), blocking: false, help: 'Replies still reach info@, but they will not show here.' },
    { label: 'Real sending', ok: isLive(), blocking: false, help: 'Practice mode is on, so nothing will really be sent.' },
  ]
}

import { CopyField, ProviderCard, ResetPractice, SettingsForm } from '@/components/SettingsParts'
import { Badge, Icon, PageHead, when } from '@/components/ui'
import { getKv, one } from '@/lib/db'
import { imapConfigured } from '@/lib/inbox'
import { domainChecks, missingCreds, PROVIDER_LABEL, providers, usedToday } from '@/lib/providers'
import { getSettings, isLive } from '@/lib/settings'
import { deploymentInfo } from '@/lib/setup'

function Check({ ok, label, help }: { ok: boolean; label: string; help: string }) {
  return (
    <li className="flex items-start gap-2.5 py-2.5">
      <span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full ${ok ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad'}`}><Icon name={ok ? 'check' : 'x'} size={12} /></span>
      <div className="min-w-0"><p className="text-sm font-bold">{label} <span className={`font-semibold ${ok ? 'text-good' : 'text-bad'}`}>{ok ? 'found' : 'missing'}</span></p><p className="text-[13px] text-ink-2">{help}</p></div>
    </li>
  )
}

export default async function SettingsPage() {
  const [settings, provs, inboxError, synced] = await Promise.all([getSettings(), providers(), getKv('inbox_error'), getKv('inbox_synced')])
  const domain = settings.from_email.split('@')[1] || ''
  const dns = await domainChecks(domain)
  const cards = await Promise.all(provs.map(async (p) => ({ ...p, used: await usedToday(p.name), missing: missingCreds(p.name) })))
  const app = (process.env.APP_URL || '').replace(/\/$/, '')
  const secret = process.env.CRON_SECRET || ''
  const isPublic = app.startsWith('https')
  const info = deploymentInfo()
  const stored = await one<{ n: number }>('SELECT COUNT(*) n FROM contacts')

  return (
    <>
      <PageHead title="Settings" sub="Connections, limits and what goes in every email.">
        {isLive() ? <Badge tone="good" icon="send">Live: real emails</Badge> : <Badge tone="warn" icon="pause">Practice mode</Badge>}
      </PageHead>

      <p className="mb-5 rounded-lg border border-line bg-white px-4 py-2.5 font-mono text-[12.5px] text-ink-2">
        environment: {info.environment} · SEND_MODE: {info.mode} · database: {info.database} · contacts: {Number(stored?.n || 0).toLocaleString()}{info.commit ? ` · build: ${info.commit}` : ''}
      </p>

      <h2 className="mb-3 text-lg">Connections</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((p) => (
          <ProviderCard key={p.name} name={p.name} label={PROVIDER_LABEL[p.name]} cap={Number(p.daily_cap)} used={p.used} enabled={!!p.enabled}
            missing={p.missing} pausedUntil={Number(p.paused_until)} lastError={p.last_error} />
        ))}
        <div className="card p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base">info@ inbox</h3>
            {!imapConfigured() ? <Badge tone="bad" icon="x">Not connected</Badge> : inboxError ? <Badge tone="bad" icon="alert">Login problem</Badge> : synced ? <Badge tone="good" icon="check">Connected</Badge> : <Badge tone="mute" icon="clock">Not checked yet</Badge>}
          </div>
          <p className="mt-2 text-[13px] leading-snug text-ink-2">Replies arrive in Hostinger as usual. This tool only reads them, and changes nothing there.{synced ? ` Last checked ${when(Number(synced))}.` : ''}</p>
          {!imapConfigured() && <p className="mt-2 text-[13px] font-semibold text-bad">Missing: IMAP_PASS</p>}
          {inboxError && <p className="mt-2 text-[13px] font-semibold text-bad">{inboxError}</p>}
        </div>
      </div>

      <section className="card mt-5 p-5">
        <h2 className="text-base">Domain records for {domain}</h2>
        <p className="mt-0.5 text-[13px] text-ink-2">Without these, Brevo and Resend refuse to send from your address, or mail lands in spam. Add them in Hostinger under Domains, DNS.</p>
        <ul className="mt-2 grid divide-y divide-line md:grid-cols-2 md:gap-x-8 md:divide-y-0">
          <Check ok={dns.brevo} label="Brevo" help="Brevo: Senders, Domains, then Add domain" />
          <Check ok={dns.resend} label="Resend" help="Resend: Domains, then Add domain" />
          <Check ok={dns.spf} label="SPF" help="Says which servers may send for this domain" />
          <Check ok={dns.dmarc} label="DMARC" help="Required by Gmail and Yahoo for bulk mail" />
        </ul>
      </section>

      <div className="mt-5"><SettingsForm settings={settings} /></div>

      <section className="card mt-5 p-5">
        <h2 className="text-base">Live setup links</h2>
        <p className="mt-0.5 text-[13px] text-ink-2">{isPublic ? 'Paste these into the services below. Keep them private.' : 'These work once the tool is on Vercel. On localhost, sending runs while this tab is open.'}</p>
        <div className="mt-4 grid gap-4">
          <CopyField label="Scheduler: call every minute (cron-job.org), keeps sending with the tab closed" value={`${app}/api/cron?token=${secret}`} />
          <CopyField label="Brevo webhook: Delivered, Opened, Hard bounce, Spam, Unsubscribed" value={`${app}/api/webhooks/brevo?token=${secret}`} />
          <CopyField label="Resend webhook: email.delivered, email.opened, email.bounced, email.complained" value={`${app}/api/webhooks/resend?token=${secret}`} />
        </div>
      </section>

      {!isLive() && (
        <section className="card mt-5 flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h2 className="text-base">Practice data</h2>
            <p className="mt-0.5 text-[13px] text-ink-2">Clear test campaigns before the first real one, so the numbers start at zero.</p>
          </div>
          <ResetPractice />
        </section>
      )}
    </>
  )
}

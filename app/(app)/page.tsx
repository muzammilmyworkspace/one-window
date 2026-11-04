import Link from 'next/link'
import { all, getKv, one } from '@/lib/db'
import { campaignStats, dailySends } from '@/lib/engine'
import { batches } from '@/lib/plan'
import { missingCreds, PROVIDER_LABEL, providers, usedToday } from '@/lib/providers'
import { Empty, Icon, Meter, Notice, PageHead, pct, Stat, StatusBadge, when } from '@/components/ui'
import SendsChart from '@/components/SendsChart'
import CampaignButtons from '@/components/CampaignButtons'

export default async function Dashboard() {
  const [stats, days, provs, running, replies, contacts, seen] = await Promise.all([
    campaignStats(), dailySends(), providers(),
    one("SELECT * FROM campaigns WHERE status IN ('running','paused') ORDER BY started_at LIMIT 1"),
    all("SELECT r.*, c.name campaign FROM replies r LEFT JOIN campaigns c ON c.id = r.campaign_id WHERE r.kind IN ('reply','unsubscribe') ORDER BY r.received_at DESC LIMIT 6"),
    all('SELECT list_name, status, COUNT(*) n FROM contacts GROUP BY list_name, status'),
    getKv('webhooks_seen'),
  ])
  const count = (s: string) => contacts.filter((c) => c.status === s).reduce((a, c) => a + Number(c.n), 0)
  const reached = await one<{ n: number }>('SELECT COUNT(DISTINCT contact_id) n FROM sends WHERE sent_at IS NOT NULL')
  const notYet = Math.max(0, count('active') - Number(reached?.n || 0))
  const total = contacts.reduce((a, c) => a + Number(c.n), 0)
  const usage = await Promise.all(provs.map(async (p) => ({ ...p, used: await usedToday(p.name), missing: missingCreds(p.name) })))
  const capacity = usage.filter((p) => p.enabled && !p.missing.length).reduce((a, p) => a + Number(p.daily_cap), 0)
  const rs = running ? await campaignStats(Number(running.id)) : null
  const plan = rs && running ? batches(rs.total, rs.sent, capacity, !!running.warmup, Number(running.started_at)) : []
  const current = plan.find((b) => b.state !== 'done')
  const none = seen ? null : 'Shows once the tool is live'

  return (
    <>
      <PageHead title="Dashboard" sub="Everything you have sent and everyone who answered.">
        <Link href="/campaigns/new" className="btn btn-primary"><Icon name="plus" size={16} /> New campaign</Link>
      </PageHead>

      {running && rs && (
        <section className="card mb-5 p-5">
          {running.pause_reason && <Notice tone="bad">{String(running.pause_reason)}</Notice>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/campaigns/${running.id}`} className="font-display text-lg font-semibold hover:underline">{running.name}</Link>
                <StatusBadge status={running.status} />
              </div>
              <p className="mt-1 text-sm text-ink-2">
                {rs.sent.toLocaleString()} of {rs.total.toLocaleString()} sent
                {current ? ` · Batch ${current.index + 1} of ${plan.length}: ${current.done} of ${current.size} sent` : ''}
              </p>
            </div>
            <CampaignButtons id={Number(running.id)} status={String(running.status)} />
          </div>
          <div className="mt-3"><Meter value={rs.sent} max={rs.total} label="Campaign progress" /></div>
        </section>
      )}

      <section aria-label="Your emails" className="mb-5">
        <h2 className="mb-3 text-base">Your emails</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat label="Total emails" value={total} sub="All contacts" />
          <Stat label="Ready to email" value={count('active')} sub="Not unsubscribed or bounced" />
          <Stat label="Not emailed yet" value={notYet} sub="Still waiting for a first email" />
        </div>
      </section>

      <h2 className="mb-3 text-base">Results</h2>
      <section aria-label="Totals" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Sent" value={stats.sent} sub="Emails sent so far" />
        <Stat label="Replies" value={stats.replied} sub={`${pct(stats.replied, stats.sent)} of sent`} />
        <Stat label="Delivered" value={seen ? stats.delivered : '–'} sub={none || `${pct(stats.delivered, stats.sent)} of sent`} />
        <Stat label="Opened" value={seen ? stats.opened : '–'} sub={none || `${pct(stats.opened, stats.sent)} of sent`} />
        <Stat label="Bounced" value={count('bounced')} sub="Removed from future sends" />
        <Stat label="Unsubscribed" value={count('unsubscribed')} sub="Removed from future sends" />
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="card p-5">
          <h2 className="mb-4 text-base">Emails sent per day</h2>
          <SendsChart data={days} />
        </section>
        <section className="card p-5">
          <h2 className="text-base">Senders today</h2>
          <p className="mb-4 mt-0.5 text-[13px] text-ink-3">Each stays under its daily limit, rolling 24 hours.</p>
          <div className="space-y-4">
            {usage.map((p) => (
              <div key={p.name}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-bold">{PROVIDER_LABEL[p.name]}</span>
                  {p.missing.length
                    ? <Link href="/settings" className="text-[13px] font-semibold text-bad hover:underline">Not connected</Link>
                    : <span className="tabular-nums text-ink-2">{p.used} / {p.daily_cap}</span>}
                </div>
                <Meter value={p.used} max={Number(p.daily_cap)} label={`${PROVIDER_LABEL[p.name]} usage today`} />
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card mt-5 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
          <h2 className="text-base">Latest replies</h2>
          <Link href="/inbox" className="text-sm font-bold text-brand-dark hover:underline">Open inbox</Link>
        </div>
        {replies.length === 0 ? (
          <Empty icon="reply" title="No replies yet">Replies go to info@ as usual, and show up here too.</Empty>
        ) : (
          <ul>
            {replies.map((r) => (
              <li key={r.id} className="border-t border-line">
                <Link href={`/inbox?id=${r.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-page">
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${r.is_read ? 'font-semibold' : 'font-extrabold'}`}>{r.from_name || r.from_email}</p>
                    <p className="truncate text-[13px] text-ink-2">{String(r.body).trim().slice(0, 120) || r.subject}</p>
                  </div>
                  <StatusBadge status={r.kind} />
                  <span className="hidden w-16 text-right text-xs text-ink-3 sm:block">{when(r.received_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

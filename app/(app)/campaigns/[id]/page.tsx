import Link from 'next/link'
import { notFound } from 'next/navigation'
import CampaignButtons from '@/components/CampaignButtons'
import CampaignEditor from '@/components/CampaignEditor'
import { Empty, Icon, Meter, Notice, PageHead, pct, Stat, StatusBadge, when } from '@/components/ui'
import { all, one } from '@/lib/db'
import { renderEmail } from '@/lib/email'
import { editorData } from '@/lib/editorData'
import { campaignStats } from '@/lib/engine'
import { batches } from '@/lib/plan'
import { dailyCapacity, PROVIDER_LABEL, type ProviderName } from '@/lib/providers'
import SendingPlan from '@/components/SendingPlan'
import { TEMPLATES } from '@/lib/seed'
import { getSettings } from '@/lib/settings'

const FILTERS = [['all', 'All'], ['sent', 'Sent'], ['queued', 'Queued'], ['replied', 'Replied'], ['bounced', 'Bounced'], ['failed', 'Failed']] as const
const WHERE: Record<string, string> = {
  sent: 's.sent_at IS NOT NULL', queued: "s.status IN ('queued','sending')", replied: 's.replied_at IS NOT NULL',
  bounced: 's.bounced_at IS NOT NULL', failed: "s.status IN ('failed','skipped')",
}
const PAGE = 50

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string; p?: string }> }) {
  const id = Number((await params).id)
  const q = await searchParams
  const c = await one('SELECT * FROM campaigns WHERE id = ?', [id])
  if (!c) notFound()

  if (c.status === 'draft') {
    return (
      <>
        <PageHead title={String(c.name)} sub={<Link href="/campaigns" className="hover:underline">Back to campaigns</Link>} />
        <CampaignEditor {...await editorData()} templates={TEMPLATES} initial={{
          id, name: String(c.name), subject: String(c.subject), preheader: String(c.preheader), html: String(c.html),
          states: String(c.states).split(',').filter(Boolean), follow_up_of: c.follow_up_of ? Number(c.follow_up_of) : null, warmup: !!c.warmup,
        }} />
      </>
    )
  }

  const f = q.f && WHERE[q.f] ? q.f : 'all'
  const page = Math.max(1, Number(q.p) || 1)
  const where = `s.campaign_id = ?${WHERE[f] ? ` AND ${WHERE[f]}` : ''}`
  const [stats, rows, count, mail] = await Promise.all([
    campaignStats(id),
    all(`SELECT s.*, ct.first_name, ct.last_name, ct.state FROM sends s JOIN contacts ct ON ct.id = s.contact_id WHERE ${where} ORDER BY COALESCE(s.sent_at, 0) DESC, s.id LIMIT ? OFFSET ?`, [id, PAGE, (page - 1) * PAGE]),
    one<{ n: number }>(`SELECT COUNT(*) n FROM sends s WHERE ${where}`, [id]),
    renderEmail({ subject: String(c.subject), html: String(c.html), preheader: String(c.preheader) }, { email: 'sarah@example.com', first_name: 'Sarah', last_name: 'Johnson', state: 'TX' }, await getSettings()),
  ])
  const pages = Math.max(1, Math.ceil(Number(count?.n || 0) / PAGE))
  const plan = batches(stats.total, stats.sent, await dailyCapacity(), !!c.warmup, Number(c.started_at))
  const link = (nf: string, p = 1) => `/campaigns/${id}?f=${nf}&p=${p}`

  return (
    <>
      <PageHead title={String(c.name)} sub={<Link href="/campaigns" className="hover:underline">Back to campaigns</Link>}>
        <StatusBadge status={String(c.status)} />
        <CampaignButtons id={id} status={String(c.status)} failed={stats.failed} full />
      </PageHead>

      {c.pause_reason && <Notice tone="bad">{String(c.pause_reason)} Check the list before you resume.</Notice>}

      <section className="card mb-5 p-5">
        <div className="mb-2 flex justify-between gap-3 text-sm"><span className="font-bold">{stats.sent.toLocaleString()} of {stats.total.toLocaleString()} sent</span><span className="tabular-nums text-ink-2">{pct(stats.sent, stats.total)}</span></div>
        <Meter value={stats.sent} max={stats.total} label="Campaign progress" />
      </section>

      <section aria-label="Totals" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Replies" value={stats.replied} sub={`${pct(stats.replied, stats.sent)} of sent`} />
        <Stat label="Waiting to send" value={stats.queued} />
        <Stat label="Bounced" value={stats.bounced} sub={pct(stats.bounced, stats.sent)} />
        <Stat label="Failed or skipped" value={stats.failed + stats.skipped} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="card min-w-0 overflow-hidden">
          <nav aria-label="Filter" className="flex gap-1 overflow-x-auto border-b border-line p-2">
            {FILTERS.map(([k, label]) => <Link key={k} href={link(k)} aria-current={f === k ? 'true' : undefined} className={`flex-none rounded-lg px-3 py-1.5 text-sm font-bold ${f === k ? 'bg-brand-soft text-brand-dark' : 'text-ink-2 hover:bg-page'}`}>{label}</Link>)}
          </nav>
          {rows.length === 0 ? <Empty icon="users" title="Nobody here" /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead><tr><th className="th">Person</th><th className="th">Status</th><th className="th">Sender</th><th className="th text-right">When</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="td max-w-[260px]"><p className="truncate font-semibold">{`${r.first_name} ${r.last_name}`.trim() || r.email}</p><p className="truncate text-[13px] text-ink-3">{r.email}</p></td>
                      <td className="td">
                        {r.replied_at ? <StatusBadge status="reply" /> : r.bounced_at ? <StatusBadge status="bounced" /> : <StatusBadge status={r.status} />}
                        {r.last_error && r.status !== 'sent' && <p className="mt-1 max-w-[240px] truncate text-xs text-bad" title={r.last_error}>{r.last_error}</p>}
                      </td>
                      <td className="td text-[13px] text-ink-2">{r.provider ? PROVIDER_LABEL[r.provider as ProviderName] : '–'}</td>
                      <td className="td text-right text-[13px] text-ink-2">{when(r.sent_at) || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
              {page > 1 ? <Link href={link(f, page - 1)} className="btn btn-ghost">Previous</Link> : <span />}
              <span className="text-ink-2">Page {page} of {pages}</span>
              {page < pages ? <Link href={link(f, page + 1)} className="btn btn-ghost">Next</Link> : <span />}
            </div>
          )}
        </section>
        <div className="space-y-5 self-start">
        <section className="card p-4">
          <h2 className="mb-3 text-base">Sending plan</h2>
          <SendingPlan batches={plan} started />
        </section>
        <section className="card overflow-hidden">
          <div className="border-b border-line p-4">
            <h2 className="flex items-center gap-2 text-base"><Icon name="send" size={16} /> The email</h2>
            <p className="mt-1 text-sm text-ink-2">{mail.subject}</p>
          </div>
          <iframe title="Email sent in this campaign" sandbox="" srcDoc={mail.html} className="h-[560px] w-full" />
        </section>
        </div>
      </div>
    </>
  )
}

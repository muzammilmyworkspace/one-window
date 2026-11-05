import Link from 'next/link'
import { all } from '@/lib/db'
import StateCards from '@/components/StateCards'
import { Empty, Icon, Meter, PageHead, pct, StatusBadge, when } from '@/components/ui'
import { ensureDrafts } from '@/lib/drafts'
import { stateOverview } from '@/lib/editorData'
import { stateName } from '@/lib/lists'

export default async function Campaigns() {
  await ensureDrafts()
  const rows = await all(`SELECT c.*,
    (SELECT COUNT(*) FROM sends s WHERE s.campaign_id = c.id) total,
    (SELECT COUNT(*) FROM sends s WHERE s.campaign_id = c.id AND s.sent_at IS NOT NULL) sent,
    (SELECT COUNT(*) FROM sends s WHERE s.campaign_id = c.id AND s.replied_at IS NOT NULL) replied,
    (SELECT COUNT(*) FROM sends s WHERE s.campaign_id = c.id AND s.bounced_at IS NOT NULL) bounced
    FROM campaigns c WHERE c.auto_child = 0 ORDER BY c.created_at DESC`)
  const states = await stateOverview()
  return (
    <>
      <PageHead title="Campaigns" sub="Pick a state to write its email.">
        <Link href="/campaigns/new" className="btn btn-primary"><Icon name="plus" size={16} /> New campaign</Link>
      </PageHead>
      <section aria-label="States" className="mb-7"><StateCards states={states} /></section>

      <h2 className="mb-3 text-base">All campaigns</h2>
      <section className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty icon="send" title="No campaigns yet">Pick a state above to start.</Empty>
        ) : (
          <table className="w-full min-w-[840px]">
            <thead><tr><th className="th">Campaign</th><th className="th">State</th><th className="th">Status</th><th className="th w-52">Progress</th><th className="th text-right">Replies</th><th className="th text-right">Bounced</th><th className="th text-right">Started</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-page">
                  <td className="td max-w-xs"><Link href={`/campaigns/${c.id}`} className="block truncate font-bold hover:underline">{c.name}</Link><span className="block truncate text-[13px] text-ink-3">{c.subject}</span></td>
                  <td className="td text-[13px]">{String(c.states).split(',').filter(Boolean).map(stateName).join(', ') || 'All states'}</td>
                  <td className="td"><StatusBadge status={c.status} /></td>
                  <td className="td">{Number(c.total) > 0 ? <><Meter value={Number(c.sent)} max={Number(c.total)} label={`${c.name} progress`} /><p className="mt-1 text-xs tabular-nums text-ink-2">{Number(c.sent).toLocaleString()} of {Number(c.total).toLocaleString()}</p></> : <span className="text-[13px] text-ink-3">Not started</span>}</td>
                  <td className="td text-right tabular-nums">{Number(c.replied)} <span className="text-xs text-ink-3">{pct(Number(c.replied), Number(c.sent))}</span></td>
                  <td className="td text-right tabular-nums">{Number(c.bounced)}</td>
                  <td className="td text-right text-[13px] text-ink-2">{when(c.started_at) || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}

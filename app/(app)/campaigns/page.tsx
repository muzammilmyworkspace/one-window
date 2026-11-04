import Link from 'next/link'
import { all } from '@/lib/db'
import { Empty, Icon, Meter, PageHead, pct, StatusBadge, when } from '@/components/ui'

export default async function Campaigns() {
  const rows = await all(`SELECT c.*,
    (SELECT COUNT(*) FROM sends s WHERE s.campaign_id = c.id) total,
    (SELECT COUNT(*) FROM sends s WHERE s.campaign_id = c.id AND s.sent_at IS NOT NULL) sent,
    (SELECT COUNT(*) FROM sends s WHERE s.campaign_id = c.id AND s.replied_at IS NOT NULL) replied,
    (SELECT COUNT(*) FROM sends s WHERE s.campaign_id = c.id AND s.bounced_at IS NOT NULL) bounced
    FROM campaigns c ORDER BY c.created_at DESC`)
  return (
    <>
      <PageHead title="Campaigns" sub="Write an email, choose who gets it, and start.">
        <Link href="/campaigns/new" className="btn btn-primary"><Icon name="plus" size={16} /> New campaign</Link>
      </PageHead>
      <section className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty icon="send" title="No campaigns yet">Your two prepared Open Enrollment emails are ready to use in a new campaign.</Empty>
        ) : (
          <table className="w-full min-w-[720px]">
            <thead><tr><th className="th">Campaign</th><th className="th">Status</th><th className="th w-52">Progress</th><th className="th text-right">Replies</th><th className="th text-right">Bounced</th><th className="th text-right">Started</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-page">
                  <td className="td max-w-xs"><Link href={`/campaigns/${c.id}`} className="block truncate font-bold hover:underline">{c.name}</Link><span className="block truncate text-[13px] text-ink-3">{c.subject}</span></td>
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

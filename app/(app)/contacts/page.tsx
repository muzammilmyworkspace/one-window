import Link from 'next/link'
import { ImportButton, StatusToggle } from '@/components/ContactActions'
import { Empty, Icon, PageHead, Stat, StatusBadge } from '@/components/ui'
import { all, one } from '@/lib/db'

const PAGE = 50

export default async function Contacts({ searchParams }: { searchParams: Promise<{ q?: string; state?: string; status?: string; p?: string }> }) {
  const sp = await searchParams
  const q = (sp.q || '').trim(), state = sp.state || '', status = sp.status || ''
  const page = Math.max(1, Number(sp.p) || 1)

  const conds: string[] = [], args: (string | number)[] = []
  if (q) { conds.push("(email LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR first_name || ' ' || last_name LIKE ?)"); args.push(...Array(4).fill(`%${q}%`)) }
  if (state) { conds.push('state = ?'); args.push(state) }
  if (status) { conds.push('status = ?'); args.push(status) }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''

  const [rows, match, byStatus, states] = await Promise.all([
    all(`SELECT * FROM contacts ${where} ORDER BY state, last_name, first_name LIMIT ? OFFSET ?`, [...args, PAGE, (page - 1) * PAGE]),
    one<{ n: number }>(`SELECT COUNT(*) n FROM contacts ${where}`, args),
    all('SELECT status, COUNT(*) n FROM contacts GROUP BY status'),
    all("SELECT state, COUNT(*) n FROM contacts WHERE state != '' GROUP BY state ORDER BY state"),
  ])
  const n = (s: string) => Number(byStatus.find((b) => b.status === s)?.n || 0)
  const total = byStatus.reduce((a, b) => a + Number(b.n), 0)
  const pages = Math.max(1, Math.ceil(Number(match?.n || 0) / PAGE))
  const link = (p: number) => `/contacts?${new URLSearchParams({ q, state, status, p: String(p) })}`

  return (
    <>
      <PageHead title="Contacts" sub="Importing the same file twice is safe: nobody is added twice, and unsubscribes stay.">
        <a href="/api/export?type=contacts" className="btn btn-ghost"><Icon name="download" size={16} /> Export</a>
        <ImportButton />
      </PageHead>

      <section aria-label="Totals" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="All contacts" value={total} />
        <Stat label="Active" value={n('active')} sub="Can be emailed" />
        <Stat label="Unsubscribed" value={n('unsubscribed')} sub="Never emailed again" />
        <Stat label="Bounced" value={n('bounced')} sub="Never emailed again" />
      </section>

      <section className="card overflow-hidden">
        <form className="flex flex-wrap gap-2 border-b border-line p-3" role="search">
          <input name="q" defaultValue={q} aria-label="Search" placeholder="Search name or email" className="field min-w-[200px] flex-1" />
          <select name="state" defaultValue={state} aria-label="State" className="field w-auto">
            <option value="">All states</option>
            {states.map((s) => <option key={s.state} value={s.state}>{s.state} ({Number(s.n).toLocaleString()})</option>)}
          </select>
          <select name="status" defaultValue={status} aria-label="Status" className="field w-auto">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="unsubscribed">Unsubscribed</option>
            <option value="bounced">Bounced</option>
          </select>
          <button className="btn btn-ghost">Apply</button>
        </form>
        {rows.length === 0 ? (
          <Empty icon="users" title={total ? 'Nobody matches' : 'No contacts yet'}>
            {total ? <Link href="/contacts" className="font-bold text-brand-dark hover:underline">Clear filters</Link> : 'Import your Excel file. It needs an Email column; First Name, Last Name and State are used too.'}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead><tr><th className="th">Name</th><th className="th">Email</th><th className="th">State</th><th className="th">Status</th><th className="th" /></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-page">
                    <td className="td font-semibold">{`${c.first_name} ${c.last_name}`.trim() || <span className="text-ink-3">No name</span>}</td>
                    <td className="td text-ink-2">{c.email}</td>
                    <td className="td">{c.state || '–'}</td>
                    <td className="td"><StatusBadge status={c.status} /></td>
                    <td className="td text-right"><StatusToggle id={Number(c.id)} status={String(c.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
            {page > 1 ? <Link href={link(page - 1)} className="btn btn-ghost">Previous</Link> : <span />}
            <span className="text-ink-2">Page {page} of {pages.toLocaleString()} · {Number(match?.n).toLocaleString()} people</span>
            {page < pages ? <Link href={link(page + 1)} className="btn btn-ghost">Next</Link> : <span />}
          </div>
        )}
      </section>
    </>
  )
}

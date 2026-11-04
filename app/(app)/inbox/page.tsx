import Link from 'next/link'
import { MarkUnread, SyncButton } from '@/components/InboxActions'
import { Empty, Icon, Notice, PageHead, StatusBadge, when } from '@/components/ui'
import { all, getKv, one, run } from '@/lib/db'
import { imapConfigured } from '@/lib/inbox'
import { getSettings } from '@/lib/settings'

const TABS = [['reply', 'Replies'], ['unsubscribe', 'Unsubscribes'], ['auto', 'Auto-replies'], ['bounce', 'Bounces']] as const

/** Splits what the person wrote from the quoted email under it. */
function splitQuote(body: string): [string, string] {
  const m = body.search(/^(On .+wrote:|>|-{2,} ?Original Message|From: .+)/m)
  return m > 0 ? [body.slice(0, m).trim(), body.slice(m).trim()] : [body.trim(), '']
}

export default async function Inbox({ searchParams }: { searchParams: Promise<{ tab?: string; id?: string }> }) {
  const sp = await searchParams
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : 'reply'
  const id = Number(sp.id) || 0

  const open = id ? await one(`SELECT r.*, c.name campaign, ct.first_name, ct.last_name, ct.state, ct.status contact_status
    FROM replies r LEFT JOIN campaigns c ON c.id = r.campaign_id LEFT JOIN contacts ct ON ct.id = r.contact_id WHERE r.id = ?`, [id]) : undefined
  if (open && !open.is_read) await run('UPDATE replies SET is_read = 1 WHERE id = ?', [id])

  const activeTab = open ? String(open.kind) : tab
  const [rows, counts, synced, error, settings] = await Promise.all([
    all('SELECT id, from_name, from_email, subject, body, kind, is_read, received_at FROM replies WHERE kind = ? ORDER BY received_at DESC LIMIT 100', [activeTab]),
    all('SELECT kind, COUNT(*) n FROM replies GROUP BY kind'),
    getKv('inbox_synced'), getKv('inbox_error'), getSettings(),
  ])
  const count = (k: string) => Number(counts.find((c) => c.kind === k)?.n || 0)
  const connected = imapConfigured()
  const [said, quoted] = open ? splitQuote(String(open.body)) : ['', '']
  const reSubject = open ? (/^re:/i.test(String(open.subject)) ? String(open.subject) : `Re: ${open.subject}`) : ''

  return (
    <>
      <PageHead title="Inbox" sub={<>Replies from people you emailed. Every one is also in {settings.reply_to}{synced ? `. Checked ${when(Number(synced))}` : ''}.</>}>
        <SyncButton disabled={!connected} />
      </PageHead>

      {!connected && <Notice tone="warn">The info@ inbox is not connected yet. Add its password as IMAP_PASS, then replies appear here.</Notice>}
      {connected && error && <Notice tone="bad">Could not read the inbox: {error}</Notice>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="card min-w-0 self-start overflow-hidden">
          <nav aria-label="Reply types" className="flex gap-1 overflow-x-auto border-b border-line p-2">
            {TABS.map(([k, label]) => (
              <Link key={k} href={`/inbox?tab=${k}`} aria-current={activeTab === k ? 'true' : undefined} className={`flex-none rounded-lg px-2.5 py-1.5 text-[13px] font-bold ${activeTab === k ? 'bg-brand-soft text-brand-dark' : 'text-ink-2 hover:bg-page'}`}>
                {label} <span className="font-semibold opacity-70">{count(k)}</span>
              </Link>
            ))}
          </nav>
          {rows.length === 0 ? <Empty icon="inbox" title="Nothing here yet" /> : (
            <ul className="max-h-[640px] overflow-y-auto">
              {rows.map((r) => (
                <li key={r.id} className="border-b border-line last:border-0">
                  <Link href={`/inbox?id=${r.id}`} aria-current={id === Number(r.id) ? 'true' : undefined} className={`block px-4 py-3 ${id === Number(r.id) ? 'bg-brand-soft' : 'hover:bg-page'}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={`min-w-0 truncate text-sm ${r.is_read || id === Number(r.id) ? 'font-semibold' : 'font-extrabold'}`}>
                        {!r.is_read && id !== Number(r.id) && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-sun align-middle" aria-label="Unread" />}
                        {r.from_name || r.from_email}
                      </p>
                      <span className="flex-none text-xs text-ink-3">{when(r.received_at)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-ink-2">{String(r.body).trim().slice(0, 110) || r.subject}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card min-w-0 self-start">
          {!open ? <Empty icon="reply" title="Choose a message">It opens here. Nothing changes in the info@ mailbox.</Empty> : (
            <>
              <div className="border-b border-line p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={String(open.kind)} />
                  {open.contact_status && open.contact_status !== 'active' && <StatusBadge status={String(open.contact_status)} />}
                </div>
                <h2 className="mt-2 break-words text-lg">{String(open.subject) || '(no subject)'}</h2>
                <p className="mt-1 break-all text-sm text-ink-2"><b className="text-ink">{open.from_name || `${open.first_name || ''} ${open.last_name || ''}`.trim()}</b> {`<${open.from_email}>`}</p>
                <p className="mt-0.5 text-[13px] text-ink-3">
                  {new Date(Number(open.received_at)).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                  {open.state ? ` · ${open.state}` : ''}{open.campaign ? ` · ${open.campaign}` : ''}
                </p>
              </div>
              <div className="whitespace-pre-wrap break-words p-5 text-[15px] leading-relaxed">{said || '(empty message)'}</div>
              {quoted && (
                <details className="mx-5 mb-5 rounded-lg bg-page px-4 py-3 text-sm text-ink-2">
                  <summary className="cursor-pointer font-semibold">Show the earlier email</summary>
                  <div className="mt-2 whitespace-pre-wrap break-words">{quoted}</div>
                </details>
              )}
              <div className="flex flex-wrap items-center gap-2 border-t border-line p-4">
                <a href={`mailto:${open.from_email}?subject=${encodeURIComponent(reSubject)}`} className="btn btn-primary"><Icon name="reply" size={15} /> Reply</a>
                <a href={settings.webmail_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost"><Icon name="link" size={15} /> Open info@ webmail</a>
                <MarkUnread id={Number(open.id)} />
              </div>
            </>
          )}
        </section>
      </div>
    </>
  )
}

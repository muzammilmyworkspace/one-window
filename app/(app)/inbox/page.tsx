import Link from 'next/link'
import { MarkUnread, SyncButton } from '@/components/InboxActions'
import { Composer, EmailFrame } from '@/components/Mail'
import { Badge, Empty, Icon, Notice, PageHead, StatusBadge, when } from '@/components/ui'
import { getKv } from '@/lib/db'
import { imapConfigured } from '@/lib/inbox'
import { FOLDERS, folderCounts, fullName, listBounces, listSent, listThreads, thread, type FolderKey, type Message } from '@/lib/mailbox'
import { stateName } from '@/lib/lists'
import { getSettings } from '@/lib/settings'

const TZ = process.env.APP_TIMEZONE || 'Asia/Karachi'
const stamp = (ms: number) => new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ })
const initials = (s: string) => s.replace(/[<>"]/g, '').split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'
const snippet = (s: string, n = 120) => s.replace(/\s+/g, ' ').trim().slice(0, n)

type Search = { f?: string; c?: string; q?: string; p?: string }

export default async function Inbox({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams
  const folder = FOLDERS.find((x) => x.key === sp.f) || FOLDERS[0]
  const q = String(sp.q || '').trim().slice(0, 100)
  const page = Math.max(1, Number(sp.p) || 1)
  const open = Number(sp.c) || 0
  const settings = await getSettings()

  const t = open ? await thread(open, settings) : null   // opening marks it read, so counts come after
  const [counts, list, synced, error] = await Promise.all([
    folderCounts(),
    folder.key === 'sent' ? listSent(q, page)
      : folder.key === 'bounce' ? listBounces(q).then((rows) => ({ rows, more: false }))
      : listThreads(folder.kind!, q).then((rows) => ({ rows, more: false })),
    getKv('inbox_synced'), getKv('inbox_error'),
  ])
  const connected = imapConfigured()

  const href = (o: { f?: FolderKey; c?: number; q?: string; p?: number }) => {
    const u = new URLSearchParams()
    u.set('f', o.f || folder.key)
    if (o.q ?? q) u.set('q', o.q ?? q)
    if (o.p && o.p > 1) u.set('p', String(o.p))
    if (o.c) u.set('c', String(o.c))
    return `/inbox?${u}`
  }
  const listHref = href({ p: page })

  return (
    <>
      <PageHead title="Inbox" sub={<>Every conversation with the people you emailed, also in {settings.reply_to}{synced ? `. Checked ${when(Number(synced))}` : ''}.</>}>
        <a href="/api/export?type=replied" className="btn btn-ghost"><Icon name="download" size={15} /> Export for sales</a>
        <SyncButton disabled={!connected} />
      </PageHead>

      {!connected && <Notice tone="warn">The info@ inbox is not connected yet. Add its password as IMAP_PASS, then replies appear here.</Notice>}
      {connected && error && <Notice tone="bad">Could not read the inbox: {error}</Notice>}

      <div className="card overflow-hidden lg:grid lg:h-[calc(100vh-200px)] lg:min-h-[560px] lg:grid-cols-[190px_330px_minmax(0,1fr)]">
        {/* folders */}
        <nav aria-label="Folders" className={`${t ? 'hidden lg:flex' : 'flex'} gap-1 overflow-x-auto border-b border-line bg-page/50 p-2 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r lg:p-3`}>
          {FOLDERS.map((x) => {
            const on = x.key === folder.key, n = counts[x.key]
            return (
              <Link key={x.key} href={`/inbox?f=${x.key}`} aria-current={on ? 'page' : undefined}
                className={`flex flex-none items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold ${on ? 'bg-white text-brand-dark shadow-card' : 'text-ink-2 hover:bg-white/70 hover:text-ink'}`}>
                <Icon name={x.icon} size={16} />
                <span>{x.label}</span>
                {n.unread > 0
                  ? <span className="ml-auto rounded-full bg-sun px-1.5 text-xs font-extrabold text-deep" aria-label={`${n.unread} unread`}>{n.unread}</span>
                  : <span className="ml-auto text-xs font-semibold text-ink-3">{n.total || ''}</span>}
              </Link>
            )
          })}
          <a href={settings.webmail_url} target="_blank" rel="noopener noreferrer" className="mt-auto hidden items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-ink-3 hover:text-ink lg:flex">
            <Icon name="link" size={14} /> info@ webmail
          </a>
        </nav>

        {/* message list */}
        <section aria-label={folder.label} className={`${t ? 'hidden lg:flex' : 'flex'} min-h-0 min-w-0 flex-col border-line lg:border-r`}>
          <form action="/inbox" className="border-b border-line p-2.5">
            <input type="hidden" name="f" value={folder.key} />
            <label className="relative block">
              <span className="sr-only">Search {folder.label}</span>
              <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input name="q" defaultValue={q} placeholder={`Search ${folder.label.toLowerCase()}`} className="field !py-2 !pl-9 !text-[13px]" />
            </label>
          </form>
          {list.rows.length === 0 ? (
            <Empty icon={folder.icon} title={q ? 'No matches' : 'Nothing here yet'}>
              {q ? <Link href={`/inbox?f=${folder.key}`} className="font-semibold text-brand-dark underline">Clear the search</Link>
                : folder.key === 'inbox' ? 'Replies from people you emailed show up here.'
                : folder.key === 'bounce' ? 'Addresses that could not get your email show up here, with the reason.' : null}
            </Empty>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {list.rows.map((r) => {
                const on = Number(r.contact_id) === open
                const unread = folder.key !== 'sent' && Number(r.unread) > 0 && !on
                const who = fullName(r) || r.from_name || r.email || r.from_email
                const at = Number(folder.key === 'sent' ? r.at : r.last)
                return (
                  <li key={folder.key === 'sent' ? `${r.type}${r.id}` : r.contact_id} className="border-b border-line">
                    <Link href={href({ c: Number(r.contact_id), p: page })} aria-current={on ? 'true' : undefined}
                      className={`block border-l-[3px] px-3.5 py-3 ${on ? 'border-brand bg-brand-soft/70' : unread ? 'border-sun hover:bg-page' : 'border-transparent hover:bg-page'}`}>
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={`min-w-0 truncate text-sm ${unread ? 'font-extrabold' : 'font-semibold'}`}>
                          {folder.key === 'sent' && <span className="font-normal text-ink-3">To: </span>}{who}
                          {folder.key !== 'sent' && Number(r.total) > 1 && <span className="ml-1.5 text-xs font-semibold text-ink-3">{Number(r.total)}</span>}
                        </p>
                        <time className={`flex-none text-xs ${unread ? 'font-bold text-ink' : 'text-ink-3'}`}>{when(at)}</time>
                      </div>
                      <p className={`mt-0.5 truncate text-[13px] ${unread ? 'font-bold text-ink' : 'text-ink'}`}>{String(r.subject) || '(no subject)'}</p>
                      {folder.key === 'sent' ? (
                        <p className="mt-1 flex items-center gap-2 truncate text-xs text-ink-3">
                          <span className="truncate">{r.type === 'answer' ? 'Your reply' : r.label}</span>
                          {r.bounced_at ? <span className="font-semibold text-bad">Bounced</span>
                            : r.replied_at ? <span className="font-semibold text-good">Replied</span>
                            : r.clicked_at ? <span className="font-semibold text-blue">Clicked</span>
                            : r.opened_at ? <span className="font-semibold text-ink-2">Opened</span> : null}
                        </p>
                      ) : (
                        <p className="mt-0.5 truncate text-[13px] text-ink-2">{snippet(String(r.body)) || ' '}</p>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
          {folder.key === 'sent' && (page > 1 || list.more) && (
            <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[13px] font-semibold">
              {page > 1 ? <Link href={href({ p: page - 1 })} className="text-brand-dark">← Newer</Link> : <span />}
              <span className="text-ink-3">Page {page}</span>
              {list.more ? <Link href={href({ p: page + 1 })} className="text-brand-dark">Older →</Link> : <span />}
            </div>
          )}
        </section>

        {/* conversation */}
        <section aria-label="Conversation" className={`${t ? 'flex' : 'hidden lg:flex'} min-h-0 min-w-0 flex-col`}>
          {!t ? (
            <div className="m-auto"><Empty icon="reply" title={open ? 'Conversation not found' : 'Choose a conversation'}>The whole back and forth opens here: your emails, their replies and your answers.</Empty></div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <header className="sticky top-0 z-10 border-b border-line bg-white/95 px-4 py-3.5 backdrop-blur sm:px-6">
                <Link href={listHref} className="mb-2 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-dark lg:hidden"><Icon name="back" size={15} /> {folder.label}</Link>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-lg leading-snug">{t.subject}</h2>
                    <p className="mt-1 break-all text-[13px] text-ink-2"><b className="text-ink">{t.name}</b> &lt;{t.email}&gt;</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {t.contact?.status && <StatusBadge status={String(t.contact.status)} />}
                      {t.contact?.state && <Badge tone="mute">{stateName(String(t.contact.state))}</Badge>}
                      {t.contact?.company && <Badge tone="mute">{String(t.contact.company)}</Badge>}
                      {t.campaigns.map((c) => <Badge key={c} tone="info">{c}</Badge>)}
                    </div>
                  </div>
                  {t.latestReplyId > 0 && <MarkUnread id={t.latestReplyId} back={listHref} />}
                </div>
              </header>

              <ol className="space-y-3 px-3 py-4 sm:px-6">
                {t.messages.map((m, i) => <MessageCard key={m.key} m={m} last={i === t.messages.length - 1} />)}
              </ol>

              <div className="px-3 pb-6 sm:px-6">
                {t.replyTo ? (
                  <>
                    {t.contact?.status === 'unsubscribed' && <Notice tone="warn">This person asked not to get emails. Only reply if they asked you something.</Notice>}
                    <Composer replyId={t.replyTo.id} toName={t.name} toEmail={t.email} subject={t.replyTo.subject} draftKey={String(open)} />
                  </>
                ) : (
                  <p className="rounded-xl bg-page px-4 py-3 text-sm text-ink-2">{t.name} has not written back yet. You can reply here as soon as they do.</p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  )
}

function MessageCard({ m, last }: { m: Message; last: boolean }) {
  const out = m.dir === 'out'
  const label = m.type === 'campaign' ? 'Campaign email' : m.type === 'answer' ? 'Your reply' : ''
  return (
    <li>
      <details open={last || m.type !== 'campaign'} className={`group overflow-hidden rounded-xl border ${out ? 'border-line bg-white' : 'border-[#d6dcf5] bg-[#fbfcff]'}`}>
        <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className={`flex h-9 w-9 flex-none items-center justify-center rounded-full text-[13px] font-extrabold ${out ? 'bg-deep text-white' : 'bg-brand-soft text-brand-dark'}`}>{initials(m.fromName || m.fromEmail)}</span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-bold">{out ? 'You' : m.fromName}{out && <span className="font-normal text-ink-3"> ({m.fromName})</span>}</span>
              <time className="flex-none text-xs text-ink-3">{stamp(m.at)}</time>
            </span>
            <span className="block truncate text-xs text-ink-3">
              {out ? `to ${m.to}` : `${m.fromEmail}`}{label ? ` · ${label}` : ''}
            </span>
            <span className="mt-1 block truncate text-[13px] text-ink-2 group-open:hidden">{m.type === 'campaign' ? m.subject : snippet(m.text, 140)}</span>
          </span>
        </summary>
        <div className="px-4 pb-4 sm:pl-16">
          {m.kind && m.kind !== 'reply' && <div className="mb-2"><StatusBadge status={m.kind} /></div>}
          {m.type === 'campaign' ? (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-semibold text-ink-2">{m.subject}</span>
                {m.campaign && <Badge tone="mute">{m.campaign}</Badge>}
                {m.stats?.bounced ? <Badge tone="bad" icon="alert">Bounced</Badge> : <>
                  {m.stats?.delivered && <Badge tone="good" icon="check">Delivered</Badge>}
                  {m.stats?.opened && <Badge tone="info" icon="eye">Opened</Badge>}
                  {m.stats?.clicked && <Badge tone="info" icon="link">Clicked</Badge>}
                </>}
              </div>
              {m.note && <p className="mb-2 rounded-lg bg-bad-soft px-3 py-2 text-[13px] font-semibold text-bad">{m.note}. This address gets no more emails.</p>}
              <EmailFrame html={m.html!} title={`Email: ${m.subject}`} />
            </>
          ) : (
            <>
              <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{m.text || '(empty message)'}</div>
              {m.quoted && (
                <details className="mt-3 text-sm text-ink-2">
                  <summary className="inline-flex cursor-pointer list-none rounded-md bg-page px-2 py-0.5 font-bold tracking-widest text-ink-3 [&::-webkit-details-marker]:hidden" aria-label="Show quoted text">•••</summary>
                  <div className="mt-2 whitespace-pre-wrap break-words border-l-2 border-line pl-3">{m.quoted}</div>
                </details>
              )}
            </>
          )}
        </div>
      </details>
    </li>
  )
}

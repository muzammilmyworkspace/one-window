'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { batches } from '@/lib/plan'
import SendingPlan from './SendingPlan'
import { Badge, Icon } from './ui'

export interface Draft { id?: number; name: string; subject: string; preheader: string; html: string; states: string[]; follow_up_of: number | null; warmup: boolean; list_name: string; reason: string; followup_key: string; followup_days: number }
interface Template { key: string; label: string; name: string; subject: string; preheader: string; html: string; list: string; reason: string; followup?: string }
interface Option { id: number; name: string; sent: number }
interface Check { label: string; ok: boolean; blocking: boolean; help: string }

const post = (url: string, body: unknown, method = 'POST') =>
  fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

const BUTTON = (label: string, href: string) =>
  `<p style="margin:0 0 20px;"><a href="${href}" style="display:inline-block;padding:14px 26px;background:#0E9F6E;border-radius:8px;color:#ffffff;text-decoration:none;font-weight:bold;">${label}</a></p>`

export default function CampaignEditor(props: {
  initial: Draft; templates: Template[]; stateCounts: { list: string; state: string; n: number }[]; previous: Option[]; live: boolean; capacity: number
}) {
  const router = useRouter()
  const [d, setD] = useState<Draft>(props.initial)
  const [html, setHtml] = useState(props.initial.html)
  const [raw, setRaw] = useState(false)
  const [preview, setPreview] = useState({ subject: '', html: '' })
  const [view, setView] = useState<'edit' | 'preview'>('edit')
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [testVia, setTestVia] = useState('brevo')
  const [confirm, setConfirm] = useState<number | null>(null)
  const [checks, setChecks] = useState<Check[]>([])
  const editor = useRef<HTMLDivElement>(null)

  // The editor owns its DOM while typing. It is only rewritten when the content changes from outside.
  useEffect(() => {
    if (!raw && view === 'edit' && editor.current && editor.current.innerHTML !== html) editor.current.innerHTML = html
  }, [html, raw, view])

  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await post('/api/preview', { subject: d.subject, preheader: d.preheader, html, reason: d.reason })
      if (r.ok) setPreview(await r.json())
    }, 350)
    return () => clearTimeout(t)
  }, [d.subject, d.preheader, d.reason, html])

  const set = (patch: Partial<Draft>) => setD((p) => ({ ...p, ...patch }))
  const sync = () => { if (editor.current) setHtml(editor.current.innerHTML) }
  const cmd = (name: string, value?: string) => { editor.current?.focus(); document.execCommand(name, false, value); sync() }

  function useTemplate(key: string) {
    const t = props.templates.find((x) => x.key === key)
    if (!t) return
    setD((p) => ({ ...p, name: t.name, subject: t.subject, preheader: t.preheader, list_name: t.list, reason: t.reason, states: [], follow_up_of: null, followup_key: t.followup || '', followup_days: t.followup ? p.followup_days || 5 : 0 }))
    setHtml(t.html)
  }

  function addLink() {
    const url = prompt('Link address (https://…)')
    if (url) cmd('createLink', url)
  }
  function addButton() {
    const label = prompt('Button text')
    if (!label) return
    const url = prompt('Button link (https://…)', 'https://www.thesupportlife.com/')
    if (url) cmd('insertHTML', BUTTON(label.replace(/</g, '&lt;'), url.replace(/"/g, '&quot;')))
  }

  async function save(): Promise<number | null> {
    setBusy(true)
    setNote(null)
    const payload = { ...d, html }
    const res = d.id ? await post(`/api/campaigns/${d.id}`, payload, 'PUT') : await post('/api/campaigns', payload)
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setNote({ ok: false, text: data.error }); return null }
    if (!d.id) { set({ id: data.id }); window.history.replaceState(null, '', `/campaigns/${data.id}`) }
    setNote({ ok: true, text: 'Draft saved' })
    return d.id || data.id
  }

  async function test() {
    setBusy(true)
    setNote(null)
    const res = await post('/api/test-send', { to: testTo, provider: testVia, subject: d.subject, preheader: d.preheader, html })
    const data = await res.json()
    setBusy(false)
    setNote(res.ok ? { ok: true, text: data.message } : { ok: false, text: data.error })
  }

  async function askStart() {
    const id = await save()
    if (!id) return
    const data = await (await fetch(`/api/campaigns/${id}`)).json()
    setChecks(data.checks || [])
    setConfirm(data.audience)
  }

  async function start() {
    setBusy(true)
    const res = await post(`/api/campaigns/${d.id}`, { action: 'start' })
    const data = await res.json()
    setBusy(false)
    setConfirm(null)
    if (!res.ok) { setNote({ ok: false, text: data.error }); return }
    window.location.href = `/campaigns/${d.id}`
  }

  async function remove() {
    if (!d.id || !window.confirm('Delete this draft?')) return
    await fetch(`/api/campaigns/${d.id}`, { method: 'DELETE' })
    router.push('/campaigns')
    router.refresh()
  }

  const toggleState = (s: string) => set({ states: d.states.includes(s) ? d.states.filter((x) => x !== s) : [...d.states, s] })
  const lists = [...new Set(props.stateCounts.map((s) => s.list))]
  if (!lists.includes(d.list_name)) lists.unshift(d.list_name)
  const inList = props.stateCounts.filter((s) => s.list === d.list_name)
  const audienceSum = (d.states.length ? inList.filter((s) => d.states.includes(s.state)) : inList).reduce((a, s) => a + s.n, 0)
  const listSize = (l: string) => props.stateCounts.filter((s) => s.list === l).reduce((a, s) => a + s.n, 0)
  const previewPlan = batches(audienceSum, 0, props.capacity, d.warmup, Date.now())
  const confirmPlan = batches(confirm || 0, 0, props.capacity, d.warmup, Date.now())

  const tool = 'rounded-md px-2.5 py-1.5 text-sm font-semibold hover:bg-page'
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        <section className="card space-y-4 p-5">
          {!d.id && (
            <div>
              <p className="label">Start from</p>
              <div className="flex flex-wrap gap-2">
                {props.templates.map((t) => <button key={t.key} type="button" onClick={() => useTemplate(t.key)} className="btn btn-ghost">{t.label}</button>)}
              </div>
            </div>
          )}
          <div>
            <label htmlFor="c-name" className="label">Campaign name</label>
            <input id="c-name" className="field" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Only you see this" />
          </div>
          <div>
            <label htmlFor="c-subject" className="label">Subject line</label>
            <input id="c-subject" className="field" value={d.subject} onChange={(e) => set({ subject: e.target.value })} />
            <p className="hint">{'{{first_name}}'} becomes each person&apos;s first name, or &quot;there&quot; if there is none.</p>
          </div>
          <div>
            <label htmlFor="c-pre" className="label">Preview text</label>
            <input id="c-pre" className="field" value={d.preheader} onChange={(e) => set({ preheader: e.target.value })} />
            <p className="hint">The grey line next to the subject in the inbox.</p>
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-2">
            <div className="mr-auto flex rounded-lg bg-page p-0.5">
              {(['edit', 'preview'] as const).map((v) => (
                <button key={v} type="button" onClick={() => { if (view === 'edit' && !raw) sync(); setView(v) }}
                  className={`rounded-md px-3 py-1 text-sm font-bold capitalize ${view === v ? 'bg-white shadow-sm' : 'text-ink-2'}`}>{v}</button>
              ))}
            </div>
            {view === 'edit' && !raw && (
              <>
                <button type="button" className={`${tool} font-extrabold`} onClick={() => cmd('bold')}>B</button>
                <button type="button" className={`${tool} italic`} onClick={() => cmd('italic')}>I</button>
                <button type="button" className={tool} onClick={() => cmd('insertUnorderedList')}>List</button>
                <button type="button" className={tool} onClick={addLink}>Link</button>
                <button type="button" className={tool} onClick={addButton}>Button</button>
                <button type="button" className={tool} onClick={() => cmd('insertText', '{{first_name}}')}>First name</button>
              </>
            )}
            {view === 'edit' && (
              <button type="button" className={tool} onClick={() => { if (!raw) sync(); setRaw(!raw) }}>{raw ? 'Editor' : 'HTML'}</button>
            )}
          </div>
          {view === 'preview' ? (
            <div className="bg-page p-3">
              <p className="mb-2 truncate px-1 text-sm"><span className="text-ink-3">Subject: </span><b>{preview.subject}</b></p>
              <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="h-[620px] w-full rounded-lg border border-line bg-white" />
            </div>
          ) : raw ? (
            <textarea aria-label="Email HTML" className="h-[420px] w-full p-4 font-mono text-[13px] outline-none" value={html} onChange={(e) => setHtml(e.target.value)} />
          ) : (
            <div ref={editor} role="textbox" aria-label="Email body" aria-multiline="true" contentEditable suppressContentEditableWarning className="editor" onInput={sync} onBlur={sync} />
          )}
          <p className="border-t border-line bg-page px-5 py-2.5 text-[12.5px] text-ink-2">The disclosure, address and unsubscribe link are added to every email automatically. Check them in Preview.</p>
        </section>
      </div>

      <aside className="space-y-5">
        <section className="card p-5">
          <h2 className="text-base">Who gets it</h2>
          <div className="mt-3">
            <label htmlFor="c-list" className="label">List</label>
            <select id="c-list" className="field" value={d.list_name} onChange={(e) => set({ list_name: e.target.value, states: [] })}>
              {lists.map((l) => <option key={l} value={l}>{l} ({listSize(l).toLocaleString()})</option>)}
            </select>
          </div>
          <div className="mt-4">
            <label htmlFor="c-follow" className="label">Audience</label>
            <select id="c-follow" className="field" value={d.follow_up_of ?? ''} onChange={(e) => set({ follow_up_of: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Everyone active in this list</option>
              {props.previous.map((p) => <option key={p.id} value={p.id}>Follow-up: {p.name} (no reply yet)</option>)}
            </select>
          </div>
          <div className="mt-4">
            <p className="label">States</p>
            <div className="flex flex-wrap gap-1.5">
              {inList.map((s) => {
                const on = d.states.includes(s.state)
                return (
                  <button key={s.state || 'none'} type="button" aria-pressed={on} onClick={() => toggleState(s.state)}
                    className={`rounded-lg border px-2.5 py-1 text-[13px] font-bold ${on ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line bg-white text-ink-2 hover:border-[#bcd0c9]'}`}>
                    {s.state || 'None'} <span className="font-semibold opacity-70">{s.n.toLocaleString()}</span>
                  </button>
                )
              })}
            </div>
            <p className="hint">None selected means every state.{!d.follow_up_of && ` ${audienceSum.toLocaleString()} people right now.`}</p>
          </div>
        </section>

        <section className="card p-5">
          <label htmlFor="c-reason" className="label">Why they get this email</label>
          <textarea id="c-reason" rows={3} className="field" value={d.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="Empty uses the text from Settings" />
          <p className="hint">Shown in the footer. It has to be true for everyone in this list.</p>
          <label htmlFor="c-fu" className="label mt-4">Automatic follow-up</label>
          <select id="c-fu" className="field" value={d.followup_key} onChange={(e) => set({ followup_key: e.target.value, followup_days: e.target.value ? d.followup_days || 5 : 0 })}>
            <option value="">No follow-up</option>
            {props.templates.filter((t) => t.key.includes('2') || t.key.endsWith('followup')).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          {d.followup_key && (
            <>
              <label htmlFor="c-fd" className="label mt-3">Days after each person&apos;s first email</label>
              <input id="c-fd" type="number" min={1} max={30} className="field" value={d.followup_days} onChange={(e) => set({ followup_days: Number(e.target.value) })} />
              <p className="hint">Goes out by itself. Anyone who replied, bounced or unsubscribed is skipped.</p>
            </>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-base">Sending plan</h2>
          <p className="mb-3 mt-0.5 text-[13px] text-ink-3">Not everyone at once. Each batch goes out through the day.</p>
          <label className="mb-3 flex items-start gap-2.5 rounded-lg bg-page p-3">
            <input type="checkbox" checked={d.warmup} onChange={(e) => set({ warmup: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[#2b4deb]" />
            <span className="text-[13px] leading-snug"><b>Warm up the domain</b><br /><span className="text-ink-2">Start with 100, 200, 300 a day. Recommended for a new domain.</span></span>
          </label>
          {d.follow_up_of ? <p className="text-[13px] text-ink-2">Shown when you press Review and start.</p> : <SendingPlan batches={previewPlan} />}
        </section>

        <section className="card p-5">
          <h2 className="text-base">Send yourself a test</h2>
          <div className="mt-3 space-y-2">
            <input aria-label="Your email" type="email" className="field" placeholder="you@gmail.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            <select aria-label="Send through" className="field" value={testVia} onChange={(e) => setTestVia(e.target.value)}>
              <option value="brevo">Through Brevo</option>
              <option value="resend">Through Resend</option>
            </select>
            <button type="button" disabled={busy || !testTo} onClick={test} className="btn btn-ghost w-full">Send test</button>
          </div>
        </section>

        <section className="card space-y-2 p-5">
          {note && <p role="status" className={`text-sm font-semibold ${note.ok ? 'text-good' : 'text-bad'}`}>{note.text}</p>}
          <button type="button" disabled={busy} onClick={askStart} className="btn btn-primary w-full"><Icon name="send" size={15} /> Review and start</button>
          <button type="button" disabled={busy} onClick={save} className="btn btn-ghost w-full">Save draft</button>
          {d.id && <button type="button" disabled={busy} onClick={remove} className="btn btn-danger w-full">Delete draft</button>}
        </section>
      </aside>

      {confirm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="start-title">
          <div className="card w-full max-w-md p-6">
            <h2 id="start-title" className="text-xl">{confirm ? `Send to ${confirm.toLocaleString()} people?` : 'Nobody matches'}</h2>
            {confirm > 0 && (
              <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
                <li><b className="text-ink">Subject:</b> {preview.subject}</li>
                {confirmPlan.length > 0 && <li><b className="text-ink">First batch:</b> {confirmPlan[0].size.toLocaleString()} emails today, then the rest in {confirmPlan.length - 1} more {confirmPlan.length === 2 ? 'batch' : 'batches'}</li>}
                <li><b className="text-ink">Replies go to:</b> your info@ inbox and the Inbox page here</li>
                <li className={props.live ? 'font-bold text-bad' : 'font-bold text-sun-ink'}>{props.live ? 'These are real emails. This cannot be undone, only paused.' : 'Practice mode: nothing will really be sent.'}</li>
              </ul>
            )}
            {confirm > 0 && (
              <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
                {checks.map((c) => (
                  <li key={c.label} className="flex items-start gap-2.5 px-3 py-2">
                    <Icon name={c.ok ? 'check' : c.blocking ? 'x' : 'alert'} size={15} className={`mt-0.5 flex-none ${c.ok ? 'text-good' : c.blocking ? 'text-bad' : 'text-sun-ink'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{c.label}</p>
                      {!c.ok && <p className="text-[12.5px] leading-snug text-ink-2">{c.help}</p>}
                    </div>
                    {!c.ok && c.blocking && props.live && <Badge tone="bad">Required</Badge>}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
              {confirm > 0 && <button type="button" disabled={busy || (props.live && checks.some((c) => c.blocking && !c.ok))} className="btn btn-primary" onClick={start}>Start sending</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

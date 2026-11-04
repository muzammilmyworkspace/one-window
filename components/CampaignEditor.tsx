'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from './ui'

export interface Draft { id?: number; name: string; subject: string; preheader: string; html: string; states: string[]; follow_up_of: number | null }
interface Template { key: string; label: string; name: string; subject: string; preheader: string; html: string }
interface Option { id: number; name: string; sent: number }

const post = (url: string, body: unknown, method = 'POST') =>
  fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

const BUTTON = (label: string, href: string) =>
  `<p style="margin:0 0 20px;"><a href="${href}" style="display:inline-block;padding:14px 26px;background:#0E9F6E;border-radius:8px;color:#ffffff;text-decoration:none;font-weight:bold;">${label}</a></p>`

export default function CampaignEditor(props: {
  initial: Draft; templates: Template[]; stateCounts: { state: string; n: number }[]; previous: Option[]; live: boolean; capacity: number
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
  const editor = useRef<HTMLDivElement>(null)

  // The editor owns its DOM while typing. It is only rewritten when the content changes from outside.
  useEffect(() => {
    if (!raw && view === 'edit' && editor.current && editor.current.innerHTML !== html) editor.current.innerHTML = html
  }, [html, raw, view])

  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await post('/api/preview', { subject: d.subject, preheader: d.preheader, html })
      if (r.ok) setPreview(await r.json())
    }, 350)
    return () => clearTimeout(t)
  }, [d.subject, d.preheader, html])

  const set = (patch: Partial<Draft>) => setD((p) => ({ ...p, ...patch }))
  const sync = () => { if (editor.current) setHtml(editor.current.innerHTML) }
  const cmd = (name: string, value?: string) => { editor.current?.focus(); document.execCommand(name, false, value); sync() }

  function useTemplate(key: string) {
    const t = props.templates.find((x) => x.key === key)
    if (!t) return
    setD((p) => ({ ...p, name: t.name, subject: t.subject, preheader: t.preheader }))
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
  const audienceSum = d.states.length ? props.stateCounts.filter((s) => d.states.includes(s.state)).reduce((a, s) => a + s.n, 0) : props.stateCounts.reduce((a, s) => a + s.n, 0)
  const days = confirm && props.capacity ? Math.ceil(confirm / props.capacity) : 0

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
            <label htmlFor="c-follow" className="label">Audience</label>
            <select id="c-follow" className="field" value={d.follow_up_of ?? ''} onChange={(e) => set({ follow_up_of: e.target.value ? Number(e.target.value) : null })}>
              <option value="">All active contacts</option>
              {props.previous.map((p) => <option key={p.id} value={p.id}>Follow-up: {p.name} (no reply yet)</option>)}
            </select>
          </div>
          <div className="mt-4">
            <p className="label">States</p>
            <div className="flex flex-wrap gap-1.5">
              {props.stateCounts.map((s) => {
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
          {note && <p role="status" className={`text-sm font-semibold ${note.ok ? 'text-brand-dark' : 'text-bad'}`}>{note.text}</p>}
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
                {days > 0 && <li><b className="text-ink">Takes:</b> about {days} {days === 1 ? 'day' : 'days'} at {props.capacity} a day</li>}
                <li><b className="text-ink">Replies go to:</b> your info@ inbox and the Inbox page here</li>
                <li className={props.live ? 'font-bold text-bad' : 'font-bold text-sun-ink'}>{props.live ? 'These are real emails. This cannot be undone, only paused.' : 'Practice mode: nothing will really be sent.'}</li>
              </ul>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
              {confirm > 0 && <button type="button" disabled={busy} className="btn btn-primary" onClick={start}>Start sending</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

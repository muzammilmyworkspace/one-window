'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { byListOrder, followupFor, listLabel, reasonFor } from '@/lib/lists'
import { batches } from '@/lib/plan'
import SendingPlan from './SendingPlan'
import { Icon } from './ui'

export interface Draft {
  id?: number; name: string; subject: string; preheader: string; html: string; states: string[]; follow_up_of: number | null
  warmup: boolean; list_name: string; reason: string; followup_key: string; followup_days: number
}
interface Template { key: string; subject: string; preheader: string; html: string; list: string }
interface Check { label: string; ok: boolean; blocking: boolean; help: string }

const post = (url: string, body: unknown, method = 'POST') =>
  fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

const BUTTON = (label: string, href: string) =>
  `<p style="margin:0 0 20px;"><a href="${href}" style="display:inline-block;padding:14px 26px;background:#0E9F6E;border-radius:8px;color:#ffffff;text-decoration:none;font-weight:bold;">${label}</a></p>`

const STEPS = ['Name', 'Recipients', 'Content', 'Test', 'Launch']

export default function CampaignEditor(props: {
  initial: Draft; templates: Template[]; stateCounts: { list: string; state: string; n: number }[]; live: boolean; capacity: number
}) {
  const router = useRouter()
  const [d, setD] = useState<Draft>(props.initial)
  const [html, setHtml] = useState(props.initial.html)
  const [step, setStep] = useState(0)
  const [view, setView] = useState<'preview' | 'edit'>('preview')
  const [preview, setPreview] = useState({ subject: '', html: '' })
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [tested, setTested] = useState(false)
  const [checks, setChecks] = useState<Check[]>([])
  const [audience, setAudience] = useState(0)
  const [permission, setPermission] = useState(false)
  const editor = useRef<HTMLDivElement>(null)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (view === 'edit' && step === 2 && editor.current && editor.current.innerHTML !== html) editor.current.innerHTML = html
  }, [html, view, step])

  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await post('/api/preview', { subject: d.subject, preheader: d.preheader, html, reason: d.reason })
      if (r.ok) setPreview(await r.json())
    }, 300)
    return () => clearTimeout(t)
  }, [d.subject, d.preheader, d.reason, html])

  const set = (patch: Partial<Draft>) => setD((p) => ({ ...p, ...patch }))
  const sync = () => { if (editor.current) setHtml(editor.current.innerHTML) }
  const cmd = (name: string, value?: string) => { editor.current?.focus(); document.execCommand(name, false, value); sync() }

  const lists = [...new Set(props.stateCounts.map((s) => s.list))].sort(byListOrder)
  if (!lists.includes(d.list_name)) lists.unshift(d.list_name)
  const listSize = (l: string) => props.stateCounts.filter((s) => s.list === l).reduce((a, s) => a + s.n, 0)
  const inList = props.stateCounts.filter((s) => s.list === d.list_name)
  const total = (d.states.length ? inList.filter((s) => d.states.includes(s.state)) : inList).reduce((a, s) => a + s.n, 0)
  const plan = batches(total, 0, props.capacity, d.warmup, Date.now())

  function pickList(l: string) {
    set({ list_name: l, states: [], reason: reasonFor(l), followup_key: d.followup_key ? followupFor(l) : '' })
  }
  const toggleState = (s: string) => set({ states: d.states.includes(s) ? d.states.filter((x) => x !== s) : [...d.states, s] })

  async function upload(f: File) {
    setReading(true)
    setNote(null)
    const body = new FormData()
    body.append('file', f)
    const res = await fetch('/api/parse-doc', { method: 'POST', body })
    const data = await res.json()
    setReading(false)
    if (file.current) file.current.value = ''
    if (!res.ok) { setNote({ ok: false, text: data.error }); return }
    set({ subject: data.subject, preheader: data.preheader })
    setHtml(data.html)
    setView('preview')
    setNote({ ok: true, text: `${f.name} added. Check the subject and the email below.` })
  }

  function usePrepared() {
    const t = props.templates.find((x) => x.list === (d.list_name.startsWith('business') ? 'business' : 'clients'))
    if (!t) return
    set({ subject: t.subject, preheader: t.preheader })
    setHtml(t.html)
    setView('preview')
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
    if (view === 'edit' && step === 2) sync()
    const payload = { ...d, html: html || '<p></p>', subject: d.subject || '(no subject yet)' }
    const res = d.id ? await post(`/api/campaigns/${d.id}`, payload, 'PUT') : await post('/api/campaigns', payload)
    const data = await res.json()
    if (!res.ok) { setNote({ ok: false, text: data.error }); return null }
    if (!d.id) { set({ id: data.id }); window.history.replaceState(null, '', `/campaigns/${data.id}`) }
    return d.id || data.id
  }

  function problem(): string {
    if (step === 0 && !d.name.trim()) return 'Give the campaign a name.'
    if (step === 1 && !total) return 'Nobody is in this list yet.'
    if (step === 2 && !d.subject.trim()) return 'Add a subject line.'
    if (step === 2 && !html.replace(/<[^>]+>/g, '').trim()) return 'Add the email content.'
    return ''
  }

  async function next() {
    const p = problem()
    if (p) { setNote({ ok: false, text: p }); return }
    setBusy(true)
    setNote(null)
    const id = await save()
    if (id && step === 3) {
      const data = await (await fetch(`/api/campaigns/${id}`)).json()
      setChecks(data.checks || [])
      setAudience(data.audience || 0)
    }
    setBusy(false)
    if (id) { setStep(step + 1); window.scrollTo(0, 0) }
  }

  async function test() {
    setBusy(true)
    setNote(null)
    const res = await post('/api/test-send', { to: testTo, subject: d.subject, preheader: d.preheader, html, reason: d.reason })
    const data = await res.json()
    setBusy(false)
    setNote(res.ok ? { ok: true, text: data.message } : { ok: false, text: data.error })
    if (res.ok) setTested(true)
  }

  async function launch() {
    setBusy(true)
    setNote(null)
    if (!(await save())) { setBusy(false); return }
    const res = await post(`/api/campaigns/${d.id}`, { action: 'start' })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setNote({ ok: false, text: data.error }); return }
    window.location.href = `/campaigns/${d.id}`
  }

  async function remove() {
    if (!d.id || !window.confirm('Delete this draft?')) return
    await fetch(`/api/campaigns/${d.id}`, { method: 'DELETE' })
    router.push('/campaigns')
    router.refresh()
  }

  const blocked = props.live && checks.some((c) => c.blocking && !c.ok)
  const tool = 'rounded-md px-2.5 py-1.5 text-sm font-semibold hover:bg-page'
  const launchPlan = batches(audience, 0, props.capacity, d.warmup, Date.now())

  return (
    <div className="mx-auto max-w-3xl">
      <ol className="mb-6 flex items-center gap-1" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex min-w-0 flex-1 items-center gap-2" aria-current={i === step ? 'step' : undefined}>
            <button type="button" disabled={i > step} onClick={() => setStep(i)} className="flex min-w-0 items-center gap-2 disabled:cursor-default">
              <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-bold ${i < step ? 'bg-good-soft text-good' : i === step ? 'bg-brand text-white' : 'bg-[#e9e9e4] text-ink-2'}`}>
                {i < step ? <Icon name="check" size={14} /> : i + 1}
              </span>
              <span className={`hidden truncate text-sm sm:block ${i === step ? 'font-bold' : 'text-ink-2'}`}>{s}</span>
            </button>
            {i < STEPS.length - 1 && <span className="h-px min-w-3 flex-1 bg-line" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="card p-6">
          <h2 className="text-xl">What is this campaign called?</h2>
          <p className="mt-1 text-sm text-ink-2">Only you see this name.</p>
          <input aria-label="Campaign name" autoFocus className="field mt-4 !py-3 !text-base" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. November clients" />
        </section>
      )}

      {step === 1 && (
        <section className="card p-6">
          <h2 className="text-xl">Who gets this email?</h2>
          <div className="mt-4 grid gap-2">
            {lists.map((l) => (
              <button key={l} type="button" aria-pressed={d.list_name === l} onClick={() => pickList(l)}
                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left ${d.list_name === l ? 'border-brand bg-brand-soft' : 'border-line bg-white hover:border-[#bfc1b8]'}`}>
                <span className="font-semibold">{listLabel(l)}</span>
                <span className="tabular-nums text-ink-2">{listSize(l).toLocaleString()}</span>
              </button>
            ))}
          </div>

          {inList.length > 1 && (
            <div className="mt-4">
              <p className="label">Only some states? <span className="font-normal text-ink-3">Optional</span></p>
              <div className="flex flex-wrap gap-1.5">
                {inList.map((s) => {
                  const on = d.states.includes(s.state)
                  return (
                    <button key={s.state || 'none'} type="button" aria-pressed={on} onClick={() => toggleState(s.state)}
                      className={`rounded-lg border px-2.5 py-1 text-[13px] font-bold ${on ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line bg-white text-ink-2 hover:border-[#bfc1b8]'}`}>
                      {s.state || 'None'} <span className="font-semibold opacity-70">{s.n.toLocaleString()}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-page p-4">
              <p className="text-[13px] font-semibold text-ink-2">Total people</p>
              <p className="mt-1 text-[28px] font-semibold leading-none tracking-tight">{total.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-brand-soft p-4">
              <p className="text-[13px] font-semibold text-brand-dark">First go, today</p>
              <p className="mt-1 text-[28px] font-semibold leading-none tracking-tight">{(plan[0]?.size || 0).toLocaleString()}</p>
            </div>
          </div>

          <label className="mt-4 flex items-start gap-2.5 rounded-lg border border-line p-3">
            <input type="checkbox" checked={d.warmup} onChange={(e) => set({ warmup: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[#2b4deb]" />
            <span className="text-sm leading-snug"><b>Start slowly</b> <span className="text-ink-3">(recommended)</span><br /><span className="text-ink-2">100, then 200, then 300 a day, so mail stays out of spam.</span></span>
          </label>
          <div className="mt-4">
            <p className="label">Sending plan</p>
            <div className="max-h-72 overflow-y-auto"><SendingPlan batches={plan} /></div>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="card overflow-hidden">
          <div className="p-6">
            <h2 className="text-xl">What should the email say?</h2>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input ref={file} type="file" accept=".pdf,.docx,.txt" className="sr-only" aria-label="Content file" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <button type="button" disabled={reading} onClick={() => file.current?.click()} className="btn btn-primary"><Icon name="upload" size={16} /> {reading ? 'Reading the file…' : 'Upload PDF or Word'}</button>
              <button type="button" onClick={usePrepared} className="btn btn-ghost">Use our ready email</button>
            </div>
            <p className="hint">The subject and text are filled in for you. Your logo, colors and footer stay the same.</p>

            <label htmlFor="c-subject" className="label mt-5">Subject line</label>
            <input id="c-subject" className="field" value={d.subject} onChange={(e) => set({ subject: e.target.value })} />
            <p className="hint">{'{{first_name}}'} becomes each person&apos;s first name.</p>
            <label htmlFor="c-pre" className="label mt-4">Preview text <span className="font-normal text-ink-3">Optional</span></label>
            <input id="c-pre" className="field" value={d.preheader} onChange={(e) => set({ preheader: e.target.value })} />
          </div>

          <div className="flex flex-wrap items-center gap-1 border-y border-line px-3 py-2">
            <div className="mr-auto flex rounded-lg bg-page p-0.5">
              {(['preview', 'edit'] as const).map((v) => (
                <button key={v} type="button" onClick={() => { if (view === 'edit') sync(); setView(v) }}
                  className={`rounded-md px-3 py-1 text-sm font-bold capitalize ${view === v ? 'bg-white shadow-sm' : 'text-ink-2'}`}>{v}</button>
              ))}
            </div>
            {view === 'edit' && (
              <>
                <button type="button" className={`${tool} font-extrabold`} onClick={() => cmd('bold')}>B</button>
                <button type="button" className={`${tool} italic`} onClick={() => cmd('italic')}>I</button>
                <button type="button" className={tool} onClick={() => cmd('insertUnorderedList')}>List</button>
                <button type="button" className={tool} onClick={addLink}>Link</button>
                <button type="button" className={tool} onClick={addButton}>Button</button>
                <button type="button" className={tool} onClick={() => cmd('insertText', '{{first_name}}')}>First name</button>
              </>
            )}
          </div>
          {view === 'preview' ? (
            <div className="bg-page p-3">
              <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="h-[640px] w-full rounded-lg border border-line bg-white" />
            </div>
          ) : (
            <div ref={editor} role="textbox" aria-label="Email text" aria-multiline="true" contentEditable suppressContentEditableWarning className="editor" onInput={sync} onBlur={sync} />
          )}
        </section>
      )}

      {step === 3 && (
        <section className="card p-6">
          <h2 className="text-xl">Send yourself a test</h2>
          <p className="mt-1 text-sm text-ink-2">Check how it looks in your inbox. Look in spam too.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <input aria-label="Your email" type="email" autoFocus className="field min-w-[220px] flex-1" placeholder="you@gmail.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            <button type="button" disabled={busy || !testTo} onClick={test} className="btn btn-primary"><Icon name="send" size={15} /> Send test</button>
          </div>
          <p className="mt-4 truncate text-sm text-ink-2"><span className="text-ink-3">Subject: </span>{preview.subject}</p>
        </section>
      )}

      {step === 4 && (
        <section className="card p-6">
          <h2 className="text-xl">Ready to launch?</h2>
          <dl className="mt-4 divide-y divide-line rounded-xl border border-line text-sm">
            {[
              ['Campaign', d.name],
              ['Recipients', `${audience.toLocaleString()} · ${listLabel(d.list_name)}${d.states.length ? ` · ${d.states.join(', ')}` : ''}`],
              ['First go', `${(launchPlan[0]?.size || 0).toLocaleString()} today, then ${Math.max(0, launchPlan.length - 1)} more ${launchPlan.length === 2 ? 'batch' : 'batches'}`],
              ['Subject', preview.subject],
              ['Replies', 'Your info@ inbox and the Inbox page here'],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3 px-4 py-2.5"><dt className="w-24 flex-none text-ink-3">{k}</dt><dd className="min-w-0 break-words font-semibold">{v}</dd></div>
            ))}
          </dl>

          <label className="mt-4 flex items-start gap-2.5 rounded-lg border border-line p-3">
            <input type="checkbox" checked={!!d.followup_key} onChange={(e) => set({ followup_key: e.target.checked ? followupFor(d.list_name) : '', followup_days: e.target.checked ? d.followup_days || 5 : 0 })} className="mt-0.5 h-4 w-4 accent-[#2b4deb]" />
            <span className="text-sm leading-snug"><b>Send a follow-up automatically</b><br />
              <span className="text-ink-2">Our ready follow-up goes out
                <input aria-label="Days" type="number" min={1} max={30} value={d.followup_days || 5} onChange={(e) => set({ followup_days: Number(e.target.value) })} className="mx-1.5 w-12 rounded border border-line px-1 text-center" />
                days later. Anyone who replied is skipped.</span></span>
          </label>

          <details className="mt-3 rounded-lg border border-line px-3 py-2 text-sm">
            <summary className="cursor-pointer font-semibold">Footer line: why they get this email</summary>
            <textarea aria-label="Why they get this email" rows={2} className="field mt-2" value={d.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="Empty uses the text from Settings" />
            <p className="hint">It has to be true for everyone in this list.</p>
          </details>

          <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
            {checks.map((c) => (
              <li key={c.label} className="flex items-start gap-2.5 px-3 py-2">
                <Icon name={c.ok ? 'check' : c.blocking ? 'x' : 'alert'} size={15} className={`mt-0.5 flex-none ${c.ok ? 'text-good' : c.blocking ? 'text-bad' : 'text-sun-ink'}`} />
                <div className="min-w-0"><p className="text-sm font-semibold">{c.label}</p>{!c.ok && <p className="text-[12.5px] leading-snug text-ink-2">{c.help}</p>}</div>
              </li>
            ))}
            {!tested && <li className="flex items-start gap-2.5 px-3 py-2"><Icon name="alert" size={15} className="mt-0.5 flex-none text-sun-ink" /><div><p className="text-sm font-semibold">Test email</p><p className="text-[12.5px] text-ink-2">You have not sent yourself a test in this session.</p></div></li>}
          </ul>

          <label className="mt-4 flex items-start gap-2.5 rounded-lg bg-sun-soft p-3">
            <input type="checkbox" checked={permission} onChange={(e) => setPermission(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#2b4deb]" />
            <span className="text-sm font-semibold leading-snug text-sun-ink">We are allowed to email this list.</span>
          </label>
          <p className={`mt-3 text-sm font-bold ${props.live ? 'text-bad' : 'text-sun-ink'}`}>{props.live ? 'These are real emails. Launching can be paused, not undone.' : 'Practice mode: nothing will really be sent.'}</p>
        </section>
      )}

      {note && <p role="status" className={`mt-3 text-sm font-semibold ${note.ok ? 'text-good' : 'text-bad'}`}>{note.text}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {step > 0 && <button type="button" disabled={busy} onClick={() => { setNote(null); setStep(step - 1) }} className="btn btn-ghost">Back</button>}
        {d.id && <button type="button" disabled={busy} onClick={remove} className="btn btn-danger">Delete draft</button>}
        <span className="flex-1" />
        {step < 4
          ? <button type="button" disabled={busy || reading} onClick={next} className="btn btn-primary">{step === 3 ? (tested ? 'Continue' : 'Skip for now') : 'Continue'}</button>
          : <button type="button" disabled={busy || !permission || blocked || !audience} onClick={launch} className="btn btn-primary"><Icon name="send" size={15} /> Launch campaign</button>}
      </div>
    </div>
  )
}

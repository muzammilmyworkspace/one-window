'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { StateRow } from '@/lib/editorData'
import { followupFor, stateName } from '@/lib/lists'
import { dayLabel, schedule, type PlanContext } from '@/lib/plan'
import SendingPlan from './SendingPlan'
import StateCards from './StateCards'
import { Icon } from './ui'

export interface Draft {
  id?: number; name: string; subject: string; preheader: string; html: string; states: string[]; follow_up_of: number | null
  warmup: boolean; list_name: string; reason: string; followup_key: string; followup_days: number; sequence: Step[]
}
interface Step { subject: string; preheader: string; html: string; day: number }
interface Template { key: string; subject: string; preheader: string; html: string; list: string }
interface Check { label: string; ok: boolean; blocking: boolean; help: string }

const post = (url: string, body: unknown, method = 'POST') =>
  fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

const BUTTON = (label: string, href: string) =>
  `<p style="margin:0 0 20px;"><a href="${href}" style="display:inline-block;padding:14px 26px;background:#0E9F6E;border-radius:8px;color:#ffffff;text-decoration:none;font-weight:bold;">${label}</a></p>`

const STEPS = ['State', 'Content', 'Batches', 'Test', 'Launch']
const month = () => new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

export default function CampaignEditor(props: {
  initial: Draft; templates: Template[]; states: StateRow[]; context: PlanContext; live: boolean; startStep?: number
}) {
  const router = useRouter()
  const [d, setD] = useState<Draft>({ ...props.initial, list_name: '' })
  const [html, setHtml] = useState(props.initial.html)
  const [step, setStep] = useState(props.startStep || 0)
  const [active, setActive] = useState(0)
  const [saved, setSaved] = useState(!!props.initial.id)
  const idRef = useRef(props.initial.id)
  const saving = useRef(false)
  const [editing, setEditing] = useState(false)
  const [preview, setPreview] = useState({ subject: '', html: '' })
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [tested, setTested] = useState(false)
  const [checks, setChecks] = useState<Check[]>([])
  const [audience, setAudience] = useState(0)
  const [permission, setPermission] = useState(false)
  const editor = useRef<HTMLDivElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const series = d.sequence || []
  const cur = active === 0 ? { subject: d.subject, preheader: d.preheader, html } : series[active - 1]

  useEffect(() => {
    if (editing && step === 1 && editor.current && editor.current.innerHTML !== cur.html) editor.current.innerHTML = cur.html
  }, [cur.html, editing, step, active])

  const code = d.states[0] || ''
  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await post('/api/preview', { subject: cur.subject, preheader: cur.preheader, html: cur.html, reason: d.reason, state: code })
      if (r.ok) setPreview(await r.json())
    }, 300)
    return () => clearTimeout(t)
  }, [cur.subject, cur.preheader, d.reason, cur.html, code])

  const set = (patch: Partial<Draft>) => { setSaved(false); setD((p) => ({ ...p, ...patch })) }
  function patchCur(p: Partial<Step>) {
    if (active === 0) { if (p.html !== undefined) { setSaved(false); setHtml(p.html) } if (p.subject !== undefined || p.preheader !== undefined) set({ ...(p.subject !== undefined && { subject: p.subject }), ...(p.preheader !== undefined && { preheader: p.preheader }) }) }
    else set({ sequence: series.map((e, i) => (i === active - 1 ? { ...e, ...p } : e)) })
  }
  function removeCurrent() {
    if (active === 0 || !window.confirm(`Remove Email ${active + 1} from this series?`)) return
    if (editing) setEditing(false)
    set({ sequence: series.filter((_, i) => i !== active - 1) })
    setActive(0)
  }
  const tabs = series.length > 0 && (
    <div className="mb-4 flex flex-wrap gap-1.5" aria-label="Emails in this series">
      {[{ day: 1 }, ...series].map((e, i) => (
        <button key={i} type="button" aria-pressed={active === i} onClick={() => { if (editing) { sync(); setEditing(false) } setActive(i) }}
          className={`rounded-lg border px-3 py-1.5 text-sm font-bold ${active === i ? 'border-brand bg-brand-soft text-brand-dark' : 'border-line bg-white text-ink-2 hover:border-[#bfc1b8]'}`}>
          Email {i + 1} <span className="font-semibold opacity-70">Day {e.day}</span>
        </button>
      ))}
    </div>
  )
  const sync = () => { if (editor.current) patchCur({ html: editor.current.innerHTML }) }
  const cmd = (name: string, value?: string) => { editor.current?.focus(); document.execCommand(name, false, value); sync() }

  const picked = props.states.filter((s) => d.states.includes(s.code))
  const everyone = props.states.reduce((a, s) => a + s.total, 0)
  const total = picked.length ? picked.reduce((a, s) => a + s.total, 0) : everyone
  const place = picked.length === 1 ? picked[0].name : picked.length ? `${picked.length} states` : 'All states'
  const slots = schedule(total, d.warmup, props.context)
  const finish = slots.length ? slots[slots.length - 1].offset : 0

  function pick(c: string) {
    const states = !c ? [] : d.states.includes(c) ? d.states.filter((x) => x !== c) : [...d.states, c]
    const name = states.length === 1 ? stateName(states[0]) : states.length ? `${states.length} states` : 'All states'
    set({ states, name: !d.name || /, [A-Z][a-z]{2} \d{4}$/.test(d.name) ? `${name}, ${month()}` : d.name })
  }

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
    setEditing(false)
    setActive(0)
    if (data.emails) {
      const [first, ...rest] = data.emails as Step[]
      set({ subject: first.subject, preheader: first.preheader, sequence: rest, followup_key: '', followup_days: 0 })
      setHtml(first.html)
      setNote({ ok: true, text: `${f.name}: ${data.emails.length} emails added.` })
    } else {
      set({ subject: data.subject, preheader: data.preheader, sequence: [] })
      setHtml(data.html)
      setNote({ ok: true, text: `${f.name} added.` })
    }
  }

  function usePrepared() {
    const t = props.templates.find((x) => x.list === 'clients')
    if (!t) return
    patchCur({ subject: t.subject, preheader: t.preheader, html: t.html })
    setEditing(false)
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
    if (editing && step === 1) sync()
    while (saving.current) await new Promise((r) => setTimeout(r, 50))
    saving.current = true
    try {
      const payload = { ...d, name: d.name || `${place}, ${month()}`, html: html || '<p></p>', subject: d.subject || '(no subject yet)' }
      const res = idRef.current ? await post(`/api/campaigns/${idRef.current}`, payload, 'PUT') : await post('/api/campaigns', payload)
      const data = await res.json()
      if (!res.ok) { setNote({ ok: false, text: data.error }); return null }
      if (!idRef.current) { idRef.current = data.id; setD((p) => ({ ...p, id: data.id })) }
      setSaved(true)
      return idRef.current!
    } finally { saving.current = false }
  }

  // Everything is kept as you type, so a refresh loses nothing.
  useEffect(() => {
    if (saved || !(d.subject.trim() || html.replace(/<[^>]+>/g, '').trim())) return
    const t = setTimeout(() => { save() }, 1500)
    return () => clearTimeout(t)
  }, [d, html, saved])

  useEffect(() => {
    if (idRef.current) window.history.replaceState(null, '', `/campaigns/${idRef.current}?step=${step}`)
  }, [step, d.id])

  function problem(): string {
    if (step === 0 && !total) return 'There is nobody in this state yet.'
    if (step === 1 && !d.subject.trim()) return 'Add a subject line.'
    if (step === 1 && !html.replace(/<[^>]+>/g, '').trim()) return 'Add the email content.'
    return ''
  }

  async function next() {
    const p = problem()
    if (p) { setNote({ ok: false, text: p }); return }
    setBusy(true)
    setNote(null)
    if (!d.name) set({ name: `${place}, ${month()}` })
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
    const res = await post('/api/test-send', { to: testTo, subject: cur.subject, preheader: cur.preheader, html: cur.html, reason: d.reason, state: code })
    const data = await res.json()
    setBusy(false)
    setNote(res.ok ? { ok: true, text: data.message } : { ok: false, text: data.error })
    if (res.ok) setTested(true)
  }

  async function launch() {
    setBusy(true)
    setNote(null)
    if (!(await save())) { setBusy(false); return }
    const res = await post(`/api/campaigns/${idRef.current}`, { action: 'start' })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setNote({ ok: false, text: data.error }); return }
    window.location.href = `/campaigns/${idRef.current}`
  }

  async function remove() {
    if (!idRef.current || !window.confirm('Delete this draft?')) return
    await fetch(`/api/campaigns/${idRef.current}`, { method: 'DELETE' })
    router.push('/campaigns')
    router.refresh()
  }

  const blocked = props.live && checks.some((c) => c.blocking && !c.ok)
  const tool = 'rounded-md px-2.5 py-1.5 text-sm font-semibold hover:bg-page'
  const frame = <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="h-[680px] w-full rounded-xl border border-line bg-white" />

  return (
    <div className="pb-24">
      <ol className="mx-auto mb-7 flex max-w-3xl items-center gap-1" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex min-w-0 flex-1 items-center gap-2 last:flex-none" aria-current={i === step ? 'step' : undefined}>
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
        <section className="mx-auto max-w-5xl">
          <h2 className="text-2xl">Which states is this email for?</h2>
          <p className="mt-1 text-sm text-ink-2">Pick one state or several.</p>
          <div className="mt-5"><StateCards states={props.states} selected={d.states} onPick={pick} /></div>
          <button type="button" aria-pressed={!d.states.length} onClick={() => pick('')}
            className={`mt-3 flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left ${!d.states.length ? 'border-brand bg-brand-soft' : 'border-line bg-white hover:border-[#bfc1b8]'}`}>
            <span className="font-semibold">All states together</span>
            <span className="tabular-nums text-ink-2">{everyone.toLocaleString()}</span>
          </button>
        </section>
      )}

      {step === 1 && (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-5">
            <div className="card p-5">
              <h2 className="text-xl">Email for {place}</h2>
              <div className="mt-3">{tabs}</div>
              {active > 0 && <button type="button" onClick={removeCurrent} className="mb-3 text-sm font-semibold text-bad hover:underline">Remove this email from the series</button>}
              <input ref={file} type="file" accept=".pdf,.docx,.txt" className="sr-only" aria-label="Content file" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <button type="button" disabled={reading} onClick={() => file.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]) }}
                className={`mt-4 flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors ${dragging ? 'border-brand bg-brand-soft' : 'border-[#d5d6cf] hover:border-brand hover:bg-brand-soft/40'}`}>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand-dark"><Icon name="upload" size={18} /></span>
                <span className="mt-2 font-semibold">{reading ? 'Reading the file…' : 'Upload PDF or Word'}</span>
                <span className="text-[13px] text-ink-2">Click, or drop the file here</span>
              </button>
              <button type="button" onClick={usePrepared} className="mt-2 text-sm font-semibold text-brand-dark hover:underline">Or use our ready email</button>

              <label htmlFor="c-subject" className="label mt-5">Subject line</label>
              <input id="c-subject" className="field" value={cur.subject} onChange={(e) => patchCur({ subject: e.target.value })} />
              <label htmlFor="c-pre" className="label mt-4">Preview text <span className="font-normal text-ink-3">Optional</span></label>
              <input id="c-pre" className="field" value={cur.preheader} onChange={(e) => patchCur({ preheader: e.target.value })} />
              <p className="hint">{'{{first_name}}'} and {'{{state_name}}'} fill in by themselves.</p>
            </div>

            {editing ? (
              <div className="card overflow-hidden">
                <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-2">
                  <button type="button" className={`${tool} font-extrabold`} onClick={() => cmd('bold')}>B</button>
                  <button type="button" className={`${tool} italic`} onClick={() => cmd('italic')}>I</button>
                  <button type="button" className={tool} onClick={() => cmd('insertUnorderedList')}>List</button>
                  <button type="button" className={tool} onClick={addLink}>Link</button>
                  <button type="button" className={tool} onClick={addButton}>Button</button>
                  <button type="button" className={tool} onClick={() => cmd('insertText', '{{first_name}}')}>First name</button>
                  <button type="button" className={tool} onClick={() => cmd('insertText', '{{state_name}}')}>State</button>
                  <button type="button" className={`${tool} ml-auto text-brand-dark`} onClick={() => { sync(); setEditing(false) }}>Done</button>
                </div>
                <div ref={editor} role="textbox" aria-label="Email text" aria-multiline="true" contentEditable suppressContentEditableWarning className="editor" onInput={sync} onBlur={sync} />
              </div>
            ) : (
              <button type="button" onClick={() => setEditing(true)} className="btn btn-ghost w-full">Edit the text</button>
            )}
          </div>
          <div className="min-w-0 lg:sticky lg:top-5 lg:self-start">
            <p className="mb-2 truncate text-sm"><span className="text-ink-3">Subject: </span><b>{preview.subject || 'Not added yet'}</b></p>
            {frame}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="mx-auto max-w-4xl">
          <h2 className="text-2xl">Batches for {place}</h2>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['People', total.toLocaleString()],
              ['Batches', String(slots.length)],
              ['First go', `${(slots[0]?.size || 0).toLocaleString()}`],
              ['Finishes', slots.length ? dayLabel(finish) : '–'],
            ].map(([k, v]) => (
              <div key={k} className="card p-4">
                <p className="text-[13px] font-semibold text-ink-2">{k}</p>
                <p className="mt-1 truncate text-[22px] font-semibold leading-tight tracking-tight">{v}</p>
              </div>
            ))}
          </div>
          {props.context.ahead > 0 && <p className="mt-3 text-sm text-ink-2">{props.context.ahead.toLocaleString()} emails from other campaigns go first, so these dates start after them.</p>}
          <label className="mt-4 flex items-start gap-2.5 rounded-xl border border-line bg-white p-3">
            <input type="checkbox" checked={d.warmup} onChange={(e) => set({ warmup: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[#2b4deb]" />
            <span className="text-sm leading-snug"><b>Start slowly</b> <span className="text-ink-3">(recommended)</span><br /><span className="text-ink-2">The whole domain sends 100, then 200, then 300 a day, then the full limit.</span></span>
          </label>
          <div className="mt-4"><SendingPlan slots={slots} /></div>
          {series.length > 0 && <p className="mt-3 text-sm text-ink-2">This is Email 1. The other {series.length} emails go out by themselves on days {series.map((e) => e.day).join(', ')} of each person&apos;s series, and stop for anyone who replies.</p>}
          <p className="mt-3 text-sm font-semibold text-ink-2">All batches are scheduled together when you launch. Nothing else to do.</p>
        </section>
      )}

      {step === 3 && (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="card self-start p-6">
            <h2 className="text-xl">Send yourself a test</h2>
            <p className="mt-1 text-sm text-ink-2">See it in your own inbox. Look in spam too.</p>
            {series.length > 0 && <div className="mt-3">{tabs}</div>}
            <div className="mt-4 space-y-2">
              <input aria-label="Your email" type="email" autoFocus className="field" placeholder="you@gmail.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
              <button type="button" disabled={busy || !testTo} onClick={test} className="btn btn-primary w-full"><Icon name="send" size={15} /> Send test</button>
            </div>
          </div>
          <div className="min-w-0">{frame}</div>
        </section>
      )}

      {step === 4 && (
        <section className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            <h2 className="text-2xl">Ready to launch</h2>
            <div>
              <label htmlFor="c-name" className="label">Campaign name</label>
              <input id="c-name" className="field" value={d.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <dl className="divide-y divide-line rounded-xl border border-line bg-white text-sm">
              {[
                ['States', picked.length ? picked.map((s) => s.code).join(', ') : 'All states'],
                ['People', audience.toLocaleString()],
                ['Batches', `${schedule(audience, d.warmup, props.context).length}, starting with ${(schedule(audience, d.warmup, props.context)[0]?.size || 0).toLocaleString()}`],
                ['Subject', d.subject],
                ['Replies', 'info@ and the Inbox page'],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3 px-4 py-2.5"><dt className="w-20 flex-none text-ink-3">{k}</dt><dd className="min-w-0 break-words font-semibold">{v}</dd></div>
              ))}
            </dl>
            {series.length > 0 ? (
              <p className="rounded-xl border border-line bg-white p-3 text-sm"><b>{series.length + 1} emails in this series.</b> <span className="text-ink-2">They go out automatically and stop for anyone who replies.</span></p>
            ) : (
            <label className="flex items-start gap-2.5 rounded-xl border border-line bg-white p-3">
              <input type="checkbox" checked={!!d.followup_key} onChange={(e) => set({ followup_key: e.target.checked ? followupFor('') : '', followup_days: e.target.checked ? d.followup_days || 5 : 0 })} className="mt-0.5 h-4 w-4 accent-[#2b4deb]" />
              <span className="text-sm leading-snug"><b>Send a follow-up automatically</b><br />
                <span className="text-ink-2">Our ready follow-up goes out
                  <input aria-label="Days" type="number" min={1} max={30} value={d.followup_days || 5} onChange={(e) => set({ followup_days: Number(e.target.value) })} className="mx-1.5 w-12 rounded border border-line px-1 text-center" />
                  days later. Anyone who replied is skipped.</span></span>
            </label>
            )}
            <label className="flex items-start gap-2.5 rounded-xl bg-sun-soft p-3">
              <input type="checkbox" checked={permission} onChange={(e) => setPermission(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#2b4deb]" />
              <span className="text-sm font-semibold leading-snug text-sun-ink">We are allowed to email these people.</span>
            </label>
            <p className={`text-sm font-bold ${props.live ? 'text-bad' : 'text-sun-ink'}`}>{props.live ? 'These are real emails. Launching can be paused, not undone.' : 'Practice mode: nothing will really be sent.'}</p>
          </div>
          <div className="min-w-0">
            <p className="label">Checks</p>
            <ul className="divide-y divide-line rounded-xl border border-line bg-white">
              {checks.map((c) => (
                <li key={c.label} className="flex items-start gap-2.5 px-3 py-2">
                  <Icon name={c.ok ? 'check' : c.blocking ? 'x' : 'alert'} size={15} className={`mt-0.5 flex-none ${c.ok ? 'text-good' : c.blocking ? 'text-bad' : 'text-sun-ink'}`} />
                  <div className="min-w-0"><p className="text-sm font-semibold">{c.label}</p>{!c.ok && <p className="text-[12.5px] leading-snug text-ink-2">{c.help}</p>}</div>
                </li>
              ))}
              {!tested && <li className="flex items-start gap-2.5 px-3 py-2"><Icon name="alert" size={15} className="mt-0.5 flex-none text-sun-ink" /><div><p className="text-sm font-semibold">Test email</p><p className="text-[12.5px] text-ink-2">You have not sent yourself a test yet.</p></div></li>}
            </ul>
          </div>
        </section>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-line bg-white/95 backdrop-blur lg:left-60">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-2 px-4 py-3 sm:px-6 lg:px-8">
          {step > 0 && <button type="button" disabled={busy} onClick={() => { setNote(null); setStep(step - 1) }} className="btn btn-ghost">Back</button>}
          {idRef.current && <button type="button" disabled={busy} onClick={remove} className="btn btn-danger">Delete draft</button>}
          <p role="status" className={`min-w-0 flex-1 truncate px-2 text-sm font-semibold ${note ? (note.ok ? 'text-good' : 'text-bad') : 'text-ink-3'}`}>{note?.text || (idRef.current ? (saved ? 'Saved' : 'Saving…') : '')}</p>
          {step < 4
            ? <button type="button" disabled={busy || reading} onClick={next} className="btn btn-primary">{step === 3 ? (tested ? 'Continue' : 'Skip for now') : 'Continue'}</button>
            : <button type="button" disabled={busy || !permission || blocked || !audience} onClick={launch} className="btn btn-primary"><Icon name="send" size={15} /> Launch campaign</button>}
        </div>
      </div>
    </div>
  )
}

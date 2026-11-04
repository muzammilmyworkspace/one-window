'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Settings } from '@/lib/settings'
import { Badge, Meter } from './ui'

const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

export function ProviderCard(p: { name: string; label: string; cap: number; used: number; enabled: boolean; missing: string[]; pausedUntil: number; lastError: string | null }) {
  const router = useRouter()
  const [cap, setCap] = useState(String(p.cap))
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const paused = p.pausedUntil > Date.now()

  async function test() {
    setBusy(true)
    setNote(null)
    const d = await (await post('/api/providers/test', { name: p.name })).json()
    setNote({ ok: !!d.ok, text: d.message || d.error })
    setBusy(false)
    router.refresh()
  }
  async function saveCap() {
    if (Number(cap) === p.cap) return
    await post('/api/settings', { providers: { [p.name]: { daily_cap: cap } } })
    router.refresh()
  }
  async function toggle() {
    await post('/api/settings', { providers: { [p.name]: { enabled: !p.enabled } } })
    router.refresh()
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base">{p.label}</h3>
        {p.missing.length ? <Badge tone="bad" icon="x">Not connected</Badge> : !p.enabled ? <Badge tone="mute" icon="pause">Turned off</Badge> : paused ? <Badge tone="warn" icon="clock">Resting 1 hour</Badge> : <Badge tone="good" icon="check">Ready</Badge>}
      </div>
      <div className="mt-3 flex justify-between text-[13px] text-ink-2"><span>Last 24 hours</span><span className="tabular-nums">{p.used} / {p.cap}</span></div>
      <div className="mt-1.5"><Meter value={p.used} max={p.cap} label={`${p.label} usage`} /></div>
      <label htmlFor={`cap-${p.name}`} className="label mt-3">Daily limit</label>
      <input id={`cap-${p.name}`} type="number" min={0} className="field" value={cap} onChange={(e) => setCap(e.target.value)} onBlur={saveCap} />
      {p.missing.length > 0 && <p className="mt-2 text-[13px] font-semibold text-bad">Missing: {p.missing.join(', ')}</p>}
      {p.lastError && <p className="mt-2 break-words text-[13px] font-semibold text-bad">{p.lastError}</p>}
      {note && <p role="status" className={`mt-2 break-words text-[13px] font-semibold ${note.ok ? 'text-good' : 'text-bad'}`}>{note.text}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} onClick={test} className="btn btn-ghost flex-1">{busy ? 'Testing…' : 'Test login'}</button>
        <button type="button" onClick={toggle} className="btn btn-ghost">{p.enabled ? 'Turn off' : 'Turn on'}</button>
      </div>
    </div>
  )
}

const FIELDS: { key: keyof Settings; label: string; hint?: string; long?: boolean }[] = [
  { key: 'from_name', label: 'From name' },
  { key: 'from_email', label: 'From address', hint: 'Must be on the domain connected in Brevo and Resend.' },
  { key: 'reply_to', label: 'Replies go to', hint: 'Your Hostinger mailbox.' },
  { key: 'gap_seconds', label: 'Seconds between emails', hint: 'Spacing them out helps keep mail out of spam.' },
  { key: 'webmail_url', label: 'Webmail link' },
  { key: 'website_url', label: 'Website' },
  { key: 'phone', label: 'Phone in the footer' },
  { key: 'facebook_url', label: 'Facebook link', hint: 'Leave a link empty to hide its icon.' },
  { key: 'instagram_url', label: 'Instagram link' },
  { key: 'reddit_url', label: 'Reddit link' },
  { key: 'assets_url', label: 'Logo and icons folder', hint: 'Holds logo.png, facebook.png, instagram.png and reddit.png.' },
  { key: 'address', label: 'Postal address in the footer', hint: 'US law requires a real postal address.', long: true },
  { key: 'disclosure', label: 'Disclosure in the footer', long: true },
  { key: 'reason', label: 'Why they get this email', hint: 'Has to be true for everyone on the list.', long: true },
]

export function SettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter()
  const [s, setS] = useState(settings)
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const res = await post('/api/settings', { settings: s })
    setBusy(false)
    setSaved(res.ok ? 'Saved' : 'Could not save')
    router.refresh()
  }
  return (
    <form onSubmit={save} className="card p-5">
      <h2 className="text-base">Sender and footer</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className={f.long ? 'md:col-span-2' : ''}>
            <label htmlFor={`s-${f.key}`} className="label">{f.label}</label>
            {f.long
              ? <textarea id={`s-${f.key}`} rows={f.key === 'disclosure' ? 3 : 1} className="field" value={s[f.key]} onChange={(e) => setS({ ...s, [f.key]: e.target.value })} />
              : <input id={`s-${f.key}`} className="field" value={s[f.key]} onChange={(e) => setS({ ...s, [f.key]: e.target.value })} />}
            {f.hint && <p className="hint">{f.hint}</p>}
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-3">
        <button disabled={busy} className="btn btn-primary">Save changes</button>
        {saved && <p role="status" className="text-sm font-semibold text-brand-dark">{saved}</p>}
      </div>
    </form>
  )
}

export function ResetPractice() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function reset() {
    if (!window.confirm('Delete all practice campaigns, sends and replies? Contacts stay.')) return
    setBusy(true)
    await post('/api/settings', { reset_practice: true })
    setBusy(false)
    router.refresh()
  }
  return <button type="button" disabled={busy} onClick={reset} className="btn btn-danger">Clear practice data</button>
}

export function CopyField({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false)
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex gap-2">
        <input readOnly aria-label={label} value={value} className="field min-w-0 flex-1 font-mono text-[13px]" onFocus={(e) => e.target.select()} />
        <button type="button" className="btn btn-ghost" onClick={async () => { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500) }}>{done ? 'Copied' : 'Copy'}</button>
      </div>
    </div>
  )
}

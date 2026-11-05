'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from './ui'

export default function LaunchAll({ drafts, people, live }: { drafts: number; people: number; live: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [permission, setPermission] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function launch() {
    setBusy(true)
    setError('')
    const res = await fetch('/api/campaigns/launch-all', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ permission }) })
    const d = await res.json()
    setBusy(false)
    if (!res.ok) { setError(d.error); router.refresh(); return }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary"><Icon name="send" size={16} /> Launch all {drafts} series</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="la-title">
          <div className="card w-full max-w-md p-6">
            <h2 id="la-title" className="text-xl">Launch {drafts} series to {people.toLocaleString()} people?</h2>
            <p className="mt-2 text-sm text-ink-2">Every series is scheduled at once and sends by itself, Georgia first and Illinois last. Anyone who replies, bounces or unsubscribes stops getting emails.</p>
            <label className="mt-4 flex items-start gap-2.5 rounded-xl bg-sun-soft p-3">
              <input type="checkbox" checked={permission} onChange={(e) => setPermission(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#2b4deb]" />
              <span className="text-sm font-semibold leading-snug text-sun-ink">We are allowed to email these people.</span>
            </label>
            <p className={`mt-3 text-sm font-bold ${live ? 'text-bad' : 'text-sun-ink'}`}>{live ? 'These are real emails. Launching can be paused, not undone.' : 'Practice mode: nothing will really be sent.'}</p>
            {error && <p role="alert" className="mt-2 text-sm font-semibold text-bad">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" disabled={busy || !permission} className="btn btn-primary" onClick={launch}>{busy ? 'Launching…' : 'Launch all'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

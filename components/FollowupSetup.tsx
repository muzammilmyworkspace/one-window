'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function FollowupSetup({ id, templates, initial }: { id: number; templates: { key: string; label: string }[]; initial: string }) {
  const router = useRouter()
  const [key, setKey] = useState(initial)
  const [days, setDays] = useState(5)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    setError('')
    const res = await fetch(`/api/campaigns/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'followup', key, days }) })
    setBusy(false)
    if (!res.ok) { setError((await res.json()).error); return }
    router.refresh()
  }

  return (
    <div className="space-y-2">
      <select aria-label="Follow-up email" className="field" value={key} onChange={(e) => setKey(e.target.value)}>
        {templates.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
      </select>
      <div className="flex items-center gap-2 text-sm">
        <input aria-label="Days after the first email" type="number" min={1} max={30} className="field w-20" value={days} onChange={(e) => setDays(Number(e.target.value))} />
        days after each email
      </div>
      <button type="button" disabled={busy} onClick={save} className="btn btn-primary w-full">Turn on</button>
      {error && <p role="alert" className="text-sm font-semibold text-bad">{error}</p>}
    </div>
  )
}

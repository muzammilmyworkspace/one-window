'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from './ui'

export function SyncButton({ disabled }: { disabled: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  async function sync() {
    setBusy(true)
    setNote(null)
    const res = await fetch('/api/inbox/sync', { method: 'POST' })
    const d = await res.json()
    setBusy(false)
    setNote(res.ok ? { ok: true, text: d.added ? `${d.added} new` : 'Nothing new' } : { ok: false, text: d.error })
    router.refresh()
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      {note && <p role="status" className={`text-sm font-semibold ${note.ok ? 'text-brand-dark' : 'text-bad'}`}>{note.text}</p>}
      <button type="button" disabled={busy || disabled} onClick={sync} className="btn btn-ghost"><Icon name="sync" size={15} /> {busy ? 'Checking…' : 'Check now'}</button>
    </div>
  )
}

export function MarkUnread({ id }: { id: number }) {
  const router = useRouter()
  async function mark() {
    await fetch(`/api/inbox/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ is_read: false }) })
    router.push('/inbox')
    router.refresh()
  }
  return <button type="button" onClick={mark} className="btn btn-ghost">Mark unread</button>
}

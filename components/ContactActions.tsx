'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from './ui'

export function ImportButton() {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  async function upload(file: File) {
    setBusy(true)
    setNote(null)
    const body = new FormData()
    body.append('file', file)
    const res = await fetch('/api/contacts/import', { method: 'POST', body })
    const d = await res.json()
    setBusy(false)
    if (input.current) input.current.value = ''
    if (!res.ok) { setNote({ ok: false, text: d.error }); return }
    setNote({ ok: true, text: `${d.added.toLocaleString()} added, ${d.duplicates.toLocaleString()} already here, ${d.invalid.toLocaleString()} invalid` })
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {note && <p role="status" className={`text-sm font-semibold ${note.ok ? 'text-good' : 'text-bad'}`}>{note.text}</p>}
      <input ref={input} type="file" accept=".xlsx,.csv" className="sr-only" aria-label="Contacts file" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="btn btn-primary"><Icon name="upload" size={16} /> {busy ? 'Importing…' : 'Import Excel or CSV'}</button>
    </div>
  )
}

export function StatusToggle({ id, status }: { id: number; status: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function set(next: string) {
    setBusy(true)
    await fetch(`/api/contacts/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: next }) })
    setBusy(false)
    router.refresh()
  }
  if (status === 'active') return <button disabled={busy} onClick={() => set('unsubscribed')} className="text-[13px] font-semibold text-ink-2 hover:text-bad hover:underline">Unsubscribe</button>
  if (status === 'unsubscribed') return <button disabled={busy} onClick={() => window.confirm('Only do this if the person asked to get emails again. Continue?') && set('active')} className="text-[13px] font-semibold text-ink-2 hover:text-brand-dark hover:underline">Make active</button>
  return null
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from './ui'

export default function ReplyBox({ id, to }: { id: number; to: string }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  async function send() {
    setBusy(true)
    setNote(null)
    const res = await fetch(`/api/inbox/${id}/reply`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body }) })
    const d = await res.json()
    setBusy(false)
    if (!res.ok) { setNote({ ok: false, text: d.error }); return }
    setBody('')
    setNote({ ok: true, text: d.practice ? 'Practice mode: saved here, not really sent.' : 'Sent. A copy is in your info@ inbox.' })
    router.refresh()
  }

  return (
    <div className="border-t border-line p-4">
      <label htmlFor="reply" className="label">Reply to {to}</label>
      <textarea id="reply" rows={4} className="field" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || !body.trim()} onClick={send} className="btn btn-primary"><Icon name="reply" size={15} /> {busy ? 'Sending…' : 'Send reply'}</button>
        {note && <p role="status" className={`text-sm font-semibold ${note.ok ? 'text-good' : 'text-bad'}`}>{note.text}</p>}
      </div>
    </div>
  )
}

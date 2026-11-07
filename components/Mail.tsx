'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from './ui'

/** A sent campaign email, shown exactly as it arrived. Scripts never run inside it. */
export function EmailFrame({ html, title }: { html: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(420)
  const doc = html.replace(/<head>/i, '<head><base target="_blank"><style>body{margin:0}</style>')

  const measure = useCallback(() => {
    const d = ref.current?.contentDocument
    if (d?.documentElement && d.documentElement.scrollHeight > 0) setHeight(d.documentElement.scrollHeight + 4)
  }, [])

  useEffect(() => {
    // inside a closed message the frame has no size yet, so measure again when it opens
    const box = ref.current?.closest('details')
    box?.addEventListener('toggle', measure)
    window.addEventListener('resize', measure)
    return () => { box?.removeEventListener('toggle', measure); window.removeEventListener('resize', measure) }
  }, [measure])

  return (
    <iframe ref={ref} title={title} srcDoc={doc} onLoad={() => { measure(); setTimeout(measure, 400) }}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className="block w-full rounded-lg border border-line bg-white" style={{ height }} />
  )
}

export function Composer({ replyId, toName, toEmail, subject, draftKey }: { replyId: number; toName: string; toEmail: string; subject: string; draftKey: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const key = `ow-draft:${draftKey}`

  useEffect(() => {
    try { const d = localStorage.getItem(key); if (d) { setBody(d); setOpen(true) } } catch { /* storage blocked */ }
  }, [key])
  useEffect(() => { if (open) box.current?.focus() }, [open])

  function change(v: string) {
    setBody(v)
    try { if (v) localStorage.setItem(key, v); else localStorage.removeItem(key) } catch { /* storage blocked */ }
  }
  function discard() { change(''); setOpen(false); setNote(null) }

  async function send() {
    if (!body.trim() || busy) return
    setBusy(true)
    setNote(null)
    try {
      const res = await fetch(`/api/inbox/${replyId}/reply`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body }) })
      const d = await res.json()
      if (!res.ok) { setNote({ ok: false, text: d.error || 'Could not send' }); return }
      change('')
      setOpen(false)
      setNote({ ok: true, text: d.practice ? 'Practice mode: saved here, not really sent.' : 'Sent. A copy is also in your info@ inbox.' })
      router.refresh()
    } catch {
      setNote({ ok: false, text: 'No connection. Your text is kept, try again.' })
    } finally { setBusy(false) }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => { setOpen(true); setNote(null) }} className="btn btn-primary"><Icon name="reply" size={15} /> Reply</button>
        {note && <p role="status" className={`text-sm font-semibold ${note.ok ? 'text-good' : 'text-bad'}`}>{note.text}</p>}
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-xl border border-[#cfd3c8] bg-white shadow-card">
      <div className="space-y-1 border-b border-line bg-page/60 px-4 py-2.5 text-[13px]">
        <p className="truncate"><span className="inline-block w-16 text-ink-3">To</span><b>{toName}</b> <span className="text-ink-2">&lt;{toEmail}&gt;</span></p>
        <p className="truncate"><span className="inline-block w-16 text-ink-3">Subject</span>{/^re:/i.test(subject) ? subject : `Re: ${subject}`}</p>
      </div>
      <label htmlFor="reply-body" className="sr-only">Your reply</label>
      <textarea id="reply-body" ref={box} rows={7} value={body} onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') send() }}
        placeholder={`Write to ${toName.split(' ')[0] || 'them'}…`}
        className="block w-full resize-y px-4 py-3 text-[15px] leading-relaxed outline-none" />
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
        <button type="button" disabled={busy || !body.trim()} onClick={send} className="btn btn-primary"><Icon name="send" size={15} /> {busy ? 'Sending…' : 'Send'}</button>
        <button type="button" onClick={discard} disabled={busy} className="btn btn-ghost">Discard</button>
        <span className="hidden text-xs text-ink-3 sm:inline">Ctrl + Enter sends. Your draft is kept if you leave.</span>
        {note && <p role="status" className={`text-sm font-semibold ${note.ok ? 'text-good' : 'text-bad'}`}>{note.text}</p>}
      </div>
    </div>
  )
}

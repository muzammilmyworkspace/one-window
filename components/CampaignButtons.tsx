'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from './ui'

export default function CampaignButtons({ id, status, failed = 0, full = false }: { id: number; status: string; failed?: number; full?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function act(action: string) {
    setBusy(true)
    const res = await fetch(`/api/campaigns/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) })
    const d = await res.json()
    setBusy(false)
    if (action === 'duplicate' && d.id) { router.push(`/campaigns/${d.id}`); return }
    router.refresh()
  }

  return (
    <>
      {status === 'running' && <button disabled={busy} onClick={() => act('pause')} className="btn btn-ghost"><Icon name="pause" size={15} /> Pause</button>}
      {status === 'paused' && <button disabled={busy} onClick={() => act('resume')} className="btn btn-primary"><Icon name="send" size={15} /> Resume</button>}
      {full && failed > 0 && <button disabled={busy} onClick={() => act('retry')} className="btn btn-ghost"><Icon name="sync" size={15} /> Retry {failed} failed</button>}
      {full && <button disabled={busy} onClick={() => act('duplicate')} className="btn btn-ghost"><Icon name="copy" size={15} /> Duplicate</button>}
      {full && <a href={`/api/export?type=campaign&id=${id}`} className="btn btn-ghost"><Icon name="download" size={15} /> Export</a>}
    </>
  )
}

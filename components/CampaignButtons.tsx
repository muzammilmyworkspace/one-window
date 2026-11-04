'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from './ui'

export default function CampaignButtons({ id, status }: { id: number; status: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function act(action: string) {
    setBusy(true)
    await fetch(`/api/campaigns/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) })
    setBusy(false)
    router.refresh()
  }

  if (status === 'running') return <button disabled={busy} onClick={() => act('pause')} className="btn btn-ghost"><Icon name="pause" size={15} /> Pause</button>
  if (status === 'paused') return <button disabled={busy} onClick={() => act('resume')} className="btn btn-primary"><Icon name="send" size={15} /> Resume</button>
  return null
}

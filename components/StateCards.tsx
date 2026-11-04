import Link from 'next/link'
import type { StateRow } from '@/lib/editorData'
import { Badge, Meter } from './ui'

function Body({ s }: { s: StateRow }) {
  const status = s.queued > 0 ? <Badge tone="info" icon="send">Sending</Badge>
    : s.reached >= s.total && s.total > 0 ? <Badge tone="good" icon="check">Emailed</Badge>
    : s.reached > 0 ? <Badge tone="warn" icon="clock">Part done</Badge>
    : <Badge tone="mute">Not started</Badge>
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <div className="min-w-0">
          <p className="font-semibold">{s.name}</p>
          <p className="text-xs text-ink-3">{s.code}</p>
        </div>
        {status}
      </div>
      <p className="mt-3 text-2xl font-semibold leading-none tracking-tight tabular-nums">{s.total.toLocaleString()}</p>
      <div className="mt-3"><Meter value={s.reached} max={s.total} label={`${s.name} progress`} /></div>
      <p className="mt-1.5 text-xs tabular-nums text-ink-2">{s.reached.toLocaleString()} emailed</p>
    </>
  )
}

const CARD = 'block w-full rounded-2xl border bg-white p-4 text-left shadow-card transition-colors'

export default function StateCards({ states, selected, onPick }: { states: StateRow[]; selected?: string; onPick?: (code: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {states.map((s) => onPick ? (
        <button key={s.code} type="button" aria-pressed={selected === s.code} onClick={() => onPick(s.code)}
          className={`${CARD} ${selected === s.code ? 'border-brand ring-2 ring-brand/25' : 'border-line hover:border-[#bfc1b8]'}`}><Body s={s} /></button>
      ) : (
        <Link key={s.code} href={`/campaigns/new?state=${s.code}`} className={`${CARD} border-line hover:border-brand`}><Body s={s} /></Link>
      ))}
    </div>
  )
}

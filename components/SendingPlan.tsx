import type { Batch } from '@/lib/plan'
import { Icon } from './ui'

function dayLabel(ms: number) {
  const a = new Date(ms), b = new Date()
  const days = Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime() - new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()) / 86400e3)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return a.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function SendingPlan({ batches, started = false }: { batches: Batch[]; started?: boolean }) {
  if (!batches.length) return <p className="text-[13px] text-ink-2">Connect a sender to see the plan.</p>
  return (
    <ol className="divide-y divide-line rounded-xl border border-line">
      {batches.map((b) => (
        <li key={b.index} className="flex items-center gap-2.5 px-3 py-2 text-sm">
          <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold ${b.state === 'done' ? 'bg-good-soft text-good' : b.state === 'now' ? 'bg-brand text-white' : 'bg-[#eeeeea] text-ink-2'}`}>
            {b.state === 'done' ? <Icon name="check" size={13} /> : b.index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Batch {b.index + 1}</p>
            <p className="text-xs text-ink-3">{dayLabel(b.at)}</p>
          </div>
          <p className="tabular-nums text-ink-2">
            {started ? <><b className="text-ink">{b.done.toLocaleString()}</b> / {b.size.toLocaleString()}</> : <b className="text-ink">{b.size.toLocaleString()}</b>}
          </p>
        </li>
      ))}
    </ol>
  )
}

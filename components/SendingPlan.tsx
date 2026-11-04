import { dayLabel, type Slot } from '@/lib/plan'

export default function SendingPlan({ slots }: { slots: Slot[] }) {
  if (!slots.length) return <p className="text-[13px] text-ink-2">Nothing left to schedule.</p>
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {slots.map((s, i) => (
        <li key={s.offset} className={`rounded-xl border p-3 ${i === 0 ? 'border-brand bg-brand-soft' : 'border-line bg-white'}`}>
          <p className={`text-xs font-semibold ${i === 0 ? 'text-brand-dark' : 'text-ink-3'}`}>Batch {i + 1}</p>
          <p className="mt-0.5 text-lg font-semibold leading-tight tabular-nums">{s.size.toLocaleString()}</p>
          <p className="mt-0.5 truncate text-xs text-ink-2">{dayLabel(s.offset)}</p>
        </li>
      ))}
    </ol>
  )
}

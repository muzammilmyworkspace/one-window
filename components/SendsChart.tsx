'use client'

import { useState } from 'react'

const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** Bars for one series, so the card title names it and no legend is needed. */
export default function SendsChart({ data }: { data: { day: string; n: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...data.map((d) => d.n), 1)
  const H = 150
  const top = Math.ceil(max / 10) * 10 || 10
  const peak = data.reduce((best, d, i) => (d.n > data[best].n ? i : best), 0)

  return (
    <div className="relative">
      <div className="relative" style={{ height: H + 24 }} onMouseLeave={() => setHover(null)}>
        {[1, 0.5, 0].map((f) => (
          <div key={f} className="absolute inset-x-0 flex items-center gap-2" style={{ top: H - H * f - 7 }}>
            <span className="w-7 text-right text-[11px] tabular-nums text-ink-3">{Math.round(top * f)}</span>
            <span className={`h-px flex-1 ${f === 0 ? 'bg-[#cfdbd6]' : 'bg-line'}`} />
          </div>
        ))}
        <div className="absolute left-9 right-0 top-0 flex items-end gap-[2px]" style={{ height: H }}>
          {data.map((d, i) => (
            <div key={d.day} className="relative flex h-full min-w-0 flex-1 items-end justify-center" onMouseEnter={() => setHover(i)}>
              {d.n > 0 && (
                <div className={`w-full max-w-[26px] rounded-t transition-colors ${hover === i ? 'bg-brand-dark' : 'bg-brand'}`}
                  style={{ height: Math.max(3, (d.n / top) * H) }} />
              )}
              {i === peak && d.n > 0 && hover === null && (
                <span className="absolute text-[11px] font-bold tabular-nums text-ink" style={{ bottom: (d.n / top) * H + 3 }}>{d.n}</span>
              )}
            </div>
          ))}
        </div>
        <div className="absolute bottom-0 left-9 right-0 flex justify-between text-[11px] text-ink-3">
          <span>{fmt(data[0].day)}</span>
          <span>{fmt(data[data.length - 1].day)}</span>
        </div>
        {hover !== null && (
          <div className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-deep px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg"
            style={{ left: `calc(36px + (100% - 36px) * ${(hover + 0.5) / data.length})` }}>
            {fmt(data[hover].day)}: {data[hover].n.toLocaleString()} sent
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>Emails sent per day</caption>
        <tbody>{data.map((d) => <tr key={d.day}><th>{d.day}</th><td>{d.n}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

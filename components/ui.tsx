import type { ReactNode } from 'react'

const ICONS: Record<string, ReactNode> = {
  home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>,
  send: <><path d="M22 2 11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></>,
  users: <><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3-6 7-6s7 2 7 6" /><path d="M16 4a4 4 0 0 1 0 8" /><path d="M18 15c2.5.6 4 2.6 4 6" /></>,
  inbox: <><path d="M3 13h5l2 3h4l2-3h5" /><path d="M5 5h14l2 8v6H3v-6z" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19 12l2-1-2-4-2 1-2-2 1-2-4-1-1 2h-2L8 3 4 5l1 2-2 2-2-1v5l2-1 2 2-1 2 4 2 1-2h2l1 2 4-2-1-2 2-2z" /></>,
  check: <path d="M4 12l5 5L20 6" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  pause: <path d="M8 5v14M16 5v14" />,
  alert: <><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  reply: <><path d="M9 7l-5 5 5 5" /><path d="M4 12h10a6 6 0 0 1 6 6v1" /></>,
  sync: <><path d="M20 11a8 8 0 0 0-14-4L3 10" /><path d="M3 4v6h6" /><path d="M4 13a8 8 0 0 0 14 4l3-3" /><path d="M21 20v-6h-6" /></>,
  out: <><path d="M9 21H5V3h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
  upload: <><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 20h16" /></>,
  link: <><path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1" /><path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1" /></>,
}

export function Icon({ name, size = 18, className = '' }: { name: keyof typeof ICONS | string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}

type Tone = 'good' | 'warn' | 'bad' | 'info' | 'mute'
const TONE: Record<Tone, string> = {
  good: 'bg-brand-soft text-brand-dark',
  warn: 'bg-sun-soft text-sun-ink',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-blue-soft text-blue',
  mute: 'bg-[#eef2f0] text-ink-2',
}
export function Badge({ tone, icon, children }: { tone: Tone; icon?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE[tone]}`}>
      {icon && <Icon name={icon} size={12} />}{children}
    </span>
  )
}

const STATUS: Record<string, [Tone, string, string]> = {
  draft: ['mute', 'pause', 'Draft'],
  running: ['good', 'send', 'Sending'],
  paused: ['warn', 'pause', 'Paused'],
  completed: ['info', 'check', 'Completed'],
  queued: ['mute', 'clock', 'Queued'],
  sending: ['good', 'send', 'Sending'],
  sent: ['good', 'check', 'Sent'],
  failed: ['bad', 'x', 'Failed'],
  skipped: ['mute', 'x', 'Skipped'],
  active: ['good', 'check', 'Active'],
  unsubscribed: ['warn', 'x', 'Unsubscribed'],
  bounced: ['bad', 'alert', 'Bounced'],
  reply: ['good', 'reply', 'Reply'],
  auto: ['mute', 'clock', 'Auto-reply'],
  unsubscribe: ['warn', 'x', 'Unsubscribe'],
  bounce: ['bad', 'alert', 'Bounce'],
}
export function StatusBadge({ status }: { status: string }) {
  const [tone, icon, label] = STATUS[status] || (['mute', 'clock', status] as [Tone, string, string])
  return <Badge tone={tone} icon={icon}>{label}</Badge>
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-ink-2">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export function Stat({ label, value, sub }: { label: string; value: string | number; sub?: ReactNode }) {
  return (
    <div className="card p-4">
      <p className="text-[13px] font-semibold text-ink-2">{label}</p>
      <p className="mt-1 font-display text-[30px] font-bold leading-none tracking-tight">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      {sub && <p className="mt-2 text-[12.5px] leading-snug text-ink-3">{sub}</p>}
    </div>
  )
}

export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} className="h-2 w-full overflow-hidden rounded-full bg-[#e6eeea]">
      <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand-dark"><Icon name={icon} size={20} /></span>
      <p className="mt-3 font-display text-lg font-bold">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-sm text-sm text-ink-2">{children}</div>}
    </div>
  )
}

export function Notice({ tone, children }: { tone: 'warn' | 'bad' | 'info'; children: ReactNode }) {
  const cls = { warn: 'border-[#f3dda8] bg-sun-soft text-sun-ink', bad: 'border-[#f3c9ce] bg-bad-soft text-bad', info: 'border-[#cddaf3] bg-blue-soft text-blue' }[tone]
  return <div className={`mb-5 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold leading-snug ${cls}`}><Icon name="alert" size={17} className="mt-0.5 flex-none" /><div className="min-w-0">{children}</div></div>
}

export const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(a / b < 0.1 ? 1 : 0)}%` : '0%')

export function when(ms?: number | null): string {
  if (!ms) return ''
  const n = Number(ms), diff = Date.now() - n
  if (diff < 60e3) return 'just now'
  if (diff < 3600e3) return `${Math.floor(diff / 60e3)} min ago`
  if (diff < 86400e3) return `${Math.floor(diff / 3600e3)} h ago`
  return new Date(n).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

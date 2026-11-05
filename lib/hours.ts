// Emails only go out during the day where the person lives.
const EASTERN = ['GA', 'FL', 'NC']
const list = EASTERN.map((s) => `'${s}'`).join(',')

function hourIn(timeZone: string, now: Date): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(now))
}
const within = (h: number, from: number, to: number) => h >= from && h < to

/** The contact filter for right now, or null when it is outside sending hours everywhere. */
export function openHours(from: number, to: number, now = new Date()): string | null {
  const east = within(hourIn('America/New_York', now), from, to)
  const central = within(hourIn('America/Chicago', now), from, to)
  if (east && central) return ''
  if (east) return ` AND ct.state IN (${list})`
  if (central) return ` AND ct.state NOT IN (${list})`
  return null
}

// How emails are split into daily batches. Safe to import in the browser.
export const WARMUP = [100, 200, 300]

export const dayLimit = (day: number, capacity: number, warmup: boolean) => (warmup ? Math.min(capacity, WARMUP[day] ?? capacity) : capacity)

/** The domain's state right now. Warm-up belongs to the domain, not to one campaign. */
export interface PlanContext { capacity: number; warmDay: number; usedToday: number; ahead: number }
export interface Slot { size: number; offset: number }

/** Which day each email goes out, after the campaigns already in the queue. */
export function schedule(total: number, warmup: boolean, c: PlanContext): Slot[] {
  const out: Slot[] = []
  let left = total, ahead = c.ahead
  for (let d = 0; left > 0 && c.capacity > 0 && d < 400; d++) {
    let room = Math.max(0, dayLimit(c.warmDay + d, c.capacity, warmup) - (d === 0 ? c.usedToday : 0))
    const first = Math.min(ahead, room)
    ahead -= first
    room -= first
    const size = Math.min(left, room)
    if (size > 0) { out.push({ size, offset: d }); left -= size }
  }
  return out
}

export function dayLabel(offset: number): string {
  if (offset === 0) return 'Today'
  if (offset === 1) return 'Tomorrow'
  return new Date(Date.now() + offset * 86400e3).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

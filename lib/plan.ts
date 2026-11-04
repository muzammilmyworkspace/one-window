// How a campaign is split into daily batches. Safe to import in the browser.
export const WARMUP = [100, 200, 300]
const DAY = 24 * 3600 * 1000

export const dayLimit = (day: number, capacity: number, warmup: boolean) => (warmup ? Math.min(capacity, WARMUP[day] ?? capacity) : capacity)

/** The size of each daily batch. */
export function planDays(total: number, capacity: number, warmup: boolean): number[] {
  const out: number[] = []
  let left = total
  for (let d = 0; left > 0 && capacity > 0 && d < 120; d++) {
    const n = Math.min(left, dayLimit(d, capacity, warmup))
    out.push(n)
    left -= n
  }
  return out
}

/** How many emails a warm-up campaign may have sent by this many days after it started. */
export function allowedBy(day: number, capacity: number): number {
  let sum = 0
  for (let d = 0; d <= day; d++) sum += dayLimit(d, capacity, true)
  return sum
}

export interface Batch { index: number; size: number; done: number; state: 'done' | 'now' | 'next'; at: number }

/** Places what has been sent against the plan, with the day each batch belongs to. */
export function batches(total: number, sent: number, capacity: number, warmup: boolean, startedAt: number): Batch[] {
  let left = sent
  return planDays(total, capacity, warmup).map((size, index) => {
    const done = Math.min(left, size)
    left -= done
    const state = done >= size ? 'done' : done > 0 ? 'now' : 'next'
    return { index, size, done, state, at: startedAt + index * DAY }
  })
}

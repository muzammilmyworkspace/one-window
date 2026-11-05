import type { Block } from './docparse'
import { emailBlocks as e } from './seed'

export interface SeriesEmail { subject: string; preheader: string; html: string; day: number }

export const SERIES_DAYS = [1, 3, 6, 9, 12, 16]

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const isGreeting = (t: string) => /^(hi|hello|dear)\b[^.!?]{0,30},?$/i.test(t)
const isSignature = (t: string) => /support life/i.test(t) && /\d{3}[-\s]\d{4}/.test(t)
const clean = (t: string) => t.replace(/^subject(\s*line)?\s*[:\-–]\s*/i, '').trim()
const greeting = (t: string) => (/^hi,?$/i.test(t) ? 'Hi {{first_name}},' : esc(t))

function build(subject: string, body: Block[], sign: string, source: string, first: boolean, day: number): SeriesEmail {
  const parts = [e.h1(esc(subject))]
  if (first) parts.push(e.split('oe2027_series'))
  const rest = body.slice(1)
  parts.push(e.p(greeting(body[0].text)))
  const intro = rest.find((b) => b.kind === 'p')
  for (let i = 0; i < rest.length; i++) {
    const b = rest[i]
    if (b.kind === 'li' || b.kind === 'ol') {
      const run: string[] = []
      while (i < rest.length && rest[i].kind === b.kind) run.push(esc(rest[i++].text))
      i--
      parts.push(e.checks(run))
    } else if (/reply to this email/i.test(b.text)) {
      const word = (b.text.match(/[Jj]ust send ([A-Z0-9 ]+)\./) || [])[1] || ''
      parts.push(e.reply(esc(b.text), word.trim()))
    } else if (b.text.endsWith(':')) parts.push(e.p(`<strong>${esc(b.text)}</strong>`))
    else parts.push(e.p(esc(b.text)))
  }
  if (first) parts.push(e.friend())
  parts.push(e.sign(sign))
  if (source) parts.push(e.source(source))
  return { subject, preheader: (intro?.text || '').slice(0, 110), html: parts.join('\n'), day }
}

/** A document holding several emails: each starts at its greeting and ends at the signature. Notes around them are left out. */
export function parseSeries(input: Block[]): SeriesEmail[] | null {
  // bold text in Word leaves a stray space before punctuation
  const blocks = input.map((b) => ({ ...b, text: b.text.replace(/\s+([.,!?;:])/g, '$1') }))
  const starts = blocks.map((b, i) => (isGreeting(b.text) ? i : -1)).filter((i) => i > 0)
  if (starts.length < 2) return null
  return starts.map((start, k) => {
    const limit = starts[k + 1] ?? blocks.length
    let end = start + 1
    while (end < limit && !isSignature(blocks[end].text)) end++
    const next = blocks[end + 1]
    const source = next && /^official reference:/i.test(next.text) ? next.text.replace(/^official reference:\s*/i, '') : ''
    return build(clean(blocks[start - 1].text), blocks.slice(start, end), blocks[end]?.text || 'The Support Life', source, k === 0, SERIES_DAYS[k] ?? SERIES_DAYS[SERIES_DAYS.length - 1] + 3 * (k - 5))
  })
}

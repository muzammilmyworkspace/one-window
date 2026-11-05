import type { Block } from './docparse'

export interface SeriesEmail { subject: string; preheader: string; html: string; day: number }

export const SERIES_DAYS = [1, 3, 6, 9, 12, 16]

// Plain on purpose: a personal looking email has a better chance of reaching the main inbox.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const p = (t: string) => `<p style="margin:0 0 14px;">${t}</p>`
const list = (items: string[]) => `<ul style="margin:0 0 14px;padding-left:22px;">${items.map((t) => `<li style="margin-bottom:5px;">${t}</li>`).join('')}</ul>`
const isGreeting = (t: string) => /^(hi|hello|dear)\b[^.!?]{0,30},?$/i.test(t)
const isSignature = (t: string) => /support life/i.test(t) && /\d{3}[-\s]\d{4}/.test(t)
const clean = (t: string) => t.replace(/^subject(\s*line)?\s*[:\-–]\s*/i, '').trim()
const greeting = (t: string) => (/^hi,?$/i.test(t) ? 'Hi {{first_name}},' : esc(t))
const signature = (t: string) => t.replace(/\s*The Support Life\s*/, '<br>The Support Life<br>').replace(/<br>\s*$/, '')

function build(subject: string, body: Block[], sign: string, source: string, day: number): SeriesEmail {
  const parts = [p(greeting(body[0].text))]
  const rest = body.slice(1)
  const intro = rest.find((b) => b.kind === 'p')
  for (let i = 0; i < rest.length; i++) {
    const b = rest[i]
    if (b.kind === 'li' || b.kind === 'ol') {
      const run: string[] = []
      while (i < rest.length && rest[i].kind === b.kind) run.push(esc(rest[i++].text))
      i--
      parts.push(list(run))
    } else if (/reply to this email/i.test(b.text)) parts.push(p(`<strong>${esc(b.text)}</strong>`))
    else parts.push(p(esc(b.text)))
  }
  parts.push(p(signature(sign)))
  if (source) parts.push(`<p style="margin:0 0 14px;font-size:12px;color:#777777;">Source: ${esc(source)}</p>`)
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
    return build(clean(blocks[start - 1].text), blocks.slice(start, end), blocks[end]?.text || 'The Support Life', source, SERIES_DAYS[k] ?? SERIES_DAYS[SERIES_DAYS.length - 1] + 3 * (k - 5))
  })
}

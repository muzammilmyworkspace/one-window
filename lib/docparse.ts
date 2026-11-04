import { emailBlocks as e } from './seed'

export interface Block { kind: 'h' | 'p' | 'li' | 'ol'; text: string }
export interface ParsedDoc { subject: string; preheader: string; html: string }

const MAX_BYTES = 4 * 1024 * 1024
const BULLET = /^[•●▪◦‣·*\-–—]\s+/
const NUMBERED = /^\d{1,2}[.)]\s+/
const entities = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function lineBlock(t: string): Block {
  if (BULLET.test(t)) return { kind: 'li', text: t.replace(BULLET, '') }
  if (NUMBERED.test(t)) return { kind: 'ol', text: t.replace(NUMBERED, '') }
  return { kind: 'p', text: t }
}

/** Plain text and PDFs have no paragraphs, so wrapped lines are joined back up. */
export function textBlocks(text: string): Block[] {
  const out: Block[] = []
  let buf = ''
  const flush = () => { if (buf) out.push(lineBlock(buf)); buf = '' }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim()
    if (!line) { flush(); continue }
    if (BULLET.test(line) || NUMBERED.test(line)) { flush(); buf = line; continue }
    if (buf && !/[.!?:]$/.test(buf) && buf.length >= 45) buf += ` ${line}`
    else { flush(); buf = line }
  }
  flush()
  return out
}

export function htmlBlocks(html: string): Block[] {
  const out: Block[] = []
  const re = /<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi
  for (const m of html.matchAll(re)) {
    const text = entities(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
    if (!text) continue
    const tag = m[1].toLowerCase()
    out.push(tag === 'li' ? { kind: 'li', text } : tag === 'p' ? lineBlock(text) : { kind: 'h', text })
  }
  return out
}

/** Text with its links made clickable and any [name] token turned into the merge field. */
function inline(t: string): string {
  return esc(t)
    .replace(/\[\s*(first\s*)?name\s*\]/gi, '{{first_name}}')
    .replace(/\b(https?:\/\/[^\s<]+[^\s<.,)])/g, '<a href="$1" style="color:#0E9F6E;">$1</a>')
}
const isHeading = (t: string) => t.length <= 60 && !/[.!?,;]$/.test(t) && !/^(hi|hello|dear|hey|thanks|thank you|regards|sincerely|best)\b/i.test(t)

export function buildEmail(input: Block[]): ParsedDoc {
  const blocks: Block[] = []
  let subject = '', preheader = ''
  for (const b of input) {
    const s = b.text.match(/^subject(?:\s*line)?\s*[:\-–]\s*(.+)$/i)
    const v = b.text.match(/^(?:preview(?:\s*text)?|preheader)\s*[:\-–]\s*(.+)$/i)
    if (s && !subject) subject = s[1].trim()
    else if (v && !preheader) preheader = v[1].trim()
    else blocks.push(b)
  }
  if (!blocks.length) throw new Error('No text found in this file. A scanned PDF has no text to read.')

  const first = blocks.find((b) => b.kind === 'h') || (isHeading(blocks[0].text) ? blocks[0] : undefined)
  if (!subject) subject = (first || blocks[0]).text.slice(0, 120)
  const greeted = blocks.slice(0, 4).some((b) => /^(hi|hello|dear|hey)\b/i.test(b.text))
  if (!preheader) preheader = blocks.find((b) => b !== first && b.kind === 'p' && b.text.length > 40 && !isHeading(b.text))?.text.slice(0, 110) || ''

  const parts: string[] = []
  if (first) parts.push(e.h1(inline(first.text)))
  if (!greeted) parts.push(e.p('Hi {{first_name}},'))
  const hasLink = blocks.some((b) => /https?:\/\//.test(b.text))
  const signed = blocks.slice(-4).some((b) => /^(thanks|thank you|regards|sincerely|best)\b/i.test(b.text))

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (b === first) continue
    if (b.kind === 'li' || b.kind === 'ol') {
      const run: Block[] = []
      while (i < blocks.length && blocks[i].kind === b.kind) run.push(blocks[i++])
      i--
      parts.push(e.rows(run.map((r, n) => {
        const m = r.text.match(/^([^:.]{3,60})[:.]\s+(.+)$/)
        return e.row(b.kind === 'ol' ? String(n + 1) : '&#10003;', m ? inline(m[1]) + '.' : '', inline(m ? m[2][0].toUpperCase() + m[2].slice(1) : r.text))
      }).join('\n')))
    } else if (b.kind === 'h' || isHeading(b.text)) parts.push(e.heading(inline(b.text)))
    else parts.push(e.p(inline(b.text)))
  }
  if (!hasLink) parts.push(e.btn('Check my options', 'upload'))
  if (!signed) parts.push(e.p('Thanks,<br><strong>The Support Life team</strong>'))
  return { subject, preheader, html: parts.join('\n') }
}

export async function parseDocument(name: string, buf: ArrayBuffer): Promise<ParsedDoc> {
  if (buf.byteLength > MAX_BYTES) throw new Error('This file is over 4 MB. Please use a smaller one.')
  const lower = name.toLowerCase()
  if (lower.endsWith('.docx')) {
    const mammoth = (await import('mammoth')).default
    const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(buf) })
    return buildEmail(htmlBlocks(value))
  }
  if (lower.endsWith('.pdf')) {
    const { extractText, getDocumentProxy } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(buf))
    const { text } = await extractText(pdf, { mergePages: true })
    return buildEmail(textBlocks(text))
  }
  if (lower.endsWith('.txt')) return buildEmail(textBlocks(new TextDecoder().decode(buf)))
  if (lower.endsWith('.doc')) throw new Error('Old .doc files cannot be read. In Word, save it as .docx and upload again.')
  throw new Error('Please upload a PDF, Word (.docx) or text file.')
}

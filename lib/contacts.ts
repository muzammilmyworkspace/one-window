import ExcelJS from 'exceljs'
import { batch, one } from './db'
import { EMAIL_RE } from './email'

interface Raw { first: string; last: string; email: string; state: string }

function csvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (c !== '\r') cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

async function xlsxRows(buf: ArrayBuffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  const ws = wb.getWorksheet('Contacts') || wb.worksheets[0]
  const rows: string[][] = []
  ws.eachRow((r) => {
    const out: string[] = []
    r.eachCell({ includeEmpty: true }, (cell, n) => {
      const v = cell.value as unknown as { text?: string; result?: unknown } | string | number | null
      out[n - 1] = String((v && typeof v === 'object' ? v.text ?? v.result : v) ?? '').trim()
    })
    rows.push(out)
  })
  return rows
}

function toContacts(rows: string[][]): { list: Raw[]; invalid: number } {
  if (!rows.length) throw new Error('The file is empty')
  const head = rows[0].map((h) => String(h || '').trim().toLowerCase())
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h))
  const ce = col('email', 'e-mail', 'email address')
  if (ce < 0) throw new Error('No "Email" column found in the first row')
  const [cf, cl, cn, cs] = [col('first name', 'firstname', 'first'), col('last name', 'lastname', 'last'), col('name', 'full name'), col('state')]
  const list: Raw[] = []
  let invalid = 0
  for (const r of rows.slice(1)) {
    const email = String(r[ce] || '').trim().toLowerCase()
    if (!email && r.every((c) => !c)) continue
    if (!EMAIL_RE.test(email)) { invalid++; continue }
    let first = cf >= 0 ? r[cf] || '' : ''
    let last = cl >= 0 ? r[cl] || '' : ''
    if (!first && cn >= 0 && r[cn]) {
      const parts = r[cn].trim().split(/\s+/)
      first = parts[0]
      last = parts.slice(1).join(' ')
    }
    list.push({ email, first: first.trim(), last: last.trim(), state: String(cs >= 0 ? r[cs] || '' : '').trim().toUpperCase() })
  }
  return { list, invalid }
}

/** Adds new contacts. An address already here is left untouched, so an unsubscribe stays. */
export async function importContacts(name: string, buf: ArrayBuffer) {
  const lower = name.toLowerCase()
  let rows: string[][]
  if (lower.endsWith('.xlsx')) rows = await xlsxRows(buf)
  else if (lower.endsWith('.csv')) rows = csvRows(new TextDecoder().decode(buf).replace(/^﻿/, ''))
  else throw new Error('Please upload an .xlsx or .csv file')
  const { list, invalid } = toContacts(rows)

  const count = async () => Number((await one<{ n: number }>('SELECT COUNT(*) n FROM contacts'))?.n || 0)
  const before = await count()
  const now = Date.now()
  for (let i = 0; i < list.length; i += 200) {
    await batch(list.slice(i, i + 200).map((c) => ({
      sql: 'INSERT OR IGNORE INTO contacts (email, first_name, last_name, state, created_at) VALUES (?, ?, ?, ?, ?)',
      args: [c.email, c.first, c.last, c.state, now],
    })))
  }
  const added = (await count()) - before
  return { added, duplicates: list.length - added, invalid }
}

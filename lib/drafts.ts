import { getKv, run, setKv } from './db'
import data from './seriesDrafts.json'

/** Puts the prepared state series in as drafts once. A draft you delete stays deleted. */
export async function ensureDrafts() {
  for (const d of data as { key: string; name: string; state: string; emails: { subject: string; preheader: string; html: string; day: number }[] }[]) {
    if (await getKv(`draft:${d.key}`)) continue
    await setKv(`draft:${d.key}`, '1')
    const [first, ...rest] = d.emails
    await run('INSERT INTO campaigns (name, subject, preheader, html, states, warmup, list_name, sequence, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)',
      [d.name, first.subject, first.preheader, first.html, d.state, '', JSON.stringify(rest), Date.now()])
  }
}

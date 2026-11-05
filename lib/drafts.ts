import { all, getKv, one, run, setKv } from './db'
import data from './seriesDrafts.json'

const OLD = ['Texas', 'Alabama', 'Florida', 'North Carolina', 'Mississippi', 'Louisiana'].map((s) => `${s}, 6-email series`)

/** Puts the prepared series in as drafts once. A draft you delete stays deleted. */
export async function ensureDrafts() {
  // the six single-state drafts became one "Other states" campaign
  const marks = OLD.map(() => '?').join(',')
  const started = await one(`SELECT 1 x FROM campaigns WHERE name IN (${marks}) AND status != 'draft' LIMIT 1`, OLD)
  if (!started) await run(`DELETE FROM campaigns WHERE name IN (${marks}) AND status = 'draft'`, OLD)
  // Illinois went from six emails to three (1, 2 and 6). Any text edited in the draft is kept.
  if (!(await getKv('draft:il-trim-1'))) {
    await setKv('draft:il-trim-1', '1')
    for (const c of await all("SELECT id, sequence FROM campaigns WHERE name = 'Illinois, 6-email series' AND status = 'draft'")) {
      const seq = JSON.parse(String(c.sequence || '[]'))
      if (seq.length === 5) await run("UPDATE campaigns SET name = 'Illinois, 3-email series', sequence = ? WHERE id = ?", [JSON.stringify([seq[0], { ...seq[4], day: 6 }]), Number(c.id)])
    }
  }
  for (const d of data as { key: string; name: string; state: string; emails: { subject: string; preheader: string; html: string; day: number }[] }[]) {
    if (await getKv(`draft:${d.key}`)) continue
    if (started && d.key === 'other-series-1') continue   // those states are already being emailed
    await setKv(`draft:${d.key}`, '1')
    const [first, ...rest] = d.emails
    await run('INSERT INTO campaigns (name, subject, preheader, html, states, warmup, list_name, sequence, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)',
      [d.name, first.subject, first.preheader, first.html, d.state, '', JSON.stringify(rest), Date.now()])
  }
}

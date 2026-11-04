import { all } from './db'
import { planContext } from './engine'
import { stateName } from './lists'
import { isLive } from './settings'

export interface StateRow { code: string; name: string; total: number; reached: number; queued: number }

/** Every state with its people and how far the emails have got. */
export async function stateOverview(): Promise<StateRow[]> {
  const [contacts, sends] = await Promise.all([
    all("SELECT state, COUNT(*) n FROM contacts WHERE status = 'active' AND state != '' GROUP BY state ORDER BY n DESC"),
    all(`SELECT ct.state, COUNT(DISTINCT CASE WHEN s.sent_at IS NOT NULL THEN s.contact_id END) reached,
        COUNT(CASE WHEN s.status IN ('queued','sending') AND c.status = 'running' THEN 1 END) queued
      FROM sends s JOIN contacts ct ON ct.id = s.contact_id JOIN campaigns c ON c.id = s.campaign_id GROUP BY ct.state`),
  ])
  return contacts.map((c) => {
    const s = sends.find((x) => x.state === c.state)
    return { code: String(c.state), name: stateName(String(c.state)), total: Number(c.n), reached: Number(s?.reached || 0), queued: Number(s?.queued || 0) }
  })
}

export async function editorData() {
  const [states, context] = await Promise.all([stateOverview(), planContext()])
  return { states, context, live: isLive() }
}

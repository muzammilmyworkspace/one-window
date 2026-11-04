import { all } from './db'
import { dailyCapacity } from './providers'
import { isLive } from './settings'

export async function editorData() {
  const [states, previous, capacity] = await Promise.all([
    all("SELECT state, COUNT(*) n FROM contacts WHERE status = 'active' GROUP BY state ORDER BY n DESC"),
    all('SELECT c.id, c.name, (SELECT COUNT(*) FROM sends s WHERE s.campaign_id = c.id AND s.sent_at IS NOT NULL) sent FROM campaigns c WHERE c.started_at IS NOT NULL ORDER BY c.started_at DESC'),
    dailyCapacity(),
  ])
  return {
    stateCounts: states.map((s) => ({ state: String(s.state), n: Number(s.n) })),
    previous: previous.map((p) => ({ id: Number(p.id), name: String(p.name), sent: Number(p.sent) })),
    live: isLive(),
    capacity,
  }
}

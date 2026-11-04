import { all } from './db'
import { dailyCapacity } from './providers'
import { isLive } from './settings'

export async function editorData() {
  const [states, previous, capacity] = await Promise.all([
    all("SELECT list_name, state, COUNT(*) n FROM contacts WHERE status = 'active' GROUP BY list_name, state ORDER BY n DESC"),
    all('SELECT c.id, c.name, (SELECT COUNT(*) FROM sends s WHERE s.campaign_id = c.id AND s.sent_at IS NOT NULL) sent FROM campaigns c WHERE c.started_at IS NOT NULL AND c.auto_child = 0 ORDER BY c.started_at DESC'),
    dailyCapacity(),
  ])
  return {
    stateCounts: states.map((s) => ({ list: String(s.list_name), state: String(s.state), n: Number(s.n) })),
    live: isLive(),
    capacity,
  }
}

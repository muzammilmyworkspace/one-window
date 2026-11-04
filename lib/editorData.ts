import { all } from './db'
import { missingCreds, providers } from './providers'
import { isLive } from './settings'

export async function editorData() {
  const [states, previous, provs] = await Promise.all([
    all("SELECT state, COUNT(*) n FROM contacts WHERE status = 'active' GROUP BY state ORDER BY n DESC"),
    all('SELECT c.id, c.name, (SELECT COUNT(*) FROM sends s WHERE s.campaign_id = c.id AND s.sent_at IS NOT NULL) sent FROM campaigns c WHERE c.started_at IS NOT NULL ORDER BY c.started_at DESC'),
    providers(),
  ])
  return {
    stateCounts: states.map((s) => ({ state: String(s.state), n: Number(s.n) })),
    previous: previous.map((p) => ({ id: Number(p.id), name: String(p.name), sent: Number(p.sent) })),
    live: isLive(),
    capacity: provs.filter((p) => p.enabled && (!isLive() || !missingCreds(p.name).length)).reduce((a, p) => a + Number(p.daily_cap), 0),
  }
}

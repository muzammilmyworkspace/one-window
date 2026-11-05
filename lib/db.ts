import { createClient, type Client, type InValue } from '@libsql/client'
import { databaseToken, databaseUrl } from './setup'

const g = globalThis as unknown as { __db?: Client; __dbReady?: Promise<void> }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS contacts_state ON contacts(state);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  preheader TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  states TEXT NOT NULL DEFAULT '',
  follow_up_of INTEGER,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  provider TEXT,
  message_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at INTEGER,
  delivered_at INTEGER,
  opened_at INTEGER,
  bounced_at INTEGER,
  replied_at INTEGER,
  UNIQUE (campaign_id, contact_id)
);
CREATE INDEX IF NOT EXISTS sends_queue ON sends(status, campaign_id);
CREATE INDEX IF NOT EXISTS sends_email ON sends(email);
CREATE INDEX IF NOT EXISTS sends_message ON sends(message_id);
CREATE INDEX IF NOT EXISTS sends_usage ON sends(provider, sent_at);

CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL UNIQUE,
  contact_id INTEGER,
  campaign_id INTEGER,
  send_id INTEGER,
  from_email TEXT NOT NULL,
  from_name TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'reply',
  is_read INTEGER NOT NULL DEFAULT 0,
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS replies_time ON replies(received_at);

CREATE TABLE IF NOT EXISTS providers (
  name TEXT PRIMARY KEY,
  daily_cap INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  errors INTEGER NOT NULL DEFAULT 0,
  paused_until INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
INSERT OR IGNORE INTO providers (name, daily_cap) VALUES ('brevo', 280), ('resend', 95);

CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reply_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  provider TEXT,
  sent_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS answers_reply ON answers(reply_id);

CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`

// Columns added after the first release. Adding one that exists fails, which is fine.
const COLUMNS = [
  'ALTER TABLE campaigns ADD COLUMN pause_reason TEXT',
  'ALTER TABLE campaigns ADD COLUMN safety_ack INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE sends ADD COLUMN complained_at INTEGER',
  'ALTER TABLE campaigns ADD COLUMN warmup INTEGER NOT NULL DEFAULT 0',
  "ALTER TABLE contacts ADD COLUMN list_name TEXT NOT NULL DEFAULT 'clients'",
  "ALTER TABLE contacts ADD COLUMN company TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE campaigns ADD COLUMN list_name TEXT NOT NULL DEFAULT 'clients'",
  "ALTER TABLE campaigns ADD COLUMN reason TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE campaigns ADD COLUMN followup_key TEXT NOT NULL DEFAULT ''",
  'ALTER TABLE campaigns ADD COLUMN followup_days INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE campaigns ADD COLUMN auto_child INTEGER NOT NULL DEFAULT 0',
  "ALTER TABLE campaigns ADD COLUMN sequence TEXT NOT NULL DEFAULT ''",
  "UPDATE contacts SET status = 'replied' WHERE status = 'active' AND id IN (SELECT contact_id FROM replies WHERE kind = 'reply')",
]

function client(): Client {
  if (!g.__db) {
    g.__db = createClient({ url: databaseUrl(), authToken: databaseToken() })
  }
  return g.__db
}

export function ready(): Promise<void> {
  if (!g.__dbReady) {
    g.__dbReady = (async () => {
      await client().executeMultiple(SCHEMA)
      for (const sql of COLUMNS) await client().execute(sql).catch(() => {})
    })().catch((e) => {
      g.__dbReady = undefined
      throw e
    })
  }
  return g.__dbReady
}

export type Row = Record<string, any>

export async function all<T = Row>(sql: string, args: InValue[] = []): Promise<T[]> {
  await ready()
  const r = await client().execute({ sql, args })
  return r.rows as unknown as T[]
}
export async function one<T = Row>(sql: string, args: InValue[] = []): Promise<T | undefined> {
  return (await all<T>(sql, args))[0]
}
export async function run(sql: string, args: InValue[] = []) {
  await ready()
  const r = await client().execute({ sql, args })
  return { changes: r.rowsAffected, id: r.lastInsertRowid === undefined ? 0 : Number(r.lastInsertRowid) }
}
export async function batch(stmts: { sql: string; args: InValue[] }[]) {
  await ready()
  await client().batch(stmts, 'write')
}

export async function getKv(key: string): Promise<string | undefined> {
  return (await one<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key]))?.value
}
export async function setKv(key: string, value: string) {
  await run('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value])
}
/** Takes a named lease. False when someone else holds it. */
export async function lease(key: string, ms: number): Promise<boolean> {
  const now = Date.now()
  await run('INSERT OR IGNORE INTO kv (key, value) VALUES (?, ?)', [key, '0'])
  const r = await run('UPDATE kv SET value = ? WHERE key = ? AND CAST(value AS INTEGER) < ?', [String(now + ms), key, now])
  return r.changes === 1
}
export async function release(key: string) {
  await setKv(key, '0')
}

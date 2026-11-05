import { all, setKv } from './db'

export const SETTING_DEFAULTS = {
  from_name: 'The Support Life',
  from_email: 'info@thesupportlife.com',
  reply_to: 'info@thesupportlife.com',
  address: 'The Support Life · 10685-B Hazelhurst Dr Ste 42901, Houston, TX 77043, USA',
  disclosure:
    'The Support Life is a third-party marketing company that connects consumers with licensed insurance agents. We are not an insurance agency or carrier and are not affiliated with HealthCare.gov or any government agency.',
  reason: "You're receiving this because you previously asked about health coverage.",
  gap_seconds: '30',
  send_from: '10',
  send_to: '20',
  webmail_url: 'https://mail.hostinger.com',
  top_note: 'Open now · Ends Jan 15',
  assets_url: 'https://www.thesupportlife.com/email',
  website_url: 'https://www.thesupportlife.com',
  phone: '(872) 217-1852',
  facebook_url: 'https://www.facebook.com/thesupportlife',
  instagram_url: 'https://www.instagram.com/thesupportlife.us/',
  reddit_url: 'https://www.reddit.com/user/thesupportlife/',
}
export type Settings = typeof SETTING_DEFAULTS
export type SettingKey = keyof Settings

export async function getSettings(): Promise<Settings> {
  const rows = await all<{ key: string; value: string }>("SELECT key, value FROM kv WHERE key LIKE 'set:%'")
  const s = { ...SETTING_DEFAULTS }
  for (const r of rows) {
    const k = r.key.slice(4) as SettingKey
    if (k in s) s[k] = r.value
  }
  return s
}
export async function saveSettings(patch: Partial<Settings>) {
  for (const k of Object.keys(SETTING_DEFAULTS) as SettingKey[]) {
    const v = patch[k]
    if (typeof v === 'string') await setKv(`set:${k}`, v.trim())
  }
}
export const isLive = () => (process.env.SEND_MODE || '').trim().replace(/^["']|["']$/g, '').toLowerCase() === 'live'

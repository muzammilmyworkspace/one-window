// Friendly names for contact lists. Safe to import in the browser.
const LABELS: Record<string, string> = {
  clients: 'Existing clients',
  business: 'Business owners',
  'business-catchall': 'Business owners (unconfirmed emails)',
}
const ORDER = ['clients', 'business', 'business-catchall']
const rank = (l: string) => { const i = ORDER.indexOf(l); return i < 0 ? ORDER.length : i }
export const byListOrder = (a: string, b: string) => rank(a) - rank(b)
export const listLabel = (name: string) => LABELS[name] || name

export const BUSINESS_REASON = "We're reaching out because your business contact details are publicly listed. We have not worked with you before."
export const reasonFor = (list: string) => (list.startsWith('business') ? BUSINESS_REASON : '')
export const followupFor = (list: string) => (list.startsWith('business') ? 'b2' : 'email2')

const STATES: Record<string, string> = {
  AL: 'Alabama', FL: 'Florida', GA: 'Georgia', IL: 'Illinois', LA: 'Louisiana', MS: 'Mississippi', NC: 'North Carolina', TX: 'Texas',
}
export const stateName = (code: string) => STATES[code] || code

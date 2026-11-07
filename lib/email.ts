import { unsubToken } from './auth'
import { stateName } from './lists'
import type { Settings } from './settings'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export interface Person { email: string; first_name?: string; last_name?: string; state?: string; company?: string }

function fill(str: string, c: Person, html: boolean): string {
  const first = (c.first_name || '').trim().split(/\s+/)[0] || ''
  const vals: Record<string, string> = { first_name: first || 'there', last_name: c.last_name || '', state: c.state || '', state_name: stateName(c.state || '') || 'your state', company: c.company || 'your business', email: c.email }
  return str.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in vals ? (html ? esc(vals[k]) : vals[k]) : m))
}

/** Fills {{first_name}} and the other fields into plain text, such as a subject line. */
export const personalize = (str: string, c: Person) => fill(str, c, false)

export function toText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/i, '')
    .replace(/<div style="display:none[\s\S]*?<\/div>/i, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, h, t) => {
      const label = t.replace(/<[^>]+>/g, '').trim() || (t.match(/alt="([^"]*)"/) || [])[1] || 'Link'
      return h.startsWith('tel:') ? label : `${label} (${h.replace(/&amp;/g, '&')})`
    })
    .replace(/<(br|\/p|\/li|\/h\d|\/tr|\/div)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** The body the user writes, wrapped in the layout and the legally required footer. */
export async function renderEmail(c: { subject: string; html: string; preheader?: string; reason?: string }, person: Person, s: Settings) {
  const url = `${(process.env.APP_URL || '').replace(/\/$/, '')}/u/${await unsubToken(person.email)}`
  const body = fill(c.html, person, true)
  const assets = s.assets_url.replace(/\/$/, '')
  // Light by design: small images only and real text, so it still reads like a personal email.
  const social = [['Facebook', 'facebook', s.facebook_url], ['Instagram', 'instagram', s.instagram_url], ['Reddit', 'reddit', s.reddit_url]].filter(([, , href]) => href)
    .map(([alt, file, href]) => `<td style="padding-right:8px;"><a href="${esc(href)}"><img src="${assets}/${file}.png" width="24" height="24" alt="${alt}" style="display:block;border:0;font-size:11px;color:#777777;"></a></td>`).join('')
  const site = s.website_url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:Arial,Helvetica,sans-serif;color:#222222;font-size:16px;line-height:1.55;">
<tr><td height="4" bgcolor="#0E9F6E" style="height:4px;background:#0E9F6E;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:16px 16px 4px;"><a href="${esc(s.website_url)}"><img src="${assets}/logo.png" width="132" height="28" alt="${esc(s.brand_name)}" style="display:block;border:0;font-size:14px;color:#222222;"></a></td></tr>
<tr><td style="padding:14px 16px 2px;">${body}</td></tr>
<tr><td style="padding:4px 16px 2px;">${social ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr>${social}<td style="font-size:14px;"><a href="${esc(s.website_url)}" style="color:#0E9F6E;font-weight:bold;text-decoration:none;">${esc(site)}</a></td></tr></table>` : ''}</td></tr>
<tr><td style="padding:12px 16px 22px;font-size:12px;line-height:1.5;color:#777777;">
<p style="margin:0 0 6px;border-top:1px solid #e5e5e5;padding-top:12px;">${esc(s.disclosure)}</p>
<p style="margin:0 0 6px;">${esc(c.reason || s.reason)} Don't want these emails? <a href="${url}" style="color:#777777;">Unsubscribe</a> or reply "unsubscribe".</p>
<p style="margin:0;">${esc(s.address)}</p>
</td></tr></table></body></html>`
  return {
    subject: fill(c.subject, person, false),
    html,
    text: toText(html),
    headers: {
      'List-Unsubscribe': `<${url}>, <mailto:${s.reply_to}?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }
}

export const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/

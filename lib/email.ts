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
  const pre = c.preheader ? fill(c.preheader, person, true) : ''
  const assets = s.assets_url.replace(/\/$/, '')
  const social = [['Facebook', 'facebook', s.facebook_url], ['Instagram', 'instagram', s.instagram_url], ['Reddit', 'reddit', s.reddit_url]].filter(([, , href]) => href)
    .map(([alt, file, href]) => `<td style="padding:0 7px;"><a href="${esc(href)}"><img src="${assets}/${file}.png" width="32" height="32" alt="${alt}" style="display:block;border:0;"></a></td>`).join('')
  const site = s.website_url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef3f0;">
${pre ? `<div style="display:none;max-height:0;overflow:hidden;color:#eef3f0;">${pre}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f0;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#33504A;font-size:16px;line-height:1.55;">
<tr><td style="height:6px;background:#0E9F6E;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center" style="padding:24px 28px 18px;border-bottom:1px solid #edf1ef;"><a href="${esc(s.website_url)}"><img src="${assets}/logo.png" width="189" height="40" alt="${esc(s.from_name)}" style="display:block;border:0;"></a></td></tr>
<tr><td style="padding:26px 30px 10px;">${body}</td></tr>
<tr><td align="center" style="padding:22px 28px;background:#f6f9f7;border-top:1px solid #edf1ef;">
<p style="margin:0 0 12px;font-size:14px;font-weight:bold;color:#17302A;">Stay in touch</p>
${social ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr>${social}</tr></table>` : ''}
<p style="margin:12px 0 0;font-size:14px;"><a href="${esc(s.website_url)}" style="color:#0E9F6E;font-weight:bold;text-decoration:none;">${esc(site)}</a>${s.phone ? ` &nbsp;·&nbsp; <span style="color:#33504A;">${esc(s.phone)}</span>` : ''}</p>
</td></tr>
<tr><td style="padding:18px 30px 24px;font-size:12px;line-height:1.5;color:#6b7a73;text-align:center;">
<p style="margin:0 0 8px;">${esc(s.disclosure)}</p>
<p style="margin:0 0 8px;">${esc(c.reason || s.reason)} Don't want these emails? <a href="${url}" style="color:#6b7a73;">Unsubscribe</a> or reply "unsubscribe".</p>
<p style="margin:0;">${esc(s.address)}</p>
</td></tr></table></td></tr></table></body></html>`
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

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
    .map(([alt, file, href]) => `<td style="padding:0 7px;"><a href="${esc(href)}"><img src="${assets}/${file}-w.png" width="34" height="34" alt="${alt}" style="display:block;border:0;"></a></td>`).join('')
  const site = s.website_url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
  const tel = s.phone.replace(/\D/g, '')
  const check = (t: string) => `<td align="center" style="padding:0 4px;font-size:13px;font-weight:bold;color:#0C3A2C;white-space:nowrap;"><span style="color:#0E9F6E;">&#10003;</span> ${t}</td>`
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#e9f0ec;">
${pre ? `<div style="display:none;max-height:0;overflow:hidden;color:#e9f0ec;">${pre}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#e9f0ec" style="background:#e9f0ec;"><tr><td align="center" style="padding:20px 10px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#33504A;font-size:16px;line-height:1.6;">
<tr><td style="padding:16px 22px 10px;border-bottom:1px solid #edf1ef;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td><a href="${esc(s.website_url)}"><img src="${assets}/logo.png" width="170" height="36" alt="${esc(s.from_name)}" style="display:block;border:0;color:#0C3A2C;font-size:17px;font-weight:bold;"></a></td>
${s.top_note ? `<td align="right" style="font-size:12px;font-weight:bold;color:#7A5200;"><span style="display:inline-block;background:#FFF4DC;border-radius:99px;padding:6px 12px;white-space:nowrap;">${esc(s.top_note)}</span></td>` : ''}
</tr></table></td></tr>
<tr><td style="padding:22px 24px 6px;">${body}</td></tr>
<tr><td style="padding:0 24px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e6eeea;"><tr><td style="padding-top:16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${check('Free consultation')}${check('No obligation')}${check('Licensed agents')}</tr></table></td></tr></table></td></tr>
${s.phone ? `<tr><td align="center" bgcolor="#E9F7F1" style="background:#E9F7F1;padding:22px 28px;">
<p style="margin:0;font-size:14px;color:#33504A;">Prefer to talk to someone?</p>
<a href="tel:+1${tel}" style="display:inline-block;margin-top:2px;font-size:25px;font-weight:bold;color:#0C3A2C;text-decoration:none;">${esc(s.phone)}</a>
<p style="margin:2px 0 0;font-size:14px;color:#33504A;">Or just reply to this email.</p>
</td></tr>` : ''}
<tr><td align="center" bgcolor="#0C3A2C" style="background:#0C3A2C;padding:26px 28px;">
${social ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr>${social}</tr></table>` : ''}
<p style="margin:14px 0 0;font-size:14px;"><a href="${esc(s.website_url)}" style="color:#FFB020;font-weight:bold;text-decoration:none;">${esc(site)}</a></p>
<p style="margin:16px 0 0;font-size:12px;line-height:1.55;color:#B9D3C8;">${esc(s.disclosure)}</p>
<p style="margin:8px 0 0;font-size:12px;line-height:1.55;color:#B9D3C8;">${esc(c.reason || s.reason)} Don't want these emails? <a href="${url}" style="color:#ffffff;">Unsubscribe</a> or reply "unsubscribe".</p>
<p style="margin:8px 0 0;font-size:12px;line-height:1.55;color:#B9D3C8;">${esc(s.address)}</p>
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

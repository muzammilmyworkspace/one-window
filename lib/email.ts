import { unsubToken } from './auth'
import type { Settings } from './settings'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export interface Person { email: string; first_name?: string; last_name?: string; state?: string }

function fill(str: string, c: Person, html: boolean): string {
  const first = (c.first_name || '').trim().split(/\s+/)[0] || ''
  const vals: Record<string, string> = { first_name: first || 'there', last_name: c.last_name || '', state: c.state || '', email: c.email }
  return str.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in vals ? (html ? esc(vals[k]) : vals[k]) : m))
}

export function toText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/i, '')
    .replace(/<div style="display:none[\s\S]*?<\/div>/i, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, h, t) => {
      const label = t.replace(/<[^>]+>/g, '').trim()
      return h.startsWith('tel:') ? label : `${label} (${h.replace(/&amp;/g, '&')})`
    })
    .replace(/<(br|\/p|\/li|\/h\d|\/tr|\/div)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** The body the user writes, wrapped in the layout and the legally required footer. */
export async function renderEmail(c: { subject: string; html: string; preheader?: string }, person: Person, s: Settings) {
  const url = `${(process.env.APP_URL || '').replace(/\/$/, '')}/u/${await unsubToken(person.email)}`
  const body = fill(c.html, person, true)
  const pre = c.preheader ? fill(c.preheader, person, true) : ''
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f5;">
${pre ? `<div style="display:none;max-height:0;overflow:hidden;color:#f4f6f5;">${pre}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;font-family:Arial,Helvetica,sans-serif;color:#1d2a24;font-size:16px;line-height:1.55;">
<tr><td style="padding:28px 28px 8px;">${body}</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #e6ebe8;font-size:12px;line-height:1.5;color:#6b7a73;">
<p style="margin:0 0 8px;">${esc(s.disclosure)}</p>
<p style="margin:0 0 8px;">${esc(s.reason)} Don't want these emails? <a href="${url}" style="color:#6b7a73;">Unsubscribe</a> or reply "unsubscribe".</p>
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

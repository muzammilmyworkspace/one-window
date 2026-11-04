import { readUnsubToken } from '@/lib/auth'
import { run } from '@/lib/db'

type Ctx = { params: Promise<{ token: string }> }

const page = (title: string, body: string, status = 200) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f6f5;font-family:Arial,Helvetica,sans-serif;color:#1d2a24;padding:16px}main{max-width:440px;background:#fff;border-radius:14px;padding:32px;box-shadow:0 12px 40px -24px rgba(0,0,0,.4)}h1{margin:0 0 10px;font-size:22px}p{margin:0 0 18px;line-height:1.5;color:#54706a}button{background:#0E9F6E;color:#fff;border:0;border-radius:9px;padding:13px 22px;font-size:15px;font-weight:700;cursor:pointer}</style></head><body><main>${body}</main></body></html>`,
  { status, headers: { 'content-type': 'text/html; charset=utf-8' } })

const bad = () => page('Link not valid', '<h1>This link is not valid</h1><p>Reply to the email with the word "unsubscribe" and we will remove you.</p>', 400)

// A GET only asks: mail scanners open links on their own, and must not unsubscribe anyone.
export async function GET(_: Request, ctx: Ctx) {
  const email = await readUnsubToken((await ctx.params).token)
  if (!email) return bad()
  return page('Unsubscribe', '<h1>Unsubscribe from these emails?</h1><p>You will not get any more emails from us.</p><form method="post"><button type="submit">Yes, unsubscribe me</button></form>')
}

// Also the one-click target of the List-Unsubscribe header.
export async function POST(_: Request, ctx: Ctx) {
  const email = await readUnsubToken((await ctx.params).token)
  if (!email) return bad()
  await run("UPDATE contacts SET status = 'unsubscribed' WHERE email = ?", [email])
  return page('Unsubscribed', '<h1>You are unsubscribed</h1><p>You will not get any more emails from us. Sorry for the bother.</p>')
}

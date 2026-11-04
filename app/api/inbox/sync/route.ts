import { fail, json } from '@/lib/api'
import { imapConfigured, syncInbox } from '@/lib/inbox'

export async function POST() {
  if (!imapConfigured()) return fail('The info@ inbox is not connected yet. Add IMAP_PASS.')
  try {
    return json(await syncInbox())
  } catch (e) {
    const err = e as Error & { authenticationFailed?: boolean }
    return fail(err.authenticationFailed ? 'Hostinger rejected the login. Check IMAP_PASS.' : err.message, 502)
  }
}

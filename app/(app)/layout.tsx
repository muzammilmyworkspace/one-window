import Shell from '@/components/Shell'
import { one } from '@/lib/db'
import { getSettings, isLive } from '@/lib/settings'

export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const unread = await one<{ n: number }>("SELECT COUNT(*) n FROM replies WHERE is_read = 0 AND kind IN ('reply','unsubscribe')")
  const open = !process.env.ADMIN_PASSWORD && (process.env.APP_URL || '').startsWith('https')
  return <Shell unread={Number(unread?.n || 0)} live={isLive()} open={open} workspace={(await getSettings()).from_name}>{children}</Shell>
}

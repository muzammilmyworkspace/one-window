import Shell from '@/components/Shell'
import { one } from '@/lib/db'
import { isLive } from '@/lib/settings'

export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const unread = await one<{ n: number }>("SELECT COUNT(*) n FROM replies WHERE is_read = 0 AND kind IN ('reply','unsubscribe')")
  return <Shell unread={Number(unread?.n || 0)} live={isLive()}>{children}</Shell>
}

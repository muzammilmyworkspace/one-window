'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Icon } from './ui'

const NAV = [
  { href: '/', label: 'Dashboard', icon: 'home' },
  { href: '/campaigns', label: 'Campaigns', icon: 'send' },
  { href: '/contacts', label: 'Contacts', icon: 'users' },
  { href: '/inbox', label: 'Inbox', icon: 'inbox' },
  { href: '/settings', label: 'Settings', icon: 'gear' },
]

const WAITING: Record<string, string> = { caps: 'Daily limits reached, continues automatically' }

/** Keeps the queue moving while the tool is open. Once live, a cron job does the same with it closed. */
function useEngine(setStatus: (s: string) => void) {
  const router = useRouter()
  const busy = useRef(false)
  useEffect(() => {
    const beat = async () => {
      if (busy.current) return
      busy.current = true
      try {
        const res = await fetch('/api/tick', { method: 'POST' })
        if (res.status === 401) { window.location.href = '/login'; return }
        const t = await res.json()
        setStatus(t.running ? WAITING[t.waiting] || 'Sending' : '')
        if (t.sent || t.inbox) router.refresh()
      } catch { /* try again on the next beat */ } finally { busy.current = false }
    }
    beat()
    const id = setInterval(beat, 15000)
    return () => clearInterval(id)
  }, [router, setStatus])
}

export default function Shell({ unread, live, open, workspace, children }: { unread: number; live: boolean; open: boolean; workspace: string; children: React.ReactNode }) {
  const path = usePathname()
  const [status, setStatus] = useState('')
  useEngine(setStatus)

  async function logout() {
    await fetch('/api/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <aside className="flex-none bg-deep text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:flex-col">
        <div className="flex items-center gap-2.5 px-5 pb-3 pt-4 lg:pb-6 lg:pt-6">
          <img src="/logo.svg" alt="" className="h-9 w-9" />
          <div>
            <p className="font-display text-lg font-semibold leading-none tracking-tight">One Window</p>
            <p className="mt-1 text-xs text-white/60">{workspace}</p>
          </div>
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {NAV.map((n) => {
            const on = n.href === '/' ? path === '/' : path.startsWith(n.href)
            return (
              <Link key={n.href} href={n.href} aria-current={on ? 'page' : undefined}
                className={`flex flex-none items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${on ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
                <Icon name={n.icon} />
                {n.label}
                {n.href === '/inbox' && unread > 0 && <span className="ml-auto rounded-full bg-sun px-1.5 text-xs font-extrabold text-deep">{unread}</span>}
              </Link>
            )
          })}
          <button onClick={logout} className="flex flex-none items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-white/70 lg:hidden"><Icon name="out" /> Sign out</button>
        </nav>
        <div className="hidden border-t border-white/10 p-3 lg:block">
          {status && <p className="mb-2 flex items-center gap-2 px-2 text-xs font-semibold text-white/80"><span className="h-2 w-2 flex-none animate-pulse rounded-full bg-sun" />{status}</p>}
          <button onClick={logout} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/70 hover:bg-white/10 hover:text-white">
            <Icon name="out" /> Sign out
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        {open && (
          <div role="alert" className="bg-bad px-4 py-2 text-center text-[13px] font-bold text-white lg:px-8">
            Anyone with this link can open One Window. Set ADMIN_PASSWORD to protect it.
          </div>
        )}
        {!live && (
          <div className="bg-sun-soft px-4 py-2 text-center text-[13px] font-bold text-sun-ink lg:px-8">
            Practice mode: nothing is really sent. Real sending starts when SEND_MODE is set to live.
          </div>
        )}
        <main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  )
}

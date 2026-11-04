'use client'

import { useState } from 'react'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })
    if (res.ok) { window.location.href = '/'; return }
    setError((await res.json().catch(() => ({}))).error || 'Could not sign in')
    setBusy(false)
  }

  return (
    <main className="flex min-h-full items-center justify-center bg-deep p-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-7">
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo-mark.svg" alt="" className="h-10 w-10" />
          <div>
            <h1 className="text-xl">Outreach</h1>
            <p className="text-[13px] text-ink-3">The Support Life</p>
          </div>
        </div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" type="password" autoFocus autoComplete="current-password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p role="alert" className="mt-2 text-sm font-semibold text-bad">{error}</p>}
        <button disabled={busy || !password} className="btn btn-primary mt-5 w-full">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  )
}

'use client'

import { useState } from 'react'

export default function LoginForm({ needsPassword }: { needsPassword: boolean }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) })
    if (res.ok) { window.location.href = '/'; return }
    setError((await res.json().catch(() => ({}))).error || 'Could not log in')
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="mt-7">
      {needsPassword && (
        <div className="mb-4">
          <label htmlFor="password" className="label">Password</label>
          <input id="password" type="password" autoFocus autoComplete="current-password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
      )}
      {error && <p role="alert" className="mb-3 text-sm font-semibold text-bad">{error}</p>}
      <button autoFocus={!needsPassword} disabled={busy || (needsPassword && !password)} className="btn btn-primary w-full !py-3 !text-[15px]">{busy ? 'Logging in…' : 'Log in'}</button>
    </form>
  )
}

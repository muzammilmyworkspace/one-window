import LoginForm from '@/components/LoginForm'
import { setupProblems } from '@/lib/setup'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  const problems = setupProblems()
  return (
    <main className="relative flex min-h-full items-center justify-center overflow-hidden bg-deep p-4">
      <div className="absolute inset-0 opacity-[0.07]" aria-hidden="true"
        style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '56px 56px' }} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <img src="/logo.svg" alt="" className="h-12 w-12" />
        <h1 className="mt-5 text-[28px] leading-none">One Window</h1>
        <p className="mt-2 text-[15px] leading-snug text-ink-2">Every campaign, contact and reply in one place.</p>
        {problems.length ? (
          <div role="alert" className="mt-6 rounded-xl border border-[#f3dda8] bg-sun-soft p-4 text-sm text-sun-ink">
            <p className="font-bold">Setup is not finished</p>
            <p className="mt-1">Add these in Vercel, then redeploy:</p>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 font-semibold">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        ) : <LoginForm needsPassword={!!process.env.ADMIN_PASSWORD} />}
      </div>
    </main>
  )
}

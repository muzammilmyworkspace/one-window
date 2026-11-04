import LoginForm from '@/components/LoginForm'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  return (
    <main className="relative flex min-h-full items-center justify-center overflow-hidden bg-deep p-4">
      <div className="absolute inset-0 opacity-[0.07]" aria-hidden="true"
        style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '56px 56px' }} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <img src="/logo.svg" alt="" className="h-12 w-12" />
        <h1 className="mt-5 text-[28px] leading-none">One Window</h1>
        <p className="mt-2 text-[15px] leading-snug text-ink-2">Every campaign, contact and reply in one place.</p>
        <LoginForm needsPassword={!!process.env.ADMIN_PASSWORD} />
      </div>
    </main>
  )
}

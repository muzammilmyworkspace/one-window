'use client'

import { Empty } from '@/components/ui'

export default function PageError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="card">
      <Empty icon="alert" title="This page could not load">
        <p>Your data is safe. Sending continues on its own.</p>
        <button type="button" onClick={reset} className="btn btn-primary mt-4">Try again</button>
      </Empty>
    </section>
  )
}

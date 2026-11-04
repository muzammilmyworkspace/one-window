import { NextResponse } from 'next/server'

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status })
export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

export function route<A extends unknown[]>(fn: (...a: A) => Promise<Response>) {
  return async (...a: A): Promise<Response> => {
    try { return await fn(...a) } catch (e) { return fail((e as Error).message || 'Something went wrong', 500) }
  }
}

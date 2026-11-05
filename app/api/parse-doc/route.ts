import { fail, json } from '@/lib/api'
import { buildEmail, readBlocks } from '@/lib/docparse'
import { parseSeries } from '@/lib/series'

export const maxDuration = 30

export async function POST(req: Request) {
  const file = (await req.formData()).get('file')
  if (!(file instanceof File)) return fail('Choose a file first')
  try {
    const blocks = await readBlocks(file.name, await file.arrayBuffer())
    const emails = parseSeries(blocks)
    return json(emails ? { emails } : buildEmail(blocks))
  } catch (e) {
    return fail((e as Error).message || 'This file could not be read')
  }
}

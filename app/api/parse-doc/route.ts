import { fail, json } from '@/lib/api'
import { parseDocument } from '@/lib/docparse'

export const maxDuration = 30

export async function POST(req: Request) {
  const file = (await req.formData()).get('file')
  if (!(file instanceof File)) return fail('Choose a file first')
  try {
    return json(await parseDocument(file.name, await file.arrayBuffer()))
  } catch (e) {
    return fail((e as Error).message || 'This file could not be read')
  }
}

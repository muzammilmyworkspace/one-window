import { fail, json, route } from '@/lib/api'
import { importContacts } from '@/lib/contacts'

export const POST = route(async (req: Request) => {
  const file = (await req.formData()).get('file')
  if (!(file instanceof File)) return fail('Choose a file first')
  return json(await importContacts(file.name, await file.arrayBuffer()))
})

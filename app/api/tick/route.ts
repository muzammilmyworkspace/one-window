import { json, route } from '@/lib/api'
import { tick } from '@/lib/engine'

export const POST = route(async () => json(await tick()))

export const databaseUrl = () => process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || 'file:local.db'
export const databaseToken = () => process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || undefined

/** Settings a deployment cannot run without. Only names are listed, never values. */
export function setupProblems(): string[] {
  const out: string[] = []
  if (!process.env.AUTH_SECRET) out.push('AUTH_SECRET')
  if (process.env.VERCEL) {
    // Vercel's disk is not kept, so a file database cannot work there
    if (databaseUrl().startsWith('file:')) out.push('TURSO_DATABASE_URL (database)')
    else if (!databaseToken()) out.push('TURSO_AUTH_TOKEN (database)')
    if (!process.env.CRON_SECRET) out.push('CRON_SECRET')
    if (!(process.env.APP_URL || '').startsWith('https://')) out.push('APP_URL (your https address)')
  }
  return out
}

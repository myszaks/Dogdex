import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { Client } from 'pg'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.database.local', quiet: true })
dotenv.config({ path: '.env.e2e.local', quiet: true })

if (!process.argv.includes('--confirm-dev')) {
  throw new Error('Uruchom skrypt wyłącznie przez npm run db:dev:migrate:training-p1.')
}

const databaseUrl = process.env.DOGDEX_DEV_DATABASE_URL
const supabaseUrl = process.env.DOGDEX_DEV_SUPABASE_URL
if (!databaseUrl || !supabaseUrl) {
  throw new Error('Brakuje DOGDEX_DEV_DATABASE_URL lub DOGDEX_DEV_SUPABASE_URL.')
}

const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
if (!projectRef || !databaseUrl.includes(projectRef)) {
  throw new Error('Adres bazy nie odpowiada projektowi DOGDEX_DEV_SUPABASE_URL; przerwano.')
}

const migration = await readFile(
  new URL('../supabase/migrations/20260731130000_complete_training_p1.sql', import.meta.url),
  'utf8',
)
const client = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
})

await client.connect()
try {
  await client.query('begin')
  await client.query(migration)
  await client.query('commit')
  process.stdout.write('Migracja P1 treningów została zastosowana do dev DB.\n')
} catch (error) {
  await client.query('rollback')
  throw error
} finally {
  await client.end()
}

import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { Client } from 'pg'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.database.local', quiet: true })
dotenv.config({ path: '.env.e2e.local', quiet: true })

if (!process.argv.includes('--confirm-dev')) {
  throw new Error('Uruchom skrypt wyłącznie przez npm run db:dev:migrate:event-payments-p0.')
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

const [baseMigration, hardeningMigration, p1p2Migration, refundRpcFix] = await Promise.all([
  readFile(new URL('../supabase/migrations/20260731203000_add_event_payments_p0.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260731213000_harden_event_payments_p0.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260731220000_add_event_payment_p1_p2.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260731224000_fix_event_refund_rpc_ambiguity.sql', import.meta.url), 'utf8'),
])
const client = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
})

await client.connect()
try {
  await client.query('begin')
  const { rows: [schemaState] } = await client.query(`
    select to_regclass('public.event_payments') is not null as base_applied
  `)
  if (!schemaState.base_applied) await client.query(baseMigration)
  await client.query(hardeningMigration)
  const { rows: [p1p2State] } = await client.query(`
    select to_regclass('public.event_refunds') is not null as applied
  `)
  if (!p1p2State.applied) await client.query(p1p2Migration)
  await client.query(refundRpcFix)
  await client.query('commit')
  process.stdout.write('Migracje P0-P2 płatności wydarzeń zostały zastosowane do dev DB.\n')
} catch (error) {
  await client.query('rollback')
  throw error
} finally {
  await client.end()
}

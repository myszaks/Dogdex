import process from 'node:process'
import { Client } from 'pg'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.database.local', quiet: true })
dotenv.config({ path: '.env.e2e.local', quiet: true })

const databaseUrl = process.env.DOGDEX_DEV_DATABASE_URL
const supabaseUrl = process.env.DOGDEX_DEV_SUPABASE_URL
if (!databaseUrl || !supabaseUrl) {
  throw new Error('Brakuje DOGDEX_DEV_DATABASE_URL lub DOGDEX_DEV_SUPABASE_URL.')
}
const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
if (!projectRef || !databaseUrl.includes(projectRef)) {
  throw new Error('Adres bazy nie odpowiada projektowi DOGDEX_DEV_SUPABASE_URL; przerwano.')
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
})
await client.connect()
try {
  const { rows } = await client.query(`
    select
      to_regclass('public.event_registration_items') is not null as registration_items,
      to_regclass('public.event_payments') is not null as payments,
      to_regclass('public.event_payment_items') is not null as payment_items,
      exists(
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'events' and column_name = 'pricing_mode'
      ) as pricing_mode,
      exists(select 1 from pg_proc where proname = 'complete_event_checkout') as complete_rpc,
      exists(select 1 from pg_proc where proname = 'fail_event_checkout') as fail_rpc,
      to_regclass('public.event_payments_one_active_per_registration') is not null as active_payment_guard
      ,to_regclass('public.event_refunds') is not null as refunds
      ,to_regclass('public.event_refund_items') is not null as refund_items
      ,to_regclass('public.event_refund_attempts') is not null as refund_attempts
      ,exists(select 1 from pg_proc where proname = 'complete_event_refund') as complete_refund_rpc
      ,exists(select 1 from pg_proc where proname = 'fail_event_refund') as fail_refund_rpc
  `)
  const result = rows[0]
  if (Object.values(result).some(value => value !== true)) {
    throw new Error(`Smoke test P0 płatności wydarzeń nie przeszedł: ${JSON.stringify(result)}`)
  }
  process.stdout.write(`Smoke test P0 płatności wydarzeń dev DB: ${JSON.stringify(result)}\n`)
} finally {
  await client.end()
}

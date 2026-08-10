import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { Client } from 'pg'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.database.local', quiet: true })
dotenv.config({ path: '.env.e2e.local', quiet: true })

if (!process.argv.includes('--confirm-dev')) {
  throw new Error('Uruchom skrypt wyłącznie z flagą --confirm-dev.')
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
  new URL('../supabase/migrations/20260809100000_add_business_profiles_and_permissions.sql', import.meta.url),
  'utf8',
)
const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })
await client.connect()

try {
  const { rows: preflight } = await client.query(`
    select
      to_regclass('public.organizer_team_members') is not null as organizer_team_ready,
      to_regclass('public.training_courses') is not null as courses_ready,
      to_regclass('public.training_pass_requests') is not null as pass_requests_ready,
      to_regclass('public.business_profiles') is not null as already_applied
  `)
  const state = preflight[0]
  if (!state.organizer_team_ready || !state.courses_ready || !state.pass_requests_ready) {
    throw new Error('Dev baseline jest niekompletny; najpierw zastosuj pakiet 20260808.')
  }
  if (state.already_applied) {
    throw new Error('Migracja profili biznesowych jest już obecna; przerwano bez zmian.')
  }

  await client.query('begin')
  await client.query(`set local lock_timeout = '15s'`)
  await client.query(`set local statement_timeout = '120s'`)
  await client.query(migration)
  await client.query('commit')

  const { rows } = await client.query(`
    select
      (select count(*)::integer from public.business_profiles) as profiles,
      (select count(*)::integer from public.business_profile_members) as members,
      (select count(*)::integer from public.events where business_profile_id is null) as events_without_profile,
      (select count(*)::integer from public.training_types where business_profile_id is null) as training_types_without_profile,
      (select count(*)::integer from public.training_bookings where business_profile_id is null) as bookings_without_profile,
      (select count(*)::integer from public.event_payments where business_profile_id is null) as event_payments_without_profile
  `)
  process.stdout.write(`Business permissions dev migration applied: ${JSON.stringify(rows[0])}\n`)
} catch (error) {
  try { await client.query('rollback') } catch {}
  throw error
} finally {
  await client.end()
}

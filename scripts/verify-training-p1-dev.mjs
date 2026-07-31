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
      (select count(*)::integer from public.training_reviews) as reviews,
      (
        select count(*)::integer
        from public.training_bookings
        where notes_user = 'QA P1 completed booking'
          and status = 'completed'
      ) as qa_completed,
      (
        select cancellation_buffer_hours
        from public.trainer_profiles
        where slug = 'trener-qa'
      ) as buffer_hours,
      exists(
        select 1
        from pg_proc
        where proname = 'claim_training_reminders'
      ) as reminder_claim_rpc
  `)
  const result = rows[0]
  if (
    result.reviews < 1
    || result.qa_completed !== 1
    || result.buffer_hours !== 24
    || result.reminder_claim_rpc !== true
  ) {
    throw new Error(`Smoke test P1 nie przeszedł: ${JSON.stringify(result)}`)
  }
  process.stdout.write(`Smoke test P1 dev DB: ${JSON.stringify(result)}\n`)
} finally {
  await client.end()
}

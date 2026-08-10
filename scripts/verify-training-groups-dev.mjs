import process from 'node:process'
import { Client } from 'pg'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.database.local', quiet: true })
dotenv.config({ path: '.env.e2e.local', quiet: true })

const databaseUrl = process.env.DOGDEX_DEV_DATABASE_URL
const supabaseUrl = process.env.DOGDEX_DEV_SUPABASE_URL
if (!databaseUrl || !supabaseUrl) throw new Error('Brakuje DOGDEX_DEV_DATABASE_URL lub DOGDEX_DEV_SUPABASE_URL.')
const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
if (!projectRef || !databaseUrl.includes(projectRef)) throw new Error('Adres bazy nie odpowiada projektowi dev; przerwano.')

const expectedTables = [
  'organizer_team_members', 'event_checkin_log', 'event_start_notifications', 'event_timing_imports',
  'training_courses', 'training_course_sessions', 'training_course_enrollments',
  'training_course_attendance', 'training_pass_products', 'training_passes',
  'training_pass_usages', 'training_commerce_payments', 'training_pass_adjustments',
  'training_commerce_refunds', 'training_pass_requests',
]
const expectedFunctions = [
  'create_training_course_enrollment(uuid,uuid,uuid,text)',
  'approve_training_course_enrollment(uuid,uuid,boolean)',
  'complete_training_commerce_checkout(uuid,text,text)',
  'fail_training_commerce_checkout(uuid,text)',
  'reconcile_training_commerce_states()',
  'promote_training_course_waitlist(uuid)',
  'consume_training_pass_for_booking(uuid,uuid,uuid)',
  'reverse_training_pass_booking_usage(uuid)',
  'consume_training_pass_for_course_session(uuid,uuid,uuid,uuid)',
  'reverse_training_pass_session_usage(uuid,uuid)',
  'complete_training_commerce_refund(uuid,text)',
  'resolve_training_pass_request(uuid,uuid,boolean,text)',
]

const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })
await client.connect()

async function verifySchema() {
  const { rows: tables } = await client.query(
    `select name, to_regclass('public.' || name) is not null as present from unnest($1::text[]) name order by name`,
    [expectedTables],
  )
  const missingTables = tables.filter(row => !row.present).map(row => row.name)
  const { rows: functions } = await client.query(
    `select signature, to_regprocedure('public.' || signature) is not null as present from unnest($1::text[]) signature order by signature`,
    [expectedFunctions],
  )
  const missingFunctions = functions.filter(row => !row.present).map(row => row.signature)
  const { rows: requiredColumns } = await client.query(`
    select expected.table_name, expected.column_name,
      columns.column_name is not null as present
    from (values
      ('registrations', 'checkin_token'),
      ('event_team_members', 'organizer_team_member_id'),
      ('training_courses', 'cancellation_policy'),
      ('training_courses', 'participant_message'),
      ('training_course_enrollments', 'policy_accepted_at'),
      ('training_pass_products', 'freeze_policy'),
      ('training_passes', 'frozen_at'),
      ('training_passes', 'policy_accepted_at'),
      ('training_commerce_payments', 'receipt_url'),
      ('training_commerce_payments', 'last_reconciled_at')
    ) expected(table_name, column_name)
    left join information_schema.columns columns
      on columns.table_schema = 'public'
     and columns.table_name = expected.table_name
     and columns.column_name = expected.column_name
    order by expected.table_name, expected.column_name
  `)
  const missingColumns = requiredColumns.filter(row => !row.present).map(row => `${row.table_name}.${row.column_name}`)
  const { rows: policies } = await client.query(`
    select count(*)::integer as count from pg_policies
    where schemaname = 'public' and tablename in (
      'organizer_team_members', 'event_checkin_log', 'event_start_notifications',
      'event_timing_imports', 'training_courses', 'training_course_sessions',
      'training_course_enrollments', 'training_course_attendance', 'training_pass_products',
      'training_passes', 'training_pass_usages', 'training_commerce_payments',
      'training_pass_adjustments', 'training_commerce_refunds', 'training_pass_requests'
    )
  `)
  if (missingTables.length || missingFunctions.length || missingColumns.length || policies[0].count < 15) {
    throw new Error(`Schemat grup/karnetów jest niekompletny: ${JSON.stringify({ missingTables, missingFunctions, missingColumns, policies: policies[0].count })}`)
  }
  return { tables: expectedTables.length, functions: expectedFunctions.length, columns: requiredColumns.length, policies: policies[0].count }
}

async function runTransactionalSmoke() {
  const trainerEmail = process.env.DOGDEX_QA_TRAINER_EMAIL || process.env.DOGDEX_QA_ORGANIZER_EMAIL
  const customerEmail = process.env.DOGDEX_QA_USER_EMAIL
  if (!trainerEmail || !customerEmail) throw new Error('Brakuje adresów kont QA w .env.e2e.local.')
  const { rows: users } = await client.query(
    `select id, lower(email) as email from auth.users where lower(email) = any($1::text[])`,
    [[trainerEmail.toLowerCase(), customerEmail.toLowerCase()]],
  )
  const trainer = users.find(row => row.email === trainerEmail.toLowerCase())
  const customer = users.find(row => row.email === customerEmail.toLowerCase())
  if (!trainer || !customer) throw new Error('Brakuje konta trenera lub klienta QA. Uruchom przygotowanie kont QA.')
  const { rows: dogs } = await client.query(`select id from public.dogs where user_id = $1 order by created_at limit 1`, [customer.id])
  if (!dogs[0]) throw new Error('Klient QA nie ma psa. Uruchom seed treningów dev.')

  await client.query('begin')
  try {
    const marker = `qa-groups-${Date.now()}`
    const { rows: courses } = await client.query(`
      insert into public.training_courses(
        trainer_id, slug, name, description, capacity, price, status,
        cancellation_policy, participant_message
      ) values ($1, $2, 'Kurs QA smoke', 'Transakcyjny test dev', 4, 0, 'published',
        'Rezygnacja testowa', 'Komunikat testowy') returning id
    `, [trainer.id, marker])
    const startsAt = new Date(Date.now() + 7 * 86400000)
    const { rows: sessions } = await client.query(`
      insert into public.training_course_sessions(course_id, starts_at, duration_min)
      values ($1, $2, 60) returning id
    `, [courses[0].id, startsAt])
    const { rows: enrollments } = await client.query(
      `select * from public.create_training_course_enrollment($1, $2, $3, $4)`,
      [courses[0].id, customer.id, dogs[0].id, 'QA smoke'],
    )
    if (enrollments[0]?.status !== 'confirmed' || enrollments[0]?.payment_status !== 'manual') {
      throw new Error(`Nieprawidłowy zapis na darmowy kurs: ${JSON.stringify(enrollments[0])}`)
    }

    const { rows: products } = await client.query(`
      insert into public.training_pass_products(
        trainer_id, name, entries, validity_days, price, cancellation_policy, freeze_policy
      ) values ($1, 'Karnet QA smoke', 3, 90, 0, 'Zwrot testowy', 'Zamrożenie testowe') returning id
    `, [trainer.id])
    const validFrom = new Date().toISOString().slice(0, 10)
    const expiresAt = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
    const { rows: passes } = await client.query(`
      insert into public.training_passes(
        product_id, user_id, dog_id, entries_total, entries_remaining, status,
        payment_status, valid_from, expires_at, policy_accepted_at, policy_snapshot
      ) values ($1, $2, $3, 3, 3, 'active', 'manual', $4, $5, now(), 'QA smoke') returning id
    `, [products[0].id, customer.id, dogs[0].id, validFrom, expiresAt])
    const { rows: consumed } = await client.query(
      `select * from public.consume_training_pass_for_course_session($1, $2, $3, $4)`,
      [passes[0].id, sessions[0].id, enrollments[0].id, trainer.id],
    )
    if (consumed[0]?.entries_remaining !== 2) throw new Error('Zużycie wejścia z karnetu nie zmieniło salda na 2.')
    const { rows: reversed } = await client.query(
      `select public.reverse_training_pass_session_usage($1, $2) as reversed`,
      [sessions[0].id, enrollments[0].id],
    )
    if (!reversed[0]?.reversed) throw new Error('Cofnięcie wejścia z karnetu nie powiodło się.')

    const { rows: requests } = await client.query(`
      insert into public.training_pass_requests(pass_id, user_id, request_type, reason)
      values ($1, $2, 'freeze', 'Kontuzja QA smoke') returning id
    `, [passes[0].id, customer.id])
    const { rows: resolved } = await client.query(
      `select * from public.resolve_training_pass_request($1, $2, true, 'Akceptacja QA')`,
      [requests[0].id, trainer.id],
    )
    const { rows: passState } = await client.query(`select status, entries_remaining from public.training_passes where id = $1`, [passes[0].id])
    if (resolved[0]?.status !== 'approved' || passState[0]?.status !== 'frozen' || passState[0]?.entries_remaining !== 3) {
      throw new Error(`Nieprawidłowy stan po akceptacji wniosku: ${JSON.stringify({ request: resolved[0], pass: passState[0] })}`)
    }
    return { enrollment: 'confirmed', passBalanceAfterReverse: 3, request: 'approved', pass: 'frozen' }
  } finally {
    await client.query('rollback')
  }
}

async function verifyPostgrestShapes() {
  const serviceRoleKey = process.env.DOGDEX_DEV_SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) throw new Error('Brakuje DOGDEX_DEV_SUPABASE_SERVICE_ROLE_KEY do smoke testu PostgREST.')
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const queries = [
    db.from('training_course_enrollments').select(`
      *, dogs(id, name), training_courses(*, training_course_sessions(*)),
      training_course_attendance(*, training_course_sessions!training_course_attendance_session_id_fkey(starts_at)),
      training_commerce_payments(id, status, amount, currency, refunded_amount, receipt_url, completed_at, created_at,
        training_commerce_refunds(id, status, amount, reason, error_message, created_at, updated_at))
    `).limit(1),
    db.from('training_passes').select(`
      *, dogs(id, name), training_pass_products(*),
      training_pass_usages(*, training_bookings(scheduled_at, training_types(name)), training_course_sessions(starts_at, training_courses(name))),
      training_pass_adjustments(*), training_pass_requests(*),
      training_commerce_payments(id, status, amount, currency, refunded_amount, receipt_url, completed_at, created_at,
        training_commerce_refunds(id, status, amount, reason, error_message, created_at, updated_at))
    `).limit(1),
    db.from('training_commerce_payments').select(`
      *, training_commerce_refunds(*),
      training_course_enrollments(dogs(name), training_courses(name)),
      training_passes(dogs(name), training_pass_products(name))
    `).limit(1),
    db.from('training_pass_requests').select(`
      *, training_passes!inner(dogs(name), training_pass_products!inner(name, trainer_id))
    `).limit(1),
  ]
  const results = await Promise.all(queries)
  const errors = results.map(result => result.error?.message).filter(Boolean)
  if (errors.length) throw new Error(`PostgREST nie obsługuje wymaganych relacji: ${errors.join(' | ')}`)
  return { queries: queries.length }
}

try {
  const schema = await verifySchema()
  const smoke = process.argv.includes('--smoke') ? await runTransactionalSmoke() : null
  const postgrest = process.argv.includes('--smoke') ? await verifyPostgrestShapes() : null
  process.stdout.write(`Training groups dev verification: ${JSON.stringify({ schema, smoke, postgrest })}\n`)
} finally {
  await client.end()
}

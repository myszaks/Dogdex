import process from 'node:process'
import { readdirSync } from 'node:fs'
import { Client } from 'pg'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.database.local', quiet: true })

const databaseUrl = process.env.DOGDEX_DEV_DATABASE_URL
if (!databaseUrl) throw new Error('Brakuje DOGDEX_DEV_DATABASE_URL w .env.database.local.')

const expectedVersions = readdirSync('supabase/migrations')
  .map(file => file.match(/^(\d{14})_.*\.sql$/)?.[1])
  .filter(Boolean)
  .sort()

const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })
await client.connect()

async function rows(sql, params = []) {
  return (await client.query(sql, params)).rows
}

try {
  const [database] = await rows(`select current_database() as database, current_user as role, version() as version`)
  const extensions = await rows(`
    select extname, extversion
    from pg_extension
    where extname in ('pg_cron', 'pg_net', 'supabase_vault')
    order by extname
  `)
  const tables = await rows(`
    select expected.name, to_regclass('public.' || expected.name) is not null as present
    from unnest(array[
      'event_waitlist_entries',
      'event_announcements',
      'event_announcement_deliveries',
      'review_reports'
    ]) expected(name)
  `)
  const columns = await rows(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'event_reviews' and column_name in (
          'is_verified', 'moderation_status', 'moderation_reason', 'moderated_at',
          'moderated_by', 'response_text', 'response_at', 'response_by'
        ))
        or
        (table_name = 'training_reviews' and column_name in (
          'is_verified', 'moderation_status', 'moderation_reason', 'moderated_at',
          'moderated_by', 'response_text', 'response_at', 'response_by'
        ))
        or
        (table_name = 'event_announcement_deliveries' and column_name = 'claimed_at')
      )
    order by table_name, column_name
  `)
  const functions = await rows(`
    select routine_name
    from information_schema.routines
    where routine_schema = 'public'
      and routine_name in (
        'invoke_event_registration_notifications',
        'claim_next_event_waitlist_offer',
        'accept_event_waitlist_offer',
        'claim_event_announcement_deliveries',
        'validate_review_report_target'
      )
    order by routine_name
  `)
  const policies = await rows(`
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'event_waitlist_entries', 'event_announcements',
        'event_announcement_deliveries', 'event_reviews',
        'training_reviews', 'review_reports'
      )
    order by tablename, policyname
  `)

  const hasMigrationTable = (await rows(`select to_regclass('supabase_migrations.schema_migrations') is not null as present`))[0].present
  const appliedVersions = hasMigrationTable
    ? (await rows(`select version from supabase_migrations.schema_migrations order by version`)).map(row => String(row.version))
    : []
  const missingRecordedVersions = hasMigrationTable
    ? expectedVersions.filter(version => !appliedVersions.includes(version))
    : null

  const hasCronTable = (await rows(`select to_regclass('cron.job') is not null as present`))[0].present
  const cronJobs = hasCronTable
    ? await rows(`select jobid, jobname, schedule, active from cron.job where jobname like 'event-registration-notifications%'`)
    : []
  const cronRuns = hasCronTable && cronJobs.length > 0
    ? await rows(`
        select status, start_time, end_time, return_message
        from cron.job_run_details
        where jobid = $1
        order by start_time desc
        limit 5
      `, [cronJobs[0].jobid])
    : []

  const hasVaultView = (await rows(`select to_regclass('vault.decrypted_secrets') is not null as present`))[0].present
  const vaultSecrets = hasVaultView
    ? await rows(`
        select
          name,
          nullif(trim(decrypted_secret), '') is not null as configured,
          case when name = 'dogdex_site_url' then decrypted_secret else null end as non_secret_value
        from vault.decrypted_secrets
        where name in ('dogdex_site_url', 'dogdex_cron_secret')
        order by name
      `)
    : []

  const [reviewIntegrity] = await rows(`
    select
      (select count(*)::integer from public.event_reviews) as event_reviews,
      (
        select count(*)::integer
        from public.event_reviews review
        where not exists (
          select 1
          from public.registrations registration
          join public.participants participant on participant.id = registration.participant_id
          where registration.event_id = review.event_id
            and registration.status = 'confirmed'
            and (
              participant.user_id = review.user_id
              or lower(participant.owner_email) = lower(coalesce((
                select auth_user.email
                from auth.users auth_user
                where auth_user.id = review.user_id
              ), ''))
            )
        )
      ) as event_reviews_without_confirmed_user_registration,
      (select count(*)::integer from public.training_reviews) as training_reviews,
      (
        select count(*)::integer
        from public.training_reviews review
        join public.training_bookings booking on booking.id = review.booking_id
        where booking.status <> 'completed'
           or booking.user_id <> review.user_id
      ) as invalid_training_reviews
  `)

  const counts = {}
  for (const table of tables.filter(table => table.present).map(table => table.name)) {
    counts[table] = Number((await rows(`select count(*)::integer as count from public.${table}`))[0].count)
  }

  process.stdout.write(`${JSON.stringify({
    database: { name: database.database, role: database.role, postgres: database.version.split(' ').slice(0, 2).join(' ') },
    extensions,
    tables,
    reviewSafetyColumns: columns,
    functions: functions.map(row => row.routine_name),
    policies,
    migrationHistory: {
      tracked: hasMigrationTable,
      expectedCount: expectedVersions.length,
      latestExpected: expectedVersions.at(-1) ?? null,
      appliedCount: appliedVersions.length,
      latestApplied: appliedVersions.at(-1) ?? null,
      missingRecordedVersions,
    },
    cronJobs,
    cronRuns,
    vaultSecrets,
    reviewIntegrity,
    rowCounts: counts,
  }, null, 2)}\n`)
} finally {
  await client.end()
}

import process from 'node:process'
import crypto from 'node:crypto'
import { Client } from 'pg'
import Stripe from 'stripe'
import nodemailer from 'nodemailer'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.database.local', quiet: true })
dotenv.config({ path: '.env.e2e.local', quiet: true })
dotenv.config({ path: '.env.local', quiet: true })

if (!process.argv.includes('--confirm-dev')) throw new Error('Uruchom przez npm run e2e:event-payments.')
const databaseUrl = process.env.DOGDEX_DEV_DATABASE_URL
const supabaseUrl = process.env.DOGDEX_DEV_SUPABASE_URL
const stripeKey = process.env.STRIPE_SECRET_KEY
if (!databaseUrl || !supabaseUrl || !stripeKey) throw new Error('Brakuje konfiguracji dev DB lub Stripe.')
if (!stripeKey.startsWith('sk_test_')) throw new Error('E2E może działać wyłącznie ze Stripe test mode.')
if (/REPLACE_ME|CHANGE_ME|YOUR_STRIPE/i.test(stripeKey)) throw new Error('STRIPE_SECRET_KEY jest placeholderem. Wpisz prawdziwy klucz sk_test_... do .env.e2e.local.')
const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
if (!projectRef || !databaseUrl.includes(projectRef)) throw new Error('Connection string nie odpowiada dev Supabase.')

const stripe = new Stripe(stripeKey)
const db = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })
let paymentIntentId = null
let stripeAccountId = null
let fullyRefunded = false

async function waitForRefund(refundId) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const refund = await stripe.refunds.retrieve(refundId, { stripeAccount: stripeAccountId })
    if (refund.status === 'succeeded') return refund
    if (refund.status === 'failed' || refund.status === 'canceled') throw new Error(`Stripe refund ${refund.status}`)
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('Stripe refund nie zakończył się w czasie testu.')
}

await db.connect()
await db.query('begin')
try {
  const organizerEmail = process.env.DOGDEX_QA_ORGANIZER_EMAIL ?? ''
  const { rows: accounts } = await db.query(`
    select profile.id, profile.stripe_account_id, auth_user.email
    from public.profiles profile join auth.users auth_user on auth_user.id = profile.id
    where profile.stripe_onboarded = true and profile.stripe_account_id is not null
    order by case when auth_user.email = $1 then 0 else 1 end
    limit 1
  `, [organizerEmail])
  if (!accounts[0]) throw new Error('Brak połączonego testowego konta Stripe w dev DB.')
  const payee = accounts[0]
  stripeAccountId = payee.stripe_account_id
  const previousIntents = await stripe.paymentIntents.list({ limit: 25 }, { stripeAccount: stripeAccountId })
  for (const previous of previousIntents.data.filter(intent => intent.metadata?.test_kind === 'dogdex_event_e2e')) {
    const detailed = await stripe.paymentIntents.retrieve(previous.id, { expand: ['latest_charge'] }, { stripeAccount: stripeAccountId })
    const previousCharge = typeof detailed.latest_charge === 'string' ? null : detailed.latest_charge
    const previousRemaining = previousCharge ? previousCharge.amount - previousCharge.amount_refunded : 0
    if (previousRemaining > 0) {
      await stripe.refunds.create({ payment_intent: previous.id, amount: previousRemaining }, { stripeAccount: stripeAccountId })
    }
  }
  const suffix = crypto.randomUUID().slice(0, 8)
  const dateOne = '2031-08-01'
  const dateTwo = '2031-08-08'

  const intent = await stripe.paymentIntents.create({
    amount: 300,
    currency: 'pln',
    payment_method: 'pm_card_visa',
    confirm: true,
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    metadata: { test_kind: 'dogdex_event_e2e', run_id: suffix },
  }, { stripeAccount: stripeAccountId, idempotencyKey: `dogdex-event-e2e-payment-${suffix}` })
  if (intent.status !== 'succeeded') throw new Error(`Testowa płatność ma status ${intent.status}.`)
  paymentIntentId = intent.id

  const { rows: [event] } = await db.query(`
    insert into public.events (title, slug, status, created_by, auto_confirm, pricing_mode, date_prices, currency, entry_fee, form_fields, start_at)
    values ($1, $2, 'upcoming', $3, true, 'per_date', $4::jsonb, 'PLN', null, $5::jsonb, now() + interval '30 days') returning id
  `, [`E2E płatności ${suffix}`, `e2e-platnosci-${suffix}`, payee.id,
    JSON.stringify({ dates: { [dateOne]: 1, [dateTwo]: 2 } }),
    JSON.stringify([{ id: 'dates', label: 'Terminy', type: 'multidate', required: true, options: [dateOne, dateTwo] }])])
  const payerEmail = process.env.DOGDEX_QA_USER_EMAIL ?? payee.email
  const { rows: [participant] } = await db.query(`insert into public.participants (dog_name, owner_name, owner_email, extra) values ('E2E Pies', 'E2E Klient', $1, '{}'::jsonb) returning id`, [payerEmail])
  const { rows: [registration] } = await db.query(`insert into public.registrations (event_id, participant_id, status, form_data) values ($1, $2, 'pending', $3::jsonb) returning id`, [event.id, participant.id, JSON.stringify({ dates: [dateOne, dateTwo] })])
  const { rows: slots } = await db.query(`
    insert into public.time_slots (event_id, slot_date, slot_time, label)
    values ($1, $2, '09:00', 'E2E termin 1'), ($1, $3, '10:00', 'E2E termin 2')
    returning id, slot_date
  `, [event.id, dateOne, dateTwo])
  for (const slot of slots) {
    await db.query(`
      insert into public.schedule_assignments (registration_id, time_slot_id, item_date)
      values ($1, $2, $3)
    `, [registration.id, slot.id, slot.slot_date])
  }
  const { rows: items } = await db.query(`
    insert into public.event_registration_items (registration_id, item_key, kind, form_field_id, occurrence_date, label, amount, currency, status)
    values ($1, $2, 'date', 'dates', $3, $4, $5, 'PLN', 'pending_payment'), ($1, $6, 'date', 'dates', $7, $8, $9, 'PLN', 'pending_payment') returning id, item_key, amount, occurrence_date
  `, [registration.id, `dates:${dateOne}`, dateOne, `E2E — ${dateOne}`, 1, `dates:${dateTwo}`, dateTwo, `E2E — ${dateTwo}`, 2])
  const { rows: [payment] } = await db.query(`
    insert into public.event_payments (registration_id, payee_user_id, payer_email, amount, currency, stripe_account_id)
    values ($1, $2, $3, 3, 'PLN', $4) returning id
  `, [registration.id, payee.id, payerEmail, stripeAccountId])
  for (const item of items) await db.query(`insert into public.event_payment_items (payment_id, registration_item_id, amount) values ($1, $2, $3)`, [payment.id, item.id, item.amount])
  const fakeSession = `cs_e2e_${suffix}`
  await db.query(`select * from public.complete_event_checkout($1, $2, $3)`, [payment.id, fakeSession, paymentIntentId])

  const firstItem = items.find(item => item.item_key === `dates:${dateOne}`)
  if (!firstItem) throw new Error('Nie znaleziono pierwszej pozycji płatności E2E.')
  const { rows: [refundOne] } = await db.query(`
    insert into public.event_refunds (payment_id, registration_id, requested_by, amount, currency, requested_dates, new_form_data, cancel_registration)
    values ($1, $2, $3, 1, 'PLN', $4::jsonb, $5::jsonb, false) returning id
  `, [payment.id, registration.id, payee.id, JSON.stringify([dateOne]), JSON.stringify({ dates: [dateTwo] })])
  await db.query(`insert into public.event_refund_items (refund_id, payment_item_id, amount) select $1, id, 1 from public.event_payment_items where payment_id = $2 and registration_item_id = $3`, [refundOne.id, payment.id, firstItem.id])
  const stripeRefundOne = await stripe.refunds.create({ payment_intent: paymentIntentId, amount: 100, metadata: { event_refund_id: refundOne.id } }, { stripeAccount: stripeAccountId, idempotencyKey: `dogdex-event-e2e-refund-1-${suffix}` })
  await waitForRefund(stripeRefundOne.id)
  await db.query(`select * from public.complete_event_refund($1, $2)`, [refundOne.id, stripeRefundOne.id])
  const { rows: [partialSchedule] } = await db.query(`
    select count(*)::integer assignment_count, min(slot.slot_date::text) remaining_date
    from public.schedule_assignments assignment
    join public.time_slots slot on slot.id = assignment.time_slot_id
    where assignment.registration_id = $1
  `, [registration.id])
  if (partialSchedule.assignment_count !== 1 || partialSchedule.remaining_date !== dateTwo) {
    throw new Error(`Częściowy zwrot pozostawił nieprawidłowy grafik: ${JSON.stringify(partialSchedule)}`)
  }

  const secondItem = items.find(item => item.item_key === `dates:${dateTwo}`)
  if (!secondItem) throw new Error('Nie znaleziono drugiej pozycji płatności E2E.')
  const { rows: [refundTwo] } = await db.query(`
    insert into public.event_refunds (payment_id, registration_id, requested_by, amount, currency, requested_dates, new_form_data, cancel_registration)
    values ($1, $2, $3, 2, 'PLN', $4::jsonb, $5::jsonb, true) returning id
  `, [payment.id, registration.id, payee.id, JSON.stringify([dateTwo]), JSON.stringify({ dates: [] })])
  await db.query(`insert into public.event_refund_items (refund_id, payment_item_id, amount) select $1, id, 2 from public.event_payment_items where payment_id = $2 and registration_item_id = $3`, [refundTwo.id, payment.id, secondItem.id])
  const stripeRefundTwo = await stripe.refunds.create({ payment_intent: paymentIntentId, amount: 200, metadata: { event_refund_id: refundTwo.id } }, { stripeAccount: stripeAccountId, idempotencyKey: `dogdex-event-e2e-refund-2-${suffix}` })
  await waitForRefund(stripeRefundTwo.id)
  await db.query(`select * from public.complete_event_refund($1, $2)`, [refundTwo.id, stripeRefundTwo.id])
  fullyRefunded = true

  const { rows: [finalSchedule] } = await db.query(`
    select count(*)::integer assignment_count
    from public.schedule_assignments where registration_id = $1
  `, [registration.id])
  if (finalSchedule.assignment_count !== 0) {
    throw new Error(`Pełny zwrot pozostawił wpisy grafiku: ${JSON.stringify(finalSchedule)}`)
  }

  const { rows: [state] } = await db.query(`select payment.status as payment_status, payment.refunded_amount, registration.status as registration_status, registration.form_data from public.event_payments payment join public.registrations registration on registration.id = payment.registration_id where payment.id = $1`, [payment.id])
  if (state.payment_status !== 'refunded' || Number(state.refunded_amount) !== 3 || state.registration_status !== 'cancelled') throw new Error(`Nieprawidłowy stan końcowy: ${JSON.stringify(state)}`)

  if (process.env.SMTP_USER && process.env.SMTP_PASS && payerEmail) {
    const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST ?? 'smtp.gmail.com', port: Number(process.env.SMTP_PORT ?? 587), secure: Number(process.env.SMTP_PORT) === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } })
    await transporter.sendMail({ from: process.env.SMTP_FROM ?? `Dogdex <${process.env.SMTP_USER}>`, to: payerEmail, subject: 'Dogdex E2E — płatność i częściowe zwroty wydarzenia', html: '<p>Test E2E płatności wydarzenia, dwóch częściowych zwrotów i zmian statusów zakończył się poprawnie.</p>' })
  }
  process.stdout.write(`E2E OK: PaymentIntent ${paymentIntentId}, dwa zwroty, grafik wyczyszczony, stan końcowy refunded/cancelled.\n`)
} catch (error) {
  if (paymentIntentId && stripeAccountId && !fullyRefunded) {
    try {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] }, { stripeAccount: stripeAccountId })
      const charge = typeof intent.latest_charge === 'string' ? null : intent.latest_charge
      const remaining = charge ? charge.amount - charge.amount_refunded : 0
      if (remaining > 0) {
        await stripe.refunds.create({ payment_intent: paymentIntentId, amount: remaining }, { stripeAccount: stripeAccountId })
        process.stderr.write(`Awaryjny zwrot ${remaining} jednostek waluty został zlecony.\n`)
      }
    } catch (cleanupError) {
      process.stderr.write(`UWAGA: automatyczny zwrot awaryjny nie powiódł się: ${String(cleanupError)}\n`)
    }
  }
  throw error
} finally {
  await db.query('rollback')
  await db.end()
}

import crypto from 'node:crypto'
import fs from 'node:fs'
import process from 'node:process'
import dotenv from 'dotenv'
import { Client } from 'pg'
import Stripe from 'stripe'

const e2e = dotenv.parse(fs.readFileSync('.env.e2e.local'))
const database = dotenv.parse(fs.readFileSync('.env.database.local'))
const baseUrl = process.env.DOGDEX_AUDIT_BASE_URL ?? 'https://develop.dogdex.pro'
const runId = crypto.randomUUID().slice(0, 8)
const marker = `AUDIT-${runId}`

const required = [
  'DOGDEX_DEV_SUPABASE_URL',
  'DOGDEX_DEV_SUPABASE_SERVICE_ROLE_KEY',
  'DOGDEX_QA_USER_EMAIL',
  'DOGDEX_QA_USER_PASSWORD',
  'DOGDEX_QA_ORGANIZER_EMAIL',
  'DOGDEX_QA_ORGANIZER_PASSWORD',
  'DOGDEX_QA_TRAINER_EMAIL',
  'DOGDEX_QA_TRAINER_PASSWORD',
  'STRIPE_SECRET_KEY',
  'VERCEL_AUTOMATION_BYPASS_SECRET',
]
for (const name of required) {
  if (!e2e[name]) throw new Error(`Brakuje ${name} w .env.e2e.local`)
}
if (!database.DOGDEX_DEV_DATABASE_URL) throw new Error('Brakuje DOGDEX_DEV_DATABASE_URL')
if (!e2e.STRIPE_SECRET_KEY.startsWith('sk_test_')) throw new Error('Audyt działa wyłącznie w Stripe test mode')
if (new URL(baseUrl).hostname !== 'develop.dogdex.pro') throw new Error('Audyt może działać wyłącznie na develop.dogdex.pro')
const projectRef = new URL(e2e.DOGDEX_DEV_SUPABASE_URL).hostname.split('.')[0]
if (!database.DOGDEX_DEV_DATABASE_URL.includes(projectRef)) throw new Error('Dev DB i dev Supabase nie są tym samym projektem')

const stripe = new Stripe(e2e.STRIPE_SECRET_KEY)
const db = new Client({ connectionString: database.DOGDEX_DEV_DATABASE_URL, ssl: { rejectUnauthorized: false } })
const findings = []
const checks = []
const eventIds = []
const trainingTypeIds = []
const availabilityIds = []
const stripeSessions = []
const stripeIntents = []

function check(name, condition, details = null) {
  if (!condition) throw new Error(`${name}${details ? `: ${JSON.stringify(details)}` : ''}`)
  checks.push(name)
}

function finding(code, message, details = null) {
  findings.push({ code, message, details })
}

async function query(text, params = []) {
  return db.query(text, params)
}

async function authenticate(email, password) {
  const response = await fetch(`${e2e.DOGDEX_DEV_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: e2e.DOGDEX_DEV_SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })
  const session = await response.json()
  if (!response.ok) throw new Error(`Logowanie QA nie powiodło się (${response.status})`)
  return `sb-${projectRef}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
}

async function api(cookie, path, { method = 'GET', body, expected } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(cookie ? { cookie } : {}),
      'x-vercel-protection-bypass': e2e.VERCEL_AUTOMATION_BYPASS_SECRET,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (expected !== undefined) {
    const statuses = Array.isArray(expected) ? expected : [expected]
    if (!statuses.includes(response.status)) {
      throw new Error(`${method} ${path}: oczekiwano ${statuses.join('/')}, otrzymano ${response.status}: ${text.slice(0, 300)}`)
    }
  }
  return { status: response.status, data, headers: response.headers }
}

async function account(email) {
  const { rows } = await query(`
    select auth_user.id, auth_user.email, profile.role, profile.stripe_account_id, profile.stripe_onboarded
    from auth.users auth_user
    join public.profiles profile on profile.id = auth_user.id
    where lower(auth_user.email) = lower($1)
  `, [email])
  if (!rows[0]) throw new Error(`Brak konta QA ${email}`)
  return rows[0]
}

async function createEvent(organizerId, {
  label,
  autoConfirm,
  pricingMode = 'free',
  entryFee = null,
  formFields = [],
  datePrices = {},
  startAt = '2031-08-01T08:00:00+02:00',
}) {
  const slug = `audit-${label}-${runId}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  const { rows } = await query(`
    insert into public.events (
      title, slug, status, created_by, auto_confirm, pricing_mode, entry_fee,
      date_prices, currency, form_fields, start_at, has_schedule
    ) values ($1, $2, 'upcoming', $3, $4, $5, $6, $7::jsonb, 'PLN', $8::jsonb, $9, true)
    returning id
  `, [`${marker} ${label}`, slug, organizerId, autoConfirm, pricingMode, entryFee,
    JSON.stringify(datePrices), JSON.stringify(formFields), startAt])
  eventIds.push(rows[0].id)
  return rows[0].id
}

async function register(cookie, eventId, user, dog, extraFields = {}) {
  return api(cookie, '/api/registrations', {
    method: 'POST',
    expected: 201,
    body: {
      eventId,
      ownerName: `${marker} Klient`,
      ownerEmail: user.email,
      dogName: dog.name,
      dogBreed: dog.breed,
      dogId: dog.id,
      extraFields,
    },
  })
}

async function createSchedule(eventId, registrationId, dates) {
  const assignments = []
  for (let index = 0; index < dates.length; index += 1) {
    const { rows: slots } = await query(`
      insert into public.time_slots (event_id, slot_date, slot_time, label, max_participants)
      values ($1, $2, $3, $4, 10) returning id
    `, [eventId, dates[index], `${String(9 + index).padStart(2, '0')}:00`, `${marker} slot`])
    await query(`
      insert into public.schedule_assignments (registration_id, time_slot_id, item_date)
      values ($1, $2, $3)
    `, [registrationId, slots[0].id, dates[index]])
    assignments.push({ slotId: slots[0].id, date: dates[index] })
  }
  return assignments
}

async function registrationState(registrationId) {
  const { rows } = await query(`
    select registration.status, registration.form_data,
      (select count(*)::integer from public.schedule_assignments assignment where assignment.registration_id = registration.id) assignment_count,
      (select count(*)::integer from public.cancellation_requests request where request.registration_id = registration.id and request.status = 'pending') pending_requests
    from public.registrations registration where registration.id = $1
  `, [registrationId])
  return rows[0]
}

async function paymentForRegistration(registrationId) {
  const { rows } = await query(`
    select * from public.event_payments where registration_id = $1 order by created_at desc limit 1
  `, [registrationId])
  return rows[0]
}

async function createPaidIntent(accountId, amountInCents, kind) {
  const intent = await stripe.paymentIntents.create({
    amount: amountInCents,
    currency: 'pln',
    payment_method: 'pm_card_visa',
    confirm: true,
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    metadata: { test_kind: 'dogdex_payment_audit', audit_run: runId, kind },
  }, { stripeAccount: accountId, idempotencyKey: `dogdex-audit-${runId}-${kind}-${crypto.randomUUID()}` })
  check(`${kind}: PaymentIntent succeeded`, intent.status === 'succeeded', { status: intent.status })
  stripeIntents.push({ id: intent.id, accountId })
  return intent.id
}

async function expireSession(sessionId, accountId) {
  const session = await stripe.checkout.sessions.retrieve(sessionId, { stripeAccount: accountId })
  if (session.status === 'open') await stripe.checkout.sessions.expire(sessionId, { stripeAccount: accountId })
}

async function completeEventPayment(registrationId, accountId, kind) {
  const payment = await paymentForRegistration(registrationId)
  check(`${kind}: pending event payment exists`, payment?.status === 'pending' && Boolean(payment.stripe_session_id), payment)
  stripeSessions.push({ id: payment.stripe_session_id, accountId })
  const paymentIntentId = await createPaidIntent(accountId, Math.round(Number(payment.amount) * 100), kind)
  await query('select * from public.complete_event_checkout($1, $2, $3)', [payment.id, payment.stripe_session_id, paymentIntentId])
  await expireSession(payment.stripe_session_id, accountId)
  return { ...payment, stripe_payment_intent_id: paymentIntentId }
}

async function completeTrainingPayment(bookingId, accountId, kind) {
  const { rows } = await query('select * from public.training_payments where booking_id = $1', [bookingId])
  const payment = rows[0]
  check(`${kind}: pending training payment exists`, payment?.status === 'pending' && Boolean(payment.stripe_session_id), payment)
  stripeSessions.push({ id: payment.stripe_session_id, accountId })
  const paymentIntentId = await createPaidIntent(accountId, Math.round(Number(payment.amount) * 100), kind)
  await query('select * from public.complete_training_checkout($1, $2, $3)', [bookingId, payment.stripe_session_id, paymentIntentId])
  await expireSession(payment.stripe_session_id, accountId)
  return paymentIntentId
}

async function auditEvents(ctx) {
  const dateOne = '2031-08-01'
  const dateTwo = '2031-08-08'
  const fields = [{ id: 'dates', label: 'Terminy', type: 'multidate', required: true, options: [dateOne, dateTwo] }]

  const freeAutoId = await createEvent(ctx.organizer.id, {
    label: 'free-auto-multidate', autoConfirm: true, formFields: fields,
  })
  const freeAuto = await register(ctx.userCookie, freeAutoId, ctx.user, ctx.dog, { dates: [dateOne, dateTwo] })
  check('free auto: registration confirmed', freeAuto.data.status === 'confirmed', freeAuto.data)
  await createSchedule(freeAutoId, freeAuto.data.id, [dateOne, dateTwo])
  const partialRequest = await api(ctx.userCookie, `/api/registrations/${freeAuto.data.id}/cancel-request`, {
    method: 'POST', expected: 201, body: { cancelled_dates: [dateOne] },
  })
  await api(ctx.organizerCookie, `/api/cancellation-requests/${partialRequest.data.id}`, {
    method: 'PATCH', expected: 200, body: { action: 'accept' },
  })
  let state = await registrationState(freeAuto.data.id)
  check('free partial cancellation: registration remains active', state.status === 'confirmed')
  check('free partial cancellation: selected date removed', JSON.stringify(state.form_data) === JSON.stringify({ dates: [dateTwo] }), state.form_data)
  check('free partial cancellation: only cancelled schedule assignment removed', state.assignment_count === 1, state)

  const fullRequest = await api(ctx.userCookie, `/api/registrations/${freeAuto.data.id}/cancel-request`, {
    method: 'POST', expected: 201, body: { cancelled_dates: [dateTwo] },
  })
  await api(ctx.organizerCookie, `/api/cancellation-requests/${fullRequest.data.id}`, {
    method: 'PATCH', expected: 200, body: { action: 'accept' },
  })
  state = await registrationState(freeAuto.data.id)
  check('free full cancellation: registration cancelled', state.status === 'cancelled', state)
  check('free full cancellation: no schedule assignments remain', state.assignment_count === 0, state)
  check('free full cancellation: no pending cancellation request', state.pending_requests === 0, state)

  const freeManualId = await createEvent(ctx.organizer.id, {
    label: 'free-manual', autoConfirm: false, formFields: [], startAt: '2031-08-15T08:00:00+02:00',
  })
  const freeManual = await register(ctx.userCookie, freeManualId, ctx.user, ctx.dog)
  check('free manual: registration pending', freeManual.data.status === 'pending')
  const rejectedRequest = await api(ctx.userCookie, `/api/registrations/${freeManual.data.id}/cancel-request`, {
    method: 'POST', expected: 201, body: {},
  })
  await api(ctx.organizerCookie, `/api/cancellation-requests/${rejectedRequest.data.id}`, {
    method: 'PATCH', expected: 200, body: { action: 'reject' },
  })
  state = await registrationState(freeManual.data.id)
  check('free manual rejection: registration unchanged', state.status === 'pending', state)
  check('free manual rejection: request closed', state.pending_requests === 0, state)
  const confirmed = await api(ctx.organizerCookie, `/api/registrations/${freeManual.data.id}`, {
    method: 'PATCH', expected: 200, body: { status: 'confirmed' },
  })
  check('free manual: organizer confirmation works', confirmed.data.status === 'confirmed', confirmed.data)
  await api(ctx.organizerCookie, `/api/registrations/${freeManual.data.id}`, {
    method: 'PATCH', expected: 200, body: { status: 'cancelled' },
  })

  const paidManualId = await createEvent(ctx.organizer.id, {
    label: 'paid-manual-per-date', autoConfirm: false, pricingMode: 'per_date', formFields: fields,
    datePrices: { dates: { [dateOne]: 3, [dateTwo]: 4 } },
  })
  const pendingPaid = await register(ctx.userCookie, paidManualId, ctx.user, ctx.dog, { dates: [dateOne, dateTwo] })
  check('paid manual: registration pending approval', pendingPaid.data.status === 'pending' && !pendingPaid.data.checkoutUrl, pendingPaid.data)
  const { rows: pendingApprovalItems } = await query('select status from public.event_registration_items where registration_id = $1', [pendingPaid.data.id])
  check('paid manual: items await approval', pendingApprovalItems.length === 2 && pendingApprovalItems.every(item => item.status === 'pending_approval'), pendingApprovalItems)
  const paymentLink = await api(ctx.organizerCookie, `/api/registrations/${pendingPaid.data.id}`, {
    method: 'PATCH', expected: 200, body: { status: 'confirmed' },
  })
  check('paid manual: confirmation sends payment link without confirming registration', paymentLink.data.payment_link_sent === true && paymentLink.data.payment_status === 'pending', paymentLink.data)
  let pendingPayment = await paymentForRegistration(pendingPaid.data.id)
  stripeSessions.push({ id: pendingPayment.stripe_session_id, accountId: ctx.organizer.stripe_account_id })

  const impossiblePartial = await api(ctx.userCookie, `/api/registrations/${pendingPaid.data.id}/cancel-request`, {
    method: 'POST', expected: 201, body: { cancelled_dates: [dateOne] },
  })
  await api(ctx.organizerCookie, `/api/cancellation-requests/${impossiblePartial.data.id}`, {
    method: 'PATCH', expected: 409, body: { action: 'accept' },
  })
  await api(ctx.organizerCookie, `/api/cancellation-requests/${impossiblePartial.data.id}`, {
    method: 'PATCH', expected: 200, body: { action: 'reject' },
  })
  const cancelPending = await api(ctx.userCookie, `/api/registrations/${pendingPaid.data.id}/cancel-request`, {
    method: 'POST', expected: 201, body: {},
  })
  await api(ctx.organizerCookie, `/api/cancellation-requests/${cancelPending.data.id}`, {
    method: 'PATCH', expected: 200, body: { action: 'accept' },
  })
  state = await registrationState(pendingPaid.data.id)
  pendingPayment = await paymentForRegistration(pendingPaid.data.id)
  const expiredPendingSession = await stripe.checkout.sessions.retrieve(pendingPayment.stripe_session_id, { stripeAccount: ctx.organizer.stripe_account_id })
  check('paid pending cancellation: registration cancelled', state.status === 'cancelled', state)
  check('paid pending cancellation: payment failed', pendingPayment.status === 'failed', pendingPayment)
  check('paid pending cancellation: Checkout expired', expiredPendingSession.status === 'expired', { status: expiredPendingSession.status })

  const paidRegistration = await register(ctx.userCookie, paidManualId, ctx.user, ctx.dog, { dates: [dateOne, dateTwo] })
  await api(ctx.organizerCookie, `/api/registrations/${paidRegistration.data.id}`, {
    method: 'PATCH', expected: 200, body: { status: 'confirmed' },
  })
  await completeEventPayment(paidRegistration.data.id, ctx.organizer.stripe_account_id, 'event-manual-per-date')
  state = await registrationState(paidRegistration.data.id)
  check('paid event completion: registration confirmed', state.status === 'confirmed', state)
  await createSchedule(paidManualId, paidRegistration.data.id, [dateOne, dateTwo])

  const paidPartialRequest = await api(ctx.userCookie, `/api/registrations/${paidRegistration.data.id}/cancel-request`, {
    method: 'POST', expected: 201, body: { cancelled_dates: [dateOne] },
  })
  await api(ctx.organizerCookie, `/api/cancellation-requests/${paidPartialRequest.data.id}`, {
    method: 'PATCH', expected: [200, 202], body: { action: 'accept' },
  })
  state = await registrationState(paidRegistration.data.id)
  let settledPayment = await paymentForRegistration(paidRegistration.data.id)
  check('paid partial refund: payment partially refunded', settledPayment.status === 'partially_refunded' && Number(settledPayment.refunded_amount) === 3, settledPayment)
  check('paid partial refund: date removed from registration', JSON.stringify(state.form_data) === JSON.stringify({ dates: [dateTwo] }), state.form_data)
  if (state.assignment_count !== 1) {
    finding('EVENT_PAID_PARTIAL_SCHEDULE_ARTIFACT', 'Po częściowym zwrocie pozostało przypisanie grafiku dla anulowanej daty.', state)
  }

  const paidFullRequest = await api(ctx.userCookie, `/api/registrations/${paidRegistration.data.id}/cancel-request`, {
    method: 'POST', expected: 201, body: { cancelled_dates: [dateTwo] },
  })
  await api(ctx.organizerCookie, `/api/cancellation-requests/${paidFullRequest.data.id}`, {
    method: 'PATCH', expected: [200, 202], body: { action: 'accept' },
  })
  state = await registrationState(paidRegistration.data.id)
  settledPayment = await paymentForRegistration(paidRegistration.data.id)
  check('paid full refund: registration cancelled', state.status === 'cancelled', state)
  check('paid full refund: payment fully refunded', settledPayment.status === 'refunded' && Number(settledPayment.refunded_amount) === 7, settledPayment)
  check('paid full refund: no pending requests', state.pending_requests === 0, state)
  if (state.assignment_count !== 0) {
    finding('EVENT_PAID_FULL_SCHEDULE_ARTIFACT', 'Po pełnym zwrocie i anulowaniu zapisu pozostały przypisania grafiku.', state)
  }
  const replay = await api(ctx.organizerCookie, `/api/cancellation-requests/${paidFullRequest.data.id}`, {
    method: 'PATCH', expected: 409, body: { action: 'accept' },
  })
  check('paid refund replay: duplicate action rejected', replay.status === 409)
  const { rows: refundRows } = await query('select status from public.event_refunds where registration_id = $1', [paidRegistration.data.id])
  check('paid refunds: exactly two succeeded refunds', refundRows.length === 2 && refundRows.every(refund => refund.status === 'succeeded'), refundRows)

  const paidAutoId = await createEvent(ctx.organizer.id, {
    label: 'paid-auto-flat', autoConfirm: true, pricingMode: 'flat', entryFee: 5,
    startAt: '2031-08-20T08:00:00+02:00',
  })
  const paidAuto = await register(ctx.userCookie, paidAutoId, ctx.user, ctx.dog)
  check('paid auto flat: checkout starts immediately', paidAuto.data.status === 'pending' && Boolean(paidAuto.data.checkoutUrl), paidAuto.data)
  await completeEventPayment(paidAuto.data.id, ctx.organizer.stripe_account_id, 'event-auto-flat')
  await api(ctx.organizerCookie, `/api/registrations/${paidAuto.data.id}`, {
    method: 'PATCH', expected: [200, 202], body: { status: 'cancelled' },
  })
  const paidAutoPayment = await paymentForRegistration(paidAuto.data.id)
  state = await registrationState(paidAuto.data.id)
  check('paid auto flat: full organizer refund', state.status === 'cancelled' && paidAutoPayment.status === 'refunded' && Number(paidAutoPayment.refunded_amount) === 5, { state, payment: paidAutoPayment })

  const reconciliation = await api(ctx.organizerCookie, '/api/event-payments/reconcile', {
    method: 'POST', expected: 200,
  })
  check('event reconciliation endpoint works', typeof reconciliation.data?.checked === 'number', reconciliation.data)
}

async function createTrainingFixtures(ctx) {
  const date = '2031-09-10'
  const { rows: availability } = await query(`
    insert into public.trainer_date_availability (trainer_id, available_date, start_time, end_time, is_active)
    values ($1, $2, '08:00', '20:00', true) returning id
  `, [ctx.trainer.id, date])
  availabilityIds.push(availability[0].id)
  const { rows: types } = await query(`
    insert into public.training_types (trainer_id, slug, name, description, price_per_hour, duration_min, is_active)
    values
      ($1, $2, $3, $4, 0, 60, true),
      ($1, $5, $6, $7, 3, 60, true)
    returning id, price_per_hour
  `, [ctx.trainer.id, `audit-free-${runId}`, `${marker} darmowy`, marker,
    `audit-paid-${runId}`, `${marker} płatny`, marker])
  trainingTypeIds.push(...types.map(type => type.id))
  return {
    date,
    freeTypeId: types.find(type => Number(type.price_per_hour) === 0).id,
    paidTypeId: types.find(type => Number(type.price_per_hour) === 3).id,
  }
}

async function bookTraining(ctx, typeId, iso, label) {
  return api(ctx.userCookie, '/api/training-bookings', {
    method: 'POST', expected: 201,
    body: {
      training_type_id: typeId,
      dog_id: ctx.dog.id,
      scheduled_at: iso,
      duration_min: 60,
      notes_user: `${marker} ${label}`,
    },
  })
}

async function trainingState(bookingId) {
  const { rows } = await query(`
    select booking.status booking_status, booking.expires_at, booking.cancellation_requested_by,
      payment.status payment_status, payment.stripe_session_id, payment.stripe_payment_intent_id
    from public.training_bookings booking
    left join public.training_payments payment on payment.booking_id = booking.id
    where booking.id = $1
  `, [bookingId])
  return rows[0]
}

async function auditTrainings(ctx) {
  const fixtures = await createTrainingFixtures(ctx)
  const freeIso = `${fixtures.date}T09:00:00+02:00`
  const freeBooking = await bookTraining(ctx, fixtures.freeTypeId, freeIso, 'free-owner-cancel')
  check('free training: immediately confirmed', freeBooking.data.status === 'confirmed' && freeBooking.data.payment === null, freeBooking.data)
  await api(ctx.userCookie, `/api/training-bookings/${freeBooking.data.id}`, {
    method: 'PATCH', expected: 200, body: { status: 'cancelled', cancellation_reason: marker },
  })
  let state = await trainingState(freeBooking.data.id)
  check('free training owner cancellation: clean state', state.booking_status === 'cancelled' && state.payment_status === null && state.cancellation_requested_by === 'user', state)

  const freeReuse = await bookTraining(ctx, fixtures.freeTypeId, freeIso, 'free-trainer-cancel')
  check('free training: cancelled slot reusable', freeReuse.status === 201)
  await api(ctx.trainerCookie, `/api/training-bookings/${freeReuse.data.id}`, {
    method: 'PATCH', expected: 200, body: { status: 'cancelled', cancellation_reason: marker },
  })
  state = await trainingState(freeReuse.data.id)
  check('free training trainer cancellation: actor recorded', state.booking_status === 'cancelled' && state.cancellation_requested_by === 'trainer', state)

  const pendingIso = `${fixtures.date}T11:00:00+02:00`
  const pending = await bookTraining(ctx, fixtures.paidTypeId, pendingIso, 'paid-pending-cancel')
  check('paid training: pending checkout created', pending.data.status === 'pending' && Boolean(pending.data.checkoutUrl), pending.data)
  state = await trainingState(pending.data.id)
  stripeSessions.push({ id: state.stripe_session_id, accountId: ctx.trainer.stripe_account_id })
  await api(ctx.userCookie, `/api/training-bookings/${pending.data.id}`, {
    method: 'PATCH', expected: 200, body: { status: 'cancelled', cancellation_reason: marker },
  })
  state = await trainingState(pending.data.id)
  const pendingSession = await stripe.checkout.sessions.retrieve(state.stripe_session_id, { stripeAccount: ctx.trainer.stripe_account_id })
  check('paid pending training cancellation: booking/payment closed', state.booking_status === 'cancelled' && state.payment_status === 'failed', state)
  check('paid pending training cancellation: Checkout expired', pendingSession.status === 'expired', { status: pendingSession.status })

  const paidOwner = await bookTraining(ctx, fixtures.paidTypeId, pendingIso, 'paid-owner-refund')
  check('paid training: cancelled slot reusable', paidOwner.status === 201)
  await completeTrainingPayment(paidOwner.data.id, ctx.trainer.stripe_account_id, 'training-owner-refund')
  await api(ctx.userCookie, `/api/training-bookings/${paidOwner.data.id}`, {
    method: 'PATCH', expected: 200, body: { status: 'cancelled', cancellation_reason: marker },
  })
  state = await trainingState(paidOwner.data.id)
  check('paid training owner cancellation: refunded', state.booking_status === 'cancelled' && state.payment_status === 'refunded', state)

  const trainerIso = `${fixtures.date}T13:00:00+02:00`
  const paidTrainer = await bookTraining(ctx, fixtures.paidTypeId, trainerIso, 'paid-trainer-refund')
  await completeTrainingPayment(paidTrainer.data.id, ctx.trainer.stripe_account_id, 'training-trainer-refund')
  await api(ctx.trainerCookie, `/api/training-bookings/${paidTrainer.data.id}`, {
    method: 'PATCH', expected: 200, body: { status: 'cancelled', cancellation_reason: marker },
  })
  state = await trainingState(paidTrainer.data.id)
  check('paid training trainer cancellation: refunded', state.booking_status === 'cancelled' && state.payment_status === 'refunded' && state.cancellation_requested_by === 'trainer', state)

  const expiredIso = `${fixtures.date}T15:00:00+02:00`
  const expired = await bookTraining(ctx, fixtures.paidTypeId, expiredIso, 'paid-expired')
  state = await trainingState(expired.data.id)
  stripeSessions.push({ id: state.stripe_session_id, accountId: ctx.trainer.stripe_account_id })
  // In production Stripe expires Checkout after 30 minutes, while Dogdex keeps
  // a five-minute grace period. Simulate both clocks instead of aging only DB.
  await expireSession(state.stripe_session_id, ctx.trainer.stripe_account_id)
  await query("update public.training_bookings set expires_at = now() - interval '1 minute' where id = $1", [expired.data.id])
  await query('select public.reconcile_training_booking_states()')
  state = await trainingState(expired.data.id)
  check('expired training hold: local booking/payment released', state.booking_status === 'cancelled' && state.payment_status === 'failed', state)
  const expiredSession = await stripe.checkout.sessions.retrieve(state.stripe_session_id, { stripeAccount: ctx.trainer.stripe_account_id })
  check('expired training hold: Stripe Checkout already expired', expiredSession.status === 'expired', { status: expiredSession.status })

  const unauthorized = await api(null, '/api/training-bookings', {
    method: 'POST', expected: 401,
    body: { training_type_id: fixtures.freeTypeId, scheduled_at: freeIso },
  })
  check('training authorization: anonymous booking rejected', unauthorized.status === 401)
  const foreignOrganizer = await api(ctx.userCookie, `/api/registrations?eventId=${eventIds[0]}`, {
    expected: 403,
  })
  check('event authorization: user cannot list organizer registrations', foreignOrganizer.status === 403)
}

async function cleanup() {
  for (const session of stripeSessions) {
    try { await expireSession(session.id, session.accountId) } catch { /* already complete/expired or removed */ }
  }
  for (const intent of stripeIntents) {
    try {
      const detailed = await stripe.paymentIntents.retrieve(intent.id, { expand: ['latest_charge'] }, { stripeAccount: intent.accountId })
      const charge = typeof detailed.latest_charge === 'string' ? null : detailed.latest_charge
      const remaining = charge ? charge.amount - charge.amount_refunded : 0
      if (remaining > 0) await stripe.refunds.create({ payment_intent: intent.id, amount: remaining }, { stripeAccount: intent.accountId })
    } catch { /* report through state checks; cleanup remains best effort */ }
  }
  if (eventIds.length) {
    // Several historical payment FKs intentionally have no ON DELETE CASCADE.
    // Remove only dependencies belonging to this audit before deleting events.
    const { rows: registrations } = await query(
      'select id from public.registrations where event_id = any($1::uuid[])',
      [eventIds],
    )
    const registrationIds = registrations.map(registration => registration.id)
    if (registrationIds.length) {
      await query('delete from public.event_refunds where registration_id = any($1::uuid[])', [registrationIds])
      await query(`
        delete from public.event_payment_items payment_item
        using public.event_payments payment
        where payment_item.payment_id = payment.id
          and payment.registration_id = any($1::uuid[])
      `, [registrationIds])
      await query('delete from public.event_payments where registration_id = any($1::uuid[])', [registrationIds])
      await query('delete from public.event_registration_items where registration_id = any($1::uuid[])', [registrationIds])
    }
    await query('delete from public.events where id = any($1::uuid[])', [eventIds])
  }
  await query('delete from public.participants where owner_name = $1', [`${marker} Klient`])
  await query('delete from public.training_bookings where notes_user like $1', [`${marker}%`])
  if (trainingTypeIds.length) await query('delete from public.training_types where id = any($1::uuid[])', [trainingTypeIds])
  if (availabilityIds.length) await query('delete from public.trainer_date_availability where id = any($1::uuid[])', [availabilityIds])
  const { rows } = await query(`
    select
      (select count(*)::integer from public.events where title like $1) events,
      (select count(*)::integer from public.participants where owner_name = $2) participants,
      (select count(*)::integer from public.training_bookings where notes_user like $1) bookings,
      (select count(*)::integer from public.training_types where description = $3) training_types
  `, [`${marker}%`, `${marker} Klient`, marker])
  check('cleanup: no audit rows remain in dev DB', Object.values(rows[0]).every(value => value === 0), rows[0])
}

await db.connect()
let auditError = null
try {
  const [userCookie, organizerCookie, trainerCookie] = await Promise.all([
    authenticate(e2e.DOGDEX_QA_USER_EMAIL, e2e.DOGDEX_QA_USER_PASSWORD),
    authenticate(e2e.DOGDEX_QA_ORGANIZER_EMAIL, e2e.DOGDEX_QA_ORGANIZER_PASSWORD),
    authenticate(e2e.DOGDEX_QA_TRAINER_EMAIL, e2e.DOGDEX_QA_TRAINER_PASSWORD),
  ])
  // pg Client executes one query at a time; keep account lookups sequential.
  const user = await account(e2e.DOGDEX_QA_USER_EMAIL)
  const organizer = await account(e2e.DOGDEX_QA_ORGANIZER_EMAIL)
  const trainer = await account(e2e.DOGDEX_QA_TRAINER_EMAIL)
  check('QA roles: organizer can manage events', ['organizer', 'organizer_trainer', 'admin'].includes(organizer.role), organizer.role)
  check('QA roles: trainer can manage trainings', ['trainer', 'organizer_trainer', 'admin'].includes(trainer.role), trainer.role)
  check('QA Stripe: organizer connected', organizer.stripe_onboarded && Boolean(organizer.stripe_account_id))
  check('QA Stripe: trainer connected', trainer.stripe_onboarded && Boolean(trainer.stripe_account_id))
  const { rows: dogs } = await query('select id, name, breed from public.dogs where user_id = $1 order by created_at limit 1', [user.id])
  check('QA user: dog profile exists', Boolean(dogs[0]))
  const ctx = { user, organizer, trainer, dog: dogs[0], userCookie, organizerCookie, trainerCookie }
  await auditEvents(ctx)
  await auditTrainings(ctx)
} catch (error) {
  auditError = error
} finally {
  try { await cleanup() } catch (cleanupError) {
    if (!auditError) auditError = cleanupError
    else findings.push({ code: 'CLEANUP_FAILED', message: String(cleanupError) })
  }
  await db.end()
}

const result = {
  runId,
  checksPassed: checks.length,
  findings,
  fatalError: auditError instanceof Error ? auditError.message : auditError ? String(auditError) : null,
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
if (auditError || findings.length) process.exitCode = 2

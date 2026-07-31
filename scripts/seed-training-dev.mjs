import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.e2e.local', quiet: true })

const supabaseUrl = process.env.DOGDEX_DEV_SUPABASE_URL
const serviceRoleKey = process.env.DOGDEX_DEV_SUPABASE_SERVICE_ROLE_KEY
const dedicatedTrainerEmail = process.env.DOGDEX_QA_TRAINER_EMAIL
const trainerEmail = dedicatedTrainerEmail || process.env.DOGDEX_QA_ORGANIZER_EMAIL
const customerEmail = process.env.DOGDEX_QA_USER_EMAIL
const configuredStripeAccountId = process.env.DOGDEX_QA_STRIPE_ACCOUNT_ID

if (!supabaseUrl || !serviceRoleKey || !trainerEmail || !customerEmail) {
  throw new Error(
    'Brakuje DOGDEX_DEV_SUPABASE_URL, DOGDEX_DEV_SUPABASE_SERVICE_ROLE_KEY albo adresów kont QA.'
  )
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function findUserByEmail(email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw error
    const user = data.users.find(candidate => candidate.email?.toLowerCase() === email.toLowerCase())
    if (user) return user
    if (data.users.length < 100) break
  }
  throw new Error(`Nie znaleziono konta QA: ${email}`)
}

function dateKeyInWarsaw(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

async function upsertDog(userId) {
  const { data: existing, error: lookupError } = await supabase
    .from('dogs')
    .select('id')
    .eq('user_id', userId)
    .eq('slug', 'qa-luna')
    .maybeSingle()
  if (lookupError) throw lookupError

  const payload = {
    user_id: userId,
    slug: 'qa-luna',
    name: 'Luna QA',
    breed: 'Border Collie',
    agility_level: 'beginner',
  }
  const query = existing
    ? supabase.from('dogs').update(payload).eq('id', existing.id).select('id').single()
    : supabase.from('dogs').insert(payload).select('id').single()
  const { data, error } = await query
  if (error) throw error
  return data.id
}

const [trainer, customer] = await Promise.all([
  findUserByEmail(trainerEmail),
  findUserByEmail(customerEmail),
])

const { data: currentTrainerProfile, error: currentTrainerProfileError } = await supabase
  .from('profiles')
  .select('stripe_account_id, stripe_onboarded')
  .eq('id', trainer.id)
  .maybeSingle()
if (currentTrainerProfileError) throw currentTrainerProfileError
const stripeAccountId = configuredStripeAccountId
  || (currentTrainerProfile?.stripe_onboarded ? currentTrainerProfile.stripe_account_id : null)
const usesDedicatedTrainer = Boolean(
  dedicatedTrainerEmail
  && trainerEmail.toLowerCase() === dedicatedTrainerEmail.toLowerCase()
)
const trainerSlug = usesDedicatedTrainer ? 'trener-stripe-qa' : 'trener-qa'
const trainerName = usesDedicatedTrainer ? 'Trener Stripe QA' : 'Trener QA'

const { error: trainerRoleError } = await supabase
  .from('profiles')
  .update({
    role: usesDedicatedTrainer ? 'trainer' : 'organizer_trainer',
    ...(stripeAccountId
      ? { stripe_account_id: stripeAccountId, stripe_onboarded: true }
      : {}),
  })
  .eq('id', trainer.id)
if (trainerRoleError) throw trainerRoleError

const { error: trainerProfileError } = await supabase
  .from('trainer_profiles')
  .upsert({
    trainer_id: trainer.id,
    slug: trainerSlug,
    is_active: true,
    full_name: trainerName,
    bio: 'Profil testowy treningów indywidualnych.',
    location_city: 'Warszawa',
    location_details: 'Lokalizacja testowa',
    cancellation_buffer_hours: 24,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'trainer_id' })
if (trainerProfileError) throw trainerProfileError

const offers = [
  {
    trainer_id: trainer.id,
    slug: 'konsultacja-qa',
    name: 'Konsultacja QA',
    description: 'Darmowa oferta testowa.',
    price_per_hour: 0,
    duration_min: 60,
    is_active: true,
  },
]

if (stripeAccountId) {
  offers.push({
    trainer_id: trainer.id,
    slug: 'trening-platny-qa',
    name: 'Trening płatny QA',
    description: 'Płatna oferta testowa Stripe.',
    price_per_hour: 120,
    duration_min: 60,
    is_active: true,
  })
}

const { error: offersError } = await supabase
  .from('training_types')
  .upsert(offers, { onConflict: 'trainer_id,slug' })
if (offersError) throw offersError

const availability = []
for (let offset = 1; offset <= 7; offset += 1) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + offset)
  const availableDate = dateKeyInWarsaw(date)
  availability.push(
    {
      trainer_id: trainer.id,
      available_date: availableDate,
      start_time: '09:00',
      end_time: '12:00',
      is_active: true,
    },
    {
      trainer_id: trainer.id,
      available_date: availableDate,
      start_time: '14:00',
      end_time: '18:00',
      is_active: true,
    }
  )
}

const { error: availabilityError } = await supabase
  .from('trainer_date_availability')
  .upsert(availability, {
    onConflict: 'trainer_id,available_date,start_time,end_time',
  })
if (availabilityError) throw availabilityError

const dogId = await upsertDog(customer.id)

const { data: freeOffer, error: freeOfferError } = await supabase
  .from('training_types')
  .select('id')
  .eq('trainer_id', trainer.id)
  .eq('slug', 'konsultacja-qa')
  .single()
if (freeOfferError) throw freeOfferError

const { data: existingCompleted, error: completedLookupError } = await supabase
  .from('training_bookings')
  .select('id')
  .eq('user_id', customer.id)
  .eq('training_type_id', freeOffer.id)
  .eq('notes_user', 'QA P1 completed booking')
  .maybeSingle()
if (completedLookupError) throw completedLookupError

let completedBookingId = existingCompleted?.id
if (!completedBookingId) {
  const completedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
  const { data: completedBooking, error: completedBookingError } = await supabase
    .from('training_bookings')
    .insert({
      training_type_id: freeOffer.id,
      user_id: customer.id,
      dog_id: dogId,
      scheduled_at: completedAt.toISOString(),
      duration_min: 60,
      status: 'completed',
      confirmed_at: completedAt.toISOString(),
      completed_at: new Date(completedAt.getTime() + 60 * 60 * 1000).toISOString(),
      notes_user: 'QA P1 completed booking',
    })
    .select('id')
    .single()
  if (completedBookingError) throw completedBookingError
  completedBookingId = completedBooking.id
}

const { data: customerProfile } = await supabase
  .from('profiles')
  .select('full_name')
  .eq('id', customer.id)
  .maybeSingle()
const { error: reviewError } = await supabase
  .from('training_reviews')
  .upsert({
    booking_id: completedBookingId,
    trainer_id: trainer.id,
    user_id: customer.id,
    author_name: customerProfile?.full_name || 'Klient QA',
    rating: 5,
    comment: 'Bardzo dobry trening testowy QA.',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'booking_id' })
if (reviewError) throw reviewError

process.stdout.write(
  `Seed treningów gotowy: trener=${trainer.id}, klient=${customer.id}, ` +
  `oferty=${offers.length}, przedziały=${availability.length}, opinie=1.\n`
)

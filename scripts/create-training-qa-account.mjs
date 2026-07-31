import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.e2e.local', quiet: true })

const supabaseUrl = process.env.DOGDEX_DEV_SUPABASE_URL
const serviceRoleKey = process.env.DOGDEX_DEV_SUPABASE_SERVICE_ROLE_KEY
const trainerEmail = process.env.DOGDEX_QA_TRAINER_EMAIL
const trainerPassword = process.env.DOGDEX_QA_TRAINER_PASSWORD

if (!supabaseUrl || !serviceRoleKey || !trainerEmail || !trainerPassword) {
  throw new Error(
    'Brakuje DOGDEX_DEV_SUPABASE_URL, DOGDEX_DEV_SUPABASE_SERVICE_ROLE_KEY, ' +
    'DOGDEX_QA_TRAINER_EMAIL lub DOGDEX_QA_TRAINER_PASSWORD.'
  )
}
if (trainerPassword.length < 8) {
  throw new Error('Hasło trenera QA musi mieć co najmniej 8 znaków.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function findUserByEmail(email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw error
    const user = data.users.find(candidate => candidate.email?.toLowerCase() === email.toLowerCase())
    if (user) return user
    if (data.users.length < 100) break
  }
  return null
}

let user = await findUserByEmail(trainerEmail)
const created = !user
if (!user) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: trainerEmail,
    password: trainerPassword,
    email_confirm: true,
    user_metadata: { full_name: 'Trener Stripe QA' },
  })
  if (error) throw error
  user = data.user
} else {
  const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
    password: trainerPassword,
    email_confirm: true,
    user_metadata: {
      ...user.user_metadata,
      full_name: user.user_metadata?.full_name || 'Trener Stripe QA',
    },
  })
  if (error) throw error
  user = data.user
}

if (!user) throw new Error('Supabase nie zwrócił utworzonego użytkownika.')

const { error: profileError } = await supabase
  .from('profiles')
  .upsert({
    id: user.id,
    role: 'trainer',
    full_name: 'Trener Stripe QA',
  }, { onConflict: 'id' })
if (profileError) throw profileError

const { error: trainerProfileError } = await supabase
  .from('trainer_profiles')
  .upsert({
    trainer_id: user.id,
    slug: 'trener-stripe-qa',
    is_active: true,
    full_name: 'Trener Stripe QA',
    bio: 'Dedykowany profil QA do testów Stripe Connect.',
    location_city: 'Warszawa',
    location_details: 'Lokalizacja testowa',
    price_per_hour: 120,
    cancellation_buffer_hours: 24,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'trainer_id' })
if (trainerProfileError) throw trainerProfileError

const loginClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const { data: loginData, error: loginError } = await loginClient.auth.signInWithPassword({
  email: trainerEmail,
  password: trainerPassword,
})
if (loginError || loginData.user?.id !== user.id) {
  throw loginError || new Error('Logowanie testowe zwróciło inne konto użytkownika.')
}
await loginClient.auth.signOut()

process.stdout.write(
  `Konto trenera Stripe QA gotowe: user_id=${user.id}, created=${created}, ` +
  'email_confirmed=true, role=trainer, login_verified=true.\n'
)

export interface DogEvent {
  id: string
  slug: string
  title: string
  description: string | null
  start_at: string | null
  end_at: string | null
  registration_opens_at: string | null
  registration_deadline: string | null
  location: string | null
  status: string
  created_at: string
  created_by: string | null
  metadata: Record<string, unknown>
  image_url: string | null
  gallery_images: string[]
  lat: number | null
  lng: number | null
  event_type_id: string | null
  form_fields: FormField[]
  has_results: boolean
  results_public: boolean
  has_schedule: boolean
  auto_confirm: boolean
  max_participants: number | null
  entry_fee: number | null
  organizer_name: string | null
  grouping_field: string | null
  last_significant_change: string | null
  changed_fields: string[]
  current_start_index: number
  track_distance_m: number | null
  live_phase: string | null
  form_template_id: string | null
}

export interface Participant {
  id: string
  user_id?: string | null
  dog_id?: string | null
  dog_name: string | null
  dog_breed: string | null
  owner_name: string | null
  owner_email: string | null
  extra: Record<string, unknown>
}

export interface Registration {
  id: string
  event_id: string
  participant_id: string
  status: string
  created_at: string
  form_data: Record<string, unknown>
  order_index: number | null
  time_slot_id: string | null
  schedule_sent_at: string | null
  checked_in: boolean
  checked_in_at: string | null
  /** Tracks sent reminders. For regular events: ISO timestamp string. For multidate: Record<YYYY-MM-DD, true>. */
  reminder_sent_at: string | Record<string, boolean> | null
  participants?: Participant
  events?: DogEvent
}

export interface TimeSlot {
  id: string
  event_id: string
  slot_date: string
  slot_time: string
  label: string | null
  max_participants: number | null
  created_at: string
}

export interface Heat {
  id: string
  event_id: string
  name: string | null
  start_time: string | null
  order_index: number
}

export interface Result {
  id: string
  heat_id: string | null
  event_id: string | null
  participant_id: string
  time_ms: number | null
  rank: number | null
  notes: string | null
  // Speedway-specific
  run1_ms: number | null
  run2_ms: number | null
  run1_status: 'DNS' | 'DNF' | null
  run2_status: 'DNS' | 'DNF' | null
  best_ms: number | null
  speed_kmh: number | null
  size_class: string | null
  class_rank: number | null
  created_at: string
  participants?: Participant
}

export interface FormField {
  id: string
  label: string
  type: 'text' | 'number' | 'email' | 'select' | 'multiselect' | 'multidate' | 'textarea' | 'checkbox'
  required: boolean
  options?: string[]
  placeholder?: string
  description?: string
}

export interface FormTemplate {
  id: string
  name: string
  event_type_id: string | null
  created_by: string
  fields: FormField[]
  created_at: string
  updated_at: string
}

export interface CancellationRequest {
  id: string
  registration_id: string
  event_id: string
  cancelled_dates: string[] | null
  status: 'pending' | 'accepted' | 'rejected'
  requested_by: string | null
  processed_at: string | null
  processed_by: string | null
  created_at: string
}

export type AgilityLevel = 'none' | 'beginner' | 'intermediate' | 'advanced' | 'competition'
export type DogGender = 'male' | 'female'

export interface Dog {
  id: string
  user_id: string
  slug: string
  name: string
  breed: string | null
  gender: DogGender | null
  pedigree_or_chip: string | null
  coat_color: string | null
  weight_kg: number | null
  height_cm: number | null
  agility_level: AgilityLevel | null
  photo_url: string | null
  rabies_vaccine_expiry: string | null
  created_at: string
  updated_at: string
}

// ============================================================
// Treningi indywidualne (Individual Trainings)
// ============================================================

export interface TrainerProfile {
  id: string
  slug: string
  trainer_id: string
  is_active: boolean
  full_name: string
  bio: string | null
  profile_image_url: string | null
  location_city: string | null
  location_details: string | null
  price_per_hour: number | null
  created_at: string
  updated_at: string
}

export interface TrainingType {
  id: string
  slug: string
  trainer_id: string
  name: string
  description: string | null
  price_per_hour: number | null
  duration_min: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface TrainingAvailability {
  id: string
  training_type_id: string
  day_of_week: number  // 0 = Sunday, 6 = Saturday (ISO 8601)
  start_time: string   // "10:00"
  end_time: string     // "18:00"
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface TrainingBooking {
  id: string
  training_type_id: string
  user_id: string
  dog_id: string | null
  scheduled_at: string
  duration_min: number
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  cancellation_reason: string | null
  cancellation_requested_by: 'user' | 'trainer' | null
  cancellation_approved_at: string | null
  notes_user: string | null
  notes_trainer: string | null
  created_at: string
  updated_at: string
  training_types?: TrainingType
  training_payments?: TrainingPayment[]
  dogs?: { id: string; name: string }
}

export interface TrainingPayment {
  id: string
  booking_id: string
  amount: number
  currency: string
  stripe_session_id: string | null
  stripe_payment_intent_id: string | null
  stripe_account_id: string | null
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  payment_method_id: string | null
  created_at: string
  updated_at: string
}

export interface TrainerProfileWithStats extends TrainerProfile {
  training_types?: TrainingType[]
  rating?: number
  total_bookings?: number
}

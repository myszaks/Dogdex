export interface DogEvent {
  id: string
  slug: string
  title: string
  description: string | null
  start_at: string | null
  end_at: string | null
  registration_opens_at?: string | null
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
  pricing_mode: 'free' | 'flat' | 'per_date'
  date_prices: Record<string, Record<string, number>>
  currency: string
  organizer_name: string | null
  grouping_field: string | null
  last_significant_change: string | null
  changed_fields: string[]
  current_start_index: number
  track_distance_m: number | null
  live_phase: string | null
  form_template_id: string | null
  competition_format_id: string | null
  competition_config: import('./competition').CompetitionFormatDefinition | null
  competition_values: Record<string, import('./competition').CompetitionScalar>
  competition_config_revision: number
  competition_config_locked_at: string | null
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
  payment_expires_at: string | null
  approved_at: string | null
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

export type AppRole = 'user' | 'organizer' | 'trainer' | 'organizer_trainer' | 'admin'
export type RoleRequestKind = 'organizer' | 'trainer' | 'organizer_trainer'
export type RoleRequestStatus = 'pending' | 'needs_info' | 'approved' | 'rejected'

export type {
  CompetitionAttemptInput,
  CompetitionCalculatedRow,
  CompetitionComputedFieldDefinition,
  CompetitionEntrantInput,
  CompetitionExpression,
  CompetitionFieldDefinition,
  CompetitionFieldType,
  CompetitionFormatDefinition,
  CompetitionGroupDefinition,
  CompetitionRankingDefinition,
  CompetitionScalar,
  CompetitionStageDefinition,
  CompetitionStatusDefinition,
  CompetitionViewBlockDefinition,
  CompetitionViewBlockType,
  CompetitionViewDefinition,
} from './competition'

export interface RoleUpgradeRequest {
  id: string
  user_id: string
  requested_role: RoleRequestKind
  status: RoleRequestStatus
  full_name: string
  business_name: string | null
  city: string | null
  phone: string | null
  experience: string
  verification_links: string[]
  certification_urls: string[]
  pricing_acknowledged: boolean
  terms_accepted: boolean
  admin_notes: string | null
  rejection_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  profiles?: {
    id: string
    full_name: string | null
    company: string | null
    role: AppRole | string
  } | null
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
  cancellation_buffer_hours: number
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
  expires_at: string | null
  confirmed_at: string | null
  completed_at: string | null
  reminder_sent_at: string | null
  notes_user: string | null
  notes_trainer: string | null
  created_at: string
  updated_at: string
  training_types?: TrainingType
  training_payments?: TrainingPayment[]
  training_reviews?: TrainingReview[]
  dogs?: { id: string; name: string }
  cancellation_allowed?: boolean
  cancellation_deadline?: string | null
  cancellation_buffer_hours?: number
}

export type EventPaymentStatus = 'pending' | 'completed' | 'failed' | 'partially_refunded' | 'refunded'

export interface EventRegistrationItem {
  id: string
  registration_id: string
  item_key: string
  kind: 'entry' | 'date'
  form_field_id: string | null
  occurrence_date: string | null
  label: string
  amount: number
  currency: string
  status: 'pending_approval' | 'pending_payment' | 'paid' | 'cancelled' | 'refunded'
  created_at: string
  updated_at: string
}

export interface EventPayment {
  id: string
  registration_id: string
  payee_user_id: string
  payer_user_id: string | null
  payer_email: string
  amount: number
  currency: string
  status: EventPaymentStatus
  refunded_amount: number
  stripe_session_id: string | null
  stripe_payment_intent_id: string | null
  stripe_charge_id: string | null
  receipt_url: string | null
  stripe_account_id: string
  checkout_token: string
  checkout_url: string | null
  expires_at: string | null
  confirmation_sent_at: string | null
  failure_code: string | null
  failure_message: string | null
  last_reconciled_at: string | null
  reconciliation_status: 'not_checked' | 'ok' | 'attention' | 'error'
  reconciliation_error: string | null
  created_at: string
  updated_at: string
}

export type EventRefundStatus = 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'canceled'

export interface EventRefund {
  id: string
  payment_id: string
  registration_id: string
  requested_by: string | null
  cancellation_request_id: string | null
  amount: number
  currency: string
  status: EventRefundStatus
  stripe_refund_id: string | null
  requested_dates: string[] | null
  new_form_data: Record<string, unknown>
  cancel_registration: boolean
  reason: string
  error_code: string | null
  error_message: string | null
  last_reconciled_at: string | null
  created_at: string
  updated_at: string
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

export interface TrainingReview {
  id: string
  booking_id: string
  trainer_id: string
  user_id: string
  author_name: string
  rating: number
  comment: string | null
  created_at: string
  updated_at: string
}

export interface TrainerProfileWithStats extends TrainerProfile {
  training_types?: TrainingType[]
  rating?: number | null
  review_count?: number
  min_price?: number | null
  total_bookings?: number
}

export interface OrganizerProfile {
  id: string
  organizer_id: string
  slug: string
  display_name: string
  organization_name: string | null
  bio: string | null
  profile_image_url: string | null
  location_city: string | null
  website_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface EventReview {
  id: string
  event_id: string
  organizer_id: string
  user_id: string
  author_name: string
  rating: number
  comment: string | null
  created_at: string
  updated_at: string
  events?: Pick<DogEvent, 'id' | 'slug' | 'title'>
}

export interface OrganizerProfileWithStats extends OrganizerProfile {
  rating?: number | null
  review_count?: number
  reviews?: EventReview[]
  events?: DogEvent[]
}

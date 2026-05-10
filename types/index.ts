export interface DogEvent {
  id: string
  slug: string | null
  title: string
  description: string | null
  start_at: string | null
  end_at: string | null
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
  auto_confirm: boolean
  max_participants: number | null
  organizer_name: string | null
  grouping_field: string | null
  last_significant_change: string | null
  changed_fields: string[]
  current_start_index: number
  track_distance_m: number | null
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

export type AgilityLevel = 'none' | 'beginner' | 'intermediate' | 'advanced' | 'competition'
export type DogGender = 'male' | 'female'

export interface Dog {
  id: string
  user_id: string
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

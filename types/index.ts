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
  metadata: Record<string, unknown>
  image_url: string | null
  event_type_id: string | null
  form_fields: FormField[]
  has_results: boolean
  results_public: boolean
  auto_confirm: boolean
  max_participants: number | null
  organizer_name: string | null
}

export interface Participant {
  id: string
  user_id?: string | null
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
  participants?: Participant
  events?: DogEvent
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

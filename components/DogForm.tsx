'use client'
import { useState } from 'react'
import type { Dog, AgilityLevel, DogGender } from '@/types'
import DogPhotoUploader from './DogPhotoUploader'

export const AGILITY_LEVELS: { value: AgilityLevel; label: string }[] = [
  { value: 'none', label: 'Brak / nie dotyczy' },
  { value: 'beginner', label: 'Początkujący' },
  { value: 'intermediate', label: 'Średniozaawansowany' },
  { value: 'advanced', label: 'Zaawansowany' },
  { value: 'competition', label: 'Zawodnik' },
]

export const GENDER_LABELS: Record<DogGender, string> = {
  male: 'Pies (♂)',
  female: 'Suka (♀)',
}

interface Props {
  initial?: Partial<Dog>
  onSave: (data: Partial<Dog>) => Promise<void>
  onCancel: () => void
}

const EMPTY: Partial<Dog> = {
  name: '',
  breed: '',
  gender: undefined,
  pedigree_or_chip: '',
  coat_color: '',
  weight_kg: undefined,
  height_cm: undefined,
  agility_level: undefined,
  rabies_vaccine_expiry: undefined,
}

export default function DogForm({ initial = EMPTY, onSave, onCancel }: Props) {
  const [form, setForm] = useState<Partial<Dog>>({ ...EMPTY, ...initial })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(key: keyof Dog, value: unknown) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name?.trim()) { setError('Imię psa jest wymagane'); return }
    if (!form.height_cm) { setError('Wzrost w kłębie jest wymagany'); return }
    if (!form.rabies_vaccine_expiry) { setError('Ważność szczepienia na wściekliznę jest wymagana'); return }
    setLoading(true)
    setError(null)
    try {
      await onSave(form)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Błąd zapisu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Zdjęcie psa – okrągłe, z cropem */}
      <DogPhotoUploader
        currentUrl={form.photo_url}
        onUrlChange={url => set('photo_url', url)}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="form-label">Imię psa *</label>
          <input className="form-input" value={form.name ?? ''} onChange={e => set('name', e.target.value)} placeholder="Burek" required />
        </div>
        <div>
          <label className="form-label">Rasa</label>
          <input className="form-input" value={form.breed ?? ''} onChange={e => set('breed', e.target.value)} placeholder="Border Collie" />
        </div>
        <div>
          <label className="form-label">Płeć</label>
          <select className="form-input" value={form.gender ?? ''} onChange={e => set('gender', e.target.value || null)}>
            <option value="">— wybierz —</option>
            <option value="male">Pies (♂)</option>
            <option value="female">Suka (♀)</option>
          </select>
        </div>
        <div>
          <label className="form-label">Poziom agility</label>
          <select className="form-input" value={form.agility_level ?? ''} onChange={e => set('agility_level', e.target.value || null)}>
            <option value="">— wybierz —</option>
            {AGILITY_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Rodowód / nr chipa</label>
          <input className="form-input" value={form.pedigree_or_chip ?? ''} onChange={e => set('pedigree_or_chip', e.target.value)} placeholder="PL12345..." />
        </div>
        <div>
          <label className="form-label">Umaszczenie</label>
          <input className="form-input" value={form.coat_color ?? ''} onChange={e => set('coat_color', e.target.value)} placeholder="Czarno-biały" />
        </div>
        <div>
          <label className="form-label">Waga (kg)</label>
          <input className="form-input" type="number" step="0.1" min="0" value={form.weight_kg ?? ''} onChange={e => set('weight_kg', e.target.value ? Number(e.target.value) : null)} placeholder="12.5" />
        </div>
        <div>
          <label className="form-label">Wzrost w kłębie (cm) *</label>
          <input className="form-input" type="number" step="0.5" min="0" value={form.height_cm ?? ''} onChange={e => set('height_cm', e.target.value ? Number(e.target.value) : null)} placeholder="45" required />
        </div>
        <div className="sm:col-span-2">
          <label className="form-label">Ważność szczepienia na wściekliznę *</label>
          <input className="form-input" type="date" value={form.rabies_vaccine_expiry ?? ''} onChange={e => set('rabies_vaccine_expiry', e.target.value || null)} required />
        </div>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 p-3 rounded-lg">⚠️ {error}</p>}

      <div className="flex gap-3 justify-end pt-2">
        <button type="button" onClick={onCancel} className="btn btn-secondary">Anuluj</button>
        <button type="submit" disabled={loading} className="btn btn-primary">{loading ? 'Zapisywanie...' : '💾 Zapisz'}</button>
      </div>
    </form>
  )
}

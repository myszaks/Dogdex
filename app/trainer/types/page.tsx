'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Edit2, Trash2 } from 'lucide-react'
import type { TrainingType } from '@/types'

export default function TrainingTypesPage() {
  const [types, setTypes] = useState<TrainingType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price_per_hour: '',
    duration_min: '60',
  })

  useEffect(() => {
    loadTypes()
  }, [])

  const loadTypes = async () => {
    try {
      const response = await fetch('/api/training-types')
      if (!response.ok) throw new Error('Błąd przy ładowaniu')
      const data = await response.json()
      setTypes(Array.isArray(data) ? data : [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      setError('Nazwa jest wymagana')
      return
    }

    try {
      const response = await fetch('/api/training-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          price_per_hour: formData.price_per_hour ? parseFloat(formData.price_per_hour) : null,
          duration_min: parseInt(formData.duration_min) || 60,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Błąd')
      }

      const newType = await response.json()
      setTypes([newType, ...types])
      setFormData({ name: '', description: '', price_per_hour: '', duration_min: '60' })
      setShowForm(false)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleDelete = async (typeId: string) => {
    if (!confirm('Czy na pewno chcesz usunąć ten typ treningu?')) return

    setDeleting(typeId)
    try {
      const response = await fetch(`/api/training-types/${typeId}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Błąd przy usuwaniu')

      setTypes(types.filter(t => t.id !== typeId))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDeleting(null)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center text-slate-500">Ładowanie…</div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/trainer" className="inline-flex items-center gap-2 text-accent hover:underline mb-6">
        <ArrowLeft className="w-4 h-4" />
        Wróć do panelu
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading font-bold text-3xl">Rodzaje treningów</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn btn-primary"
        >
          <Plus className="w-4 h-4" />
          Nowy typ
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card p-6 mb-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Nazwa *</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="form-input"
                placeholder="np. Agility"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Opis</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="form-input resize-none"
                rows={3}
                placeholder="Opis tego typu treningu…"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Cena/godzinę (PLN)</label>
                <input
                  type="number"
                  value={formData.price_per_hour}
                  onChange={e => setFormData(prev => ({ ...prev, price_per_hour: e.target.value }))}
                  className="form-input"
                  step="0.01"
                  min="0"
                  placeholder="150.00"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Czas trwania (min)</label>
                <input
                  type="number"
                  value={formData.duration_min}
                  onChange={e => setFormData(prev => ({ ...prev, duration_min: e.target.value }))}
                  className="form-input"
                  min="15"
                  step="15"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary flex-1">
                Dodaj typ
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="btn btn-secondary flex-1"
              >
                Anuluj
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {types.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <p>Nie masz jeszcze żadnych typów treningów</p>
        </div>
      ) : (
        <div className="space-y-4">
          {types.map(type => (
            <div key={type.id} className="card p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-heading font-semibold text-lg mb-1">{type.name}</h3>
                  {type.description && (
                    <p className="text-sm text-muted-foreground mb-3">{type.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm font-semibold text-accent">
                    {type.price_per_hour && (
                      <span>
                        {type.price_per_hour.toLocaleString('pl-PL', {
                          style: 'currency',
                          currency: 'PLN',
                        })}/h
                      </span>
                    )}
                    <span>{type.duration_min} min</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <Link
                    href={`/trainer/types/${type.id}`}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Edytuj"
                  >
                    <Edit2 className="w-4 h-4 text-slate-600" />
                  </Link>
                  <button
                    onClick={() => handleDelete(type.id)}
                    disabled={deleting === type.id}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-600"
                    title="Usuń"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DogCard from '@/components/DogCard'
import DogForm from '@/components/DogForm'
import type { Dog } from '@/types'

interface Props {
  initialDogs: Dog[]
}

export default function MojePsyClient({ initialDogs }: Props) {
  const router = useRouter()
  const [dogs, setDogs] = useState<Dog[]>(initialDogs)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd(data: Partial<Dog>) {
    const res = await fetch('/api/dogs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Błąd zapisu')
    setDogs(prev => [...prev, json])
    setAdding(false)
    router.refresh()
  }

  async function handleDelete(id: string) {
    setError(null)
    const res = await fetch(`/api/dogs/${id}`, { method: 'DELETE' })
    if (!res.ok) { setError('Nie udało się usunąć'); return }
    setDogs(prev => prev.filter(d => d.id !== id))
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 p-3 rounded-lg">⚠️ {error}</p>}

      {dogs.length === 0 && !adding && (
        <div className="card text-center py-16">
          <p className="text-5xl mb-4">🐕</p>
          <p className="text-slate-500 font-medium">Nie masz jeszcze żadnego psa w profilu</p>
          <p className="text-slate-400 text-sm mt-1">Dodaj psa, żeby szybciej zapisywać się na wydarzenia</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {dogs.map(dog => (
          <DogCard key={dog.id} dog={dog} onDelete={handleDelete} />
        ))}
      </div>

      {adding ? (
        <div className="card">
          <h2 className="font-semibold text-slate-700 mb-4">➕ Nowy pies</h2>
          <DogForm onSave={handleAdd} onCancel={() => setAdding(false)} />
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="btn btn-primary w-full sm:w-auto">
          ➕ Dodaj psa
        </button>
      )}
    </div>
  )
}

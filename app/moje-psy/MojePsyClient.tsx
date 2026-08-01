'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DogCard from '@/components/DogCard'
import DogForm from '@/components/DogForm'
import type { Dog } from '@/types'
import { PlusCircle, Dog as DogIcon, X } from 'lucide-react'

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
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm">
          ⚠️ {error}
        </div>
      )}

      {dogs.length === 0 && (
        <div className="bg-card rounded-3xl p-16 text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
            <DogIcon className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="font-heading font-semibold text-foreground text-lg">Brak psów w profilu</p>
          <p className="text-muted-foreground text-sm mt-1 mb-6">
            Dodaj psa, żeby szybciej zapisywać się na wydarzenia.
          </p>
          <button onClick={() => setAdding(true)} className="btn btn-primary">
            <PlusCircle className="w-4 h-4" />
            Dodaj pierwszego psa
          </button>
        </div>
      )}

      {dogs.length > 0 && (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {dogs.map(dog => (
              <DogCard key={dog.id} dog={dog} onDelete={handleDelete} />
            ))}
          </div>
          <button onClick={() => setAdding(true)} className="btn btn-primary">
            <PlusCircle className="w-4 h-4" />
            Dodaj psa
          </button>
        </>
      )}

      {/* Add dog modal */}
      {adding && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setAdding(false) }}
        >
          <div className="relative w-full max-w-lg bg-card rounded-3xl shadow-2xl max-h-[90dvh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-border shrink-0">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">Moje psy</p>
                <h2 className="font-heading font-bold text-foreground text-lg">Dodaj nowego psa</h2>
              </div>
              <button
                onClick={() => setAdding(false)}
                className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-border transition-colors"
                aria-label="Zamknij"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <DogForm onSave={handleAdd} onCancel={() => setAdding(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}



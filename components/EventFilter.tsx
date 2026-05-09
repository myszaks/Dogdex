'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { EVENT_TYPES } from '@/lib/eventTypes'

export default function EventFilter({ location }: { location?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const createQueryString = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [k, v] of Object.entries(updates)) {
        if (v) params.set(k, v)
        else params.delete(k)
      }
      return params.toString()
    },
    [searchParams]
  )

  const currentType = searchParams.get('typ') ?? ''
  const currentLocation = searchParams.get('lokalizacja') ?? ''
  const currentSearch = searchParams.get('szukaj') ?? ''
  const currentOrganizer = searchParams.get('organizator') ?? ''

  function handleChange(key: string, value: string) {
    router.push(`${pathname}?${createQueryString({ [key]: value })}`, { scroll: false })
  }

  function handleClear() {
    router.push(pathname, { scroll: false })
  }

  const hasFilters = currentType || currentLocation || currentSearch || currentOrganizer

  return (
    <div className="card mb-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">🔍 Filtruj</p>
        {hasFilters && (
          <button onClick={handleClear} className="text-xs text-sky-600 hover:underline">
            Wyczyść
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <input
          className="form-input text-sm"
          placeholder="Szukaj nazwy..."
          value={currentSearch}
          onChange={e => handleChange('szukaj', e.target.value)}
        />
        <select
          className="form-input text-sm"
          value={currentType}
          onChange={e => handleChange('typ', e.target.value)}
        >
          <option value="">Wszystkie typy</option>
          {EVENT_TYPES.map(t => (
            <option key={t.id} value={t.id}>
              {t.icon} {t.name}
            </option>
          ))}
        </select>
        <input
          className="form-input text-sm"
          placeholder="Lokalizacja..."
          value={currentLocation}
          onChange={e => handleChange('lokalizacja', e.target.value)}
        />
        <input
          className="form-input text-sm"
          placeholder="Organizator..."
          value={currentOrganizer}
          onChange={e => handleChange('organizator', e.target.value)}
        />
      </div>
    </div>
  )
}

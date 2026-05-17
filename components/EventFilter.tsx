'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { EVENT_TYPES } from '@/lib/eventTypes'
import { Search, MapPin, User, X, Tag } from 'lucide-react'

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
    <div className="bg-card rounded-3xl border border-border p-5 mb-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-foreground">Filtruj wydarzenia</p>
        {hasFilters && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1 text-xs text-accent font-medium hover:text-orange-600 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Wyczyść filtry
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            className="form-input pl-9"
            placeholder="Szukaj nazwy..."
            value={currentSearch}
            onChange={e => handleChange('szukaj', e.target.value)}
          />
        </div>

        {/* Type */}
        <div className="relative">
          <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <select
            className="form-input pl-9 appearance-none"
            value={currentType}
            onChange={e => handleChange('typ', e.target.value)}
          >
            <option value="">Wszystkie typy</option>
            {EVENT_TYPES.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Location */}
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            className="form-input pl-9"
            placeholder="Lokalizacja..."
            value={currentLocation}
            onChange={e => handleChange('lokalizacja', e.target.value)}
          />
        </div>

        {/* Organizer */}
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            className="form-input pl-9"
            placeholder="Organizator..."
            value={currentOrganizer}
            onChange={e => handleChange('organizator', e.target.value)}
          />
        </div>
      </div>

      {/* Active filter chips */}
      {hasFilters && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border">
          {currentSearch && (
            <FilterChip label={`Nazwa: ${currentSearch}`} onRemove={() => handleChange('szukaj', '')} />
          )}
          {currentType && (
            <FilterChip label={`Typ: ${EVENT_TYPES.find(t => t.id === currentType)?.name ?? currentType}`} onRemove={() => handleChange('typ', '')} />
          )}
          {currentLocation && (
            <FilterChip label={`Miejsce: ${currentLocation}`} onRemove={() => handleChange('lokalizacja', '')} />
          )}
          {currentOrganizer && (
            <FilterChip label={`Org: ${currentOrganizer}`} onRemove={() => handleChange('organizator', '')} />
          )}
        </div>
      )}
    </div>
  )
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium">
      {label}
      <button onClick={onRemove} className="hover:text-accent transition-colors ml-0.5">
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}


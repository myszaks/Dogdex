'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, SlidersHorizontal, X, MapPin, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export default function EventSearchBar() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const currentSearch = searchParams.get('szukaj') ?? ''
  const currentLocation = searchParams.get('lokalizacja') ?? ''
  const currentOrganizer = searchParams.get('organizator') ?? ''

  // Local state for the search input – decoupled from URL to avoid lag
  const [searchValue, setSearchValue] = useState(currentSearch)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep local state in sync if URL param changes externally (e.g. clear all)
  useEffect(() => {
    setSearchValue(currentSearch)
  }, [currentSearch])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [draftLocation, setDraftLocation] = useState(currentLocation)
  const [draftOrganizer, setDraftOrganizer] = useState(currentOrganizer)

  const buildParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [k, v] of Object.entries(updates)) {
        if (v) params.set(k, v)
        else params.delete(k)
      }
      return params.toString()
    },
    [searchParams],
  )

  function push(updates: Record<string, string>) {
    router.push(`${pathname}?${buildParams(updates)}`, { scroll: false })
  }

  function handleOpenChange(open: boolean) {
    if (open) {
      setDraftLocation(searchParams.get('lokalizacja') ?? '')
      setDraftOrganizer(searchParams.get('organizator') ?? '')
    }
    setDialogOpen(open)
  }

  function applyFilters() {
    push({ lokalizacja: draftLocation, organizator: draftOrganizer })
    setDialogOpen(false)
  }

  function clearAll() {
    router.push(pathname, { scroll: false })
  }

  const advancedCount = [currentLocation, currentOrganizer].filter(Boolean).length
  const hasAny = !!(searchValue || currentLocation || currentOrganizer)

  return (
    <div className="mb-6">
      {/* ── Top bar ── */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        {/* Name search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 h-10 rounded-xl bg-card border-border text-sm"
            placeholder="Szukaj wydarzeń..."
            value={searchValue}
            onChange={e => {
              const val = e.target.value
              setSearchValue(val)
              if (debounceRef.current) clearTimeout(debounceRef.current)
              debounceRef.current = setTimeout(() => {
                push({ szukaj: val })
              }, 300)
            }}
          />
        </div>

        {/* Advanced filters modal */}
        <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
          <DialogTrigger
            render={
              <Button
                variant="outline"
                className="h-10 rounded-xl gap-2 shrink-0 border-border bg-card"
              />
            }
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filtry
            {advancedCount > 0 && (
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-accent text-white text-xs font-bold leading-none">
                {advancedCount}
              </span>
            )}
          </DialogTrigger>

          <DialogContent className="rounded-3xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Filtry zaawansowane</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label htmlFor="event-filter-location" className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-accent" />
                  Lokalizacja
                </label>
                <Input
                  id="event-filter-location"
                  className="rounded-xl"
                  placeholder="Wpisz miasto lub miejsce..."
                  value={draftLocation}
                  onChange={e => setDraftLocation(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="event-filter-organizer" className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-accent" />
                  Organizator
                </label>
                <Input
                  id="event-filter-organizer"
                  className="rounded-xl"
                  placeholder="Nazwa organizatora..."
                  value={draftOrganizer}
                  onChange={e => setDraftOrganizer(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <DialogClose render={<Button variant="ghost" className="rounded-xl" />}>
                Anuluj
              </DialogClose>
              <Button
                className="rounded-xl bg-accent text-white hover:bg-orange-600"
                onClick={applyFilters}
              >
                Zastosuj filtry
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Clear all */}
        {hasAny && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0 px-1"
          >
            <X className="w-4 h-4" />
            Wyczyść
          </button>
        )}
      </div>

      {/* ── Active filter chips ── */}
      {hasAny && (
        <div className="flex flex-wrap gap-2 mt-3">
          {currentSearch && (
            <FilterChip
              label={`Szukaj: ${currentSearch}`}
              onRemove={() => push({ szukaj: '' })}
            />
          )}
          {currentLocation && (
            <FilterChip
              label={`Miejsce: ${currentLocation}`}
              onRemove={() => push({ lokalizacja: '' })}
            />
          )}
          {currentOrganizer && (
            <FilterChip
              label={`Org: ${currentOrganizer}`}
              onRemove={() => push({ organizator: '' })}
            />
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
      <button
        onClick={onRemove}
        className="ml-0.5 hover:text-primary/70 transition-colors"
        aria-label="Usuń filtr"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}

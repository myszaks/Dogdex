'use client'
import 'leaflet/dist/leaflet.css'
import { useEffect, useId, useRef, useState } from 'react'
import type { LeafletMouseEvent, Map as LeafletMap, Marker } from 'leaflet'

interface Props {
  lat: number | null
  lng: number | null
  location?: string
  onLocationChange: (lat: number, lng: number, address: string) => void
}

const DEFAULT_LAT = 52.069
const DEFAULT_LNG = 19.48
const DEFAULT_ZOOM = 6

export default function MapPicker({ lat, lng, location, onLocationChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [searchInput, setSearchInput] = useState(location ?? '')
  const [searchError, setSearchError] = useState<string | null>(null)
  const generatedId = useId()
  const searchId = `map-address-${generatedId}`
  const helpId = `${searchId}-help`
  const errorId = `${searchId}-error`
  const statusId = `${searchId}-status`

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    let cancelled = false

    async function init() {
      const L = (await import('leaflet')).default

      if (cancelled || !containerRef.current) return

      // Fix default icon path issue with webpack
      const defaultIconPrototype = L.Icon.Default.prototype as typeof L.Icon.Default.prototype & {
        _getIconUrl?: unknown
      }
      delete defaultIconPrototype._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      })

      const initLat = lat ?? DEFAULT_LAT
      const initLng = lng ?? DEFAULT_LNG
      const initZoom = lat !== null ? 13 : DEFAULT_ZOOM

      const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView([initLat, initLng], initZoom)
      mapRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map)

      // Force correct size after DOM is fully laid out
      setTimeout(() => { if (!cancelled) map.invalidateSize() }, 100)

      if (lat !== null && lng !== null) {
        markerRef.current = L.marker([lat, lng]).addTo(map)
      }

      map.on('click', async (e: LeafletMouseEvent) => {
        const { lat: clickLat, lng: clickLng } = e.latlng

        if (markerRef.current) {
          markerRef.current.setLatLng([clickLat, clickLng])
        } else {
          markerRef.current = L.marker([clickLat, clickLng]).addTo(map)
        }

        setGeocoding(true)
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${clickLat}&lon=${clickLng}&format=json`,
            {
              headers: {
                'Accept-Language': 'pl',
                'User-Agent': 'Dogdex/1.0 (dog events platform)',
              },
            }
          )
          const data = await res.json()
          const address = data.display_name ?? `${clickLat.toFixed(5)}, ${clickLng.toFixed(5)}`
          setSearchInput(address)
          setSearchError(null)
          onLocationChange(clickLat, clickLng, address)
        } catch {
          const fallbackAddress = `${clickLat.toFixed(5)}, ${clickLng.toFixed(5)}`
          setSearchInput(fallbackAddress)
          setSearchError(null)
          onLocationChange(clickLat, clickLng, fallbackAddress)
        } finally {
          setGeocoding(false)
        }
      })
    }

    init()

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        markerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync marker when props change (e.g. from text input)
  useEffect(() => {
    if (!mapRef.current || lat === null || lng === null) return
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng])
    }
    mapRef.current.invalidateSize()
  }, [lat, lng])

  async function handleSearch(e?: React.FormEvent | React.KeyboardEvent) {
    e?.preventDefault()
    const query = searchInput.trim()
    if (!query) return

    setGeocoding(true)
    setSearchError(null)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
        {
          headers: {
            'Accept-Language': 'pl',
            'User-Agent': 'Dogdex/1.0 (dog events platform)',
          },
        }
      )
      const data = await res.json()
      if (!data || data.length === 0) {
        setSearchError('Nie znaleziono lokalizacji. Wpisz dokładniejszy adres.')
        return
      }
      const { lat: foundLat, lon: foundLng, display_name } = data[0]
      const newLat = parseFloat(foundLat)
      const newLng = parseFloat(foundLng)

      onLocationChange(newLat, newLng, display_name)
      setSearchInput(display_name)

      if (mapRef.current) {
        mapRef.current.setView([newLat, newLng], 14)
        const L = (await import('leaflet')).default
        if (markerRef.current) {
          markerRef.current.setLatLng([newLat, newLng])
        } else {
          markerRef.current = L.marker([newLat, newLng]).addTo(mapRef.current)
        }
      }
    } catch {
      setSearchError('Nie udało się wyszukać adresu. Spróbuj ponownie.')
    } finally {
      setGeocoding(false)
    }
  }

  return (
    <div className="space-y-2">
      {/* Address search input */}
      <label htmlFor={searchId} className="form-label">
        Adres wydarzenia
      </label>
      <div className="flex gap-2">
        <input
          id={searchId}
          type="text"
          value={searchInput}
          onChange={e => {
            setSearchInput(e.target.value)
            if (searchError) setSearchError(null)
          }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearch() } }}
          placeholder="Wpisz adres i kliknij Szukaj…"
          className="form-input flex-1"
          aria-describedby={`${helpId}${searchError ? ` ${errorId}` : ''}`}
          aria-invalid={searchError ? true : undefined}
        />
        <button
          type="button"
          onClick={() => handleSearch()}
          disabled={geocoding}
          className="btn btn-secondary btn-sm shrink-0 px-3"
          aria-describedby={statusId}
        >
          {geocoding ? '⏳' : '🔍 Szukaj'}
        </button>
      </div>

      <div
        ref={containerRef}
        className={`w-full rounded-xl overflow-hidden border border-slate-200 z-0 transition-[height] ${
          lat === null || lng === null ? 'h-40 sm:h-48' : 'h-52 sm:h-64'
        }`}
        aria-label="Mapa wyboru lokalizacji wydarzenia"
      />
      <p id={statusId} role="status" aria-live="polite" className="text-xs text-slate-500">
        {geocoding ? 'Pobieranie adresu…' : ''}
      </p>
      {searchError && (
        <p id={errorId} role="alert" className="text-xs font-medium text-red-600">
          {searchError}
        </p>
      )}
      <p id={helpId} className="text-xs text-slate-500">
        Wpisz adres i kliknij Szukaj, lub kliknij bezpośrednio na mapie, aby ustawić pin.
      </p>
    </div>
  )
}

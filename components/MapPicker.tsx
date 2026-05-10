'use client'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'

interface Props {
  lat: number | null
  lng: number | null
  onLocationChange: (lat: number, lng: number, address: string) => void
}

const DEFAULT_LAT = 52.069
const DEFAULT_LNG = 19.48
const DEFAULT_ZOOM = 6

export default function MapPicker({ lat, lng, onLocationChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const [geocoding, setGeocoding] = useState(false)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    let cancelled = false

    async function init() {
      const L = (await import('leaflet')).default

      if (cancelled || !containerRef.current) return

      // Fix default icon path issue with webpack
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
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

      map.on('click', async (e: any) => {
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
          onLocationChange(clickLat, clickLng, address)
        } catch {
          onLocationChange(clickLat, clickLng, `${clickLat.toFixed(5)}, ${clickLng.toFixed(5)}`)
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
  }, [lat, lng])

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="w-full h-64 rounded-xl overflow-hidden border border-slate-200 z-0"
      />
      {geocoding && <p className="text-xs text-slate-400">⏳ Pobieranie adresu...</p>}
      <p className="text-xs text-slate-400">
        Kliknij na mapie, aby ustawić pin. Adres lokalizacji zostanie wypełniony automatycznie.
      </p>
    </div>
  )
}

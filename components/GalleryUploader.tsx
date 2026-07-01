'use client'
import { useRef, useState } from 'react'
import Image from 'next/image'

interface Props {
  images: string[]
  onImagesChange: (urls: string[]) => void
}

const MAX_IMAGES = 10
const MAX_SIZE_MB = 5

export default function GalleryUploader({ images, onImagesChange }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList) {
    setError(null)
    const remaining = MAX_IMAGES - images.length
    if (remaining <= 0) return

    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    const toUpload = Array.from(files).slice(0, remaining)

    const oversized = toUpload.find(f => f.size > MAX_SIZE_MB * 1024 * 1024)
    if (oversized) {
      setError(`Plik "${oversized.name}" przekracza ${MAX_SIZE_MB} MB`)
      return
    }
    const invalid = toUpload.find(f => !allowed.includes(f.type))
    if (invalid) {
      setError('Dozwolone formaty: JPG, PNG, WebP')
      return
    }

    setUploading(true)
    const newUrls: string[] = []

    for (const file of toUpload) {
      const fd = new FormData()
      fd.append('file', file)
      try {
        const res = await fetch('/api/events/upload-gallery', { method: 'POST', body: fd })
        if (res.ok) {
          const { url } = await res.json()
          newUrls.push(url)
        } else {
          const { error: err } = await res.json()
          setError(err ?? 'Błąd przesyłania zdjęcia')
        }
      } catch {
        setError('Błąd połączenia')
      }
    }

    onImagesChange([...images, ...newUrls])
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function removeImage(idx: number) {
    onImagesChange(images.filter((_, i) => i !== idx))
  }

  return (
    <div>
      <p className="text-sm font-semibold text-slate-700 mb-2">🖼️ Galeria zdjęć</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
        {images.map((url, i) => (
          <div key={url + i} className="relative aspect-[4/3] rounded-lg overflow-hidden group border border-slate-200">
            <Image src={url} alt={`Zdjęcie ${i + 1}`} fill className="object-cover" unoptimized />
            <button
              type="button"
              onClick={() => removeImage(i)}
              className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
              title="Usuń zdjęcie"
            >
              ✕
            </button>
          </div>
        ))}

        {images.length < MAX_IMAGES && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="aspect-[4/3] rounded-lg border-2 border-dashed border-slate-300 hover:border-sky-400 flex flex-col items-center justify-center text-slate-400 hover:text-sky-500 transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <span className="text-sm">Przesyłanie...</span>
            ) : (
              <>
                <span className="text-2xl leading-none">+</span>
                <span className="text-xs mt-1">Dodaj zdjęcie</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={e => e.target.files && handleFiles(e.target.files)}
      />

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      <p className="text-xs text-slate-400">Maks. {MAX_IMAGES} zdjęć, każde do {MAX_SIZE_MB} MB. JPG, PNG, WebP.</p>
    </div>
  )
}

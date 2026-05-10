'use client'
import { useState, useRef } from 'react'
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import Image from 'next/image'
import ConfirmModal from './ConfirmModal'

interface Props {
  currentUrl?: string | null
  onUrlChange: (url: string | null) => void
}

const OUTPUT_SIZE = 400 // px square

function centerSquareCrop(width: number, height: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 90 }, 1, width, height),
    width,
    height,
  )
}

async function cropToBlob(image: HTMLImageElement, pixelCrop: PixelCrop, type: string): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_SIZE
  canvas.height = OUTPUT_SIZE

  const scaleX = image.naturalWidth / image.width
  const scaleY = image.naturalHeight / image.height

  const ctx = canvas.getContext('2d')!
  ctx.drawImage(
    image,
    pixelCrop.x * scaleX,
    pixelCrop.y * scaleY,
    pixelCrop.width * scaleX,
    pixelCrop.height * scaleY,
    0, 0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas toBlob failed'))
    }, type, 0.88)
  })
}

export default function DogPhotoUploader({ currentUrl, onUrlChange }: Props) {
  const [srcUrl, setSrcUrl] = useState<string | null>(null)
  const [srcType, setSrcType] = useState<string>('image/jpeg')
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>()
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSrcType(file.type || 'image/jpeg')
    const reader = new FileReader()
    reader.onload = ev => {
      setSrcUrl(ev.target?.result as string)
      setCrop(undefined)
      setCompletedCrop(undefined)
      setError(null)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget
    setCrop(centerSquareCrop(width, height))
  }

  async function handleConfirmCrop() {
    if (!imgRef.current || !completedCrop) {
      setError('Zaznacz obszar kadrowania')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const blob = await cropToBlob(imgRef.current, completedCrop, srcType)
      const ext = srcType === 'image/webp' ? 'webp' : srcType === 'image/png' ? 'png' : 'jpg'
      const fd = new FormData()
      fd.append('file', new File([blob], `dog.${ext}`, { type: srcType }))

      const res = await fetch('/api/dogs/upload-photo', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Błąd uploadu')

      // delete old photo
      if (currentUrl) {
        await fetch(`/api/dogs/upload-photo?url=${encodeURIComponent(currentUrl)}`, { method: 'DELETE' })
      }

      onUrlChange(json.url)
      setSrcUrl(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Błąd uploadu')
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove() {
    setRemoving(true)
    try {
      await fetch(`/api/dogs/upload-photo?url=${encodeURIComponent(currentUrl!)}`, { method: 'DELETE' })
      onUrlChange(null)
    } catch {
      onUrlChange(null)
    } finally {
      setRemoving(false)
    }
  }

  function handleCancel() {
    setSrcUrl(null)
    setCrop(undefined)
    setCompletedCrop(undefined)
    setError(null)
  }

  return (
    <div className="space-y-3">
      <label className="form-label">Zdjęcie psa</label>

      {/* Current photo – circle preview */}
      {currentUrl && !srcUrl && (
        <div className="flex items-center gap-4">
          <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-sky-200 bg-slate-100 shrink-0">
            <Image src={currentUrl} alt="Zdjęcie psa" fill className="object-cover" unoptimized />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="btn btn-secondary btn-sm"
            >
              🔄 Zmień
            </button>
            <button
              type="button"
              onClick={() => setConfirmRemoveOpen(true)}
              disabled={removing}
              className="btn btn-secondary btn-sm text-red-600 hover:bg-red-50"
            >
              {removing ? '...' : '🗑️ Usuń'}
            </button>
          </div>
        </div>
      )}

      {/* No photo yet – upload button */}
      {!currentUrl && !srcUrl && (
        <div className="flex items-center gap-3">
          <div className="w-24 h-24 rounded-full border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-3xl shrink-0">
            🐕
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="btn btn-secondary btn-sm"
          >
            📷 Dodaj zdjęcie
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Crop editor */}
      {srcUrl && (
        <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <p className="text-xs text-slate-500">Zaznacz kwadratowy obszar – zostanie wykadrowany do okrągłego zdjęcia.</p>
          <div className="flex justify-center">
            <ReactCrop
              crop={crop}
              onChange={c => setCrop(c)}
              onComplete={c => setCompletedCrop(c)}
              aspect={1}
              circularCrop
              minWidth={60}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={srcUrl}
                alt="Kadruj"
                onLoad={handleImageLoad}
                className="max-h-72 max-w-full object-contain"
              />
            </ReactCrop>
          </div>

          {error && <p className="text-red-600 text-xs">⚠️ {error}</p>}

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={handleCancel} className="btn btn-secondary btn-sm">
              Anuluj
            </button>
            <button
              type="button"
              onClick={handleConfirmCrop}
              disabled={uploading || !completedCrop}
              className="btn btn-primary btn-sm"
            >
              {uploading ? 'Wysyłanie...' : '✅ Potwierdź kadrowanie'}
            </button>
          </div>
        </div>
      )}
      <ConfirmModal
        open={confirmRemoveOpen}
        title="Usunąć zdjęcie?"
        message="Zdjęcie psa zostanie trwale usunięte."
        confirmLabel="Usuń"
        danger
        onConfirm={() => { setConfirmRemoveOpen(false); handleRemove() }}
        onCancel={() => setConfirmRemoveOpen(false)}
      />
    </div>
  )
}

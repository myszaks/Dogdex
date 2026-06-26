'use client'
import { useState, useRef, useCallback } from 'react'
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import Image from 'next/image'

interface Props {
  currentUrl?: string | null
  onUrlChange: (url: string | null) => void
}

const ASPECT = 16 / 9
const OUTPUT_WIDTH = 800

function centerAspectCrop(width: number, height: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 90 }, ASPECT, width, height),
    width,
    height,
  )
}

async function cropToBlob(image: HTMLImageElement, pixelCrop: PixelCrop, type: string): Promise<Blob> {
  const canvas = document.createElement('canvas')
  const scaleX = image.naturalWidth / image.width
  const scaleY = image.naturalHeight / image.height

  const srcW = pixelCrop.width * scaleX
  const srcH = pixelCrop.height * scaleY
  const outH = Math.round(OUTPUT_WIDTH / ASPECT)

  canvas.width = OUTPUT_WIDTH
  canvas.height = outH

  const ctx = canvas.getContext('2d')!
  ctx.drawImage(
    image,
    pixelCrop.x * scaleX,
    pixelCrop.y * scaleY,
    srcW,
    srcH,
    0, 0,
    OUTPUT_WIDTH,
    outH,
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('Nie udało się przygotować zdjęcia.'))
    }, type, 0.88)
  })
}

export default function ImageCropUploader({ currentUrl, onUrlChange }: Props) {
  const [srcUrl, setSrcUrl] = useState<string | null>(null)
  const [srcType, setSrcType] = useState<string>('image/jpeg')
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
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
    // reset input so same file can be re-selected
    e.target.value = ''
  }

  function handleImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget
    setCrop(centerAspectCrop(width, height))
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
      const fd = new FormData()
      const ext = srcType === 'image/webp' ? 'webp' : srcType === 'image/png' ? 'png' : 'jpg'
      fd.append('file', new File([blob], `thumbnail.${ext}`, { type: srcType }))

      const res = await fetch('/api/events/upload-thumbnail', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Błąd przesyłania zdjęcia')

      // if replacing existing, delete old
      if (currentUrl) {
        await fetch(`/api/events/upload-thumbnail?url=${encodeURIComponent(currentUrl)}`, { method: 'DELETE' })
      }

      onUrlChange(json.url)
      setSrcUrl(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Błąd przesyłania zdjęcia')
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove() {
    if (!currentUrl) return
    if (!confirm('Usunąć zdjęcie?')) return
    setRemoving(true)
    try {
      await fetch(`/api/events/upload-thumbnail?url=${encodeURIComponent(currentUrl)}`, { method: 'DELETE' })
      onUrlChange(null)
    } catch {
      // ignore storage errors — URL is cleared anyway
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
      <label className="form-label">Zdjęcie (thumbnail)</label>

      {/* Current thumbnail preview */}
      {currentUrl && !srcUrl && (
        <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
          <Image src={currentUrl} alt="Thumbnail" fill className="object-cover" unoptimized />
          <div className="absolute top-2 right-2 flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="btn btn-sm bg-white/90 text-slate-700 border border-slate-200 shadow-sm hover:bg-white"
            >
              🔄 Zmień
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={removing}
              className="btn btn-sm bg-red-50 text-red-600 border border-red-200 shadow-sm hover:bg-red-100"
            >
              {removing ? '...' : '🗑 Usuń'}
            </button>
          </div>
        </div>
      )}

      {/* Upload button when no current or in replace mode */}
      {!currentUrl && !srcUrl && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full aspect-video rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-sky-400 hover:text-sky-500 transition-colors bg-slate-50 hover:bg-sky-50"
        >
          <span className="text-3xl">🖼</span>
          <span className="text-sm font-medium">Kliknij, aby dodać zdjęcie</span>
          <span className="text-xs">JPG, PNG lub WebP · maks. 5 MB · proporcje 16:9</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Crop UI modal-like overlay */}
      {srcUrl && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-800">Kadruj zdjęcie</h3>
                <p className="text-xs text-slate-400 mt-0.5">Proporcje 16:9 · przeciągnij narożniki, aby dostosować</p>
              </div>
              <button
                type="button"
                onClick={handleCancel}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none"
                aria-label="Zamknij"
              >
                ✕
              </button>
            </div>

            <div className="overflow-auto flex-1 bg-slate-900 flex items-center justify-center p-4">
              <ReactCrop
                crop={crop}
                onChange={c => setCrop(c)}
                onComplete={c => setCompletedCrop(c)}
                aspect={ASPECT}
                minWidth={100}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={srcUrl}
                  alt="Kadrowanie"
                  onLoad={handleImageLoad}
                  style={{ maxHeight: '60vh', maxWidth: '100%', display: 'block' }}
                />
              </ReactCrop>
            </div>

            {error && (
              <p className="text-red-600 text-sm px-4 pt-3">{error}</p>
            )}

            <div className="p-4 border-t border-slate-100 flex gap-3 justify-end">
              <button
                type="button"
                onClick={handleCancel}
                className="btn btn-secondary"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={handleConfirmCrop}
                disabled={uploading || !completedCrop}
                className="btn btn-primary"
              >
                {uploading ? 'Wgrywanie...' : '✓ Zapisz zdjęcie'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

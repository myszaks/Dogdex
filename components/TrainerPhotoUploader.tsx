'use client'
import { useState, useRef } from 'react'
import Image from 'next/image'
import { X } from 'lucide-react'
import ConfirmModal from './ConfirmModal'

interface Props {
  currentUrl?: string | null
  onUrlChange: (url: string | null) => void
}

export default function TrainerPhotoUploader({ currentUrl, onUrlChange }: Props) {
  const [srcUrl, setSrcUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setError('Dozwolone formaty: JPG, PNG, WebP')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Plik zbyt duży (max 5MB)')
      return
    }

    setError(null)

    // Preview
    const reader = new FileReader()
    reader.onload = ev => {
      setSrcUrl(ev.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  async function handleUpload() {
    const file = inputRef.current?.files?.[0]
    if (!file) {
      setError('Wybierz plik')
      return
    }

    setUploading(true)
    setError(null)

    try {
      const fd = new FormData()
      fd.append('file', file)

      const res = await fetch('/api/trainer/upload-photo', { method: 'POST', body: fd })
      const json = await res.json()

      if (!res.ok) throw new Error(json.error ?? 'Błąd uploadu')

      // Delete old photo if exists
      if (currentUrl) {
        await fetch(`/api/trainer/upload-photo?url=${encodeURIComponent(currentUrl)}`, { method: 'DELETE' })
      }

      onUrlChange(json.url)
      setSrcUrl(null)
      inputRef.current!.value = ''
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Błąd uploadu')
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove() {
    setRemoving(true)
    try {
      await fetch(`/api/trainer/upload-photo?url=${encodeURIComponent(currentUrl!)}`, { method: 'DELETE' })
      onUrlChange(null)
    } catch {
      onUrlChange(null)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Current photo */}
      {currentUrl && !srcUrl && (
        <div className="flex items-center gap-4">
          <div className="relative w-32 h-32 rounded-lg overflow-hidden border-2 border-accent/20 bg-slate-100 shrink-0">
            <Image src={currentUrl} alt="Zdjęcie profilu" fill className="object-cover" unoptimized />
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="btn btn-secondary btn-sm"
            >
              🔄 Zmień zdjęcie
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

      {/* No photo yet */}
      {!currentUrl && !srcUrl && (
        <div className="flex items-center gap-3 p-4 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50">
          <div className="text-4xl">📷</div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="btn btn-secondary btn-sm"
          >
            Dodaj zdjęcie profilu
          </button>
        </div>
      )}

      {/* Preview */}
      {srcUrl && (
        <div className="space-y-3 p-4 border-2 border-accent/30 rounded-lg bg-accent/5">
          <div className="relative w-40 h-40 mx-auto rounded-lg overflow-hidden border border-accent/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={srcUrl} alt="Preview" className="w-full h-full object-cover" />
          </div>
          <div className="flex gap-2 justify-center">
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className="btn btn-primary btn-sm"
            >
              {uploading ? 'Wysyłanie…' : '✓ Prześlij'}
            </button>
            <button
              type="button"
              onClick={() => {
                setSrcUrl(null)
                inputRef.current!.value = ''
              }}
              disabled={uploading}
              className="btn btn-secondary btn-sm"
            >
              ✕ Anuluj
            </button>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}

      <ConfirmModal
        open={confirmRemoveOpen}
        title="Usunąć zdjęcie?"
        message="Ta akcja nie może być cofnięta."
        confirmLabel="Usuń"
        cancelLabel="Anuluj"
        danger={true}
        onConfirm={() => {
          setConfirmRemoveOpen(false)
          handleRemove()
        }}
        onCancel={() => setConfirmRemoveOpen(false)}
      />
    </div>
  )
}

'use client'

import { useRef, useState } from 'react'
import { FileCheck2, FilePlus2, Loader2, Paperclip, Trash2 } from 'lucide-react'
import {
  DOG_DOCUMENT_TYPES,
  DOG_DOCUMENT_TYPE_LABELS,
  type DogDocument,
  type DogDocumentType,
} from '@/lib/dogDocuments'

const DOCUMENTS_NOW = Date.now()

export default function DogDocumentsManager({ dogId, initialDocuments }: { dogId: string; initialDocuments: DogDocument[] }) {
  const [documents, setDocuments] = useState(initialDocuments)
  const [type, setType] = useState<DogDocumentType>('rabies_vaccination')
  const [label, setLabel] = useState('')
  const [documentNumber, setDocumentNumber] = useState('')
  const [issuer, setIssuer] = useState('')
  const [issuedAt, setIssuedAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function addDocument(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    const form = new FormData()
    form.set('type', type)
    if (label.trim()) form.set('label', label.trim())
    if (documentNumber.trim()) form.set('documentNumber', documentNumber.trim())
    if (issuer.trim()) form.set('issuer', issuer.trim())
    if (issuedAt) form.set('issuedAt', issuedAt)
    if (expiresAt) form.set('expiresAt', expiresAt)
    const file = fileRef.current?.files?.[0]
    if (file) form.set('file', file)

    try {
      const response = await fetch(`/api/dogs/${dogId}/documents`, { method: 'POST', body: form })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Nie udało się zapisać dokumentu')
      setDocuments(current => [...current, data].sort(sortDocuments))
      setLabel('')
      setDocumentNumber('')
      setIssuer('')
      setIssuedAt('')
      setExpiresAt('')
      if (fileRef.current) fileRef.current.value = ''
      setMessage({ type: 'success', text: 'Dokument został dodany do profilu psa.' })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Nie udało się zapisać dokumentu' })
    } finally {
      setSaving(false)
    }
  }

  async function removeDocument(document: DogDocument) {
    if (!window.confirm(`Usunąć dokument „${document.label}”?`)) return
    const response = await fetch(`/api/dogs/${dogId}/documents/${document.id}`, { method: 'DELETE' })
    const data = await response.json()
    if (!response.ok) {
      setMessage({ type: 'error', text: data.error ?? 'Nie udało się usunąć dokumentu' })
      return
    }
    setDocuments(current => current.filter(item => item.id !== document.id))
    setMessage({ type: 'success', text: 'Dokument został usunięty.' })
  }

  return (
    <div className="space-y-5">
      <form onSubmit={addDocument} className="bg-card rounded-3xl p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FilePlus2 className="h-5 w-5" /></span>
          <div>
            <h2 className="font-heading text-lg font-semibold">Dodaj dokument</h2>
            <p className="mt-1 text-sm text-muted-foreground">Możesz zapisać samą informację albo dołączyć skan. Pliki są prywatne.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="dog-document-type" className="form-label">Typ dokumentu</label>
            <select id="dog-document-type" className="form-input" value={type} onChange={event => setType(event.target.value as DogDocumentType)}>
              {DOG_DOCUMENT_TYPES.map(value => <option key={value} value={value}>{DOG_DOCUMENT_TYPE_LABELS[value]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="dog-document-label" className="form-label">Własna nazwa</label>
            <input id="dog-document-label" className="form-input" value={label} maxLength={120} onChange={event => setLabel(event.target.value)} placeholder={DOG_DOCUMENT_TYPE_LABELS[type]} />
          </div>
          <div>
            <label htmlFor="dog-document-number" className="form-label">Numer dokumentu</label>
            <input id="dog-document-number" className="form-input" value={documentNumber} maxLength={120} onChange={event => setDocumentNumber(event.target.value)} />
          </div>
          <div>
            <label htmlFor="dog-document-issuer" className="form-label">Wystawca</label>
            <input id="dog-document-issuer" className="form-input" value={issuer} maxLength={160} onChange={event => setIssuer(event.target.value)} />
          </div>
          <div>
            <label htmlFor="dog-document-issued-at" className="form-label">Data wydania</label>
            <input id="dog-document-issued-at" className="form-input" type="date" value={issuedAt} onChange={event => setIssuedAt(event.target.value)} />
          </div>
          <div>
            <label htmlFor="dog-document-expires-at" className="form-label">Ważny do</label>
            <input id="dog-document-expires-at" className="form-input" type="date" min={issuedAt || undefined} value={expiresAt} onChange={event => setExpiresAt(event.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="dog-document-file" className="form-label">Skan lub PDF</label>
            <input ref={fileRef} id="dog-document-file" className="form-input" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" />
            <p className="mt-1 text-xs text-muted-foreground">PDF, JPG, PNG lub WEBP, maksymalnie 5 MB.</p>
          </div>
        </div>
        <button className="btn btn-primary mt-5" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Zapisz dokument
        </button>
      </form>

      {message && <p role="status" className={`rounded-2xl px-4 py-3 text-sm ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{message.text}</p>}

      {documents.length === 0 ? (
        <div className="bg-card rounded-3xl p-12 text-center shadow-sm">
          <FileCheck2 className="mx-auto h-9 w-9 text-muted-foreground" />
          <p className="mt-3 font-heading font-semibold">Brak dokumentów</p>
          <p className="mt-1 text-sm text-muted-foreground">Dodaj szczepienie, licencję lub kwalifikację potrzebną na wydarzeniach.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {documents.map(document => {
            const expiryState = documentExpiryState(document.expires_at)
            return (
              <article key={document.id} className="bg-card rounded-3xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{DOG_DOCUMENT_TYPE_LABELS[document.type]}</p>
                    <h3 className="mt-1 truncate font-semibold">{document.label}</h3>
                    {document.document_number && <p className="mt-1 text-xs text-muted-foreground">Nr {document.document_number}</p>}
                  </div>
                  <button type="button" aria-label={`Usuń ${document.label}`} onClick={() => removeDocument(document)} className="btn btn-ghost btn-sm text-red-600"><Trash2 className="h-4 w-4" /></button>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full px-2.5 py-1 font-semibold ${expiryState.className}`}>{expiryState.label}</span>
                  {document.issuer && <span className="text-muted-foreground">{document.issuer}</span>}
                </div>
                {document.storage_path && (
                  <a href={`/api/dogs/${dogId}/documents/${document.id}`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm mt-4 w-full">
                    <Paperclip className="h-4 w-4" /> Otwórz załącznik
                  </a>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function sortDocuments(a: DogDocument, b: DogDocument) {
  if (!a.expires_at && !b.expires_at) return a.label.localeCompare(b.label, 'pl')
  if (!a.expires_at) return 1
  if (!b.expires_at) return -1
  return a.expires_at.localeCompare(b.expires_at)
}

function documentExpiryState(expiresAt: string | null) {
  if (!expiresAt) return { label: 'Bezterminowy', className: 'bg-sage-100 text-sage-700' }
  const days = Math.ceil((new Date(`${expiresAt}T23:59:59`).getTime() - DOCUMENTS_NOW) / 86400000)
  if (days < 0) return { label: `Wygasł ${new Date(expiresAt).toLocaleDateString('pl-PL')}`, className: 'bg-red-50 text-red-700' }
  if (days <= 30) return { label: `Wygasa za ${days} dni`, className: 'bg-amber-50 text-amber-700' }
  return { label: `Ważny do ${new Date(expiresAt).toLocaleDateString('pl-PL')}`, className: 'bg-emerald-50 text-emerald-700' }
}

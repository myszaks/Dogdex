import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient } from '@/lib/supabaseServer'
import { DOG_DOCUMENT_TYPE_LABELS, isDogDocumentType } from '@/lib/dogDocuments'

interface Params { params: Promise<{ id: string }> }

const ALLOWED_FILE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
const MAX_FILE_SIZE = 5 * 1024 * 1024

async function ownedDog(id: string) {
  const { user } = await getServerUser()
  if (!user) return { error: NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 }) } as const
  const db = createServerClient()
  const { data: dog } = await db.from('dogs').select('id').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!dog) return { error: NextResponse.json({ error: 'Nie znaleziono psa' }, { status: 404 }) } as const
  return { db, dog, user } as const
}

function optionalText(value: FormDataEntryValue | null, maxLength: number) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized.slice(0, maxLength) : null
}

function optionalDate(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return value
}

function safeFileName(value: string) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(-120) || 'document'
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params
  const owned = await ownedDog(id)
  if ('error' in owned) return owned.error
  const { data, error } = await owned.db
    .from('dog_documents')
    .select('id, dog_id, owner_id, type, label, document_number, issuer, issued_at, expires_at, storage_path, file_name, file_type, file_size, created_at, updated_at')
    .eq('dog_id', id)
    .eq('owner_id', owned.user.id)
    .order('expires_at', { ascending: true, nullsFirst: false })
  if (error) return NextResponse.json({ error: 'Nie udało się pobrać dokumentów' }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const owned = await ownedDog(id)
  if ('error' in owned) return owned.error

  let form: FormData
  try { form = await request.formData() } catch {
    return NextResponse.json({ error: 'Nieprawidłowe dane formularza' }, { status: 400 })
  }
  const type = form.get('type')
  if (!isDogDocumentType(type)) {
    return NextResponse.json({ error: 'Wybierz prawidłowy typ dokumentu' }, { status: 400 })
  }
  const label = optionalText(form.get('label'), 120) ?? DOG_DOCUMENT_TYPE_LABELS[type]
  const issuedAt = optionalDate(form.get('issuedAt'))
  const expiresAt = optionalDate(form.get('expiresAt'))
  if (issuedAt && expiresAt && expiresAt < issuedAt) {
    return NextResponse.json({ error: 'Data ważności nie może być wcześniejsza niż data wydania' }, { status: 400 })
  }

  const fileValue = form.get('file')
  const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null
  if (file && (!ALLOWED_FILE_TYPES.has(file.type) || file.size > MAX_FILE_SIZE)) {
    return NextResponse.json({ error: 'Dokument musi być plikiem PDF, JPG, PNG lub WEBP do 5 MB' }, { status: 400 })
  }

  let storagePath: string | null = null
  if (file) {
    storagePath = `${owned.user.id}/${id}/${crypto.randomUUID()}-${safeFileName(file.name)}`
    const bytes = await file.arrayBuffer()
    const { error: uploadError } = await owned.db.storage
      .from('dog-documents')
      .upload(storagePath, bytes, { contentType: file.type, upsert: false })
    if (uploadError) {
      return NextResponse.json({ error: 'Nie udało się przesłać pliku dokumentu' }, { status: 500 })
    }
  }

  const { data, error } = await owned.db
    .from('dog_documents')
    .insert({
      dog_id: id,
      owner_id: owned.user.id,
      type,
      label,
      document_number: optionalText(form.get('documentNumber'), 120),
      issuer: optionalText(form.get('issuer'), 160),
      issued_at: issuedAt,
      expires_at: expiresAt,
      storage_path: storagePath,
      file_name: file?.name ?? null,
      file_type: file?.type ?? null,
      file_size: file?.size ?? null,
    })
    .select('id, dog_id, owner_id, type, label, document_number, issuer, issued_at, expires_at, storage_path, file_name, file_type, file_size, created_at, updated_at')
    .single()
  if (error || !data) {
    if (storagePath) await owned.db.storage.from('dog-documents').remove([storagePath])
    return NextResponse.json({ error: 'Nie udało się zapisać dokumentu' }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

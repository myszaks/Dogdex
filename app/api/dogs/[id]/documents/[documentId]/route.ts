import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/getServerUser'
import { createServerClient } from '@/lib/supabaseServer'

interface Params { params: Promise<{ id: string; documentId: string }> }

async function ownedDocument(id: string, documentId: string) {
  const { user } = await getServerUser()
  if (!user) return { error: NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 }) } as const
  const db = createServerClient()
  const { data: document } = await db
    .from('dog_documents')
    .select('id, storage_path')
    .eq('id', documentId)
    .eq('dog_id', id)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!document) return { error: NextResponse.json({ error: 'Nie znaleziono dokumentu' }, { status: 404 }) } as const
  return { db, document } as const
}

export async function GET(_request: Request, { params }: Params) {
  const { id, documentId } = await params
  const owned = await ownedDocument(id, documentId)
  if ('error' in owned) return owned.error
  if (!owned.document.storage_path) {
    return NextResponse.json({ error: 'Ten wpis nie ma załączonego pliku' }, { status: 404 })
  }
  const { data, error } = await owned.db.storage
    .from('dog-documents')
    .createSignedUrl(owned.document.storage_path, 60)
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Nie udało się otworzyć dokumentu' }, { status: 500 })
  }
  return NextResponse.redirect(data.signedUrl)
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id, documentId } = await params
  const owned = await ownedDocument(id, documentId)
  if ('error' in owned) return owned.error
  if (owned.document.storage_path) {
    const { error: storageError } = await owned.db.storage.from('dog-documents').remove([owned.document.storage_path])
    if (storageError) return NextResponse.json({ error: 'Nie udało się usunąć pliku dokumentu' }, { status: 500 })
  }
  const { error } = await owned.db.from('dog_documents').delete().eq('id', documentId)
  if (error) return NextResponse.json({ error: 'Nie udało się usunąć dokumentu' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

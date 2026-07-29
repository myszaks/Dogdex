import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import {
  createAuthClient,
  createServerClient,
  hasServiceRoleKey,
} from '@/lib/supabaseServer'
import { getServerUser } from '@/lib/getServerUser'
import { isTrainerRole } from '@/lib/roles'

export async function POST(req: NextRequest) {
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  if (!isTrainerRole(role)) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'Brak pliku' }, { status: 400 })
  }

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Dozwolone: JPG, PNG, WebP' }, { status: 400 })
  }

  // Validate file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Plik zbyt duży (max 5MB)' }, { status: 400 })
  }

  try {
    const supabase = await createAuthClient()
    const extension = file.type === 'image/jpeg'
      ? 'jpg'
      : file.type === 'image/png'
        ? 'png'
        : 'webp'
    const fileName = `${user.id}/${randomUUID()}.${extension}`
    const buffer = await file.arrayBuffer()

    // Upload to Supabase Storage
    const { error } = await supabase.storage
      .from('trainers')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (error) throw new Error('Nie udało się przesłać zdjęcia')

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('trainers')
      .getPublicUrl(fileName)

    return NextResponse.json({ url: publicUrl })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Błąd przesyłania zdjęcia' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  const { user, role } = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 401 })
  if (!isTrainerRole(role)) return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })

  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'Brak URL' }, { status: 400 })

  try {
    const supabase = await createAuthClient()
    
    const marker = '/storage/v1/object/public/trainers/'
    const markerIndex = url.indexOf(marker)
    const fileName = markerIndex >= 0
      ? decodeURIComponent(url.slice(markerIndex + marker.length))
      : ''
    if (!fileName || fileName.includes('..')) {
      return NextResponse.json({ error: 'Nieprawidłowy URL' }, { status: 400 })
    }

    let storageClient = supabase
    if (!fileName.startsWith(`${user.id}/`)) {
      const isLegacyOwnFile = fileName.startsWith(`trainer-${user.id}-`)
      const { data: profile } = await supabase
        .from('trainer_profiles')
        .select('profile_image_url')
        .eq('trainer_id', user.id)
        .maybeSingle()

      if (!isLegacyOwnFile || profile?.profile_image_url !== url) {
        return NextResponse.json({ error: 'Brak uprawnień' }, { status: 403 })
      }
      if (!hasServiceRoleKey()) {
        return NextResponse.json({ error: 'Usuwanie pliku jest chwilowo niedostępne' }, { status: 503 })
      }
      storageClient = createServerClient()
    }

    const { error } = await storageClient.storage
      .from('trainers')
      .remove([fileName])

    if (error) throw new Error('Nie udało się usunąć zdjęcia')

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Delete error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Błąd usunięcia' },
      { status: 500 }
    )
  }
}

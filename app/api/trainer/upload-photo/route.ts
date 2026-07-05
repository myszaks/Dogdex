import { NextRequest, NextResponse } from 'next/server'
import { createAuthClient } from '@/lib/supabaseServer'
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
    const fileName = `trainer-${user.id}-${Date.now()}.${file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp'}`
    const buffer = await file.arrayBuffer()

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
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
    
    // Extract filename from URL
    const fileName = url.split('/').pop()
    if (!fileName) throw new Error('Nieprawidłowy URL')

    await supabase.storage
      .from('trainers')
      .remove([fileName])

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Delete error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Błąd usunięcia' },
      { status: 500 }
    )
  }
}

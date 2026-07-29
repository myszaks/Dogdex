import { notFound } from 'next/navigation'
import CompetitionFormatStudio from '@/components/CompetitionFormatStudio'
import { createAuthClient } from '@/lib/supabaseServer'
import { requireRole } from '@/lib/getServerUser'
import type { CompetitionFormatDefinition } from '@/types/competition'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditCompetitionFormatPage({ params }: Props) {
  const { id } = await params
  const { user, role } = await requireRole(['organizer', 'admin'])
  const supabase = await createAuthClient()
  const { data: format } = await supabase
    .from('competition_formats')
    .select('id, name, description, status, definition, created_by, is_system')
    .eq('id', id)
    .maybeSingle()

  if (
    !format
    || format.status !== 'draft'
    || (role !== 'admin' && (format.created_by !== user.id || format.is_system))
  ) {
    notFound()
  }

  return (
    <CompetitionFormatStudio
      formatId={format.id}
      initialName={format.name}
      initialDescription={format.description}
      initialDefinition={format.definition as CompetitionFormatDefinition}
    />
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Archive,
  CalendarPlus,
  CopyPlus,
  Eye,
  Loader2,
  Pencil,
} from 'lucide-react'

interface Props {
  formatId: string
  status: 'draft' | 'published' | 'archived'
  usageCount: number
  canManage: boolean
  canCreateVersion: boolean
  existingDraftId?: string | null
  compact?: boolean
  showPreview?: boolean
}

export default function CompetitionFormatActions({
  formatId,
  status,
  usageCount,
  canManage,
  canCreateVersion,
  existingDraftId,
  compact = false,
  showPreview = true,
}: Props) {
  const router = useRouter()
  const [pending, setPending] = useState<'version' | 'archive' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const buttonSize = compact ? 'btn-sm' : ''

  async function createVersion() {
    if (existingDraftId) {
      router.push(`/organizer/formats/${existingDraftId}/edit`)
      return
    }

    setPending('version')
    setError(null)
    try {
      const response = await fetch(`/api/competition-formats/${formatId}/versions`, {
        method: 'POST',
      })
      const json = await response.json()
      if (!response.ok) {
        throw new Error(json.error ?? 'Nie udało się utworzyć nowej wersji.')
      }
      router.push(`/organizer/formats/${json.id}/edit`)
      router.refresh()
    } catch (versionError) {
      setError(versionError instanceof Error
        ? versionError.message
        : 'Nie udało się utworzyć nowej wersji.')
    } finally {
      setPending(null)
    }
  }

  async function archiveFormat() {
    if (
      usageCount > 0
      || !window.confirm('Zarchiwizować tę wersję formatu? Nie będzie można użyć jej w nowych wydarzeniach.')
    ) return

    setPending('archive')
    setError(null)
    try {
      const response = await fetch(`/api/competition-formats/${formatId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      })
      const json = await response.json()
      if (!response.ok) {
        throw new Error(json.error ?? 'Nie udało się zarchiwizować formatu.')
      }
      router.push('/organizer/formats')
      router.refresh()
    } catch (archiveError) {
      setError(archiveError instanceof Error
        ? archiveError.message
        : 'Nie udało się zarchiwizować formatu.')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {showPreview && (
          <Link
            href={`/organizer/formats/${formatId}`}
            className={`btn btn-secondary ${buttonSize}`}
          >
            <Eye className="h-4 w-4" />
            Podgląd
          </Link>
        )}

        {status === 'draft' && canManage && (
          <Link
            href={`/organizer/formats/${formatId}/edit`}
            className={`btn btn-primary ${buttonSize}`}
          >
            <Pencil className="h-4 w-4" />
            Edytuj szkic
          </Link>
        )}

        {status === 'published' && (
          <>
            <Link
              href={`/organizer/events/new?competitionFormatId=${formatId}`}
              className={`btn btn-primary ${buttonSize}`}
            >
              <CalendarPlus className="h-4 w-4" />
              Użyj w wydarzeniu
            </Link>
            {canCreateVersion && (
              <button
                type="button"
                onClick={createVersion}
                disabled={pending !== null}
                className={`btn btn-secondary ${buttonSize}`}
              >
                {pending === 'version'
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <CopyPlus className="h-4 w-4" />}
                {existingDraftId ? 'Kontynuuj nową wersję' : 'Utwórz nową wersję'}
              </button>
            )}
            {canManage && (
              <button
                type="button"
                onClick={archiveFormat}
                disabled={pending !== null || usageCount > 0}
                title={usageCount > 0
                  ? 'Nie można archiwizować formatu używanego przez wydarzenia.'
                  : 'Archiwizuj format'}
                className={`btn btn-secondary ${buttonSize}`}
              >
                {pending === 'archive'
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Archive className="h-4 w-4" />}
                Archiwizuj
              </button>
            )}
          </>
        )}
      </div>
      {status === 'published' && canManage && usageCount > 0 && (
        <p className="text-xs text-muted-foreground">
          Archiwizacja będzie dostępna, gdy żadne wydarzenie nie będzie używać tej wersji.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

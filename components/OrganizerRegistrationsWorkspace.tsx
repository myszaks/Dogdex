'use client'

import { useMemo, useState } from 'react'
import type { FormField, Registration } from '@/types'
import type { CompetitionFormatDefinition } from '@/types/competition'
import CancellationRequestsPanel, {
  type CancellationRequestRow,
  type CancellationResolution,
} from '@/components/CancellationRequestsPanel'
import RegistrationsClientList from '@/components/RegistrationsClientList'
import {
  mergeRegistrationUpdate,
  registrationStats,
} from '@/lib/registrationManagement'

interface Props {
  initialRegistrations: Registration[]
  initialCancellationRequests: CancellationRequestRow[]
  eventFormFields: FormField[]
  groupingField: string | null
  competitionDefinition: CompetitionFormatDefinition | null
}

function sortRegistrations(registrations: Registration[]) {
  return [...registrations].sort((left, right) => {
    if (left.order_index != null && right.order_index != null) {
      return left.order_index - right.order_index
    }
    return new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
  })
}

export default function OrganizerRegistrationsWorkspace({
  initialRegistrations,
  initialCancellationRequests,
  eventFormFields,
  groupingField,
  competitionDefinition,
}: Props) {
  const [registrations, setRegistrations] = useState<Registration[]>(
    () => sortRegistrations(initialRegistrations),
  )
  const [cancellationRequests, setCancellationRequests] = useState<CancellationRequestRow[]>(
    initialCancellationRequests,
  )

  const stats = useMemo(() => registrationStats(registrations), [registrations])

  function updateRegistration(updated: Partial<Registration> & Pick<Registration, 'id'>) {
    setRegistrations(previous => mergeRegistrationUpdate(previous, updated))
  }

  function handleCancellationResolved(resolution: CancellationResolution) {
    setCancellationRequests(previous =>
      previous.filter(request => request.id !== resolution.requestId)
    )
    if (resolution.registration) {
      updateRegistration(resolution.registration)
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        <div className="card text-center py-2">
          <p className="text-xl font-bold text-slate-800">{stats.total}</p>
          <p className="text-xs text-slate-500">Łącznie</p>
        </div>
        <div className="card text-center py-2">
          <p className="text-xl font-bold text-green-600">{stats.confirmed}</p>
          <p className="text-xs text-slate-500">Potwierdzone</p>
        </div>
        <div className="card text-center py-2">
          <p className="text-xl font-bold text-yellow-600">{stats.pending}</p>
          <p className="text-xs text-slate-500">Oczekujące</p>
        </div>
        <div className="card text-center py-2">
          <p className="text-xl font-bold text-red-500">{stats.cancelled}</p>
          <p className="text-xs text-slate-500">Anulowane</p>
        </div>
      </div>

      {registrations.length === 0 ? (
        <div className="card text-center py-12 text-slate-500">
          Brak zapisów na to wydarzenie
        </div>
      ) : (
        <>
          <CancellationRequestsPanel
            requests={cancellationRequests}
            onResolved={handleCancellationResolved}
          />
          <RegistrationsClientList
            registrations={registrations}
            onRegistrationsChange={setRegistrations}
            onRegistrationUpdated={updateRegistration}
            eventFormFields={eventFormFields}
            groupingField={groupingField}
            competitionDefinition={competitionDefinition}
          />
        </>
      )}
    </>
  )
}

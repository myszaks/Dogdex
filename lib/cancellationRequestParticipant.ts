export interface CancellationParticipant {
  dog_name: string | null
  owner_name: string | null
  owner_email: string | null
}

function firstRelation(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value
  return candidate && typeof candidate === 'object'
    ? candidate as Record<string, unknown>
    : null
}

export function cancellationRequestParticipant(relation: unknown): CancellationParticipant | null {
  const registration = firstRelation(relation)
  if (!registration) return null

  const participant = firstRelation(registration.participants)
  if (!participant) return null

  return {
    dog_name: typeof participant.dog_name === 'string' ? participant.dog_name : null,
    owner_name: typeof participant.owner_name === 'string' ? participant.owner_name : null,
    owner_email: typeof participant.owner_email === 'string' ? participant.owner_email : null,
  }
}

interface EventRegistrationWindow {
  registrationOpensAt: string | null
  registrationDeadline: string | null
  eventStartsAt: string | null
}

function isInvalidDate(value: string | null) {
  return value !== null && Number.isNaN(new Date(value).getTime())
}

export function validateEventRegistrationWindow({
  eventStartsAt,
  registrationDeadline,
  registrationOpensAt,
}: EventRegistrationWindow): string | null {
  if (isInvalidDate(registrationOpensAt)) return 'Data otwarcia zapisów jest nieprawidłowa'
  if (isInvalidDate(registrationDeadline)) return 'Data zamknięcia zapisów jest nieprawidłowa'
  if (isInvalidDate(eventStartsAt)) return 'Data rozpoczęcia wydarzenia jest nieprawidłowa'

  const opensAt = registrationOpensAt ? new Date(registrationOpensAt).getTime() : null
  const closesAt = registrationDeadline ? new Date(registrationDeadline).getTime() : null
  const startsAt = eventStartsAt ? new Date(eventStartsAt).getTime() : null

  if (opensAt !== null && closesAt !== null && opensAt >= closesAt) {
    return 'Otwarcie zapisów musi nastąpić przed ich zamknięciem'
  }
  if (opensAt !== null && startsAt !== null && opensAt >= startsAt) {
    return 'Otwarcie zapisów musi nastąpić przed rozpoczęciem wydarzenia'
  }
  if (closesAt !== null && startsAt !== null && closesAt > startsAt) {
    return 'Zamknięcie zapisów nie może nastąpić po rozpoczęciu wydarzenia'
  }
  return null
}

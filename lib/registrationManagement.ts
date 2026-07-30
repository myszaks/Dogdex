type StatusRecord = {
  status?: unknown
}

export function registrationStats(registrations: StatusRecord[]) {
  return {
    total: registrations.length,
    confirmed: registrations.filter(registration => registration.status === 'confirmed').length,
    pending: registrations.filter(registration => registration.status === 'pending').length,
    cancelled: registrations.filter(registration => registration.status === 'cancelled').length,
  }
}

export function splitRegistrationHistory<T extends StatusRecord>(registrations: T[]) {
  return {
    active: registrations.filter(registration => registration.status !== 'cancelled'),
    cancelled: registrations.filter(registration => registration.status === 'cancelled'),
  }
}

export function mergeRegistrationUpdate<
  T extends { id: string },
  U extends Partial<T> & Pick<T, 'id'>,
>(registrations: T[], updated: U): T[] {
  return registrations.map(registration =>
    registration.id === updated.id
      ? { ...registration, ...updated }
      : registration
  )
}

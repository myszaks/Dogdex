export const BUSINESS_PERMISSIONS = [
  'profile.manage',
  'team.manage',
  'events.create',
  'events.edit',
  'events.registrations',
  'events.checkin',
  'events.results',
  'events.finance',
  'trainings.offer',
  'trainings.schedule',
  'trainings.bookings',
  'trainings.attendance',
  'customers.view',
  'passes.manage',
  'payments.view',
  'refunds.manage',
] as const

export type BusinessPermission = (typeof BUSINESS_PERMISSIONS)[number]

export const BUSINESS_TRAINING_WORKSPACE_PERMISSIONS = [
  'trainings.offer',
  'trainings.schedule',
  'trainings.bookings',
  'trainings.attendance',
  'customers.view',
  'passes.manage',
] as const satisfies readonly BusinessPermission[]

export const BUSINESS_COURSE_WORKSPACE_PERMISSIONS = [
  'trainings.offer',
  'trainings.schedule',
  'trainings.attendance',
  'customers.view',
] as const satisfies readonly BusinessPermission[]

export const BUSINESS_PERMISSION_LABELS: Record<BusinessPermission, string> = {
  'profile.manage': 'Profil firmy lub klubu',
  'team.manage': 'Zespół i uprawnienia',
  'events.create': 'Tworzenie wydarzeń',
  'events.edit': 'Edycja wydarzeń',
  'events.registrations': 'Zapisy na wydarzenia',
  'events.checkin': 'Check-in wydarzeń',
  'events.results': 'Wyniki wydarzeń',
  'events.finance': 'Finanse wydarzeń',
  'trainings.offer': 'Oferta kursów i zajęć',
  'trainings.schedule': 'Terminy zajęć',
  'trainings.bookings': 'Obsługa rezerwacji indywidualnych',
  'trainings.attendance': 'Obecności',
  'customers.view': 'Uczestnicy i klienci',
  'passes.manage': 'Karnety i ich saldo',
  'payments.view': 'Podgląd płatności',
  'refunds.manage': 'Zwroty płatności',
}

export const BUSINESS_PERMISSION_GROUPS = [
  { label: 'Profil i zespół', permissions: ['profile.manage', 'team.manage'] },
  { label: 'Wydarzenia', permissions: ['events.create', 'events.edit', 'events.registrations', 'events.checkin', 'events.results', 'events.finance'] },
  { label: 'Treningi', permissions: ['trainings.offer', 'trainings.schedule', 'trainings.bookings', 'trainings.attendance', 'customers.view', 'passes.manage'] },
  { label: 'Płatności', permissions: ['payments.view', 'refunds.manage'] },
] as const satisfies ReadonlyArray<{ label: string; permissions: readonly BusinessPermission[] }>

export function isBusinessPermission(value: unknown): value is BusinessPermission {
  return typeof value === 'string' && (BUSINESS_PERMISSIONS as readonly string[]).includes(value)
}

export function normalizeBusinessPermissions(value: unknown): BusinessPermission[] {
  const permissions = Array.isArray(value) ? [...new Set(value.filter(isBusinessPermission))] : []
  if (permissions.includes('refunds.manage') || permissions.includes('events.finance')) permissions.push('payments.view')
  if (permissions.includes('trainings.attendance') || permissions.includes('passes.manage')) permissions.push('customers.view')
  if (permissions.includes('trainings.bookings')) permissions.push('customers.view')
  return [...new Set(permissions)]
}

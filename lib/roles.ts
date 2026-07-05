export const APP_ROLES = ['user', 'organizer', 'trainer', 'organizer_trainer', 'admin'] as const
export type AppRole = (typeof APP_ROLES)[number]

export const ROLE_LABELS: Record<AppRole, string> = {
  user: 'Użytkownik',
  organizer: 'Organizator',
  trainer: 'Trener',
  organizer_trainer: 'Organizator i trener',
  admin: 'Administrator',
}

export const ROLE_REQUEST_KINDS = ['organizer', 'trainer', 'organizer_trainer'] as const
export type RoleRequestKind = (typeof ROLE_REQUEST_KINDS)[number]

export const ROLE_REQUEST_STATUSES = ['pending', 'needs_info', 'approved', 'rejected'] as const
export type RoleRequestStatus = (typeof ROLE_REQUEST_STATUSES)[number]

export const ROLE_REQUEST_LABELS: Record<RoleRequestKind, string> = {
  organizer: 'Organizator wydarzeń',
  trainer: 'Trener',
  organizer_trainer: 'Organizator i trener',
}

export const ROLE_REQUEST_STATUS_LABELS: Record<RoleRequestStatus, string> = {
  pending: 'Oczekuje',
  needs_info: 'Do uzupełnienia',
  approved: 'Zatwierdzony',
  rejected: 'Odrzucony',
}

export function isAppRole(role: unknown): role is AppRole {
  return typeof role === 'string' && (APP_ROLES as readonly string[]).includes(role)
}

export function isRoleRequestKind(value: unknown): value is RoleRequestKind {
  return typeof value === 'string' && (ROLE_REQUEST_KINDS as readonly string[]).includes(value)
}

export function isRoleRequestStatus(value: unknown): value is RoleRequestStatus {
  return typeof value === 'string' && (ROLE_REQUEST_STATUSES as readonly string[]).includes(value)
}

export function isOrganizerRole(role: string | null | undefined): boolean {
  return role === 'organizer' || role === 'organizer_trainer' || role === 'admin'
}

export function isTrainerRole(role: string | null | undefined): boolean {
  return role === 'trainer' || role === 'organizer_trainer' || role === 'admin'
}

export function hasRequiredRole(
  role: string | null | undefined,
  requiredRoles: readonly string[],
): boolean {
  if (role === 'admin') return true
  if (requiredRoles.includes('organizer') && isOrganizerRole(role)) return true
  if (requiredRoles.includes('trainer') && isTrainerRole(role)) return true
  return !!role && requiredRoles.includes(role)
}

export function nextRoleAfterApproval(
  currentRole: string | null | undefined,
  requestedKind: RoleRequestKind,
): AppRole {
  if (currentRole === 'admin') return 'admin'
  if (requestedKind === 'organizer_trainer') return 'organizer_trainer'
  if (requestedKind === 'organizer') {
    return isTrainerRole(currentRole) ? 'organizer_trainer' : 'organizer'
  }
  return isOrganizerRole(currentRole) ? 'organizer_trainer' : 'trainer'
}

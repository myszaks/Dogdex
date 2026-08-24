export function hasAnyRole(role: string | null, roles: string[]) {
  if (!role) return false
  if (role === 'admin') return true
  if (roles.includes(role)) return true

  return role === 'organizer_trainer'
    && (roles.includes('organizer') || roles.includes('trainer'))
}

export const EVENT_TEAM_PERMISSIONS = ['registrations', 'checkin', 'results', 'finance'] as const
export type EventTeamPermission = (typeof EVENT_TEAM_PERMISSIONS)[number]

export const EVENT_TEAM_PERMISSION_LABELS: Record<EventTeamPermission, string> = {
  registrations: 'Sekretariat i zapisy',
  checkin: 'Odprawa i check-in',
  results: 'Wprowadzanie wyników',
  finance: 'Finanse',
}

export function isEventTeamPermission(value: unknown): value is EventTeamPermission {
  return typeof value === 'string'
    && (EVENT_TEAM_PERMISSIONS as readonly string[]).includes(value)
}

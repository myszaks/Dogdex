export type PreselectedFormatStatus =
  | 'checking'
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error'

export function isPreselectedFormatBlocking(
  status: PreselectedFormatStatus,
): boolean {
  return status === 'checking' || status === 'loading' || status === 'error'
}

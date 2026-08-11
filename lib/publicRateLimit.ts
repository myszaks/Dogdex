import { createHmac } from 'node:crypto'
import { createServerClient, hasServiceRoleKey } from '@/lib/supabaseServer'

export interface PublicRateLimitRule {
  scope: string
  identifier: string
  limit: number
  windowSeconds: number
}

export type PublicRateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: 'limited'; retryAfterSeconds: number }
  | { allowed: false; reason: 'unavailable' }

function normalizeIp(value: string | null): string | null {
  const first = value?.split(',')[0]?.trim()
  if (!first || first.length > 64) return null
  return first
}

export function getRequestIp(req: Request): string {
  return (
    normalizeIp(req.headers.get('cf-connecting-ip'))
    ?? normalizeIp(req.headers.get('x-real-ip'))
    ?? normalizeIp(req.headers.get('x-forwarded-for'))
    ?? 'unknown'
  )
}

function hashIdentifier(scope: string, identifier: string): string | null {
  const salt = process.env.RATE_LIMIT_SALT?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!salt) return null

  return createHmac('sha256', salt)
    .update(`${scope}\0${identifier.trim().toLowerCase()}`)
    .digest('hex')
}

export async function enforcePublicRateLimits(
  rules: PublicRateLimitRule[],
): Promise<PublicRateLimitResult> {
  if (!hasServiceRoleKey()) return { allowed: false, reason: 'unavailable' }

  const supabase = createServerClient()
  for (const rule of rules) {
    const identifierHash = hashIdentifier(rule.scope, rule.identifier)
    if (!identifierHash) return { allowed: false, reason: 'unavailable' }

    const { data, error } = await supabase.rpc('consume_public_rate_limit', {
      p_scope: rule.scope,
      p_identifier_hash: identifierHash,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    })

    if (error || typeof data !== 'boolean') {
      return { allowed: false, reason: 'unavailable' }
    }
    if (!data) {
      return {
        allowed: false,
        reason: 'limited',
        retryAfterSeconds: rule.windowSeconds,
      }
    }
  }

  return { allowed: true }
}

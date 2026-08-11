import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const nextConfig = require('../../next.config.js')

describe('global security headers', () => {
  it('sets HSTS and a restrictive CSP for every route', async () => {
    const rules = await nextConfig.headers()
    const globalRule = rules.find((rule: { source: string }) => rule.source === '/(.*)')
    const headers = new Map(
      globalRule.headers.map((header: { key: string; value: string }) => [header.key, header.value]),
    )

    expect(headers.get('Strict-Transport-Security')).toBe(
      'max-age=31536000; includeSubDomains',
    )

    const csp = headers.get('Content-Security-Policy')
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'self'")
    expect(csp).toContain('upgrade-insecure-requests')
  })
})

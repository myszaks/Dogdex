import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const getServerUser = vi.fn()

vi.mock('@/lib/getServerUser', () => ({
  getServerUser,
}))

const originalClientId = process.env.STRIPE_CLIENT_ID
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

afterEach(() => {
  if (originalClientId === undefined) delete process.env.STRIPE_CLIENT_ID
  else process.env.STRIPE_CLIENT_ID = originalClientId

  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
})

describe('GET /api/stripe/connect', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.STRIPE_CLIENT_ID = 'ca_test'
    process.env.NEXT_PUBLIC_APP_URL = 'https://dogdex.example'
    getServerUser.mockResolvedValue({
      user: { id: 'trainer-user-id', email: 'trainer@example.com' },
      role: 'trainer',
    })
  })

  it('uses a random cookie-bound OAuth state instead of the user id', async () => {
    const { GET } = await import('@/app/api/stripe/connect/route')
    const response = await GET(new NextRequest('https://dogdex.example/api/stripe/connect'))

    expect(response.status).toBeGreaterThanOrEqual(300)
    expect(response.status).toBeLessThan(400)

    const location = new URL(response.headers.get('location')!)
    const state = location.searchParams.get('state')
    expect(state).toMatch(/^[a-f0-9]{64}$/)
    expect(state).not.toBe('trainer-user-id')
    expect(location.searchParams.get('redirect_uri')).toBe('https://dogdex.example/api/stripe/callback')

    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain(`dogdex_stripe_connect_state=${state}`)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=lax')
  })
})

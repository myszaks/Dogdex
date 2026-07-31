import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  oauthToken: vi.fn(),
  createServerClient: vi.fn(),
  hasServiceRoleKey: vi.fn(),
  getServerUser: vi.fn(),
}))

vi.mock('stripe', () => ({
  default: class StripeMock {
    oauth = { token: mocks.oauthToken }
  },
}))

vi.mock('@/lib/supabaseServer', () => ({
  createServerClient: mocks.createServerClient,
  hasServiceRoleKey: mocks.hasServiceRoleKey,
}))

vi.mock('@/lib/getServerUser', () => ({
  getServerUser: mocks.getServerUser,
}))

const originalStripeSecret = process.env.STRIPE_SECRET_KEY
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL

afterEach(() => {
  if (originalStripeSecret === undefined) delete process.env.STRIPE_SECRET_KEY
  else process.env.STRIPE_SECRET_KEY = originalStripeSecret
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl
})

describe('GET /api/stripe/callback', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.NEXT_PUBLIC_APP_URL = 'https://dogdex.example'
    mocks.hasServiceRoleKey.mockReturnValue(true)
    mocks.getServerUser.mockResolvedValue({
      user: { id: 'trainer-user-id' },
      role: 'trainer',
    })
  })

  it('persists the connected account with the server client', async () => {
    mocks.oauthToken.mockResolvedValue({ stripe_user_id: 'acct_test_trainer' })
    const single = vi.fn().mockResolvedValue({ error: null })
    const select = vi.fn(() => ({ single }))
    const eq = vi.fn(() => ({ select }))
    const update = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ update }))
    mocks.createServerClient.mockReturnValue({ from })

    const { GET } = await import('@/app/api/stripe/callback/route')
    const request = new NextRequest(
      'https://dogdex.example/api/stripe/callback?code=ac_test&state=state-test',
      { headers: { cookie: 'dogdex_stripe_connect_state=state-test' } },
    )
    const response = await GET(request)

    expect(response.headers.get('location')).toBe(
      'https://dogdex.example/payments?stripe_connected=true',
    )
    expect(mocks.oauthToken).toHaveBeenCalledWith({
      grant_type: 'authorization_code',
      code: 'ac_test',
    })
    expect(update).toHaveBeenCalledWith({
      stripe_account_id: 'acct_test_trainer',
      stripe_onboarded: true,
    })
    expect(eq).toHaveBeenCalledWith('id', 'trainer-user-id')
  })
})

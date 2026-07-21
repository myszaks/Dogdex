import { afterEach, describe, expect, it, vi } from 'vitest'

describe('trainer date availability route modules', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('can be evaluated during a build without Supabase environment variables', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    vi.resetModules()

    const [privateRoute, publicRoute] = await Promise.all([
      import('@/app/api/trainer/date-availability/route'),
      import('@/app/api/trainer/date-availability/public/route'),
    ])

    expect(privateRoute.GET).toBeTypeOf('function')
    expect(privateRoute.POST).toBeTypeOf('function')
    expect(privateRoute.PATCH).toBeTypeOf('function')
    expect(privateRoute.DELETE).toBeTypeOf('function')
    expect(publicRoute.GET).toBeTypeOf('function')
  })
})

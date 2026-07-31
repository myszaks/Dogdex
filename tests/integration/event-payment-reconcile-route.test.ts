import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getServerUser: vi.fn(),
  hasServiceRoleKey: vi.fn(),
  reconcileEventPayments: vi.fn(),
}))

vi.mock('@/lib/getServerUser', () => ({ getServerUser: mocks.getServerUser }))
vi.mock('@/lib/supabaseServer', () => ({ hasServiceRoleKey: mocks.hasServiceRoleKey }))
vi.mock('@/lib/eventReconciliation', () => ({ reconcileEventPayments: mocks.reconcileEventPayments }))

describe('/api/event-payments/reconcile', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.hasServiceRoleKey.mockReturnValue(true)
    mocks.reconcileEventPayments.mockResolvedValue({ checked: 2, corrected: 1, errors: 0 })
  })

  it('allows an organizer to reconcile only their ledger', async () => {
    mocks.getServerUser.mockResolvedValue({ user: { id: 'organizer-1' }, role: 'organizer' })
    const { POST } = await import('@/app/api/event-payments/reconcile/route')
    const response = await POST()
    expect(response.status).toBe(200)
    expect(mocks.reconcileEventPayments).toHaveBeenCalledWith('organizer-1')
  })

  it('protects the scheduled reconciliation with CRON_SECRET', async () => {
    process.env.CRON_SECRET = 'cron-test'
    const { GET } = await import('@/app/api/event-payments/reconcile/route')
    const denied = await GET(new Request('https://dogdex.example/api/event-payments/reconcile'))
    expect(denied.status).toBe(401)
    const accepted = await GET(new Request('https://dogdex.example/api/event-payments/reconcile', { headers: { authorization: 'Bearer cron-test' } }))
    expect(accepted.status).toBe(200)
    expect(mocks.reconcileEventPayments).toHaveBeenCalledWith()
  })
})

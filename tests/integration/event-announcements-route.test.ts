import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getServerUser: vi.fn(),
  processPendingAnnouncementDeliveries: vi.fn(),
  requireEventAccessForApi: vi.fn(),
}))

vi.mock('@/lib/supabaseServer', () => ({ createServerClient: mocks.createServerClient }))
vi.mock('@/lib/getServerUser', () => ({ getServerUser: mocks.getServerUser }))
vi.mock('@/lib/eventAccess', () => ({ requireEventAccessForApi: mocks.requireEventAccessForApi }))
vi.mock('@/lib/eventAnnouncements', () => ({
  processPendingAnnouncementDeliveries: mocks.processPendingAnnouncementDeliveries,
}))

describe('event announcements route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.processPendingAnnouncementDeliveries.mockResolvedValue({
      processed: 0, delivered: 0, failed: 0, errors: [],
    })
    mocks.requireEventAccessForApi.mockResolvedValue({
      access: { user: { id: 'organizer-1', email: 'org@example.com' } },
    })
  })

  it('rejects sending without an organizer session', async () => {
    mocks.getServerUser.mockResolvedValue({ user: null, role: null })
    mocks.requireEventAccessForApi.mockResolvedValue({ error: new Response(null, { status: 403 }) })
    const { POST } = await import('@/app/api/events/[id]/announcements/route')
    const response = await POST(
      new Request('https://dogdex.test/api/events/event-1/announcements', {
        method: 'POST', body: JSON.stringify({ title: 'Test', message: 'Treść', audience: 'confirmed' }),
      }),
      { params: Promise.resolve({ id: 'event-1' }) },
    )
    expect(response.status).toBe(403)
    expect(mocks.createServerClient).not.toHaveBeenCalled()
  })

  it('stores a communication even when the selected audience is empty', async () => {
    mocks.getServerUser.mockResolvedValue({ user: { id: 'organizer-1', email: 'org@example.com' }, role: 'organizer' })
    const announcement = {
      id: 'announcement-1', event_id: 'event-1', title: 'Zmiana parkingu', body: 'Wjazd od północy.',
      audience: 'confirmed', recipient_count: 0, delivered_count: 0, failed_count: 0,
      created_at: '2026-08-04T10:00:00.000Z',
    }
    mocks.createServerClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'events') return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
            id: 'event-1', slug: 'spacer', title: 'Spacer', created_by: 'organizer-1',
          } }) }) }),
        }
        if (table === 'registrations') return {
          select: () => ({ eq: () => ({ in: async () => ({ data: [] }) }) }),
        }
        if (table === 'event_announcements') return {
          insert: () => ({ select: () => ({ single: async () => ({ data: announcement, error: null }) }) }),
          select: () => ({ eq: () => ({ single: async () => ({ data: announcement }) }) }),
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    })

    const { POST } = await import('@/app/api/events/[id]/announcements/route')
    const response = await POST(
      new Request('https://dogdex.test/api/events/event-1/announcements', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Zmiana parkingu', message: 'Wjazd od północy.', audience: 'confirmed' }),
      }),
      { params: Promise.resolve({ id: 'event-1' }) },
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({ title: 'Zmiana parkingu', recipient_count: 0 })
    expect(mocks.processPendingAnnouncementDeliveries).toHaveBeenCalledWith({ announcementId: 'announcement-1', limit: 20 })
  })
})

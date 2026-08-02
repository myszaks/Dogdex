import { describe, expect, it, vi } from 'vitest'

const createAuthClient = vi.fn()

vi.mock('@/lib/supabaseServer', () => ({
  createAuthClient,
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect')
  }),
}))

function collectText(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (!node || typeof node !== 'object') return ''

  const children = (node as { props?: { children?: unknown } }).props?.children
  if (Array.isArray(children)) return children.map(collectText).join(' ')
  return collectText(children)
}

describe('my registrations page', () => {
  it('loads cancelled registrations into a separate history section', async () => {
    const statusFilter = vi.fn(async () => ({
      data: [
        {
          id: 'reg-active',
          participant_id: 'participant-1',
          status: 'confirmed',
          created_at: '2026-07-30T10:00:00.000Z',
          form_data: {},
          participants: { dog_name: 'Figa' },
          events: {
            id: 'event-active',
            slug: 'active-event',
            title: 'Aktywne wydarzenie',
            start_at: '2026-08-10T10:00:00.000Z',
            form_fields: [],
          },
        },
        {
          id: 'reg-cancelled',
          participant_id: 'participant-1',
          status: 'cancelled',
          created_at: '2026-07-29T10:00:00.000Z',
          form_data: {},
          participants: { dog_name: 'Luna' },
          events: {
            id: 'event-cancelled',
            slug: 'cancelled-event',
            title: 'Anulowane wydarzenie',
            start_at: '2026-08-11T10:00:00.000Z',
            form_fields: [],
          },
        },
      ],
    }))
    const registrationStatusIn = vi.fn(() => ({
      order: statusFilter,
    }))

    createAuthClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: 'user-1', email: 'user@example.com' } },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === 'participants') {
          return {
            select: () => ({
              ilike: async () => ({ data: [{ id: 'participant-1' }] }),
            }),
          }
        }
        if (table === 'registrations') {
          return {
            select: () => ({
              in: () => ({
                in: registrationStatusIn,
              }),
            }),
          }
        }
        if (table === 'cancellation_requests') {
          return {
            select: () => ({
              in: () => ({
                eq: async () => ({ data: [] }),
              }),
            }),
          }
        }
        throw new Error(`Unexpected table ${table}`)
      }),
    })

    const { default: MyRegistrationsPage } = await import('@/app/moje-zapisy/page')
    const tree = await MyRegistrationsPage({
      searchParams: Promise.resolve({}),
    })
    const text = collectText(tree)

    expect(registrationStatusIn).toHaveBeenCalledWith(
      'status',
      ['confirmed', 'pending', 'cancelled'],
    )
    expect(text).toContain('Aktywne zapisy')
    expect(text).toContain('Historia anulowanych')
  }, 10_000)
})

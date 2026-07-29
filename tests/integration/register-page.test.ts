import { describe, expect, it, vi } from 'vitest'

const createServerClient = vi.fn()

vi.mock('@/lib/supabaseServer', () => ({
  createServerClient,
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('notFound')
  }),
  redirect: vi.fn(() => {
    throw new Error('redirect')
  }),
}))

function findRegistrationEventId(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null
  const props = (node as { props?: Record<string, unknown> }).props
  if (!props) return null
  if (typeof props.eventId === 'string') return props.eventId

  const children = props.children
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findRegistrationEventId(child)
      if (found) return found
    }
    return null
  }
  return findRegistrationEventId(children)
}

describe('registration page', () => {
  it('passes the resolved event UUID to the registration form for slug URLs', async () => {
    const event = {
      id: '91fbc388-f79d-4a3a-b338-55423603518e',
      slug: 'summer-agility',
      title: 'Summer Agility',
      status: 'upcoming',
      start_at: '2030-08-01T10:00:00.000Z',
      end_at: null,
      registration_deadline: null,
      location: 'Warszawa',
      event_type_id: null,
      form_fields: [],
      max_participants: null,
    }

    createServerClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: event }),
          }),
        }),
      }),
    })

    const { default: RegisterPage } = await import('@/app/register/[eventId]/page')
    const tree = await RegisterPage({
      params: Promise.resolve({ eventId: event.slug }),
    })

    expect(findRegistrationEventId(tree)).toBe(event.id)
  })
})

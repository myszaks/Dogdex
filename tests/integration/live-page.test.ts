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

function collectText(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (!node || typeof node !== 'object') return ''

  const element = node as {
    type?: unknown
    props?: { children?: unknown } & Record<string, unknown>
  }
  if (typeof element.type === 'function') {
    return collectText(
      (element.type as (props: Record<string, unknown>) => unknown)(element.props ?? {}),
    )
  }

  const children = element.props?.children
  if (Array.isArray(children)) return children.map(collectText).join(' ')
  return collectText(children)
}

describe('live event page', () => {
  it('shows a waiting state and does not load results for a future event', async () => {
    const event = {
      id: 'event-1',
      slug: 'future-speedway',
      title: 'Speedway w sierpniu',
      status: 'upcoming',
      start_at: '2099-08-15T10:00:00.000Z',
      end_at: '2099-08-15T12:00:00.000Z',
      has_results: true,
      results_public: true,
    }
    const maybeSingle = vi.fn(async () => ({ data: event, error: null }))
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn((table: string) => {
      if (table !== 'events') throw new Error(`Unexpected table ${table}`)
      return { select }
    })
    createServerClient.mockReturnValue({ from })

    const { default: LivePage } = await import('@/app/live/[eventId]/page')
    const tree = await LivePage({
      params: Promise.resolve({ eventId: event.slug }),
    })
    const text = collectText(tree)

    expect(text).toContain('Wyniki na żywo nie są jeszcze dostępne')
    expect(text).not.toContain('Na żywo')
    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('events')
  })
})

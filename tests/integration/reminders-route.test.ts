import { afterEach, describe, expect, it } from 'vitest'
import { GET } from '@/app/api/reminders/route'

const originalCronSecret = process.env.CRON_SECRET

afterEach(() => {
  if (originalCronSecret === undefined) {
    delete process.env.CRON_SECRET
  } else {
    process.env.CRON_SECRET = originalCronSecret
  }
})

describe('GET /api/reminders authorization', () => {
  it('fails closed when CRON_SECRET is missing', async () => {
    delete process.env.CRON_SECRET

    const response = await GET(new Request('http://localhost/api/reminders'))

    expect(response.status).toBe(503)
  })

  it('rejects a request without the bearer secret', async () => {
    process.env.CRON_SECRET = 'test-cron-secret'

    const response = await GET(new Request('http://localhost/api/reminders'))

    expect(response.status).toBe(401)
  })
})

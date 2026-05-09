(async () => {
  try {
    require('dotenv').config({ path: '.env.local' })
    const fetch = require('node-fetch')

    const base = 'http://localhost:3000'

    // Poll until /api/events responds
    let eventsRes
    for (let i = 0; i < 30; i++) {
      try {
        eventsRes = await fetch(`${base}/api/events`)
        if (eventsRes.ok) break
      } catch (e) {}
      await new Promise(r => setTimeout(r, 1000))
    }

    if (!eventsRes || !eventsRes.ok) {
      console.error('[E2E] /api/events not available')
      process.exit(1)
    }

    const events = await eventsRes.json()
    const upcoming = Array.isArray(events) ? events.find(e => e.status === 'upcoming') : null
    if (!upcoming) {
      console.error('[E2E] No upcoming event found (check DB)')
      process.exit(1)
    }

    console.log('[E2E] Using event:', upcoming.id, upcoming.title)

    const payload = {
      eventId: upcoming.id,
      ownerName: 'Test User',
      ownerEmail: process.env.SMTP_TEST_TO || process.env.SMTP_USER,
      dogName: 'Fido',
      dogBreed: 'Mieszaniec',
      extraFields: { note: 'E2E test' }
    }

    const postRes = await fetch(`${base}/api/registrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await postRes.text()
    console.log('[E2E] POST /api/registrations status', postRes.status)
    console.log('[E2E] Response:', data)
    process.exit(postRes.ok ? 0 : 1)
  } catch (err) {
    console.error('[E2E] Error', err)
    process.exit(1)
  }
})()

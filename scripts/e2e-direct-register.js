(async () => {
  try {
    require('dotenv').config({ path: '.env.local' })
    const { createClient } = require('@supabase/supabase-js')
    const nodemailer = require('nodemailer')

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.error('[E2E] Supabase env missing')
      process.exit(1)
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // find upcoming event
    const { data: events, error: eErr } = await supabase
      .from('events')
      .select('id,title,status,auto_confirm,start_at,location,max_participants')
      .eq('status', 'upcoming')
      .limit(1)

    if (eErr) {
      console.error('[E2E] Error fetching events', eErr)
      process.exit(1)
    }
    if (!events || events.length === 0) {
      console.error('[E2E] No upcoming events found')
      process.exit(1)
    }

    const ev = events[0]
    console.log('[E2E] Using event', ev.id, ev.title)

    const payload = {
      dog_name: 'E2E Fido',
      dog_breed: 'Mieszaniec',
      owner_name: 'E2E Tester',
      owner_email: process.env.SMTP_TEST_TO || process.env.SMTP_USER || null,
      extra: {},
    }

    const { data: participant, error: pErr } = await supabase
      .from('participants')
      .insert([payload])
      .select()
      .single()

    if (pErr || !participant) {
      console.error('[E2E] Failed to create participant', pErr)
      process.exit(1)
    }

    const status = ev.auto_confirm ? 'confirmed' : 'pending'
    const { data: registration, error: rErr } = await supabase
      .from('registrations')
      .insert([{ event_id: ev.id, participant_id: participant.id, status, form_data: {} }])
      .select()
      .single()

    if (rErr || !registration) {
      console.error('[E2E] Failed to create registration', rErr)
      process.exit(1)
    }

    console.log('[E2E] Created registration', registration.id)

    // send email via nodemailer
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS
    if (user && pass && participant.owner_email) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user, pass },
      })

      const html = `<p>Testowy e-mail E2E — status: ${status}</p><p>Wydarzenie: ${ev.title}</p>`
      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM ?? `Dogdex <${user}>`,
        to: participant.owner_email,
        subject: `Dogdex E2E test - ${status}`,
        html,
      })
      console.log('[E2E] Email sent:', info.response ?? info.messageId ?? info)
    } else {
      console.log('[E2E] Skipping email (no SMTP credentials or owner_email)')
    }

    process.exit(0)
  } catch (err) {
    console.error('[E2E] Error', err)
    process.exit(1)
  }
})()

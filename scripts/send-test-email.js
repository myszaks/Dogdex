(async () => {
  try {
    try { require('dotenv').config({ path: '.env.local' }) } catch {}
    const nodemailer = require('nodemailer')

    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS
    if (!user || !pass) {
      console.error('[Email Test] SMTP_USER or SMTP_PASS not set in env')
      process.exit(1)
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user, pass },
    })

    const to = process.env.SMTP_TEST_TO ?? user

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM ?? `Dogdex <${user}>`,
      to,
      subject: 'Dogdex — test SMTP',
      html: `<p>To jest testowy e-mail wysłany z konfiguracji SMTP (Dogdex).</p>`,
    })

    console.log('[Email Test] Sent OK:', info.response ?? info.messageId ?? info)
  } catch (err) {
    console.error('[Email Test] Failed to send:', err)
    process.exit(1)
  }
})()

# Konfiguracja e-maili – Resend lub Nodemailer

Aplikacja ma gotową integrację w `lib/email.ts`. Wystarczy skonfigurować jeden z poniższych providerów.

---

## Opcja A: Resend (zalecane – masz już konto)

### 1. Zainstaluj SDK (opcjonalnie – obecna impl. używa natywnego fetch, SDK nie jest wymagany)

```bash
npm install resend
```

### 2. Pobierz API Key

1. Zaloguj się na [resend.com](https://resend.com)
2. Idź do **API Keys** → **Create API Key**
3. Skopiuj klucz

### 3. Zweryfikuj domenę nadawcy

1. W panelu Resend: **Domains** → **Add Domain**
2. Dodaj wymagane rekordy DNS (SPF, DKIM) u swojego dostawcy domeny
3. Poczekaj na weryfikację (zwykle kilka minut)

> Bez własnej domeny możesz testować wysyłając **tylko na swój zarejestrowany adres** (ograniczenie sandbox Resend).

### 4. Dodaj zmienne środowiskowe

W `.env.local`:

```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@twojadomena.pl
```

Na Vercel / innym hostingu dodaj te same zmienne w panelu deployment.

### 5. Gotowe

Żadnych zmian w kodzie. `lib/email.ts` używa już Resend przez natywny fetch.

---

## Opcja B: Nodemailer (własny SMTP / Gmail)

### 1. Zainstaluj

```bash
npm install nodemailer
npm install --save-dev @types/nodemailer
```

### 2. Dodaj zmienne środowiskowe

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=twoj@gmail.com
SMTP_PASS=twoje-haslo-aplikacji
SMTP_FROM=Dogdex <twoj@gmail.com>
```

> Dla Gmaila użyj **App Password** (nie zwykłego hasła): konto Google → Bezpieczeństwo → Hasła do aplikacji.

### 3. Zastąp implementację w `lib/email.ts`

Zamień całą funkcję `sendRegistrationEmail` na:

```ts
import nodemailer from 'nodemailer'

export async function sendRegistrationEmail(payload: RegistrationEmailPayload): Promise<void> {
  const host = process.env.SMTP_HOST
  if (!host) {
    if (process.env.NODE_ENV === 'development') console.log('[Email] SMTP not configured')
    return
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
  })

  const statusText =
    payload.status === 'confirmed'
      ? '✅ Twój zapis został potwierdzony!'
      : '📝 Twój zapis został przyjęty i oczekuje na potwierdzenie.'

  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? 'Dogdex <noreply@dogdex.pl>',
    to: payload.to,
    subject: payload.status === 'confirmed'
      ? `✅ Zapis potwierdzony – ${payload.eventTitle}`
      : `📝 Przyjęto zapis – ${payload.eventTitle}`,
    html: `<p>${statusText}</p><p>Pies: <b>${payload.dogName}</b></p><p>Wydarzenie: <b>${payload.eventTitle}</b></p>`,
  })
}
```

---

## Testowanie lokalnie

Możesz użyć [Mailpit](https://mailpit.axllent.org/) jako lokalnego SMTP catcha:

```bash
# Windows (scoop)
scoop install mailpit

# lub Docker
docker run -p 1025:1025 -p 8025:8025 axllent/mailpit
```

Ustaw w `.env.local`:

```env
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
SMTP_FROM=test@dogdex.pl
```

Maile widoczne na `http://localhost:8025`.

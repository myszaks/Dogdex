# Phase 2: Implementacja - Status

## ✅ Ukończone

### 1. **Email System** 📧
- ✅ `lib/email.ts` – 4 nowe funkcje:
  - `sendTrainingBookingConfirmation()` – potwierdzenie rezerwacji (user)
  - `sendTrainingBookingToTrainer()` – powiadomienie o nowej rezerwacji (trainer)
  - `sendTrainingReminder()` – przypomnienie dzień przed (user)
  - `sendTrainingCancellationEmail()` – anulacja (user + trainer)

### 2. **Stripe Checkout Integration** 💳
- ✅ `POST /api/training-bookings` – zmodyfikowany:
  - Tworzy Stripe Checkout session gdy trainer ma `stripe_account_id`
  - Zwraca `checkoutUrl` w response
  - Wysyła confirmation email do usera
  - Wysyła notification email do trenera
  - Zapisuje `training_payments` record

### 3. **Stripe Webhook Handler** 🪝
- ✅ `POST /api/webhooks/stripe/route.ts` – nowy:
  - Obsługuje `checkout.session.completed` → zmienia booking status na `confirmed`
  - Obsługuje `checkout.session.async_payment_failed` → zmienia payment status na `failed`
  - Obsługuje `charge.refunded` → zmienia payment status na `refunded`
  - Weryfikuje webhook signature

### 4. **Booking Confirmation Emails** 📤
- ✅ `PATCH /api/training-bookings/[id]` – zmodyfikowany:
  - Wysyła email do usera gdy trainer potwierdzi
  - Wysyła email do trenera gdy user anuluje
  - Wysyła email do usera gdy trainer anuluje

### 5. **Environment Variables** 🔐
- ✅ `.env.local` – dodane zmienne:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_PUBLISHABLE_KEY`
  - `STRIPE_CLIENT_ID`
  - `STRIPE_WEBHOOK_SECRET`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - `NEXT_PUBLIC_APP_URL`

---

## 🚀 Co teraz zrobić (Setup & Testing)

### 1. Zainstaluj Stripe SDK
```bash
npm install
```

### 2. Pobierz Stripe keys
1. Wejdź na https://dashboard.stripe.com
2. Przejdź do **Settings → API keys** → kopiuj `Secret key` (sk_test_...)
3. Przejdź do **Settings → Connect settings** → kopiuj `Client ID` (ca_...)
4. Przejdź do **Webhooks → Create endpoint**:
   - Endpoint URL: `https://twoja-domena.com/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_failed`, `charge.refunded`
   - Kopiuj **Signing secret** (whsec_...)

### 3. Konfiguruj .env.local
```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_CLIENT_ID=ca_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Deploy schema.sql (jeśli nie zrobiłeś jeszcze)
```
Supabase Dashboard → SQL Editor → new query
Wklej supabase/schema.sql → RUN
```

### 5. Restart dev server
```bash
npm run dev
```

---

## 📱 Testing Checklist

### Flow: Booking with Payment
1. **Zaloguj się jako user**
2. Wejdź `/trainings` → kliknij trenera
3. Zarezerwuj trening → powinien być `checkoutUrl` w response
4. **Powinnaś dostać email**: Potwierdzenie rezerwacji ✅
5. **Trainer powinien dostać email**: Powiadomienie o nowej rezerwacji ✅
6. Kliknij "Zarezerwuj" na formie
7. Redirect do Stripe Checkout (jeśli trainer ma Stripe)
8. Wpisz test card: `4242 4242 4242 4242`, dowolna data/CVC
9. Po płatności → webhook → booking `status='confirmed'`
10. **Sprawdź**: `/moje-treningi` powinien pokazywać `confirmed`

### Flow: Trainer Confirmation (bez Stripe)
1. Jeśli trainer **nie ma** Stripe → booking jest `pending`
2. Trainer wejdzie do `/trainer/bookings`
3. Kliknij "Potwierdź"
4. User dostaje email "Trening potwierdzony" ✅

### Flow: Cancellation
1. User anuluje z `/moje-treningi`
2. Trainer dostaje email o anulacji ✅
3. Lub trainer anuluje z `/trainer/bookings`
4. User dostaje email o anulacji ✅

---

## 📊 Architecture Overview

```
User rezerwuje trening
        ↓
POST /api/training-bookings
        ├─→ Tworzy booking (status=pending)
        ├─→ Email do usera: potwierdzenie
        ├─→ Email do trenera: powiadomienie
        └─→ Stripe session (jeśli trainer.stripe_account_id)
        ↓
Frontend redirects do Stripe Checkout
        ↓
User płaci kartą (test: 4242...)
        ↓
Stripe webhook: POST /api/webhooks/stripe
        ├─→ Zmienia booking.status = 'confirmed'
        └─→ Zmienia payment.status = 'completed'
        ↓
[Opcjonalnie] Trainer dodatkowo potwierdza
        ├─→ PATCH /api/training-bookings/[id]
        └─→ Email do usera: potwierdzenie
```

---

## 🔧 Troubleshooting

### Email nie przychodzą
- Sprawdź SMTP_USER, SMTP_PASS w .env.local
- Sprawdzę czy maile są w "spam" folderze

### Webhook nie działa (localhost)
- Lokalnie webhooks nie mogą być testowane
- Użyj **Stripe CLI**:
  ```bash
  stripe listen --forward-to localhost:3000/api/webhooks/stripe
  stripe trigger checkout.session.completed
  ```

### Checkout session error
- Sprawdź czy trainer.stripe_account_id jest ustawiony
- Sprawdź czy STRIPE_SECRET_KEY jest poprawny
- Sprawdź browser console (F12) na błędy

### Booking się nie tworzy
- Sprawdź czy booking conflict detection działą (double-booking)
- Sprawdzę terminal output na błędy SQL

---

## 📝 Co zostało

**Phase 3 (Future)**:
- [ ] Trainer analytics/dashboard (revenue, booking stats)
- [ ] User reviews for trainers
- [ ] Cancellation buffer (24h before)
- [ ] SMS reminders
- [ ] Integration z Google Calendar
- [ ] Refund processing
- [ ] Payment reconciliation reports

---

## 🎯 Summary

**Phase 2 to:**
1. ✅ Email notifications (4 templates)
2. ✅ Stripe Checkout integration
3. ✅ Webhook payment confirmation
4. ✅ Booking confirmation flow
5. ✅ Cancellation notifications

**Teraz jest gotowe do testowania!** 🚀

# Phase 2 ✅ KOMPLETNA – Action Plan

## 🎯 Co zostało zaimplementowane

### Email System ✅
- 4 email templates dla treningów (rezerwacja, powiadomienie trenera, anulacja, reminder)
- Integracja z Nodemailer + Gmail SMTP (istniejący setup)
- Auto-wysyłanie emaili w key moments (rezerwacja, confirm, anulacja)

### Payment Processing ✅
- Stripe Checkout integration w POST `/api/training-bookings`
- Automatyczne tworzenie Stripe session gdy trainer ma `stripe_account_id`
- Return `checkoutUrl` dla frontend redirect
- Webhook handler `/api/webhooks/stripe` do potwierdzenia płatności
- Automatyczne zmianę booking status na `confirmed` po płatności

### Booking Confirmations ✅
- Email do usera o rezerwacji
- Email do trenera o nowej rezerwacji
- Email do usera po potwierdzeniu trenera
- Email do obu przy anulacji

### UI Updates ✅
- Booking form redirects do Stripe Checkout gdy potrzebna płatność
- `/moje-treningi` pokazuje success message po płatności
- Status badges (pending, confirmed, cancelled)

---

## 🚀 TODO: Setup & Deployment (30 min)

### 1️⃣ Pobierz Stripe Keys (5 min)
```
https://dashboard.stripe.com/
→ Settings → API Keys → Secret Key (sk_test_...)
→ Settings → Connect Settings → Client ID (ca_...)
→ Webhooks → Create Endpoint
  URL: https://twoja-domena.com/api/webhooks/stripe
  Events: checkout.session.completed, checkout.session.async_payment_failed, charge.refunded
  → Kopiuj Signing Secret (whsec_...)
```

### 2️⃣ Update .env.local (2 min)
```bash
STRIPE_SECRET_KEY=sk_test_YOUR_KEY
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY
STRIPE_CLIENT_ID=ca_YOUR_CLIENT_ID
STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000  # lub production URL
```

### 3️⃣ Install Dependencies (2 min)
```bash
npm install
```

### 4️⃣ Deploy Schema (2 min) – JEŚLI JESZCZE NIE ZROBIŁEŚ
```
Supabase Dashboard
→ SQL Editor
→ New Query
→ Wklej: supabase/schema.sql
→ RUN
```

### 5️⃣ Restart Dev Server (1 min)
```bash
npm run dev
```

### 6️⃣ Test Stripe Connect (2 min)
```
Zaloguj się jako trainer (organizer role)
→ /trainer/profile
→ Kliknij "Połącz konto Stripe"
→ Powinien redirect do Stripe OAuth
→ Po powrocie powinien pokazać "stripe_onboarded = true"
```

---

## 📱 Manual Testing Flow (15 min)

### Test 1: Paid Training with Payment
```
1. Zaloguj się jako USER
2. Wejdź /trainings → wybierz trenera
3. Wybierz typ, datę, godzinę
4. Kliknij "Zarezerwuj trening"
5. ✅ Powinnaś otrzymać email: "Rezerwacja treningu"
6. ✅ Trainer powinien otrzymać email: "Nowa rezerwacja"
7. → Redirect do Stripe Checkout (jeśli trainer ma Stripe)
8. Wpisz test card:
   - Numer: 4242 4242 4242 4242
   - Data: 12/25
   - CVC: 123
9. ✅ Po checkout → /moje-treningi z success message
10. ✅ Booking status = "confirmed"
11. ✅ Payment status = "completed" (w DB)
```

### Test 2: Free Training (No Stripe)
```
1. Jeśli trainer NIE ma Stripe
2. Booking tworzy się ze status="pending"
3. Trainer wejdzie do /trainer/bookings
4. Kliknij "Potwierdź"
5. ✅ User dostaje email: "Trening potwierdzony"
6. Booking status = "confirmed"
```

### Test 3: Cancellation
```
1. User wejdzie do /moje-treningi
2. Kliknij "Anuluj rezerwację"
3. ✅ Trainer dostaje email: "Anulacja rezerwacji"
4. Booking status = "cancelled"
5. Lub trainer anuluje z /trainer/bookings
6. ✅ User dostaje email: "Anulacja"
```

### Test 4: Webhooks (Production Only)
```
Webhook nie działa lokalnie na localhost.
Dla production:
- Webhook będzie automatycznie wywoływany przez Stripe
- Stripe → POST /api/webhooks/stripe
- Webhook zmienia booking.status = "confirmed"
```

---

## 🔧 Troubleshooting

| Problem | Rozwiązanie |
|---------|----------|
| Emaile nie przychodzą | Sprawdź SMTP_USER/PASS w .env.local; popatrz spam folder |
| Checkout session error | Sprawdź STRIPE_SECRET_KEY; trainer musi mieć stripe_account_id |
| Webhook nie works | Localhost webhooks nie działają; użyj Stripe CLI lub deploy do production |
| Booking się nie tworzy | Sprawdź double-booking conflict; spróbuj inny czas |
| User.email undefined | Sprawdź czy user zalogowany; email powinien być w JWT |

---

## 📊 Architecture Summary

```
User rezerwuje trening
        ↓
POST /api/training-bookings
  ├─ Sprawdź dostępność
  ├─ Stwórz booking (status=pending)
  ├─ Wyślij email do user + trainer
  └─ Jeśli trainer.stripe_account_id
      ├─ Stwórz Stripe Checkout session
      └─ Zwróć checkoutUrl
        ↓
Frontend redirects do Stripe
        ↓
User płaci (test card: 4242...)
        ↓
Stripe webhook: POST /api/webhooks/stripe
  ├─ Verify signature
  ├─ Update booking.status = 'confirmed'
  └─ Update payment.status = 'completed'
        ↓
/moje-treningi pokazuje success + booking confirmed
```

---

## 🎓 Files Changed in Phase 2

### Created
- ✅ `/app/api/webhooks/stripe/route.ts` – webhook handler
- ✅ `/PHASE2_COMPLETION.md` – documentation

### Modified
- ✅ `/app/api/training-bookings/route.ts` – payment logic + emails
- ✅ `/app/api/training-bookings/[id]/route.ts` – confirmation emails
- ✅ `/app/trainings/[id]/book/[typeId]/page.tsx` – checkout redirect
- ✅ `/app/moje-treningi/page.tsx` – payment success message
- ✅ `/lib/email.ts` – 4 new email functions
- ✅ `/.env.local` – Stripe variables
- ✅ `/package.json` – stripe ^14.0.0

---

## ✨ Next Steps (Phase 3+)

- [ ] Trainer analytics dashboard
- [ ] User reviews for trainers
- [ ] Cancellation buffer (e.g., 24h before)
- [ ] SMS notifications
- [ ] Google Calendar integration
- [ ] Refund processing
- [ ] Invoice generation
- [ ] Email templates customization

---

## 🎉 You're Ready!

Phase 2 jest kompletna. System jest gotowy do testowania.

**Next:** Run `npm install` → Update .env.local → npm run dev → Test flow

**Questions?** Check:
- docs/TRAININGS_SETUP.md – initial setup guide
- PHASE2_COMPLETION.md – detailed Phase 2 info
- PHASE2_ACTION_PLAN.md – this file

Good luck! 🚀

# Plan: Payment Gateway via Stripe Connect

## TL;DR
Integracja bramki płatniczej z modelem marketplace opartym na Stripe Connect (Standard connected accounts + Direct Charges). Organizator podłącza własne konto Stripe, uczestnik płaci bezpośrednio na konto organizatora, organizator płaci opłatę Stripe (~1.5% + €0.25). Platforma nie pobiera prowizji na start (architektura gotowa do późniejszego dodania application_fee). Płatność jest blocking — rejestracja potwierdzana dopiero po sukcesie płatności.

---

## Decisions
- **Provider**: Stripe Connect (Standard accounts + Direct Charges)
- **Who pays Stripe fee**: Organizator (charge na connected account)
- **Platform fee**: 0% na start; `application_fee_amount` gotowy w kodzie jako konfigurowalny parametr
- **Onboarding**: Stripe Connect OAuth (Standard) — organizer łączy pełne konto Stripe
- **Payment timing**: Blocking — Stripe Checkout po zapisie, potwierdzenie dopiero po sukcesie
- **Refunds**: Manualne — organizer inicjuje zwrot z panelu
- **Polish payments**: Stripe obsługuje BLIK, P24, karty — brak potrzeby alternatywnego providera

---

## Phase 1: Foundations

1. **Migration `add_stripe_connect.sql`**: `ALTER TABLE profiles ADD COLUMN stripe_account_id text; ADD COLUMN stripe_onboarded boolean DEFAULT false`
2. **Migration `add_payments_table.sql`**: Tabela `payments(id, registration_id, amount, currency, stripe_session_id, stripe_payment_intent_id, status [pending/completed/failed/refunded], created_at, updated_at)`
3. **`npm install stripe`** + `@stripe/stripe-js` (Stripe SDK)
4. **`types/index.ts`**: Dodaj `stripe_account_id: string | null; stripe_onboarded: boolean` do Profile; dodaj `Payment` interface
5. **`lib/stripe.ts`**: Stripe client: `new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-11-20.acacia' })`
6. **`.env.local`** (+ `.env.example` update): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CLIENT_ID`, `NEXT_PUBLIC_APP_URL`

## Phase 2: Organizer Onboarding (Stripe Connect OAuth)

*Depends on Phase 1*

7. **`app/api/stripe/connect/route.ts`** (GET): Generuje Stripe Connect OAuth URL (`https://connect.stripe.com/oauth/authorize?client_id=...&redirect_uri=...`), redirectuje organizatora
8. **`app/api/stripe/callback/route.ts`** (GET): Przyjmuje `?code=...`, wywołuje `stripe.oauth.token(code)` → dostaje `stripe_user_id`, zapisuje do `profiles` (`stripe_account_id`, `stripe_onboarded=true`), redirectuje do `/profile`
9. **`app/profile/ProfileClient.tsx`**: Dla użytkowników z rolą `organizer` — sekcja "Płatności" z przyciskiem "Połącz konto Stripe" (link do `/api/stripe/connect`) lub status "Konto Stripe połączone ✓" gdy `stripe_onboarded`

## Phase 3: Payment in Registration Flow

*Depends on Phase 1*

10. **`app/api/registrations/route.ts`** (POST): Po utworzeniu rejestracji, gdy `event.entry_fee > 0`:
    - Pobierz `organizer.stripe_account_id` z profiles (via `event.created_by`)
    - Jeśli organizer nie ma połączonego konta → zapis normalny (pending), brak płatności
    - Utwórz Stripe Checkout Session: direct charge na connected account (`Stripe-Account` header), `payment_method_types: ['card', 'blik', 'p24']`, success/cancel URLs, `metadata: { registration_id }`
    - Utwórz rekord w `payments` (status: pending, stripe_session_id)
    - Zwróć `{ registrationId, checkoutUrl }` zamiast tylko `{ id }`
11. **`components/RegisterForm.tsx`**: Jeśli response zawiera `checkoutUrl` → `window.location.href = checkoutUrl` (redirect do Stripe Checkout)
12. **`app/register/[eventId]/success/page.tsx`** (new): Strona powrotu z Stripe (`?session_id=...`), weryfikuje status sesji, wyświetla "Zapis potwierdzony, płatność przetworzona"
13. **`app/register/[eventId]/cancel/page.tsx`** (new): Strona powrotu po anulowaniu w Stripe, wyświetla "Płatność anulowana — Twój zapis oczekuje"

## Phase 4: Stripe Webhook

*Depends on Phase 2 + Phase 3*

14. **`app/api/webhooks/stripe/route.ts`** (POST):
    - Weryfikacja podpisu: `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)`
    - `checkout.session.completed` + `payment_status: 'paid'` → pobierz `registration_id` z metadata, UPDATE `registrations.status = 'confirmed'`, UPDATE `payments.status = 'completed'` + `stripe_payment_intent_id`, wyślij email potwierdzający
    - `checkout.session.async_payment_failed` → UPDATE `payments.status = 'failed'`
    - **Ważne**: raw body (`await req.text()`) wymagane do weryfikacji podpisu — nie używaj `req.json()`

## Phase 5: Organizer Refund Panel

*Depends on Phase 4*

15. **`app/api/payments/[id]/refund/route.ts`** (POST): Sprawdź właścicielstwo (organizator eventu), wywołaj `stripe.refunds.create({ payment_intent: ... }, { stripeAccount: organizer.stripe_account_id })`, UPDATE `payments.status = 'refunded'`
16. **`app/organizer/events/[eventId]/registrations/`**: Dodaj kolumnę "Płatność" (status: opłacone/oczekuje/zwrócone) + przycisk "Zwróć płatność" (tylko gdy `payment.status = 'completed'`)

## Phase 6: User View

*Depends on Phase 4*

17. **`app/moje-zapisy/page.tsx`**: Pokaż status płatności przy każdym zapisie (np. "Oczekuje na płatność" z linkiem do ponownego płacenia, lub "Opłacone")

---

## Relevant Files

- `supabase/migrations/add_stripe_connect.sql` — nowa
- `supabase/migrations/add_payments_table.sql` — nowa
- `lib/stripe.ts` — nowa
- `types/index.ts` — dodaj do Profile + nowy Payment interface
- `app/api/stripe/connect/route.ts` — nowa
- `app/api/stripe/callback/route.ts` — nowa
- `app/api/webhooks/stripe/route.ts` — nowa
- `app/api/registrations/route.ts` — modyfikacja POST
- `app/api/payments/[id]/refund/route.ts` — nowa
- `components/RegisterForm.tsx` — dodaj redirect do Stripe
- `app/profile/ProfileClient.tsx` — dodaj sekcję Connect
- `app/register/[eventId]/success/page.tsx` — nowa
- `app/register/[eventId]/cancel/page.tsx` — nowa
- `app/organizer/events/[eventId]/registrations/` — dodaj payment status + refund btn
- `app/moje-zapisy/page.tsx` — dodaj payment status

---

## Verification

1. Uruchom obie migracje SQL w Supabase (profiles + payments table)
2. Utwórz Stripe Connect application w Stripe Dashboard, skonfiguruj redirect URI
3. Dodaj env vars (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CLIENT_ID`, `NEXT_PUBLIC_APP_URL`)
4. Test onboardingu: zaloguj jako organizer → `/profile` → "Połącz konto Stripe" → Stripe OAuth → powrót → `stripe_onboarded=true` w DB
5. Stwórz wydarzenie z `entry_fee = 25` z połączonym organizatorem
6. Zarejestruj uczestnika → sprawdź redirect do Stripe Checkout
7. Użyj testowej karty Stripe `4242 4242 4242 4242` → weryfikuj `registrations.status = confirmed` + `payments.status = completed`
8. W panelu organizatora kliknij "Zwróć płatność" → weryfikuj refund w Stripe Dashboard + `payments.status = refunded`
9. Test edge case: organizator bez połączonego konta Stripe → zapis działa normalnie (bez płatności)
10. Skonfiguruj Stripe webhook endpoint w Stripe Dashboard: `{NEXT_PUBLIC_APP_URL}/api/webhooks/stripe`, events: `checkout.session.completed`, `checkout.session.async_payment_failed`

---

## Further Considerations

1. **Edge case: organizer bez Stripe**: Gdy event ma entry_fee ale organizer nie podłączył Stripe — zapis jest `pending` bez płatności. Można blokować tworzenie eventów z entry_fee dopóki Stripe nie podłączony, lub pozwolić i informować uczestnika o płatności przelewem. Rekomendacja: informacja ostrzegawcza w panelu organizatora.
2. **Ponowna próba płatności**: Gdy uczestnik wyjdzie z Stripe bez płacenia — rejestracja zostaje `pending`. Potrzebna możliwość ponownego wejścia na stronę płatności. Warto przechowywać `stripe_session_url` w payments i dać link "Dokończ płatność" w `moje-zapisy`.
3. **Przyszłe application_fee**: Parametr `application_fee_amount` powinien być wyliczany z konfigurowalnej stałej (np. `PLATFORM_FEE_PERCENT=0` w env). Dzięki temu zmiana na prowizję wymaga tylko zmiany env var.

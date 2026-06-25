# Treningi Indywidualne – Instrukcja Wdrażania

## ✅ Co zostało zrobione

Pełna implementacja systemu rezerwacji treningów indywidualnych z następującymi elementami:

### 📊 Baza danych
- ✅ 5 nowych tabel w Supabase:
  - `trainer_profiles` – wizytówki trenerów
  - `training_types` – rodzaje treningów (agility, behawiorystyka, itp)
  - `training_availability` – dostępne dni i godziny
  - `training_bookings` – rezerwacje treningów (z double-booking protection)
  - `training_payments` – rejestracja płatności
- ✅ Stripe Connect columns w `profiles` table
- ✅ Row-level security (RLS) policies

### 🔌 API Routes (18 endpoints)

**Public/User:**
- `GET /api/trainers` – lista aktywnych trenerów
- `GET /api/trainers/[id]` – profil trenera + jego typy treningów
- `POST /api/training-bookings` – rezerwacja (z walidacją dostępności)
- `GET /api/training-bookings` – moje rezerwacje

**Trainer Management:**
- `GET/POST /api/trainer-profile` – edycja profilu
- `GET/POST /api/training-types` – zarządzanie typami
- `DELETE /api/training-types/[id]`
- `POST /api/training-availability` – ustawianie dostępności
- `DELETE /api/training-availability`
- `GET /api/training-availability/list` – lista dostępności
- `GET/PATCH /api/training-bookings/[id]` – szczegóły rezerwacji + confirm/reject

**Stripe Connect:**
- `GET /api/stripe/connect` – redirect do Stripe OAuth
- `GET /api/stripe/callback` – pobierz token i zapisz do profilu

### 🎨 UI Pages

**For Users:**
- `/trainings` – lista trenerów (karty z foto, miastem, ceną)
- `/trainings/[id]` – profil trenera + lista typów treningów
- `/trainings/[id]/book/[typeId]` – rezerwacja z kalendarzem (14 dni, godziny 30-minutowe)
- `/moje-treningi` – moje rezerwacje (nadchodzące + historia)

**For Trainers:**
- `/trainer` – dashboard (statystyki, linki szybkie)
- `/trainer/profile` – edycja profilu + Stripe Connect button
- `/trainer/types` – zarządzanie typami treningów (CRUD)
- `/trainer/availability` – ustawianie dostępności (dzień + czas)
- `/trainer/bookings` – lista rezerwacji (confirm/reject pending)

### 🧭 Navigation
- ✅ Nowy link "Treningi indywidualne" w bocznym panelu (dla zalogowanych użytkowników)

### 💾 TypeScript Types
- ✅ Kompletne interfejsy dla: TrainerProfile, TrainingType, TrainingAvailability, TrainingBooking, TrainingPayment

---

## 🚀 Jak wdrożyć

### 1. **Deploy do Supabase** (jedna raz)
```sql
-- Wejdź do Supabase Dashboard → SQL Editor
-- Skopiuj zawartość supabase/schema.sql
-- Uruchom całość
```

### 2. **Zainstaluj Stripe SDK**
```bash
npm install
```

### 3. **Skonfiguruj zmienne środowiskowe** (.env.local)
```
# Istniejące (powinny być)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Dodaj dla Stripe Connect:
STRIPE_SECRET_KEY=sk_test_... (z Stripe Dashboard)
STRIPE_CLIENT_ID=ca_... (z Stripe Dashboard → Settings → Connect)
STRIPE_WEBHOOK_SECRET=whsec_... (z Stripe Dashboard → Webhooks, opcjonalnie na start)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... (jeśli będziesz osadzać Stripe na froncie)
```

### 4. **Zrestartuj dev server**
```bash
npm run dev
```

---

## 📝 Testowanie

### User Flow (Regular User):
1. Zaloguj się (lub zarejestruj)
2. Kliknij "Treningi indywidualne" w panelu bocznym
3. Kliknij na kartę trenera
4. Kliknij na typ treningu
5. Wybierz datę i godzinę (będą wyświetlane tylko dostępne sloty)
6. Kliknij "Zarezerwuj trening"
7. Przejdź do "Moje treningi" aby zobaczyć rezerwację

### Trainer Flow (Organizer with Trainer Profile):
1. Zaloguj się jako organizator (role: 'organizer')
2. Wejdź do `/trainer` (panel trenera)
3. Kliknij "Edytuj profil"
   - Wypełnij dane (imię, opis, miasto, cena/h)
   - **Kliknij "Połącz konto Stripe"** – przeniesie Cię do Stripe OAuth
   - Po powrocie – profil będzie zaznaczony jako "stripe_onboarded = true"
   - Zaznacz "Profil aktywny" aby pojawić się w liście dla użytkowników
4. Kliknij "Rodzaje treningów" i dodaj kilka typów (np. Agility, Behawiorystyka)
5. Kliknij "Dostępność" i dodaj dostępne dni/godziny dla każdego typu
6. Kliknij "Rezerwacje" aby zobaczyć przychodzące rezerwacje
   - Kliknij "Potwierdź" lub "Odrzuć"

---

## ❌ Co jeszcze trzeba zrobić (Phase 2+)

### Płatności (Stripe Checkout)
- [ ] Payment creation w `/api/training-bookings` POST
- [ ] Redirect do Stripe Checkout
- [ ] Webhook `/api/webhooks/stripe` do confirmation po `checkout.session.completed`
- [ ] Payment display w UI
- [ ] Refund endpoint

### Emaile
- [ ] Potwierdzenie rezerwacji (user + trainer)
- [ ] Przypomnienie dzień przed (user)
- [ ] Anulacja (user + trainer)
- [ ] Wiadomość o potwierdzeniu (trainer → user)

### Rozszerzenia
- [ ] Rating/Reviews trenerów
- [ ] Analytics dla trenerów
- [ ] Cancellation buffer (np. 24h before)
- [ ] SMS notifications
- [ ] Integration z Google Calendar
- [ ] Multi-dog families (pokazać psy użytkownika w rezerwacji)
- [ ] Trainer search/filter (miasto, specjalizacja, cena)

---

## 🔑 Ważne Notatki

1. **Double-booking prevention**: Formularz rezerwacji automatycznie weryfikuje konflikty. Jeśli slot zajęty → error 409
2. **RLS Security**: Użytkownicy mogą widzieć tylko:
   - Aktywne profile trenerów
   - Aktywne typy treningów
   - Swoje rezerwacje lub rezerwacje dla ich typów (jeśli trainer)
3. **Stripe Connect Architecture**: Gotowa pod marketplace model:
   - Trainer ma `stripe_account_id`
   - Platforma NIE pobiera prowizji na start
   - `application_fee_amount` może być później dodane w checkout session
4. **Trainer vs Organizer**: Trainer = organizer z `trainer_profiles` record. Może mieć zarówno eventy jak i treningi

---

## 📞 Support

Jeśli coś nie działa:
1. Sprawdź czy tabele są w Supabase (SQL Editor → Tables)
2. Sprawdź env vars
3. Sprawdź browser console (F12) na błędy
4. Sprawdź Supabase logs

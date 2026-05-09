# 🐾 Dogdex

Platforma do organizacji psich zawodów, eventów i spacerów — instalowalna jako PWA na telefonie.

## Stack

| Warstwa | Technologia |
|---|---|
| Frontend + Backend | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Baza danych | Supabase (PostgreSQL) |
| Realtime | Supabase Realtime (websocket) |
| Deploy | Vercel (frontend) + Supabase (DB) |
| Mobile | PWA — instalacja przez przeglądarkę |

## Funkcje

### Publiczne
- **Strona główna** – lista nadchodzących wydarzeń
- **Archiwum** – zakończone zawody z wynikami i zdjęciami
- **Formularz zapisu** – zapis na wybrane wydarzenie
- **Live wyniki** – tabela wyników aktualizowana na żywo (realtime)

### Panel Organizatora
- Tworzenie i edycja wydarzeń (z datą, lokalizacją, statusem)
- Podgląd i zarządzanie zapisami (potwierdzanie / anulowanie)
- Wpisywanie i edycja wyników uczestników
- Link do widoku live

## Szybki start

### 1. Instalacja zależności

```bash
npm install
```

### 2. Konfiguracja Supabase

1. Utwórz darmowy projekt na [supabase.com](https://supabase.com)
2. Skopiuj `.env.local.example` → `.env.local` i uzupełnij:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=twoj-anon-key
SUPABASE_SERVICE_ROLE_KEY=twoj-service-role-key
```

3. W Supabase → **SQL Editor** → wklej i uruchom zawartość `supabase/schema.sql`

### 3. Uruchomienie dev

```bash
npm run dev
```

Otwórz: [http://localhost:3000](http://localhost:3000)

### 4. Build produkcyjny

```bash
npm run build
npm start
```

## Struktura projektu

```
app/
├── page.tsx                             # Home – nadchodzące wydarzenia
├── archive/
│   ├── page.tsx                         # Lista archiwalnych wydarzeń
│   └── [eventId]/page.tsx               # Szczegóły + wyniki wydarzenia
├── register/[eventId]/page.tsx          # Formularz zapisu
├── live/[eventId]/page.tsx              # Widok live wyników
├── organizer/
│   ├── page.tsx                         # Dashboard organizatora
│   └── events/
│       ├── new/page.tsx                 # Tworzenie nowego wydarzenia
│       └── [eventId]/
│           ├── edit/                    # Edycja wydarzenia
│           ├── registrations/page.tsx   # Zarządzanie zapisami
│           └── results/page.tsx         # Wpisywanie wyników
└── api/
    ├── events/route.ts                  # GET lista, POST nowe
    ├── events/[id]/route.ts             # GET, PATCH, DELETE
    ├── registrations/route.ts           # GET lista, POST nowy zapis
    ├── registrations/[id]/route.ts      # PATCH status
    └── results/route.ts                 # GET lista, POST/PUT wyniki

components/
├── Navigation.tsx              # Topbar + bottom nav mobile
├── RegisterForm.tsx            # Formularz zapisu uczestnika
├── LiveResults.tsx             # Live tabela z realtime websocket
├── ResultsForm.tsx             # Panel organizatora – wpisywanie wyników
└── RegistrationStatusButton.tsx # Przycisk zmiany statusu zapisu

lib/
├── supabaseClient.ts   # Klient Supabase (przeglądarka)
├── supabaseServer.ts   # Klient Supabase (serwer / API routes)
└── utils.ts            # Formatowanie dat, czasów, statusów

types/
└── index.ts            # Typy TypeScript (DogEvent, Registration, Result...)

supabase/
└── schema.sql          # Schemat bazy danych + RLS + dane przykładowe
```

## Deploy na Vercel

```bash
# 1. Zainstaluj Vercel CLI
npm i -g vercel

# 2. Deploy
vercel

# 3. Dodaj zmienne środowiskowe w Vercel Dashboard:
#    NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```

## PWA – instalacja na telefonie

1. Otwórz aplikację w **Chrome** (Android) lub **Safari** (iOS)
2. Android: menu ⋮ → „Dodaj do ekranu głównego"
3. iOS: przycisk udostępniania → „Dodaj do ekranu głównego"

> Aplikacja działa jak natywna — pełnoekranowo, bez paska przeglądarki.

## Ikony PWA

Dodaj pliki `public/icon-192.png` i `public/icon-512.png` (np. logo Dogdex).
Możesz wygenerować ikony na [maskable.app](https://maskable.app/editor).

## Bezpieczeństwo

- `SUPABASE_SERVICE_ROLE_KEY` używany wyłącznie po stronie serwera (API routes)
- RLS włączone na wszystkich tabelach — odczyt publiczny, zapis przez service role
- Walidacja danych wejściowych w każdym API route
- Dozwolone wartości statusów sprawdzane (allowlist)
- Kolumna `form_data` przechowuje kopię zapisu dla audytu

## Roadmap (następne kroki)

- [ ] Supabase Auth (logowanie organizatora e-mail / magic link)
- [ ] Role-based access (tylko organizator może tworzyć/edytować eventy)
- [ ] Zdjęcia w archiwum (upload do Supabase Storage)
- [ ] Eksport listy uczestników do CSV/PDF
- [ ] Powiadomienia push (potwierdzenie zapisu)
- [ ] Dynamiczne szablony formularzy (custom pola per event)
- [ ] Heaty / serie startowe
- [ ] Aplikacja natywna przez Capacitor (App Store / Google Play)

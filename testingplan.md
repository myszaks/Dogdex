# Plan testów – Dogdex

## Wybór technologii

| Warstwa | Narzędzie | Uzasadnienie |
|---|---|---|
| Runner / assertions | **Vitest** | Natywna obsługa ESM i TypeScript, szybszy od Jest, kompatybilne API (`describe/it/expect`) |
| DOM environment | **jsdom** | Pełniejsza implementacja DOM niż happy-dom, wymagana przez RTL |
| Komponenty React | **@testing-library/react** + **@testing-library/user-event** | Standard dla App Router; testuje zachowanie, nie implementację |
| Mocking HTTP (fetch) | **msw v2** | Mock Service Worker – przechwytuje `fetch()` w testach komponentów |
| Coverage | **@vitest/coverage-v8** | Wbudowany provider, bez dodatkowej konfiguracji |
| Matcher extensions | **@testing-library/jest-dom** | `toBeInTheDocument()`, `toHaveValue()` itd. |

**Nie testujemy:** `page.tsx` (Next.js server components – wymagałyby osobnego harnessu), `proxy.ts`, `MapPicker` (leaflet ssr:false), `GalleryUploader`/`ImageCropUploader` (File API).

---

## Faza 1 – Konfiguracja środowiska *(blokuje wszystko)*

1. Zainstaluj devDependencies:
   ```
   vitest @vitest/ui @vitest/coverage-v8
   @testing-library/react @testing-library/user-event @testing-library/jest-dom
   jsdom msw
   ```
2. Utwórz `vitest.config.ts` — `environment: 'jsdom'`, `globals: true`, `setupFiles`, resolve alias `@/*` (z tsconfig), coverage provider v8, threshold 70%
3. Utwórz `__tests__/setup.ts` — importuj `@testing-library/jest-dom`, mockuj globalnie `next/navigation` (`useRouter`, `useParams`, `usePathname`) i `next/headers` (`cookies`, `headers`)
4. Utwórz `__tests__/mocks/supabase.ts` — fabryka `createMockSupabase(overrides?)` mockująca fluent chain Supabase (`.from().select().eq().single()` itd.)
5. Utwórz `__tests__/mocks/msw-handlers.ts` — domyślne handlery MSW dla `/api/*`
6. Dodaj do `package.json`: `"test": "vitest"`, `"test:ui": "vitest --ui"`, `"test:coverage": "vitest run --coverage"`

---

## Faza 2 – Testy jednostkowe: `lib/` *(równolegle z Fazą 3)*

### `__tests__/lib/utils.test.ts`
Pure functions, zero zewnętrznych deps:
- `toSlug`: polskie litery (ą→a, ę→e), znaki specjalne, max 80 znaków, lowercase
- `formatDate` / `formatDateShort`: polski format (`12 maja 2026`)
- `formatTime`: `0 → "0.00 s"`, `12340 → "12.34 s"`, wartości null/undefined
- `statusLabel` / `statusColor`: wszystkie 5 statusów (upcoming, ongoing, finished, cancelled, archived)
- `isRegistrationOpen`: deadline null → true, deadline przyszły → true, deadline przeszły → false
- `effectiveStatus`: `upcoming` + deadline minął → `'upcoming_closed'`; pozostałe bez zmian

### `__tests__/lib/email.test.ts`
Mock `nodemailer` przez `vi.mock('nodemailer')`:
- `sendRegistrationEmail`: weryfikuj `to`, `subject`, obecność imienia psa i statusu w HTML
- `sendEventChangeEmail`: HTML zawiera `changed_fields` (data, lokalizacja)
- `sendScheduleEmail`: HTML zawiera `slot_time` w formacie HH:mm, `slot_date` po polsku

### `__tests__/lib/eventTypes.test.ts`
- Każdy typ ma `id`, `label`, `defaultFields[]`
- Każde pole ma `id`, `label`, `type`

---

## Faza 3 – Testy integracyjne: API routes *(równolegle z Fazą 2)*

Wzorzec: `vi.mock('lib/supabaseServer')` + `vi.mock('lib/getServerUser')`, wywołanie handlera z `new Request(url, { method, body })`.

### `__tests__/api/registrations/post.test.ts` — *krytyczne reguły biznesowe*
- Duplikat (email + dogName case-insensitive) → `409`
- `max_participants` osiągnięty (pending+confirmed) → `409`
- `auto_confirm=true` → `status='confirmed'`, `=false` → `status='pending'`
- Brakujący wymagany parametr → `400`
- Sukces → `sendRegistrationEmail` wywołany (spy)

### `__tests__/api/registrations/export.test.ts`
- `Content-Type: text/csv`, `Content-Disposition: attachment`
- Pierwsza linia CSV zawiera `Lp,Właściciel,Email,Pies,Rasa,Status`
- Pola z cudzysłowami poprawnie escapowane (`"`)
- Dynamiczne `form_data` pola dołączone do nagłówka

### `__tests__/api/events/post.test.ts`
- Brak `title` → `400`
- Gdy slug zajęty → slug z sufixem `-2`; przy kolejnym konflikcie → `-3`
- Rola `user` (nie organizer) → `403`

### `__tests__/api/events/patch.test.ts`
- Zmiana `start_at` → `changed_fields` zawiera `'start_at'`, email wysłany
- Zmiana tylko `description` → email NIE wysłany
- `status → 'finished'` + `results_public=true` → `results_public` ustawione na `false`
- Nie-właściciel → `403`, właściciel → `200`

### `__tests__/api/events/start-index.test.ts`
- `action='next'` przy indeksie 5 → 6
- `action='prev'` przy indeksie 0 → zostaje 0
- `action='set', value=3` → ustawia 3
- Brak uprawnień → `403`

### `__tests__/api/events/send-schedule.test.ts`
- Wysyła email tylko do `confirmed` z `time_slot_id !== null`
- Pomija `pending` i rejestracje bez slotu
- Aktualizuje `schedule_sent_at` po sukcesie
- Opcjonalny `registrationIds[]` zawęża wysyłkę

### `__tests__/api/admin/users.test.ts`
- Próba degradacji ostatniego admina → `400`
- Zmiana roli gdy jest ≥2 adminów → `200`
- Rola `organizer` → `403`

---

## Faza 4 – Testy komponentów RTL *(depends on Faza 1)*

### `__tests__/components/RegisterForm.test.tsx` *(msw mock `/api/registrations`)*
- Renderuje pola z `form_fields` eventu (wymagane i opcjonalne)
- Puste wymagane pole przy submit → komunikat walidacji
- Submit z danymi → `POST /api/registrations` z poprawnym body
- Odpowiedź `409` → wyświetla komunikat o duplikacie
- Odpowiedź `201` → wyświetla ekran potwierdzenia

### `__tests__/components/ResultsForm.test.tsx` *(msw mock `/api/results`)*
- Renderuje tabelę uczestników z polami `time_ms`, `rank`, `notes`
- Kliknięcie "Auto-rank" → sortuje po czasie, przypisuje kolejne rangi
- Kliknięcie "Zapisz" przy wypełnionym wierszu → `POST /api/results`
- Po sukcesie → wyświetla badge "Zapisano"

### `__tests__/components/LiveStartPanel.test.tsx` *(mock Supabase Realtime)*
- Renderuje uczestnika na pozycji `initialStartIndex`
- Pokazuje 2 kolejnych uczestników
- Symulacja Realtime `postgres_changes` → panel aktualizuje wyświetlanego uczestnika

---

## Wszystkie pliki do stworzenia

| Plik | Typ |
|---|---|
| `vitest.config.ts` | konfiguracja |
| `__tests__/setup.ts` | konfiguracja |
| `__tests__/mocks/supabase.ts` | mock helper |
| `__tests__/mocks/msw-handlers.ts` | mock helper |
| `__tests__/lib/utils.test.ts` | jednostkowy |
| `__tests__/lib/email.test.ts` | jednostkowy |
| `__tests__/lib/eventTypes.test.ts` | jednostkowy |
| `__tests__/api/registrations/post.test.ts` | integracyjny |
| `__tests__/api/registrations/export.test.ts` | integracyjny |
| `__tests__/api/events/post.test.ts` | integracyjny |
| `__tests__/api/events/patch.test.ts` | integracyjny |
| `__tests__/api/events/start-index.test.ts` | integracyjny |
| `__tests__/api/events/send-schedule.test.ts` | integracyjny |
| `__tests__/api/admin/users.test.ts` | integracyjny |
| `__tests__/components/RegisterForm.test.tsx` | komponentowy |
| `__tests__/components/ResultsForm.test.tsx` | komponentowy |
| `__tests__/components/LiveStartPanel.test.tsx` | komponentowy |

**Modyfikacje:** `package.json` (devDependencies + scripts)

---

## Weryfikacja

1. `npm run test` — wszystkie testy przechodzą zielono
2. `npm run test:coverage` — coverage ≥70% na `lib/`, API routes
3. `npm run build` — bez błędów TypeScript po dodaniu typów testów
4. `npm run test:ui` — wizualizacja wyników w przeglądarce

---

## Decyzje

- **Vitest zamiast Jest** — lepszy ESM/TypeScript, szybszy build
- **jsdom** — wymagany przez RTL, pełniejszy od happy-dom
- **msw v2** tylko w testach komponentów; testy API handlers — bezpośrednie wywołanie handlerów (bez HTTP)
- **Supabase mockowany statycznie** (`vi.mock`) — brak real DB w testach
- **Nie testujemy page.tsx** — server components wymagają e2e (Playwright) — osobny sprint
- **E2E (Playwright)** — poza zakresem tego planu

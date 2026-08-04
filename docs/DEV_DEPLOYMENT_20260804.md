# Wdrożenie zmian z 4 sierpnia 2026

## Stan sprawdzony na bazie development

Audyt został wykonany przez `npm run db:dev:audit` z użyciem połączenia
`DOGDEX_DEV_DATABASE_URL` z lokalnego pliku `.env.database.local`.

- tabele listy rezerwowej i komunikatów istnieją;
- funkcje przydzielania miejsca z listy rezerwowej istnieją;
- `pg_cron`, `pg_net` i `supabase_vault` są dostępne;
- cron `event-registration-notifications-every-5-minutes` jest aktywny, a pięć
  ostatnich wykonań zakończyło się powodzeniem;
- Vault zawiera `dogdex_cron_secret` oraz `dogdex_site_url` ustawiony na
  `https://develop.dogdex.pro`;
- brakuje tabeli `review_reports`, kolumn moderacji i odpowiedzi w tabelach
  opinii oraz funkcji atomowego pobierania komunikatów;
- w bazie są dwie opinie o treningach i obie dotyczą zakończonych rezerwacji;
- baza nie prowadzi tabeli `supabase_migrations.schema_migrations`, dlatego stan
  ustalamy po obiektach schematu, a nie po historii numerów migracji.

## Jedyna migracja do wgrania na development

W Supabase Dashboard projektu developerskiego otwórz **SQL Editor**, wklej całą
zawartość poniższego pliku i uruchom ją jeden raz:

```text
supabase/migrations/20260804150000_add_review_safety.sql
```

Migracja jest idempotentna. Dodaje bezpieczeństwo opinii, zgłoszenia i
moderację, a istniejące poprawne opinie oznacza domyślnie jako zweryfikowane i
opublikowane. Dodaje też blokadę dostarczeń komunikatów, której używa kod tego
wydania.

Po wykonaniu uruchom lokalnie:

```powershell
npm run db:dev:audit
```

W wyniku powinny pojawić się `review_reports`, wszystkie kolumny bezpieczeństwa
opinii, `validate_review_report_target`, `claim_event_announcement_deliveries`
oraz kolumna `event_announcement_deliveries.claimed_at`.

## Ustawienia poza migracją

### Vercel development

- `NEXT_PUBLIC_SITE_URL=https://develop.dogdex.pro`
- `CRON_SECRET` musi być identyczny jak sekret `dogdex_cron_secret` w Vault
  developerskiego Supabase;
- `SUPABASE_SERVICE_ROLE_KEY` musi wskazywać ten sam projekt developerski;
- ustawienia SMTP muszą wskazywać skrzynkę używaną przez development.

Nie dodawaj zadania do `vercel.json`. Harmonogram działa w Supabase Cron.
Po ustawieniu zmiennych wdróż najpierw tę wersję aplikacji. Nowy plik logo
znajduje się w `public/brand/dogdex-email-logo.png` i nie będzie dostępny na
domenie developerskiej, dopóki zmiany nie zostaną wdrożone.

### Supabase development

- **Authentication → URL Configuration → Site URL**:
  `https://develop.dogdex.pro`;
- do **Redirect URLs** dodaj co najmniej
  `https://develop.dogdex.pro/auth/callback` oraz
  `https://develop.dogdex.pro/reset-password`;
- po wdrożeniu otwórz
  `https://develop.dogdex.pro/brand/dogdex-email-logo.png` i sprawdź w
  narzędziach sieciowych, czy odpowiedź ma status `200` oraz nagłówek
  `Content-Type: image/png`; odpowiedź `text/html` oznacza, że nadal działa
  wcześniejsze wdrożenie albo strona błędu;
- dopiero wtedy w **Authentication → Email Templates** wklej wszystkie pliki z
  `supabase/email-templates/` i ustaw tematy z `subjects.json`;
- nie zamieniaj zmiennych takich jak `{{ .ConfirmationURL }}`, `{{ .Email }}`,
  `{{ .Phone }}`, `{{ .Provider }}` czy `{{ .FactorType }}` na przykładowe dane;
- włącz używane powiadomienia bezpieczeństwa Auth.

### Produkcja

Na produkcji zastosuj nowe migracje w kolejności numerów. Ustaw odpowiednio
`NEXT_PUBLIC_SITE_URL`, Supabase **Site URL** i sekret Vault `dogdex_site_url` na
`https://dogdex.pro`. Produkcja musi mieć własny `CRON_SECRET`; nie kopiuj
sekretu z developmentu. Te same szablony Auth trzeba wkleić także do projektu
produkcyjnego, ponieważ pliki w repozytorium nie aktualizują automatycznie
hostowanego Supabase.

Przed uruchomieniem crona produkcyjnego sprawdź SPF, DKIM i DMARC domeny
nadawczej oraz wykonaj test wszystkich szablonów Auth i wiadomości aplikacyjnych.

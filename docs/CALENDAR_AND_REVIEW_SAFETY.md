# Eksport do kalendarza i bezpieczeństwo opinii

## Google Calendar

Dogdex otwiera w niewielkim oknie Google Calendar gotowy formularz wydarzenia bez OAuth i bez dostępu do kalendarza użytkownika. Użytkownik sam zatwierdza zapis po stronie Google. Jeśli przeglądarka zablokuje popup, formularz otworzy się w bieżącej karcie.

- `/api/calendar/google/events/:id` — publiczny termin wydarzenia,
- `/api/calendar/google/registrations/:id` — prywatny termin konkretnego zapisu; wymaga zalogowania i sprawdza właściciela zapisu,
- `/api/calendar/google/trainings/:id` — prywatny termin treningu; dostępny klientowi, trenerowi i administratorowi.

W przypadku zapisu wielodniowego użytkownik trafia na ekran z wybranymi przez siebie dniami i dodaje je osobno. Bez OAuth Google Calendar nie udostępnia mechanizmu utworzenia kilku niezależnych wydarzeń jednym kliknięciem.

## Bezpieczeństwo opinii

Opinię nadal może wystawić tylko osoba z potwierdzonym udziałem w zakończonym wydarzeniu albo ukończonym treningu. Publiczne opinie otrzymują oznaczenie „Potwierdzony udział”.

Dodatkowe zabezpieczenia:

- jedna opinia na wydarzenie użytkownika lub rezerwację treningu,
- zapis, edycja i usuwanie wyłącznie przez serwerowe API; bez bezpośredniej mutacji tabel z klienta,
- publiczne profile i średnie ocen uwzględniają tylko opinie o statusie `published`,
- organizator lub trener może opublikować jedną odpowiedź pod opinią,
- zalogowany użytkownik może zgłosić cudzą opinię z określonym powodem,
- administrator rozpatruje zgłoszenia w `/admin/reviews` i może opinię ukryć, usunąć z publikacji, przywrócić albo odrzucić zgłoszenie,
- opinie i zgłoszenia pozostają w bazie jako ślad decyzji moderacyjnej.

## Wdrożenie bazy

Należy zastosować migrację:

`supabase/migrations/20260804150000_add_review_safety.sql`

Jest to jedyna migracja brakująca obecnie na bazie developerskiej. Oprócz
bezpieczeństwa opinii dodaje atomowe pobieranie komunikatów uczestników, aby
równoległe wykonania nie wysyłały duplikatów. Nie są wymagane nowe zmienne
środowiskowe ani zadania cron.

# Lista rezerwowa i komunikaty wydarzenia

## Lista rezerwowa

Lista rezerwowa jest dostępna dla wydarzeń z ustawionym limitem uczestników.
Po wyczerpaniu miejsc formularz zapisów zmienia się w formularz dołączenia do
kolejki. Dane uczestnika, psa oraz odpowiedzi formularza są zachowywane, ale na
tym etapie nie jest pobierana płatność.

Gdy zwolni się miejsce:

1. pierwsza oczekująca osoba otrzymuje wyłączną propozycję miejsca;
2. miejsce jest dla niej zarezerwowane przez 12 godzin;
3. potwierdzenie tworzy właściwy zapis i, jeśli wydarzenie jest płatne,
   uruchamia dotychczasowy proces Stripe Checkout;
4. odrzucenie albo wygaśnięcie propozycji przekazuje miejsce następnej osobie.

Aktywne propozycje wliczają się do limitu wydarzenia. Operacje pojemności są
serializowane w PostgreSQL, dlatego równoczesne zapisy i potwierdzenia nie mogą
przydzielić jednego miejsca kilku osobom.

Organizator widzi kolejkę w zakładce **Zapisy**. Użytkownik widzi swój status na
publicznej stronie wydarzenia i może samodzielnie usunąć psa z kolejki.

## Komunikaty do uczestników

Panel komunikatów znajduje się w podsumowaniu workspace wydarzenia. Organizator
wybiera jedną z grup:

- potwierdzeni uczestnicy;
- oczekujący i potwierdzeni;
- osoby na liście rezerwowej.

Adresy są deduplikowane, więc osoba zapisana z kilkoma psami otrzymuje jeden
e-mail zawierający listę psów. Każdy odbiorca ma osobny rekord dostarczenia.
Wysłane komunikaty są widoczne na stronie wydarzenia tylko dla ich odbiorców.
Rekordy są atomowo rezerwowane przez proces wysyłający, dzięki czemu równoległe
wykonanie crona i wysyłka bezpośrednio z panelu nie pobiorą tej samej wiadomości.

Pierwszych 20 wiadomości jest przetwarzanych bezpośrednio po publikacji.
Pozostałe oczekują w kolejce i są wysyłane przez istniejący Supabase Cron.
Panel organizatora pokazuje liczbę odbiorców, dostarczonych wiadomości i błędów.
Nieudane dostarczenie jest ponawiane przez cron maksymalnie trzy razy.

## Automatyzacja

Istniejące zadanie Supabase Cron wywołujące co pięć minut endpoint
`/api/event-registration-notifications` obsługuje teraz trzy kolejki:

- powiadomienia o rozpoczęciu zapisów;
- propozycje miejsc z listy rezerwowej;
- oczekujące dostarczenia komunikatów.

Nie trzeba tworzyć kolejnego zadania cron. Nadal wymagane są sekrety
`dogdex_site_url`, `dogdex_cron_secret` oraz odpowiadający im `CRON_SECRET` w
Vercel.

## Migracja

Zastosuj migrację:

```text
supabase/migrations/20260804120000_add_event_waitlist_and_announcements.sql
```

Migracja tworzy tabele, indeksy, RLS oraz funkcje atomowego przydzielania miejsc.
Uzupełniająca blokada dostarczeń znajduje się w migracji
`20260804150000_add_review_safety.sql`, która jest częścią tego samego wydania.

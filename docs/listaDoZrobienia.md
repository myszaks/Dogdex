# Lista do zrobienia

- Wzory maili wysyłane do użytkowników.

## P1 — istotne problemy UX

- Strona wydarzenia i formularz zapisu nie pokazują, czy wydarzenie jest bezpłatne, płatne ani czy wymaga akceptacji.
- Po wysłaniu zapisu formularz po prostu znika. Brakuje jednoznacznego potwierdzenia, a przycisk nadal pokazuje „Zapisz się”.
- Formularz wydarzenia każe ręcznie wpisać psa i rasę mimo zapisanych profili psów.
- Podgląd płatnego wydarzenia pokazuje tylko „Cena za wybrane terminy”, bez cen poszczególnych dat i sumy.
- Na formularzu rezerwacji treningu przed kliknięciem nie ma podsumowania ceny. Cena pojawia się dopiero w Stripe.
- Dashboard płatności pokazuje godziny w UTC: trening zarezerwowany na 14:00 widniał jako 12:00.
- Eksport CSV działa, ale dla treningów pola klient, pies i e-mail są puste.
- Główny panel trenera w „Nadchodzących rezerwacjach” pokazuje stare anulowane terminy, przez co świeżo opłacona rezerwacja może być niewidoczna.
- „Uzgodnij ze Stripe” nie daje wyraźnego potwierdzenia zakończenia operacji.

## P2 — kosmetyka

- Po logowaniu okno przez chwilę pozostaje otwarte ze stanem „Logowanie…”.
- Na stronach regularnie pojawia się pojedynczy błąd 404 zasobu w konsoli.
- Są napisy bez polskich znaków: „Dostepnosc”, „Oczekujace”, „Odrzuc”, „Ukonczone”.
- Konfiguracja osobnych cen za daty jest mało odkrywalna — opcja pojawia się dopiero po dodaniu pola wyboru dat i pierwszego terminu.

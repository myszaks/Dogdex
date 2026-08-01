# Audyt płatności — 1 sierpnia 2026

## Wynik końcowy

- Audyt zakończony: **56/56 kontroli zaliczonych, 0 znalezisk, 0 błędów wykonania**.
- Identyfikator końcowego przebiegu: `b9603c7e`.
- Hotfix atomowego czyszczenia grafiku został zastosowany na dev DB.
- Istniejący wcześniej artefakt QA oraz wszystkie niespójne przypisania anulowanych zapisów zostały usunięte.

## Środowisko i metoda

- Deployment: `develop.dogdex.pro`, chroniony Vercel Automation Bypass.
- Baza: dev Supabase; zgodność projektu potwierdzona uwierzytelnioną sesją QA.
- Stripe: tryb testowy, połączone konta organizatora i trenera.
- Role: użytkownik, organizator i trener logowani osobnymi kontami QA.
- Każdy przebieg wygaszał otwarte Checkouty, zwracał pozostałe środki testowe i usuwał własne rekordy z dev DB.

## Zaliczony zakres

### Wydarzenia

- bezpłatne wydarzenie z automatycznym potwierdzeniem;
- bezpłatne wydarzenie z akceptacją organizatora;
- odrzucenie i akceptacja wniosku o rezygnację;
- częściowa oraz pełna rezygnacja z wielu dat;
- płatność za pojedynczy zapis (`flat`) i osobne ceny dat (`per_date`);
- płatność po automatycznej akceptacji i link po ręcznej akceptacji;
- anulowanie oczekującego Checkoutu i zwolnienie zapisu;
- częściowy oraz pełny zwrot Stripe;
- usuwanie z grafiku wyłącznie zwróconej daty przy zwrocie częściowym;
- usuwanie wszystkich przypisań grafiku przy zwrocie pełnym;
- odporność na ponowne wykonanie webhooka lub uzgodnienia;
- uzgadnianie płatności ze Stripe;
- kontrola statusów zapisów, pozycji płatności, refundów i wniosków.

### Treningi indywidualne

- bezpłatna rezerwacja;
- płatna rezerwacja i utworzenie Checkoutu;
- anulowanie oczekującej płatności;
- płatność i zwrot po anulowaniu przez użytkownika;
- płatność i zwrot po anulowaniu przez trenera;
- ponowne wykorzystanie zwolnionego terminu;
- wygaśnięcie Checkoutu po stronie Stripe i późniejsze uzgodnienie blokady;
- kontrola par statusów rezerwacja–płatność;
- odrzucenie operacji bez uwierzytelnienia lub właściwej roli.

## Hotfix i naprawa danych

Procedura `complete_event_refund` atomowo aktualizuje teraz stan płatności i zapisu oraz czyści `schedule_assignments`:

- przy częściowym zwrocie usuwa przypisania wyłącznie dla zwróconych dat;
- przy pełnym zwrocie usuwa wszystkie przypisania danego zapisu;
- powtórzenie webhooka lub uzgodnienia ponownie wykonuje bezpieczne czyszczenie, nie naliczając zwrotu drugi raz.

Migracja zawiera również jednorazową naprawę istniejących danych. Po jej wykonaniu na dev DB:

- przypisania grafiku dla anulowanych zapisów: 0;
- przypisania dla dat niewystępujących już w zapisie: 0;
- wcześniejszy artefakt QA z 30 lipca 2026: usunięty.

Osobny rzeczywisty test Stripe potwierdził płatność, dwa częściowe zwroty i końcowy stan `refunded/cancelled` bez pozostałości w grafiku.

## Ograniczenia audytu

- Sesje Checkout były tworzone i wygaszane przez rzeczywiste Stripe API. Płatności testowe wykonywano przez PaymentIntent na połączonym koncie i finalizowano tą samą procedurą domenową co webhook; nie automatyzowano wpisywania karty w hostowanym interfejsie Stripe.
- Przepływy wysyłające e-mail zakończyły się powodzeniem po stronie API, ale audyt nie logował się do skrzynek odbiorczych, aby potwierdzić dostarczenie każdej wiadomości.
- Lokalne zmiany interfejsu P1/P2 nie były jeszcze wdrożone. Migracja hotfixu została natomiast zastosowana bezpośrednio na dev DB i była objęta końcowym audytem.

## Wniosek

Audyt płatności jest zamknięty bez zastrzeżeń w opisanym zakresie: wszystkie testowane przepływy płatności, zwrotów, rezygnacji, uzgadniania i sprzątania danych zakończyły się poprawnie, a końcowy przebieg nie pozostawił artefaktów.

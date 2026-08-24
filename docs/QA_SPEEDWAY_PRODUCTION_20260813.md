# QA Speedway production — 2026-08-13

Branch: `qa/speedway-production`
Środowisko danych: Supabase DEV `jkeikxygsmqqauhrrnxm`
Zakres: desktop, pełny flow eventu Speedway, smoke, API, Realtime i UI.

## Podsumowanie

- Testy automatyczne po poprawkach i integracji z `master`: **87/87 zaliczone** (`17/17` plików).
- TypeScript: **zaliczony** po usunięciu starego cache `.next` z innego brancha.
- Build produkcyjny: **zaliczony**.
- ESLint: **zaliczony bez błędów**; pozostały `133` ostrzeżenia istniejącego długu technicznego.
- Transakcyjny event QA: `codex-qa-speedway-flow-20260813`.
- UI sprawdzono w przeglądarce aplikacji przy szerokości viewportu `1294 px`.
- Dane testowe utworzono wyłącznie w DEV i usunięto po zakończeniu audytu.

## Status poprawek — 2026-08-13

Wszystkie defekty aplikacyjne opisane w tym raporcie zostały naprawione lokalnie na branchu `qa/speedway-production`:

- publiczny live i `GET /api/results` używają kontrolowanego odczytu serwerowego oraz zwracają wyłącznie jawnie wybrane pola bez adresów e-mail,
- publiczne trasy i API nie ujawniają eventów `draft`, nawet zanim zostaną zaostrzone polityki PROD,
- brak `SUPABASE_SERVICE_ROLE_KEY` powoduje jednoznaczny błąd konfiguracji zamiast cichego przejścia na rolę `anon` i pustych ekranów,
- strony odprawy, wyników, zapisów, edycji, grafiku i wprowadzania wyników wymagają właściwej roli oraz właściciela eventu (admin zachowuje dostęp),
- endpointy wyników, zapisów, eksportu, kolejności i grafiku weryfikują właściciela oraz powiązanie event–zgłoszenie–uczestnik; dystans do obliczenia prędkości pochodzi z bazy, a nie z payloadu klienta,
- DNS/DNF pozostają niesklasyfikowane i nie otrzymują medalu ani wyróżnienia zwycięzcy,
- modal zapisu ma semantykę dialogu, pułapkę fokusu, zamknięcie przez Escape i poprawne etykiety pól,
- obcięte dane listy zapisów mają podpowiedzi z pełną wartością,
- ESLint 9 / Next 16 ma działającą konfigurację.

Przygotowano migrację `supabase/migrations/20260813195213_harden_production_event_rls.sql`, która:

- usuwa publiczny dostęp do PII w `participants`, `registrations` i `schedule_assignments`,
- ogranicza tworzenie i obsługę `cancellation_requests` do właściciela zgłoszenia oraz managera właściwego eventu,
- uzależnia odczyt publiczny eventów i wyników od statusu oraz `results_public`,
- ogranicza mutacje organizatora do eventów, których jest właścicielem,
- odbiera rolom `anon` i `authenticated` historyczne uprawnienia `TRUNCATE`, `TRIGGER` i `REFERENCES`, pozostawiając tylko potrzebne operacje,
- dodaje indeksy wspierające warunki RLS.

**Migracja nie została zastosowana ani do DEV, ani do PROD.** Wymaga osobnej, jednoznacznej zgody na zmianę schematu oraz wdrożenia po wcześniejszym uruchomieniu poprawionego kodu z prawidłowym `SUPABASE_SERVICE_ROLE_KEY`.

### Finalna weryfikacja

- `npm test`: **87/87**, `17/17` plików,
- `npm run typecheck`: **zaliczony**,
- `npm run lint`: **0 błędów**, `133` ostrzeżenia,
- `npm run build`: **zaliczony** na Next.js `16.3.0`,
- odczytowy smoke finalnego builda z realną PROD DB:
  - strona główna i event `speedway-na-zakonczenie-lata` renderują się poprawnie,
  - brak poziomego overflow,
  - modal zapisu ma prawidłowe ARIA i etykiety oraz zamyka się przez Escape,
  - `GET /api/results` zwraca `200` i poprawne puste `[]` dla eventu bez wyników,
  - wszystkie sprawdzone strony organizatora bez sesji zwracają `307 → /`,
  - konsola przeglądarki nie zgłosiła błędów ani ostrzeżeń.

Nie wykonywano zapisów, edycji ani usuwania danych w PROD.

## Zaliczone testy flow

1. Utworzenie eventu Speedway przez konto organizatora — `201`.
2. Automatyczne dodanie i ochrona pól systemowych:
   - `height_cm`,
   - `sport_class`.
3. Edycja eventu: status `ongoing`, dystans toru `50 m`, faza `run1` — `200`.
4. Przygotowanie sześciu potwierdzonych zgłoszeń reprezentujących klasy:
   - XS,
   - S,
   - M,
   - L,
   - CHART,
   - SPORT.
5. Odprawa wszystkich sześciu zgłoszeń — `6/6`, każdy endpoint `200`.
6. Zapis wyników obu przejazdów — wszystkie sześć wywołań `201`.
7. Obsługa `DNS` i `DNF` bez czasu na poziomie danych — poprawny `best_ms = null` i brak miejsca.
8. Wyliczenie najlepszego czasu i prędkości dla toru 50 m:
   - XS: `5050 ms`,
   - M: `4750 ms`, `37.89 km/h`,
   - L: `4550 ms`, `39.56 km/h`,
   - CHART: `4300 ms`, `41.86 km/h`,
   - SPORT: `4100 ms`, `43.90 km/h`.
9. Przeliczenie rankingów klasowych — `200`, pięć wyników sklasyfikowanych.
10. Walidacja niedozwolonej klasy startowej — `400`.
11. Edycja istniejącego wyniku — `200`, pola pochodne przeliczone.
12. Przejście indeksu startowego `0 → 1 → 0` — oba wywołania `200`.
13. Realtime tabeli `events`:
    - subskrypcja `SUBSCRIBED`,
    - aktualizacja indeksu odebrana,
    - indeks przywrócony do `0`.
14. Publiczny odczyt tabeli `results` przez RLS — sześć rekordów, bez błędu.
15. Realtime tabeli `results` — aktualizacja wyniku odebrana publicznie.
16. Utworzenie slotu harmonogramu — `201`.
17. Ochrona niezalogowanych mutacji — wyniki, indeks startowy, ranking, zapisy i harmonogram zwracają `401`.
18. Formularz tworzenia eventu po wybraniu typu Speedway poprawnie pokazuje blokadę pól klasyfikacji.

## Smoke tras

| Trasa | Wynik |
|---|---:|
| `/` | 200 |
| `/events/qa-speedway-pelny-flow-1785401098406` | 200 |
| `/register/qa-speedway-pelny-flow-1785401098406` | 200 |
| `/events/qa-speedway-pelny-flow-1785401098406/schedule` | 200 |
| `/live/qa5-speedway-klasy-1785435241875` | 200 |
| `/archive/qa5-speedway-klasy-1785435241875` | 200 |
| `/organizer` bez sesji | 307 → `/` |
| `/organizer/events/.../live-entry` bez sesji | 307 → `/` |

Sam kod odpowiedzi `200` publicznego live nie oznacza poprawnego renderowania — audyt UI ujawnił pustą zawartość opisaną jako P1.

## UI desktop

Sprawdzone ręcznie:

- publiczna strona wydarzenia,
- modal zapisu i natywna walidacja wymaganych pól,
- publiczny grafik i jego pusty stan,
- lista zapisów organizatora,
- odprawa sześciu klas,
- wprowadzanie wyników R1/R2, korekta oraz DNS/DNF,
- pełna lista wyników,
- publiczny live w fazie `run1`,
- publiczny live w fazie `podium`,
- publiczne archiwum,
- formularze tworzenia i edycji eventu Speedway,
- grafik organizatora.

Na sprawdzonych ekranach nie wykryto globalnego poziomego overflow ani nachodzenia komponentów przy `1294 px`. Kafelki zapisów celowo obcinają część tekstu; szczegóły opisano jako P3. Obrazy kafelków mapy wychodzą poza własne prostokąty techniczne, ale są prawidłowo przycinane przez kontener i nie poszerzają dokumentu.

## Weryfikacja względem PROD DB — 2026-08-13

Porównano wyłącznie odczytowo projekt DEV `jkeikxygsmqqauhrrnxm` z projektem PROD `zsixgysfiepxhwzccfja`.

Podstawowe kolumny Speedway używane przez ten branch są dostępne w obu bazach: `events.current_start_index`, `events.track_distance_m`, `events.live_phase`, `results.run1_ms`, `results.run2_ms`, `results.best_ms`, `results.speed_kmh`, `results.size_class`, `results.class_rank`, `results.run1_status`, `results.run2_status` oraz `registrations.checked_in`.

RLS i granty nie są jednak zgodne:

- DEV nie przyznaje roli `anon` dostępu do `participants` ani `registrations`; odczyt uczestnika wymaga użytkownika uwierzytelnionego i spełnienia `private.can_read_participant(id)`.
- PROD przyznaje roli `anon` `SELECT` do `participants` i `registrations`, a polityki `participants_public_read` oraz `registrations_public_read` mają warunek `true`.
- PROD ma również publiczne polityki odczytu `events`, `results` i `time_slots` z warunkiem `true`, podczas gdy DEV stosuje polityki zależne od widoczności eventu, właściciela lub zespołu.

W konsekwencji:

| Pozycja z audytu | PROD DB | Ocena po porównaniu |
|---|---|---|
| P1 — pusty publiczny Speedway live | Nie powinien wystąpić przy obecnych politykach PROD | Artefakt testu DEV: lokalny serwer miał klucz anon podstawiony jako `SUPABASE_SERVICE_ROLE_KEY`, a DEV blokuje anonimowy odczyt uczestników i zapisów. |
| P1 — medal dla DNS/DNF | Wystąpi | Błąd czysto frontendowy; medal jest nadawany według indeksu tablicy, niezależnie od `best_ms` i `class_rank`. |
| P2 — brak ochrony stron odprawy i wyników | Wystąpi, z większym wpływem | Brak `requireRole()` jest w kodzie. Ponieważ PROD publicznie udostępnia uczestników i zapisy, niezalogowany użytkownik może otrzymać więcej danych niż na DEV. |
| P2 — publiczny `GET /api/results` zwraca 500 | Nie powinien wystąpić przy obecnych politykach PROD | Artefakt DEV: PROD pozwala roli anon czytać `results` i zagnieżdżone `participants`. |
| P2 — dostępność formularza zapisu | Wystąpi | Semantyka HTML/ARIA jest niezależna od bazy. |
| P2 — konfiguracja lint | Wystąpi | Problem konfiguracji repozytorium, niezależny od bazy. |
| P3 — obcięte dane bez podpowiedzi | Wystąpi | Problem CSS/HTML, niezależny od bazy. |
| Ograniczenie testu zapisu i przypisania grafiku | Nie jest potwierdzonym błędem PROD | Test został zablokowany przez celowe użycie anon zamiast właściwego klucza serwisowego DEV. |

Ważne: brak pustego live oraz błędu API na PROD wynika obecnie z bardzo szerokiego publicznego odczytu danych, a nie z odpornego projektu endpointów. Nie należy kopiować tych luźnych polityk do DEV jako poprawki. Docelowo publiczny live/API powinny otrzymywać minimalny, jawnie wybrany zestaw danych przez bezpieczny widok, RPC albo kontrolowany odczyt serwerowy.

### Nowe P1 — rozjazd RLS ujawnia dane i osłabia izolację organizatorów na PROD

PROD ma aktywne RLS, ale polityki są istotnie luźniejsze od DEV:

- `events_public_read`, `participants_public_read`, `registrations_public_read`, `results_public_read` i `time_slots_public_read` używają warunku `true`; przy istniejących grantach anon pozwala to publicznie czytać eventy, uczestników, zgłoszenia, wyniki i sloty,
- polityki modyfikacji eventów, uczestników, zgłoszeń, wyników i slotów dla organizatora sprawdzają głównie `user_role()`, bez powiązania operacji z `created_by`, `is_event_manager(event_id)` albo uprawnieniem zespołowym.
- `cancellation_requests_organizer_update` na PROD sprawdza tylko globalną rolę organizatora, więc bezpośredni klient Supabase może modyfikować wniosek należący do innego eventu; przygotowana migracja wiąże odczyt, insert i update z właścicielem zgłoszenia lub managerem właściwego eventu.

W DEV ten obszar jest już wyraźnie zaostrzony przez kontrolę właściciela/managera i `private.can_read_participant`. Przed wdrożeniem brancha należy zsynchronizować PROD z docelowym modelem RLS poprzez przejrzane migracje. Nie wolno naprawiać pustego live przez ponowne publiczne otwieranie całych tabel zawierających dane uczestników.

## Defekty

### P1 w konfiguracji DEV — publiczny Speedway live jest pusty

**Korekta po porównaniu PROD:** defekt odtworzony na DEV przy zastąpieniu `service_role` kluczem anon; nie powinien odtworzyć się z obecną PROD DB, która pozwala anonimowo czytać `participants` i `registrations`.

`/live/[eventId]` pokazuje nagłówek wydarzenia, lecz nie renderuje zawodnika na starcie, kolejki, wyników ani podium. Błąd potwierdzono osobno dla `live_phase = run1` i `live_phase = podium`.

Strona serwerowa pobiera rejestracje z relacją `participants(...)`. Publiczny klient nie może odczytać tabeli `participants`, przez co lista `speedwayParticipants` jest pusta. `SpeedwayLiveView` kończy wtedy render przez `if (participants.length === 0) return null`. Należy udostępnić bezpieczny, ograniczony widok/RPC/API dla publicznych danych zawodników albo wykonać kontrolowany odczyt serwisowy po stronie serwera.

### P1 — DNS/DNF otrzymuje złoty medal w podsumowaniu klasy

W pośrednim ekranie wyników klasy zawodnik z `DNS` w R1 i `DNF` w R2, `best_ms = null` oraz `class_rank = null` otrzymuje złoty medal i żółte wyróżnienie pierwszego miejsca. Medal jest wybierany według indeksu tablicy, a nie ważnego rankingu. Ten sam ekran komunikuje „Oba przebiegi ukończone”, choć nie było ukończonego przejazdu.

Medale i wyróżnienia miejsc należy renderować wyłącznie dla rekordów z ważnym `best_ms` i `class_rank`; DNS/DNF powinny pozostać niesklasyfikowane.

### P2 — brak pełnej ochrony stron odprawy i wyników

`/organizer/events/[eventId]/checkin` oraz `/organizer/events/[eventId]/results` nie wywołują `requireRole()` i bez sesji zwracają `200`, podczas gdy pozostałe strony organizatora przekierowują `307`.

RLS ogranicza dane oraz API blokuje zapis, ale routing jest niespójny i pokazuje interfejs organizatora użytkownikowi bez właściwej roli. Strony powinny wymagać organizatora/admina oraz sprawdzać właściciela eventu lub uprawnienie zespołowe.

### P2 w konfiguracji DEV — publiczny `GET /api/results` zwraca 500

**Korekta po porównaniu PROD:** odpowiedź `500` jest specyficzna dla zaostrzonych grantów/polityk DEV i lokalnego braku prawdziwego klucza serwisowego. Z obecną PROD DB anonimowy join do `participants` jest dozwolony.

Zapytanie łączy `results` z `participants`, ale anonimowa rola może odczytać publiczne wyniki i nie może bezpośrednio odczytać `participants`. Wynik: `permission denied for table participants`.

To ten sam obszar uprawnień, który blokuje publiczny ekran live, ale endpoint wymaga osobnej korekty obsługi zapytania i błędu.

### P2 — formularz zapisu ma braki dostępności

- modal nie jest eksponowany jako `dialog`,
- pola „Imię psa” i „Rasa psa” są nazwane dla czytnika ekranu placeholderami,
- pole wzrostu jest spinbuttonem bez dostępnej nazwy.

Natywna walidacja pól wymaganych działa, lecz etykiety powinny być powiązane przez `label`/`htmlFor` lub `aria-labelledby`, a modal powinien mieć poprawną semantykę i zarządzanie fokusem.

### P2 — konfiguracja lint jest niesprawna

- `npm run lint` uruchamia usunięte w Next 16 polecenie `next lint`.
- Bezpośredni ESLint 9 nie znajduje `eslint.config.js`, `eslint.config.mjs` ani `eslint.config.cjs`.

### P3 — lista zapisów obcina istotne dane bez podpowiedzi

Przy desktopowym układzie czterech kolumn nazwy psów, rasy i adres e-mail są skracane przez `truncate`, ale elementy nie mają `title` ani alternatywnego sposobu odczytania pełnej wartości. Nie powoduje to overlapu, jednak utrudnia identyfikację uczestnika.

## Ograniczenie środowiskowe

### Pełny test publicznego zapisu i przypisania harmonogramu

Serwer QA został celowo uruchomiony z publicznym kluczem DEV także w miejscu `service_role`, aby wykluczyć przypadkowy dostęp do produkcji. Endpointy publicznego zapisu oraz przypisań harmonogramu używają klienta serwisowego, dlatego bez właściwego klucza DEV nie mogą ominąć RLS. Utworzenie slotu przeszło, przypisanie zwróciło `404`, ponieważ bez serwisowej roli endpoint nie odczytał zgłoszenia.

Testy integracyjne tych tras przeszły, ale pełny test transakcyjny wymaga `SUPABASE_SERVICE_ROLE_KEY` projektu DEV.

## Retest transakcyjny na DEV — 2026-08-13

Retest wykonano na branchu `qa/speedway-production` przeciwko projektowi `DogdexDev` (`jkeikxygsmqqauhrrnxm`). Użyto tymczasowego organizatora i osobnego wydarzenia testowego. SMTP został wyłączony w lokalnym procesie aplikacji, więc test nie wysyłał wiadomości do rzeczywistych skrzynek. Nie wykonywano zapisów do PROD.

Potwierdzone scenariusze:

1. Utworzenie wydarzenia Speedway przez UI z ręcznym zatwierdzaniem, wynikami publicznymi i grafikiem — poprawne.
2. Automatyczne dodanie nieusuwalnych pól `height_cm` i `sport_class` — poprawne.
3. Publiczna rejestracja sześciu zawodników klas XS, S, M, L, Chart i Sport — `201`, wszystkie zapisy oczekujące.
4. Ponowny zapis tego samego psa i e-maila — `409`.
5. Ręczne zatwierdzenie organizatora — 6/6 potwierdzonych.
6. Klasyfikacja Speedway na ekranie odprawy — wszystkie sześć klas poprawne.
7. Zbiorcza odprawa — 6/6, `checked_in = true`.
8. Utworzenie slotu grafiku, przypisanie uczestnika przez drag and drop i zapis przypisania — poprawne.
9. Publiczny grafik niezalogowanego użytkownika — dane osobowe ukryte, widoczna wyłącznie liczba wolnych miejsc.
10. Zmiana statusu wydarzenia na `ongoing` i zapis toru 50 m — poprawne.
11. Wprowadzenie dwóch przejazdów dla pięciu sklasyfikowanych zawodników oraz DNS/DNF dla klasy S — poprawne.
12. Przeliczenie najlepszych czasów, prędkości i rankingów — pięciu zwycięzców klas z `class_rank = 1`; DNS/DNF z `class_rank = null`.
13. Publiczne `GET /api/results` — `200`, sześć wyników, brak `owner_email`.
14. Publiczny live pokazał wszystkie wyniki; przełączenie na podium pojawiło się bez ręcznego odświeżania.
15. Zapis zalogowanego użytkownika został powiązany z jego `user_id`.
16. Użytkownik wysłał wniosek o anulowanie, a organizator zaakceptował go — zgłoszenie otrzymało status `cancelled`.
17. Trasy `/organizer` i `/organizer/.../results` bez sesji przekierowują `307` do `/`; chronione API zwraca `401`.
18. Brak błędów i ostrzeżeń w konsoli przeglądarki na końcowych ekranach organizatora i publicznego live.

Podczas retestu znaleziono i poprawiono rozpoznawanie istniejącej roli `organizer_trainer`. Przed poprawką konto z tą rolą było opisane jako „Nieznana rola” i przekierowywane z `/organizer`. Po poprawce ma etykietę „Organizator i trener”, widzi właściwą nawigację i otwiera panel organizatora. Wspólna kontrola uprawnień traktuje tę rolę jako sumę uprawnień organizatora i trenera, bez nadawania uprawnień administratora.

Weryfikacja po zmianach:

- `npm test` — 87/87 testów,
- `npm run typecheck` — bez błędów,
- `npm run build` — poprawny build produkcyjny,
- `npm run lint` — 0 błędów, 133 istniejące ostrzeżenia.

Po teście usunięto z DEV dokładnie wydarzenie testowe, jego 7 zgłoszeń, 7 uczestników, 6 wyników, slot i przypisanie grafiku, wniosek o anulowanie oraz tymczasowe konto organizatora. Końcowa kontrola zwróciła 0 pozostałych rekordów wydarzenia i uczestników testowych.

# Backlog rozwoju produktu

Pomysły odłożone po rozpoczęciu prac nad sportowym paszportem psa oraz dokumentami i automatyczną kwalifikacją na wydarzenia.

## Event Day 2.0

Status: moduł operacyjny zaimplementowany 2026-08-08.

- [x] Check-in uczestnika kodem QR.
- [x] Tryb słabego zasięgu/offline z późniejszą synchronizacją i idempotencją.
- [x] Inteligentna kolejność startów z zachowaniem kolejności w grupach odprawionych/nieodprawionych.
- [x] Powiadomienie e-mail uczestnika, że zbliża się jego start.
- [x] Uniwersalny adapter CSV do importu wyników z pomiaru czasu.
- [ ] Dedykowane adaptery i automatyczny streaming dla konkretnych producentów urządzeń.
- [ ] Natywne push/SMS zamiast lub obok kanału e-mail.

## Zajęcia grupowe, kursy i karnety

Status: moduł operacyjny dla trenera i uczestnika zaimplementowany 2026-08-08.

- [x] Serie cyklicznych treningów zamiast pojedynczych terminów.
- [x] Zamówienie/aktywacja karnetu oraz kontrola liczby wejść z historią użyć.
- [x] Lista obecności i oznaczanie odrabiania zajęć.
- [x] Stałe grupy szkoleniowe z limitem miejsc i listą rezerwową.
- [x] Płatność online Stripe Connect za kurs i karnet, z Checkout, webhookiem i wygasaniem rezerwacji.
- [x] Samoobsługowe pełne zwroty i uzgadnianie płatności kursów/karnetów.
- [x] Automatyczne przenoszenie pierwszej osoby z listy rezerwowej po rezygnacji.
- [x] Automatyczne rozliczanie wejścia z karnetu przy rezerwacji i opcjonalnie przy obecności grupowej.
- [x] Edycja i anulowanie kursu/harmonogramu oraz komunikacja e-mail ze stałą grupą.
- [x] Zamrażanie, przedłużanie, transfer i korekty salda karnetu z audytem.
- [x] Eksport CSV sprzedaży i przypomnienia o wygasających karnetach.
- [x] Kursy i karnety we wspólnym panelu płatności, ze szczegółami Stripe i ponawianiem nieudanego zwrotu.
- [x] Pełny panel uczestnika: harmonogram, obecności, historia wejść i korekt, płatności, status zwrotu oraz potwierdzenia Stripe.
- [x] Szczegółowa publiczna strona kursu oraz zasady rezygnacji widoczne i akceptowane przed zakupem.
- [x] Edycja notatki zapisu i zmiana psa przed płatnością oraz rozpoczęciem kursu.
- [x] Wnioski uczestnika o zamrożenie lub przedłużenie karnetu, rozpatrywane przez trenera z audytem i e-mailem.
- [x] Transfer karnetu wyłącznie w panelu trenera/organizatora, bez samoobsługowego transferu uczestnika.
- [ ] Zwroty częściowe wykorzystywanych karnetów według konfigurowalnej polityki trenera.

## Pakiet dokumentów organizatora

- Generowanie list startowych, kart ocen i numerów startowych do PDF.
- Eksport odprawy zawodników i list kontrolnych dla obsługi.
- Szablony dokumentów zależne od dyscypliny.
- Paczka do pobrania przed wydarzeniem i wersja gotowa do druku.

## Powiadomienia push i SMS

- Przypomnienie o zapisach, płatności i zbliżającym się starcie.
- Pilne komunikaty organizatora w dniu wydarzenia.
- Preferencje kanałów i zgody komunikacyjne użytkownika.
- Historia doręczeń oraz kontrola kosztów SMS.

## Dalsze etapy paszportu sportowego

- Publiczny, udostępnialny link do paszportu psa z kontrolą prywatności.
- Certyfikaty i dyplomy PDF generowane z zatwierdzonych wyników.
- Rankingi sezonowe, krajowe i międzyorganizatorskie.
- Weryfikowane tytuły i osiągnięcia przyznawane przez organizatora.

## Dalsze etapy dokumentów

- Status ręcznej weryfikacji dokumentu przez organizatora.
- OCR dat ważności i numerów dokumentów.
- Przypomnienia o zbliżającym się końcu ważności.
- Bezpieczne udostępnienie konkretnego dokumentu organizatorowi na czas wydarzenia.

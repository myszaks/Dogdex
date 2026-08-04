# E-maile Dogdex

Wiadomości aplikacyjne i szablony Supabase korzystają z jednego języka wizualnego: leśna zieleń `#1E3932`, pomarańczowy akcent `#FF8024`, tło sage `#F6FAF8`, białe karty i proste komunikaty po polsku.

## Wiadomości aplikacyjne

Kod wysyłki znajduje się w `lib/email.ts`, a współdzielony układ w `lib/emailTemplate.ts`.

Każda wiadomość zawiera:

- pełny logotyp Dogdex z tekstowym opisem zastępczym dla klientów blokujących obrazy,
- preheader widoczny na liście wiadomości w programie pocztowym,
- jednoznaczny tytuł i status,
- tabelę z nazwanymi danymi zamiast luźnych wartości,
- jeden główny przycisk prowadzący do właściwego miejsca,
- wersję tekstową generowaną obok HTML,
- bezpieczne kodowanie danych pochodzących od użytkowników.

Wymagane zmienne środowiskowe:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=twoj@gmail.com
SMTP_PASS=haslo-aplikacji
SMTP_FROM=Dogdex <twoj@gmail.com>
CONTACT_EMAIL=kontakt@dogdex.pro
NEXT_PUBLIC_SITE_URL=https://dogdex.pro
```

`CONTACT_EMAIL` jest opcjonalne. Bez niego formularz kontaktowy trafia na adres zapasowy zdefiniowany w kodzie. `NEXT_PUBLIC_SITE_URL` służy do budowania przycisków w wiadomościach.
Służy również do ładowania logotypu z `/brand/dogdex-email-logo.png`, dlatego adres musi być publicznie dostępny i odpowiadać środowisku wysyłającemu wiadomość.

## Szablony Supabase Auth

Wersjonowane pliki znajdują się w `supabase/email-templates/`. Tematy są zapisane w `subjects.json`.

| Plik | Ekran w Supabase Dashboard |
| --- | --- |
| `confirmation.html` | Confirm signup |
| `invite.html` | Invite user |
| `magic_link.html` | Magic link |
| `email_change.html` | Change email address |
| `recovery.html` | Reset password |
| `reauthentication.html` | Reauthentication |
| `password_changed.html` | Password changed |
| `email_changed.html` | Email address changed |
| `phone_changed.html` | Phone number changed |
| `identity_linked.html` | Sign-in method linked |
| `identity_unlinked.html` | Sign-in method removed |
| `mfa_factor_enrolled.html` | Verification method added |
| `mfa_factor_unenrolled.html` | Verification method removed |

W projekcie hostowanym najpierw wdróż aplikację i sprawdź, czy publiczny adres
`/brand/dogdex-email-logo.png` zwraca plik z nagłówkiem `Content-Type: image/png`.
Następnie otwórz **Authentication → Email Templates**, wklej zawartość
właściwego pliku i ustaw temat z `subjects.json`. Powiadomienia bezpieczeństwa
trzeba dodatkowo włączyć na poziomie projektu. Szablony lokalne można wskazać
przez `auth.email.template.<type>.content_path` w `supabase/config.toml`; zmiany
wymagają ponownego uruchomienia lokalnego Supabase.

Nie zamieniaj zmiennych szablonów na stałe wartości. Supabase uzupełnia je osobno dla każdej wiadomości. W używanych przez Dogdex szablonach są to: `{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .Email }}`, `{{ .NewEmail }}`, `{{ .OldEmail }}`, `{{ .Phone }}`, `{{ .OldPhone }}`, `{{ .Provider }}`, `{{ .FactorType }}` i `{{ .SiteURL }}`.

| Rodzaj wiadomości | Dane dynamiczne, które muszą pozostać w szablonie |
| --- | --- |
| Rejestracja, zaproszenie, magic link, reset hasła | `Email`, `ConfirmationURL`, `SiteURL` |
| Zmiana adresu e-mail | `Email`, `NewEmail`, `ConfirmationURL`, `SiteURL` |
| Kod ponownego uwierzytelnienia | `Email`, `Token`, `SiteURL` |
| Zmiana hasła | `Email`, `SiteURL` |
| Powiadomienie o zmianie e-maila | `OldEmail`, `Email`, `SiteURL` |
| Powiadomienie o zmianie telefonu | `OldPhone`, `Phone`, `Email`, `SiteURL` |
| Połączenie lub odłączenie tożsamości | `Provider`, `Email`, `SiteURL` |
| Dodanie lub usunięcie MFA | `FactorType`, `Email`, `SiteURL` |

Przed publikacją sprawdź w Supabase:

1. **Site URL** wskazuje produkcyjną domenę Dogdex.
2. Dozwolone adresy przekierowań zawierają `/auth/callback` i `/reset-password` dla używanych środowisk.
3. Własny SMTP ma poprawne SPF, DKIM i DMARC, a śledzenie linków jest wyłączone dla wiadomości Auth.
4. Każdy szablon został wysłany testowo na telefon i komputer.

Oficjalne zasady zmiennych i wdrażania: [Supabase Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates) oraz [Customizing email templates](https://supabase.com/docs/guides/local-development/customizing-email-templates).

## Test SMTP

```powershell
node scripts/send-test-email.js adres@example.com
```

Wiadomości aplikacyjne można bezpiecznie przechwytywać lokalnie przez Mailpit. Ustaw host i port lokalnego serwera SMTP, nie używając produkcyjnych danych odbiorców.

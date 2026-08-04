# Powiadomienia o rozpoczęciu zapisów

Automatyzacja zapisów jest uruchamiana przez Supabase Cron co pięć minut. Zadanie
wykonuje żądanie `POST /api/event-registration-notifications`; endpoint obsługuje
powiadomienia o rozpoczęciu zapisów, propozycje miejsc z listy rezerwowej oraz
oczekujące komunikaty organizatorów. Każda kolejka zapisuje stan przetwarzania,
aby nie wysłać tej samej wiadomości ponownie.

## Konfiguracja środowiska

1. W ustawieniach danego środowiska Vercel ustaw `CRON_SECRET` na losową wartość
   o długości co najmniej 32 znaków.
2. W Supabase Dashboard otwórz **Project Settings → Vault** i dodaj dwa sekrety:

   | Nazwa | Wartość |
   | --- | --- |
   | `dogdex_site_url` | adres odpowiadającego wdrożenia: `https://develop.dogdex.pro` dla developmentu albo `https://dogdex.pro` dla produkcji |
   | `dogdex_cron_secret` | dokładnie ta sama wartość co `CRON_SECRET` w Vercel |

   Sekrety można również utworzyć w SQL Editorze:

   ```sql
   select vault.create_secret(
     'https://develop.dogdex.pro',
     'dogdex_site_url',
     'Publiczny adres developerskiej aplikacji Dogdex'
   );

   select vault.create_secret(
     'WKLEJ_TUTAJ_CRON_SECRET',
     'dogdex_cron_secret',
     'Bearer token dla zadań cyklicznych Dogdex'
   );
   ```

3. Zastosuj migrację `20260803170000_schedule_registration_notifications.sql`.
   Włącza ona `pg_cron` i `pg_net`, a następnie tworzy zadanie z harmonogramem
   `*/5 * * * *`.
4. Wdróż aplikację na Vercel. Zadanie nie jest już konfigurowane w `vercel.json`,
   dlatego przechodzi na planie Hobby.

Migrację można zastosować przed dodaniem sekretów. Do czasu ich skonfigurowania
zadanie kończy się bez żądania HTTP i emituje ostrzeżenie w logach bazy.

## Weryfikacja

Stan harmonogramu:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'event-registration-notifications-every-5-minutes';
```

Ostatnie wykonania:

```sql
select status, start_time, end_time, return_message
from cron.job_run_details
where jobid = (
  select jobid
  from cron.job
  where jobname = 'event-registration-notifications-every-5-minutes'
)
order by start_time desc
limit 20;
```

Ręczne, zabezpieczone uruchomienie:

```powershell
$dogdexBaseUrl = 'https://develop.dogdex.pro' # na produkcji: https://dogdex.pro
Invoke-RestMethod `
  -Method Post `
  -Uri "$dogdexBaseUrl/api/event-registration-notifications" `
  -Headers @{ Authorization = 'Bearer WKLEJ_TUTAJ_CRON_SECRET' }
```

Odpowiedź zawiera liczbę wysłanych i pominiętych powiadomień. W przypadku
nieudanej wysyłki blokada subskrypcji jest zwalniana, a następne wykonanie crona
spróbuje ponownie.

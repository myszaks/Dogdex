# Płatności wydarzeń

## Przepływ pierwszej wersji

- Automatyczna akceptacja: zapis tworzy sesję Stripe Checkout od razu, a webhook potwierdza zapis po płatności.
- Ręczna akceptacja: uczestnik wysyła zgłoszenie, organizator je akceptuje, uczestnik dostaje stabilny link płatniczy, a zapis jest potwierdzany dopiero po płatności.
- Wydarzenie może mieć jedną cenę za zapis albo osobną cenę dla każdej opcji pola `multidate`. Kilka wybranych dat jest jednym Checkoutem z osobnymi pozycjami.
- Direct charges trafiają bezpośrednio na połączone konto Stripe organizatora. Dogdex nie pobiera prowizji.

## Zwroty

- Anulowanie jednej lub kilku opłaconych dat tworzy częściowy zwrot odpowiadający dokładnie ich pozycjom.
- Zapis i wybrane daty zmieniają się dopiero po statusie `succeeded` zwrotu.
- Zwroty `pending` i `requires_action` są uzgadniane automatycznie; błędny zwrot można ponowić ze strony szczegółów transakcji.
- Anulowanie całego opłaconego zapisu zwraca pozostałą kwotę. Anulowanie wydarzenia zleca zwroty dla wszystkich opłaconych zapisów i wygasza oczekujące Checkouty.

## Webhook Stripe

Endpoint: `/api/webhooks/stripe`. Powinien odbierać zdarzenia z kont połączonych:

- `checkout.session.completed`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `refund.created`
- `refund.updated`
- `refund.failed`
- `charge.refunded`

## Uzgadnianie i raportowanie

- Cron `/api/event-payments/reconcile` działa raz dziennie i wymaga `CRON_SECRET`.
- Organizator może ręcznie uruchomić reconciliation z `/payments`.
- `/payments` pokazuje sprzedaż brutto, zwroty, kwotę netto i wyjątki.
- Szczegóły wydarzeniowej transakcji są pod `/payments/events/{paymentId}`.
- Eksport wspólnego rejestru wydarzeń i treningów: `/api/event-payments/export`.

## Testy

Testy lokalne:

```text
npm test
npm run typecheck
npm run build
```

Prawdziwy E2E w Stripe test mode:

1. W `.env.e2e.local` ustaw prawdziwy `STRIPE_SECRET_KEY=sk_test_...`.
2. Dev DB musi zawierać co najmniej jedno połączone konto Stripe.
3. Uruchom `npm run e2e:event-payments`.

E2E wykonuje płatność 3 PLN, częściowe zwroty 1 PLN i 2 PLN, sprawdza atomowe przejścia stanów oraz SMTP. Dane QA w bazie są wycofywane transakcją, a płatność Stripe kończy jako w pełni zwrócona.

create unique index if not exists event_payments_one_active_per_registration
  on public.event_payments(registration_id)
  where status in ('pending', 'completed', 'partially_refunded', 'refunded');

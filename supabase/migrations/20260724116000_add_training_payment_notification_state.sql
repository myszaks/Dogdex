alter table public.training_payments
  add column if not exists confirmation_sent_at timestamptz;

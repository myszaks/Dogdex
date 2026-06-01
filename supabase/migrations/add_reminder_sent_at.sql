-- Add reminder_sent_at to registrations for 24h reminder deduplication.
-- For regular events: stores ISO timestamp when the reminder was sent.
-- For multidate events: stores a JSONB object { "YYYY-MM-DD": true } 
-- to track which specific dates a reminder has already been sent for.

ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS reminder_sent_at JSONB DEFAULT NULL;

-- Index to efficiently query registrations that haven't received reminders yet
-- (used by the /api/reminders cron endpoint)
CREATE INDEX IF NOT EXISTS registrations_reminder_sent_at_idx
  ON registrations (event_id)
  WHERE reminder_sent_at IS NULL AND status = 'confirmed';

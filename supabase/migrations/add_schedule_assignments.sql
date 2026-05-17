-- Many-to-many: registration → time_slot
-- item_date: YYYY-MM-DD string matching the participant's multidate selection
-- UNIQUE(registration_id, item_date) ensures one slot per date per dog

CREATE TABLE IF NOT EXISTS schedule_assignments (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  registration_id uuid     NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  time_slot_id    uuid     NOT NULL REFERENCES time_slots(id)    ON DELETE CASCADE,
  item_date       text     NOT NULL DEFAULT '',
  sent_at         timestamptz,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(registration_id, item_date)
);

CREATE INDEX IF NOT EXISTS idx_sa_registration ON schedule_assignments(registration_id);
CREATE INDEX IF NOT EXISTS idx_sa_slot         ON schedule_assignments(time_slot_id);

-- Migrate existing single-slot assignments from registrations.time_slot_id
INSERT INTO schedule_assignments (registration_id, time_slot_id, item_date, sent_at)
SELECT id, time_slot_id, '', schedule_sent_at
FROM   registrations
WHERE  time_slot_id IS NOT NULL
ON CONFLICT DO NOTHING;

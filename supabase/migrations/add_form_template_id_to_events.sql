-- Add form_template_id column to events table
-- This stores which form template was selected when creating/editing an event
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS form_template_id uuid REFERENCES form_templates(id) ON DELETE SET NULL;

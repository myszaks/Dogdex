-- Create public storage bucket for event thumbnails
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-thumbnails',
  'event-thumbnails',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "event_thumbnails_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-thumbnails');

-- Authenticated users can upload
CREATE POLICY "event_thumbnails_auth_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'event-thumbnails' AND auth.role() = 'authenticated');

-- Authenticated users can delete
CREATE POLICY "event_thumbnails_auth_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'event-thumbnails' AND auth.role() = 'authenticated');

ALTER TABLE public.conferences
    ADD COLUMN IF NOT EXISTS time TIME;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('profile-images', 'profile-images', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']),
    ('dignitary-images', 'dignitary-images', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

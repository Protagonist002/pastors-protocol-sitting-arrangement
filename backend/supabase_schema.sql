-- =============================================================================
-- Pastors' Protocol Central Sitting Arrangement
-- Complete Database Schema — Source of Truth
-- Generated from AGENT_CONTEXT.md (Sections 4, 5, 6, 13)
-- =============================================================================
-- INSTRUCTIONS:
--   Run this ENTIRE file in the Supabase SQL Editor (Dashboard → SQL Editor).
--   It will create all tables, enable RLS, set up policies, create the
--   auto-profile trigger, and enable realtime.
--
--   If re-running on an existing project, you may need to DROP existing
--   tables/policies first (see bottom of file for cleanup SQL).
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. PROFILES TABLE
-- =============================================================================
-- Automatically populated by the on_auth_user_created trigger (see §13).
-- Role is always 'protocol' on signup. Admins promote via Access Control UI.

CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name   TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'protocol'
                  CHECK (role IN ('admin', 'editor', 'protocol')),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS: anyone can read all profiles
CREATE POLICY "profiles_read_all"
    ON public.profiles FOR SELECT
    USING (true);

-- RLS: users can update their own profile (but not the role field — that's admin-only via API)
CREATE POLICY "profiles_update_own"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- =============================================================================
-- 2. AUDITORIUMS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.auditoriums (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                   TEXT NOT NULL UNIQUE,
    name                   TEXT NOT NULL,
    description            TEXT,
    map_type               TEXT NOT NULL DEFAULT 'interactive'
                             CHECK (map_type IN ('interactive', 'image')),
    image_url              TEXT,
    sections               JSONB NOT NULL DEFAULT '[]'::jsonb,
    default_seating_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at             TIMESTAMPTZ DEFAULT NOW(),
    updated_at             TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.auditoriums ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. CONFERENCES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.conferences (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    date        DATE,
    start_date  DATE,
    end_date    DATE,
    time        TIME,
    venue       TEXT,
    description TEXT,
    auditorium_id UUID REFERENCES public.auditoriums(id),
    created_by  UUID REFERENCES public.profiles(id),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.conferences
    ADD COLUMN IF NOT EXISTS start_date DATE,
    ADD COLUMN IF NOT EXISTS end_date DATE,
    ADD COLUMN IF NOT EXISTS time TIME,
    ADD COLUMN IF NOT EXISTS venue TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS auditorium_id UUID REFERENCES public.auditoriums(id),
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.conferences ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 4. SESSIONS TABLE
-- =============================================================================
-- seating_config stores the section grid blueprint as JSONB:
-- { "choir": { "rows": 5, "cols": 4 }, "left": { "rows": 8, "cols": 5 }, ... }

CREATE TABLE IF NOT EXISTS public.sessions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conference_id    UUID NOT NULL REFERENCES public.conferences(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    date             DATE,
    time             TIME,
    description      TEXT,
    seating_config   JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by       UUID REFERENCES public.profiles(id),
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 5. DIGNITARY DIRECTORY TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dignitary_directory (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    title        TEXT NOT NULL,
    church       TEXT,
    extension    TEXT,
    notes        TEXT,
    picture_url  TEXT,
    created_by   UUID REFERENCES public.profiles(id),
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.dignitary_directory ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 6. CONFERENCE DIGNITARIES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.conference_dignitaries (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conference_id         UUID NOT NULL REFERENCES public.conferences(id) ON DELETE CASCADE,
    directory_dignitary_id UUID NOT NULL REFERENCES public.dignitary_directory(id) ON DELETE CASCADE,
    created_by            UUID REFERENCES public.profiles(id),
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (conference_id, directory_dignitary_id)
);

ALTER TABLE public.conference_dignitaries ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 7. SESSION DIGNITARIES TABLE
-- =============================================================================
-- NOT "attendees" — the table is called "dignitaries".
-- title is always free text (e.g., "Presiding Bishop", "H.E.", "Minister of Interior")
-- picture_url stores the full public URL from Supabase Storage, not base64.
-- UNIQUE constraint on (session_id, section, row_num, col_num) prevents double-booking.

CREATE TABLE IF NOT EXISTS public.dignitaries (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id   UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    conference_dignitary_id UUID REFERENCES public.conference_dignitaries(id) ON DELETE SET NULL,
    directory_dignitary_id UUID REFERENCES public.dignitary_directory(id) ON DELETE SET NULL,
    name         TEXT NOT NULL,
    title        TEXT NOT NULL,
    church       TEXT,
    extension    TEXT,
    section      TEXT,
    row_num      INTEGER,
    col_num      INTEGER,
    status       TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'arrived', 'seated', 'absent')),
    notes        TEXT,
    picture_url  TEXT,
    created_by   UUID REFERENCES public.profiles(id),
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (session_id, section, row_num, col_num)
);

ALTER TABLE public.dignitaries
    ADD COLUMN IF NOT EXISTS conference_dignitary_id UUID REFERENCES public.conference_dignitaries(id) ON DELETE SET NULL;

ALTER TABLE public.dignitaries
    ADD COLUMN IF NOT EXISTS directory_dignitary_id UUID REFERENCES public.dignitary_directory(id) ON DELETE SET NULL;

ALTER TABLE public.dignitaries ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 8. AUDITORIUM SEED DATA
-- =============================================================================

INSERT INTO public.auditoriums (slug, name, description, map_type, image_url, sections, default_seating_config)
VALUES
(
    'glt-camp-auditorium',
    'GLT Camp Auditorium',
    'Current interactive camp auditorium seating map.',
    'interactive',
    '/glt-camp-auditorium.jpeg',
    '[
      {"id":"choir","label":"Choir","color":"#e8843a"},
      {"id":"left","label":"Left Section","color":"#c0392b"},
      {"id":"middle","label":"Middle Section","color":"#2471a3"},
      {"id":"right","label":"Right Section","color":"#b8920a"},
      {"id":"minister","label":"Minister Section","color":"#4a5568"},
      {"id":"vvip","label":"SETMAN / VVIP / CEC","closed":true,"color":"#d1d5db"},
      {"id":"altar","label":"Altar","closed":true,"color":"#5eac24"}
    ]'::jsonb,
    '{
      "choir": {"rows": 5, "cols": 4},
      "left": {"rows": 8, "cols": 5},
      "middle": {"rows": 10, "cols": 6},
      "right": {"rows": 8, "cols": 5},
      "minister": {"rows": 6, "cols": 5}
    }'::jsonb
),
(
    'gltife-auditorium',
    'GLTIFE Auditorium',
    'GLT Ife auditorium seating map.',
    'image',
    '/gltife-auditorium.png',
    '[
      {"id":"choir","label":"Choir","color":"#b56df0"},
      {"id":"smrs","label":"SMRS VIP Minister","color":"#f58bf2"},
      {"id":"setman","label":"Set Man CEC","color":"#ff6868"},
      {"id":"assPastor","label":"Ass Pastor","color":"#68a9ef"}
    ]'::jsonb,
    '{
      "choir": {"rows": 8, "cols": 6},
      "smrs": {"rows": 5, "cols": 6},
      "setman": {"rows": 6, "cols": 6},
      "assPastor": {"rows": 6, "cols": 6}
    }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    map_type = EXCLUDED.map_type,
    image_url = EXCLUDED.image_url,
    sections = EXCLUDED.sections,
    default_seating_config = EXCLUDED.default_seating_config,
    updated_at = NOW();

-- =============================================================================
-- 9. AUTO-CREATE PROFILE TRIGGER
-- =============================================================================
-- When a new user signs up via Supabase Auth, this trigger automatically
-- creates a row in public.profiles with role = 'protocol' (view-only).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Unnamed'),
        'protocol'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- 10. HELPER FUNCTION: Check if user is editor or admin
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_editor_or_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'editor')
    );
$$ LANGUAGE sql SECURITY DEFINER;

-- =============================================================================
-- 11. ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- ── Auditoriums ──
CREATE POLICY "auditoriums_read" ON public.auditoriums
    FOR SELECT USING (auth.role() = 'authenticated');

-- ── Conferences ──
-- All authenticated users can read
CREATE POLICY "conferences_read" ON public.conferences
    FOR SELECT USING (auth.role() = 'authenticated');

-- Only editors/admins can insert
CREATE POLICY "conferences_insert" ON public.conferences
    FOR INSERT WITH CHECK (public.is_editor_or_admin());

-- Only editors/admins can update
CREATE POLICY "conferences_update" ON public.conferences
    FOR UPDATE
    USING (public.is_editor_or_admin())
    WITH CHECK (public.is_editor_or_admin());

-- Only editors/admins can delete (backend further restricts to admin-only)
CREATE POLICY "conferences_delete" ON public.conferences
    FOR DELETE USING (public.is_editor_or_admin());

-- ── Sessions ──
CREATE POLICY "sessions_read" ON public.sessions
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "sessions_insert" ON public.sessions
    FOR INSERT WITH CHECK (public.is_editor_or_admin());

CREATE POLICY "sessions_update" ON public.sessions
    FOR UPDATE
    USING (public.is_editor_or_admin())
    WITH CHECK (public.is_editor_or_admin());

CREATE POLICY "sessions_delete" ON public.sessions
    FOR DELETE USING (public.is_editor_or_admin());

-- ── Dignitary directory ──
CREATE POLICY "dignitary_directory_read" ON public.dignitary_directory
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "dignitary_directory_insert" ON public.dignitary_directory
    FOR INSERT WITH CHECK (public.is_editor_or_admin());

CREATE POLICY "dignitary_directory_update" ON public.dignitary_directory
    FOR UPDATE
    USING (public.is_editor_or_admin())
    WITH CHECK (public.is_editor_or_admin());

CREATE POLICY "dignitary_directory_delete" ON public.dignitary_directory
    FOR DELETE USING (public.is_editor_or_admin());

-- ── Conference dignitaries ──
CREATE POLICY "conference_dignitaries_read" ON public.conference_dignitaries
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "conference_dignitaries_insert" ON public.conference_dignitaries
    FOR INSERT WITH CHECK (public.is_editor_or_admin());

CREATE POLICY "conference_dignitaries_delete" ON public.conference_dignitaries
    FOR DELETE USING (public.is_editor_or_admin());

-- ── Dignitaries ──
CREATE POLICY "dignitaries_read" ON public.dignitaries
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "dignitaries_insert" ON public.dignitaries
    FOR INSERT WITH CHECK (public.is_editor_or_admin());

CREATE POLICY "dignitaries_update" ON public.dignitaries
    FOR UPDATE
    USING (public.is_editor_or_admin())
    WITH CHECK (public.is_editor_or_admin());

CREATE POLICY "dignitaries_delete" ON public.dignitaries
    FOR DELETE USING (public.is_editor_or_admin());

-- =============================================================================
-- 12. REALTIME
-- =============================================================================
-- Enable realtime for the dignitaries table so the frontend can subscribe
-- to live updates via Supabase channels.

ALTER PUBLICATION supabase_realtime ADD TABLE public.dignitaries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conference_dignitaries;

-- =============================================================================
-- 12B. PROTOCOL PROFILE + ARRIVAL TRACKING EXTENSIONS
-- =============================================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS extension TEXT,
    ADD COLUMN IF NOT EXISTS picture_url TEXT;

INSERT INTO public.profiles (id, full_name, role, extension, picture_url)
SELECT
    auth_users.id,
    COALESCE(
        NULLIF(auth_users.raw_user_meta_data->>'full_name', ''),
        split_part(COALESCE(auth_users.email, 'protocol.user'), '@', 1)
    ),
    COALESCE(NULLIF(auth_users.raw_user_meta_data->>'role', ''), 'protocol'),
    NULLIF(auth_users.raw_user_meta_data->>'extension', ''),
    NULLIF(auth_users.raw_user_meta_data->>'picture_url', '')
FROM auth.users AS auth_users
LEFT JOIN public.profiles AS profiles
    ON profiles.id = auth_users.id
WHERE profiles.id IS NULL;

ALTER TABLE public.conference_dignitaries
    ADD COLUMN IF NOT EXISTS first_arrival_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS first_arrival_session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.conference_protocol_assignments (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conference_id                   UUID NOT NULL REFERENCES public.conferences(id) ON DELETE CASCADE,
    user_id                         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    conference_role                 TEXT,
    assigned_conference_dignitary_id UUID REFERENCES public.conference_dignitaries(id) ON DELETE SET NULL,
    created_by                      UUID REFERENCES public.profiles(id),
    created_at                      TIMESTAMPTZ DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (conference_id, user_id),
    UNIQUE (conference_id, assigned_conference_dignitary_id)
);

ALTER TABLE public.conference_protocol_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conference_protocol_assignments_read" ON public.conference_protocol_assignments;
CREATE POLICY "conference_protocol_assignments_read" ON public.conference_protocol_assignments
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "conference_protocol_assignments_write" ON public.conference_protocol_assignments;
CREATE POLICY "conference_protocol_assignments_write" ON public.conference_protocol_assignments
    FOR ALL USING (public.is_editor_or_admin()) WITH CHECK (public.is_editor_or_admin());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role, extension, picture_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Unnamed'),
        'protocol',
        NEW.raw_user_meta_data->>'extension',
        NEW.raw_user_meta_data->>'picture_url'
    )
    ON CONFLICT (id) DO UPDATE
    SET
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        extension = COALESCE(EXCLUDED.extension, public.profiles.extension),
        picture_url = COALESCE(EXCLUDED.picture_url, public.profiles.picture_url);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conference_protocol_assignments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.conference_protocol_assignments;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conferences'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.conferences;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sessions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
    END IF;
END $$;

-- =============================================================================
-- 13. SUPABASE STORAGE BUCKET (run manually in Dashboard → Storage)
-- =============================================================================
-- Bucket name:  dignitary-photos
-- Access:       Public read, authenticated write
-- File naming:  {session_id}/{dignitary_id}.jpg
--
-- NOTE: Storage buckets cannot be created via SQL. Use the Supabase Dashboard:
--   1. Go to Storage → New Bucket
--   2. Name: "dignitary-photos"
--   3. Check "Public bucket" (for public read access)
--   4. Add policy: allow INSERT for authenticated users

-- Current backend upload buckets. This supersedes the older dashboard-only note
-- above; Supabase storage buckets can be upserted from the SQL editor.
-- The API also creates these lazily when it is running with a service-role key.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('profile-images', 'profile-images', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']),
    ('dignitary-images', 'dignitary-images', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =============================================================================
-- CLEANUP SQL (only if you need to reset and re-run)
-- =============================================================================
-- Uncomment the following lines if you need to drop everything and start fresh:
--
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP FUNCTION IF EXISTS public.handle_new_user();
-- DROP FUNCTION IF EXISTS public.is_editor_or_admin();
-- DROP TABLE IF EXISTS public.dignitaries CASCADE;
-- DROP TABLE IF EXISTS public.conference_dignitaries CASCADE;
-- DROP TABLE IF EXISTS public.dignitary_directory CASCADE;
-- DROP TABLE IF EXISTS public.sessions CASCADE;
-- DROP TABLE IF EXISTS public.conferences CASCADE;
-- DROP TABLE IF EXISTS public.auditoriums CASCADE;
-- DROP TABLE IF EXISTS public.profiles CASCADE;

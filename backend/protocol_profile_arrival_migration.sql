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
    id                               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conference_id                    UUID NOT NULL REFERENCES public.conferences(id) ON DELETE CASCADE,
    user_id                          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    conference_role                  TEXT,
    assigned_conference_dignitary_id UUID REFERENCES public.conference_dignitaries(id) ON DELETE SET NULL,
    created_by                       UUID REFERENCES public.profiles(id),
    created_at                       TIMESTAMPTZ DEFAULT NOW(),
    updated_at                       TIMESTAMPTZ DEFAULT NOW(),
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

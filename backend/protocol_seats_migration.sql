CREATE TABLE IF NOT EXISTS public.protocol_seats (
    id                               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id                       UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    user_id                          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    assigned_conference_dignitary_id UUID NOT NULL REFERENCES public.conference_dignitaries(id) ON DELETE CASCADE,
    section                          TEXT,
    row_num                          INTEGER,
    col_num                          INTEGER,
    notes                            TEXT,
    created_by                       UUID REFERENCES public.profiles(id),
    created_at                       TIMESTAMPTZ DEFAULT NOW(),
    updated_at                       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (session_id, user_id),
    UNIQUE (session_id, section, row_num, col_num)
);

ALTER TABLE public.protocol_seats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "protocol_seats_read" ON public.protocol_seats;
CREATE POLICY "protocol_seats_read" ON public.protocol_seats
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "protocol_seats_write" ON public.protocol_seats;
CREATE POLICY "protocol_seats_write" ON public.protocol_seats
    FOR ALL USING (public.is_editor_or_admin() OR user_id = auth.uid())
    WITH CHECK (public.is_editor_or_admin() OR user_id = auth.uid());

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'protocol_seats'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.protocol_seats;
    END IF;
END $$;

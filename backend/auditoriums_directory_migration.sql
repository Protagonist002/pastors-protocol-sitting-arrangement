-- Run this on the existing Supabase project to add auditorium selection
-- and the reusable dignitary directory / conference roster flow.

CREATE TABLE IF NOT EXISTS public.auditoriums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    map_type TEXT NOT NULL DEFAULT 'interactive' CHECK (map_type IN ('interactive', 'image')),
    image_url TEXT,
    sections JSONB NOT NULL DEFAULT '[]'::jsonb,
    default_seating_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.auditoriums ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.dignitary_directory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    title TEXT NOT NULL,
    church TEXT,
    extension TEXT,
    notes TEXT,
    picture_url TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.dignitary_directory ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.conference_dignitaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conference_id UUID NOT NULL REFERENCES public.conferences(id) ON DELETE CASCADE,
    directory_dignitary_id UUID NOT NULL REFERENCES public.dignitary_directory(id) ON DELETE CASCADE,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (conference_id, directory_dignitary_id)
);

ALTER TABLE public.conference_dignitaries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.conferences
    ADD COLUMN IF NOT EXISTS auditorium_id UUID REFERENCES public.auditoriums(id);

ALTER TABLE public.dignitaries
    ADD COLUMN IF NOT EXISTS conference_dignitary_id UUID REFERENCES public.conference_dignitaries(id) ON DELETE SET NULL;

ALTER TABLE public.dignitaries
    ADD COLUMN IF NOT EXISTS directory_dignitary_id UUID REFERENCES public.dignitary_directory(id) ON DELETE SET NULL;

DO $$
BEGIN
    CREATE POLICY "auditoriums_read" ON public.auditoriums FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "dignitary_directory_read" ON public.dignitary_directory FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "dignitary_directory_insert" ON public.dignitary_directory FOR INSERT WITH CHECK (public.is_editor_or_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "dignitary_directory_update" ON public.dignitary_directory FOR UPDATE USING (public.is_editor_or_admin()) WITH CHECK (public.is_editor_or_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "dignitary_directory_delete" ON public.dignitary_directory FOR DELETE USING (public.is_editor_or_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "conference_dignitaries_read" ON public.conference_dignitaries FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "conference_dignitaries_insert" ON public.conference_dignitaries FOR INSERT WITH CHECK (public.is_editor_or_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE POLICY "conference_dignitaries_delete" ON public.conference_dignitaries FOR DELETE USING (public.is_editor_or_admin());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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
    'Image-based auditorium placeholder. Sections will be configured later.',
    'image',
    '/gltife-auditorium.jpeg',
    '[]'::jsonb,
    '{}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    map_type = EXCLUDED.map_type,
    image_url = EXCLUDED.image_url,
    sections = EXCLUDED.sections,
    default_seating_config = EXCLUDED.default_seating_config,
    updated_at = NOW();

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conference_dignitaries;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

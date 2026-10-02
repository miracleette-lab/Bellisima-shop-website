-- Run this once in the Supabase Dashboard SQL Editor.
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub text NOT NULL,
  email text NOT NULL,
  full_name text NOT NULL,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add these fields safely if public.users already existed before Google sign-in.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS google_sub text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique_idx ON public.users (google_sub);

-- This table is written by the trusted Node server, never directly by the browser.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
-- ==============================================================================
-- Resume Radiance / Placement Screening Console - Supabase Database Schema
-- Run this SQL in your Supabase Project Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Create the analyses table to store candidate screening scorecards
CREATE TABLE IF NOT EXISTS public.analyses (
    id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    candidate_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Software Engineer (Entry Level)',
    overall_score INTEGER NOT NULL DEFAULT 0,
    readiness_tier TEXT NOT NULL DEFAULT 'Tier 3: Overhaul Required',
    evaluation_basis TEXT NOT NULL DEFAULT 'role-fit',
    assumed_role TEXT DEFAULT '',
    jd_score INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    analysis JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 2. Create high-performance indexes for sorting & filtering
CREATE INDEX IF NOT EXISTS idx_analyses_overall_score ON public.analyses (overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_readiness_tier ON public.analyses (readiness_tier);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON public.analyses (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_candidate_name ON public.analyses USING gin (to_tsvector('english', candidate_name));

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

-- 4. Create open access policies for anonymous placement officers
CREATE POLICY "Allow anonymous read on analyses"
    ON public.analyses
    FOR SELECT
    TO anon, authenticated
    USING (true);

CREATE POLICY "Allow anonymous insert on analyses"
    ON public.analyses
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY "Allow anonymous update on analyses"
    ON public.analyses
    FOR UPDATE
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow anonymous delete on analyses"
    ON public.analyses
    FOR DELETE
    TO anon, authenticated
    USING (true);

-- 5. Optional Storage Bucket for transient resume document processing
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes-temp', 'resumes-temp', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow anonymous storage access"
    ON storage.objects
    FOR ALL
    TO anon, authenticated
    USING (bucket_id = 'resumes-temp')
    WITH CHECK (bucket_id = 'resumes-temp');

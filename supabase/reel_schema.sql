-- "Photos only" AI video generation flow — additive schema, separate from the
-- uploads/captions tables in schema.sql (those back the raw-walkthrough-video
-- pipeline and are untouched by this file).
-- Target project: https://hmqnpidncvylrwmsctxm.supabase.co (same project as
-- schema.sql — this just adds new tables/buckets alongside the existing ones).
--
-- Flow: agent uploads 5+ property photos (no video) -> reel-generate Edge
-- Function has Claude analyze/select/write prompts -> reel-process-video.yml
-- (GitHub Actions) calls Kling AI per selected photo and assembles the final
-- video with ffmpeg -> reel-status is polled until status = 'ready'.

create extension if not exists pgcrypto;

create table if not exists public.reel_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  location text not null,
  agent_name text,
  agent_phone text,
  status text not null default 'pending'
    check (status in (
      'pending', 'analyzing', 'prompting', 'generating', 'assembling', 'ready', 'failed'
    )),
  error_message text,
  final_video_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reel_photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.reel_projects (id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  quality_score numeric,
  feature_type text,
  analysis_notes text,
  is_selected boolean not null default false,
  selection_rank integer,
  created_at timestamptz not null default now()
);

create index if not exists reel_photos_project_id_idx on public.reel_photos (project_id);

create table if not exists public.reel_clips (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.reel_projects (id) on delete cascade,
  photo_id uuid not null references public.reel_photos (id) on delete cascade,
  sort_order integer not null default 0,
  caption_text text not null,
  prompt_text text not null,
  kling_task_id text,
  kling_video_url text,
  status text not null default 'pending'
    check (status in ('pending', 'generating', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reel_clips_project_id_idx on public.reel_clips (project_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reel_projects_set_updated_at on public.reel_projects;
create trigger reel_projects_set_updated_at
  before update on public.reel_projects
  for each row execute function public.set_updated_at();

drop trigger if exists reel_clips_set_updated_at on public.reel_clips;
create trigger reel_clips_set_updated_at
  before update on public.reel_clips
  for each row execute function public.set_updated_at();

alter table public.reel_projects enable row level security;
alter table public.reel_photos enable row level security;
alter table public.reel_clips enable row level security;

-- Writes only ever happen from Edge Functions using the service-role key
-- (which bypasses RLS). The public can read a project once it's ready, same
-- pattern as public.uploads in schema.sql — status polling for in-progress
-- projects goes through reel-status (service role), not direct table access.
create policy "public can read ready reel projects" on public.reel_projects
  for select using (status = 'ready');

create policy "public can read photos of ready reel projects" on public.reel_photos
  for select using (
    exists (
      select 1 from public.reel_projects p
      where p.id = reel_photos.project_id and p.status = 'ready'
    )
  );

create policy "public can read clips of ready reel projects" on public.reel_clips
  for select using (
    exists (
      select 1 from public.reel_projects p
      where p.id = reel_clips.project_id and p.status = 'ready'
    )
  );

insert into storage.buckets (id, name, public)
values ('property-photos', 'property-photos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('generated-videos', 'generated-videos', true)
on conflict (id) do nothing;

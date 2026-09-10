-- Reelstate edge-function backend schema.
-- Target project: https://hmqnpidncvylrwmsctxm.supabase.co
-- Run this in the Supabase SQL editor (or `supabase db push` once linked).
--
-- Writes only ever happen from the Edge Functions in supabase/functions,
-- using the service-role key (which bypasses RLS). The public can only
-- read a listing once it's finished generating.

create extension if not exists pgcrypto;

create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  video_file_url text,
  photos_array jsonb not null default '[]'::jsonb,
  address text not null,
  property_type text not null,
  furnishing text,
  price numeric not null check (price >= 0),
  agent_name text not null,
  agent_phone text not null,
  agent_whatsapp text,
  description text,
  status text not null default 'pending'
    check (status in ('pending', 'generating', 'ready', 'failed')),
  walkthrough_video_url text,
  reels_video_url text,
  landing_page_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.captions (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.uploads (id) on delete cascade,
  timecode_start text not null,
  timecode_end text not null,
  caption_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists captions_upload_id_idx on public.captions (upload_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists uploads_set_updated_at on public.uploads;
create trigger uploads_set_updated_at
  before update on public.uploads
  for each row execute function public.set_updated_at();

alter table public.uploads enable row level security;
alter table public.captions enable row level security;

create policy "public can read ready uploads" on public.uploads
  for select using (status = 'ready');

create policy "public can read captions of ready uploads" on public.captions
  for select using (
    exists (
      select 1 from public.uploads u
      where u.id = captions.upload_id and u.status = 'ready'
    )
  );

insert into storage.buckets (id, name, public)
values ('videos', 'videos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

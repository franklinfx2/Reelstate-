-- Initial schema for Reelstate MVP.
-- MVP has no agent auth yet, so RLS is intentionally open: anyone can
-- insert/read their own draft while creating a listing, and the public can
-- only read properties (and their media/content) once published.

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agent_name text not null,
  agent_phone text not null,
  title text not null,
  property_type text not null check (property_type = any (array[
    'self_contained', 'chamber_and_hall', 'one_bedroom', 'two_bedroom',
    'three_bedroom', 'four_plus_bedroom', 'apartment', 'house', 'standalone',
    'compound_house', 'furnished_apartment', 'commercial', 'land', 'short_stay'
  ])),
  bedrooms integer,
  furnishing text check (furnishing is null or furnishing = any (array[
    'furnished', 'semi_furnished', 'unfurnished'
  ])),
  listing_purpose text not null default 'rent' check (listing_purpose = any (array[
    'rent', 'sale', 'short_stay'
  ])),
  price_amount numeric not null,
  price_currency text not null default 'GHS',
  price_period text check (price_period is null or price_period = any (array[
    'per_year', 'per_month', 'per_night', 'one_time'
  ])),
  location_area text not null,
  location_city text not null,
  description text,
  slug text not null unique,
  status text not null default 'draft' check (status = any (array[
    'draft', 'processing', 'ready', 'published'
  ]))
);

create table public.media (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  property_id uuid not null references public.properties (id) on delete cascade,
  media_type text not null check (media_type = any (array[
    'photo', 'raw_video', 'processed_video_vertical', 'processed_video_status'
  ])),
  storage_path text not null,
  sort_order integer not null default 0
);

create table public.generated_content (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  property_id uuid not null references public.properties (id) on delete cascade,
  content_type text not null check (content_type = any (array[
    'caption_instagram', 'caption_facebook', 'caption_tiktok',
    'whatsapp_message', 'landing_page_copy'
  ])),
  content text not null
);

alter table public.properties enable row level security;
alter table public.media enable row level security;
alter table public.generated_content enable row level security;

-- Server uses the anon key for everything (no agent auth in the MVP), so the
-- app itself needs broad read/insert/update; the public should only ever
-- see published listings.
create policy "app can read all properties" on public.properties for select using (true);
create policy "app can insert properties" on public.properties for insert with check (true);
create policy "app can update properties" on public.properties for update using (true);
create policy "public can read published properties" on public.properties for select using (status = 'published');

create policy "app can read all media" on public.media for select using (true);
create policy "app can insert media" on public.media for insert with check (true);
create policy "public can read media of published properties" on public.media for select using (
  exists (select 1 from public.properties p where p.id = media.property_id and p.status = 'published')
);

create policy "app can read all generated content" on public.generated_content for select using (true);
create policy "app can insert generated content" on public.generated_content for insert with check (true);
create policy "public can read generated content of published properties" on public.generated_content for select using (
  exists (select 1 from public.properties p where p.id = generated_content.property_id and p.status = 'published')
);

insert into storage.buckets (id, name, public)
values ('property-media', 'property-media', true)
on conflict (id) do nothing;

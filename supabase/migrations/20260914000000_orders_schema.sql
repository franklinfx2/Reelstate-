-- Orders schema for the manual-fulfillment video service.
-- Client uploads photos + pays -> admin (service-role only) reviews the
-- photos, edits the video by hand, and uploads the finished file.
--
-- orders/order_photos have RLS enabled with NO policies at all: the public
-- order form and tracking page, and every admin action, all run server-side
-- and use the service-role key (supabaseAdmin() in src/lib/supabase.ts),
-- which bypasses RLS. The anon key can't read or write these tables.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_name text not null,
  client_phone text not null,
  photo_count integer not null check (photo_count >= 5),
  band text not null check (band = any (array['A', 'B', 'C', 'custom'])),
  price_ghs numeric,
  music_choice text not null default 'we_pick'
    check (music_choice = any (array['we_pick', 'client_provided'])),
  music_file_path text,
  custom_instructions text,
  status text not null default 'placed'
    check (status = any (array['placed', 'payment_confirmed', 'in_progress', 'ready'])),
  deliverable_video_path text
);

create table public.order_photos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.orders (id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0
);

create index order_photos_order_id_idx on public.order_photos (order_id);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.orders enable row level security;
alter table public.order_photos enable row level security;

insert into storage.buckets (id, name, public)
values ('order-photos', 'order-photos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('order-videos', 'order-videos', true)
on conflict (id) do nothing;

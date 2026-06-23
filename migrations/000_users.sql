-- Users table mirrors auth.users for application-level fields.
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  plan text not null default 'free',
  allowed_channels text[] not null default '{}',
  primary_channel_id text,
  channels_limit integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users enable row level security;
-- Service role bypasses RLS. No client policies — table is private to the server.

-- Auto-create public.users row when a new user signs up via Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: create rows for any existing auth users that don't have a public.users row yet.
insert into public.users (id, email)
select id, email from auth.users
on conflict (id) do nothing;

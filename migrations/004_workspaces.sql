-- Workspaces: one per (user_id, channel_id) — auto-created on first request.
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  channel_id text not null,
  channel_name text,
  channel_handle text,
  channel_avatar text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, channel_id)
);

create index if not exists workspaces_user_id_idx on public.workspaces (user_id);
create index if not exists workspaces_channel_id_idx on public.workspaces (channel_id);

alter table public.workspaces enable row level security;

-- Subscriptions: which YouTube channels belong to which folder in a workspace.
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  youtube_channel_id text not null,
  folder_id uuid,
  added_at timestamptz not null default now()
);

create index if not exists subscriptions_workspace_id_idx on public.subscriptions (workspace_id);
create index if not exists subscriptions_folder_id_idx on public.subscriptions (folder_id);
create index if not exists subscriptions_youtube_channel_id_idx on public.subscriptions (youtube_channel_id);

alter table public.subscriptions enable row level security;

-- Add subscription_expires_at and subscribed_at to users if not present
alter table public.users
  add column if not exists subscription_expires_at timestamptz,
  add column if not exists subscribed_at timestamptz;

-- ============================================================
-- DATA MIGRATION: Create workspaces from existing folder data
-- ============================================================
-- For every distinct workspace_channel_id in the folders table,
-- create a workspace for the owning user.
insert into public.workspaces (user_id, channel_id, created_at, updated_at)
select
  f.user_id,
  f.workspace_channel_id,
  min(f.created_at),
  now()
from public.folders f
where f.workspace_channel_id is not null
  and f.workspace_channel_id != ''
  and not exists (
    select 1 from public.workspaces w
    where w.user_id = f.user_id
      and w.channel_id = f.workspace_channel_id
  )
group by f.user_id, f.workspace_channel_id;

-- Migrate primary_channel_id users (legacy users who never had folders)
insert into public.workspaces (user_id, channel_id, created_at, updated_at)
select
  u.id,
  u.primary_channel_id,
  u.created_at,
  now()
from public.users u
where u.primary_channel_id is not null
  and u.primary_channel_id != ''
  and not exists (
    select 1 from public.workspaces w
    where w.user_id = u.id
      and w.channel_id = u.primary_channel_id
  );

-- Migrate allowed_channels users (channels not covered by folders or primary)
insert into public.workspaces (user_id, channel_id, created_at, updated_at)
select
  u.id,
  unnest(u.allowed_channels),
  u.created_at,
  now()
from public.users u
where u.allowed_channels is not null
  and array_length(u.allowed_channels, 1) > 0
on conflict (user_id, channel_id) do nothing;

-- ============================================================
-- Add workspace_id to folders for the new foreign key
-- ============================================================
alter table public.folders
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

-- Populate workspace_id on folders
update public.folders f
set workspace_id = w.id
from public.workspaces w
where w.user_id = f.user_id
  and w.channel_id = f.workspace_channel_id
  and f.workspace_id is null;

-- Folders without a workspace (shouldn't happen, but safety net)
-- Create orphan workspaces for any remaining folders
insert into public.workspaces (user_id, channel_id, created_at, updated_at)
select
  f.user_id,
  f.workspace_channel_id,
  min(f.created_at),
  now()
from public.folders f
where f.workspace_id is null
  and f.workspace_channel_id is not null
  and not exists (
    select 1 from public.workspaces w
    where w.user_id = f.user_id
      and w.channel_id = f.workspace_channel_id
  )
group by f.user_id, f.workspace_channel_id;

update public.folders f
set workspace_id = w.id
from public.workspaces w
where w.user_id = f.user_id
  and w.channel_id = f.workspace_channel_id
  and f.workspace_id is null;

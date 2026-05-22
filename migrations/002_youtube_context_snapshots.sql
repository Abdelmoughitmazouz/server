-- Verified YouTube-session fingerprints used by /api/me/validate-youtube-context.
-- Seed snapshots from a trusted YouTube account verification/link flow.
create table if not exists public.youtube_context_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  youtube_channel_id text,
  subscription_channel_ids text[] not null default '{}',
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists youtube_context_snapshots_user_id_idx
  on public.youtube_context_snapshots (user_id);

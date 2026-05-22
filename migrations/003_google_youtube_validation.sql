-- Google provider credentials are application-encrypted before storage.
create table if not exists public.google_oauth_credentials (
  user_id uuid primary key references public.users(id) on delete cascade,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  access_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.youtube_subscription_fingerprint_cache (
  user_id uuid primary key references public.users(id) on delete cascade,
  fingerprint text not null,
  subscription_count integer not null,
  channel_ids text[] not null default '{}',
  cached_at timestamptz not null default now()
);

alter table public.youtube_context_snapshots
  add column if not exists subscription_fingerprint text;

alter table public.youtube_context_snapshots
  add column if not exists subscription_count integer;

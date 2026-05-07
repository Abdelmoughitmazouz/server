create table if not exists public.revoked_refresh_tokens (
  jti text primary key,
  user_id uuid not null,
  revoked_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_revoked_refresh_tokens_expires
  on public.revoked_refresh_tokens (expires_at);

alter table public.revoked_refresh_tokens enable row level security;
-- Service role bypasses RLS. No client policies — table is private to the server.

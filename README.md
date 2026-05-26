# FolderTube Server

Node/Express server that proxies Supabase access for the FolderTube extension. The extension never sees the Supabase anon key or a Supabase JWT — only short-lived server-issued tokens.

## Setup

```
cp .env.example .env
```

Fill in:
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase dashboard → Project Settings → API → `service_role` key (do NOT commit)
- `JWT_SECRET` — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

Run the migrations in `migrations/` against the Supabase project (SQL Editor).

```
npm install
npm run dev
```

## Endpoints

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/api/auth/exchange` | `Bearer <supabase_access_token>` or body token | Supabase token plus optional `{provider_token, provider_refresh_token}` from the Google OAuth session | `{access_token, refresh_token, profile}` |
| POST | `/api/auth/store-google-token` | `Bearer <access_token>` | `{provider_token}` | `{ok:true}` |
| POST | `/api/auth/refresh`  | — | `{refresh_token}` | `{access_token, refresh_token}` (rotated) |
| POST | `/api/auth/logout`   | — | `{refresh_token}` | 204 |
| GET  | `/api/me`            | `Bearer <access_token>` | — | `{profile, min_extension_version}` |
| GET  | `/api/me/subscriptions-fingerprint` | `Bearer <access_token>` | — | `{ok, fingerprint, subscriptionCount}` or a Google reconnect reason |
| POST | `/api/me/validate-youtube-context` | `Bearer <access_token>` | optional empty body | `{ok:true}`, true mismatch, or a Google reconnect reason |
| GET  | `/api/folders?channel_id=...` | `Bearer <access_token>` | — | `{folders: [...]}` |
| PUT  | `/api/folders`       | `Bearer <access_token>` | `{channel_id, folders[]}` | `{folders, deleted_ids}` or 403 `folder_limit_exceeded` |
| DELETE | `/api/folders/:id` | `Bearer <access_token>` | — | 204 / 404 |
| GET  | `/api/health`        | — | — | `{ok: true}` |

Token lifetimes: **access 15 min**, **refresh 30 days**. Refresh tokens are rotated on every use; the consumed `jti` is added to `public.revoked_refresh_tokens` so a stolen refresh token cannot be replayed.

## Auth flow

```
website (Supabase login)
  ── Supabase access token ──▶ POST /api/auth/exchange
                               server validates with Supabase, mints {access, refresh}
  ◀────────────────────────── {access_token, refresh_token, profile}

website ── chrome.runtime.sendMessage({setTokens, ...}) ──▶ extension

extension stores {access, refresh} in chrome.storage.local
extension calls /api/me, /api/folders/* with `Authorization: Bearer <access>`
on 401 token_expired → POST /api/auth/refresh, retry
```

When the website exchanges a Supabase Google OAuth session, it must include the session's `provider_token` and `provider_refresh_token` fields in `/api/auth/exchange`. The server encrypts those provider credentials before storing them in `google_oauth_credentials`; they are never handed to the extension. Configure `GOOGLE_OAUTH_CLIENT_ID` and, for a confidential Google client, `GOOGLE_OAUTH_CLIENT_SECRET` so the server can refresh access tokens. `GOOGLE_TOKEN_ENCRYPTION_KEY` is optional; when omitted the existing `JWT_SECRET` is used as the encryption-key seed.

## Deployment

**Vercel (recommended — same project as folderstube.com):**
Add `api/[...slug].js` that imports the Express app:
```js
import app from '../server/src/index.js';
export default app;
```
Set the same env vars in Vercel project settings. Note that the `app.listen` call is harmless on Vercel — the platform invokes the exported handler directly.

**Standalone (Railway / Fly / Render):** `npm start`.

## Plan rules

| Plan | Channel slots | Folders per channel |
|---|---|---|
| free | 1 | 3 |
| plus | 1 | unlimited |
| pro  | 3 | unlimited |

Channel slots are enforced when a channel is linked (handled by the website). The server enforces folder count and channel membership on every folder operation. Defined in [src/plans.js](src/plans.js).

## Folder semantics

`PUT /api/folders` is an idempotent "sync the entire workspace" operation. The body lists every folder that should exist for `(user, channel_id)` after the call. The server upserts them all (matching the existing client behaviour) and deletes any rows for that pair whose `id` is not in the list. Response includes both the applied rows and the deleted IDs.

**Authorization gates run in this order on every PUT/GET:**

1. `channel_id` format check (URL-safe, ≤128 chars).
2. **Channel membership:** `channel_id` must be in the user's `allowed_channels` (merged with legacy `primary_channel_id`). Read fresh from `users` on every request, never the JWT. If not linked, returns `403 channel_not_linked` with `{plan, allowed_channels, channels_limit}` so the client can render an actionable error.
3. **Folder count** (PUT only): `folders.length` ≤ `PLAN_LIMITS[plan].folders_per_workspace`. If exceeded, returns `403 folder_limit_exceeded` with `{plan, limit, attempted}`. The existing Supabase `folder_limit_exceeded` trigger is left in place as a backstop.

**`user_id` is always taken from the JWT**, never from the request body — a client cannot write folders for another user regardless of what it sends.

`POST /api/me/validate-youtube-context` is the folder-load guard. The extension sends no Google token and no subscription fingerprint. The server loads the stored Google provider credential, fetches paginated `subscriptions.list` data from the YouTube Data API, builds a deterministic sorted channel fingerprint, and caches the resulting fingerprint per user for at least 60 seconds. It matches that server-side context against rows in `youtube_context_snapshots` that were seeded by a trusted link/verification flow. During rollout it also checks channel IDs already stored in that user's folder metadata as a legacy subscription snapshot. Fewer than three matching known subscriptions after a successful YouTube fetch is a true `{ok:false, reason:"youtube_account_mismatch"}` response. Credential problems stay distinct as `{ok:false, reason:"google_provider_token_missing"}`, `{ok:false, reason:"google_reauth_required"}`, or `{ok:false, reason:"youtube_api_auth_failed"}` so the client can ask for reconnect instead of showing mismatch. The client must not load or sync folders until it receives `{ok:true}`.

`GET /api/folders` without a `channel_id` returns folders only for channels in `allowed_channels` (so historical rows from an unlinked channel are not leaked).

`DELETE /api/folders/:id` does NOT check channel membership — a user must always be able to remove their own data, including stragglers from a channel they've since unlinked. Scope is `(id, user_id)`.

## Not yet implemented (next steps)

- Extension-side ApiClient that calls these endpoints (step 3)
- Rate limiting (per-IP and per-user)
- Forced-update gate (`min_extension_version` check) wired into the extension
- Cleanup job for expired rows in `revoked_refresh_tokens`

import express from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../jwt.js';
import { saveGoogleProviderTokens } from '../google-provider-tokens.js';
import { invalidateSubscriptionsFingerprintCache } from '../youtube-subscriptions.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const exchangeBodySchema = z.object({
  access_token: z.string().min(10).optional(),
  supabase_access_token: z.string().min(10).optional(),
  token: z.string().min(10).optional(),
  provider_token: z.string().min(10).optional(),
  provider_refresh_token: z.string().min(10).optional(),
  provider_token_expires_at: z.union([z.string().datetime(), z.number()]).optional(),
}).passthrough();

function extractSupabaseAccessToken(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer (.+)$/);
  if (m?.[1]) {
    return { token: m[1], source: 'authorization_header' };
  }

  const parsed = exchangeBodySchema.safeParse(req.body || {});
  if (!parsed.success) {
    return { token: null, source: 'invalid_body', issues: parsed.error.issues };
  }

  const token = parsed.data.access_token
    || parsed.data.supabase_access_token
    || parsed.data.token
    || null;

  return { token, source: token ? 'body' : 'missing_body_token', issues: null };
}

async function loadProfile(user_id, fallbackUser) {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, plan, created_at, subscription_expires_at, subscribed_at')
    .eq('id', user_id)
    .maybeSingle();
  if (error && error.code !== '42P01') {
    console.error('[auth] loadProfile query failed', {
      userId: user_id,
      errorCode: error.code,
      errorMessage: error.message,
    });
    throw Object.assign(new Error(`profile_lookup_failed: ${error.message}`), {
      status: 500,
      supabaseError: { code: error.code, message: error.message },
    });
  }

  if (data) return data;

  const email = fallbackUser?.email || null;
  const { error: insertError } = await supabase
    .from('users')
    .upsert({ id: user_id, email }, { onConflict: 'id' });
  if (insertError) {
    console.error('[auth] loadProfile user upsert failed', {
      userId: user_id,
      errorCode: insertError.code,
      errorMessage: insertError.message,
    });
  }

  return {
    id: user_id,
    email,
    plan: 'free',
    created_at: new Date().toISOString(),
    subscription_expires_at: null,
    subscribed_at: null,
  };
}

function tokenExpiry(value) {
  if (typeof value === 'number') return new Date(value * 1000).toISOString();
  return value || null;
}

router.post('/exchange', async (req, res, next) => {
  try {
    const extracted = extractSupabaseAccessToken(req);
    if (!extracted.token) {
      return res.status(400).json({
        error: 'missing_supabase_token',
        detail: extracted.issues || null,
      });
    }

    const { data, error } = await supabase.auth.getUser(extracted.token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'invalid_supabase_token', detail: error?.message || null });
    }

    const profile = await loadProfile(data.user.id, data.user);
    const body = exchangeBodySchema.safeParse(req.body || {});
    if (body.success && body.data.provider_token) {
      try {
        await saveGoogleProviderTokens(profile.id, {
          provider_token: body.data.provider_token,
          provider_refresh_token: body.data.provider_refresh_token || null,
          provider_token_expires_at: tokenExpiry(body.data.provider_token_expires_at),
          email: profile.email || data.user.email || null,
        });
        await invalidateSubscriptionsFingerprintCache(profile.id);
      } catch (providerErr) {
        console.error('[auth] provider token save failed (non-fatal)', providerErr.message);
      }
    }

    const access_token = signAccessToken({
      user_id: profile.id,
      email: profile.email,
      plan: profile.plan,
    });
    const { token: refresh_token } = signRefreshToken({ user_id: profile.id });

    res.json({ access_token, refresh_token, profile });
  } catch (error) {
    console.error('[auth] /exchange unexpected error', error);
    const status = error.status || 500;
    res.status(status).json({
      error: error.message || 'internal_error',
      ...(error.supabaseError ? { supabase_error: error.supabaseError } : {}),
    });
  }
});

router.post('/store-google-token', requireAuth, async (req, res, next) => {
  console.log("ENTERED_STORE_GOOGLE_TOKEN");
  return res.json({ reached: true });
});

const refreshSchema = z.object({ refresh_token: z.string().min(10) });

router.post('/refresh', async (req, res, next) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request', detail: parsed.error.issues });

    let payload;
    try {
      payload = verifyRefreshToken(parsed.data.refresh_token);
    } catch (err) {
      return res.status(401).json({ error: 'invalid_refresh_token', detail: err.message });
    }

    const { data: revoked, error: revokedError } = await supabase
      .from('revoked_refresh_tokens')
      .select('jti')
      .eq('jti', payload.jti)
      .maybeSingle();
    if (revokedError) {
      console.error('[auth] /refresh revoked check failed', revokedError);
    }
    if (revoked) return res.status(401).json({ error: 'revoked' });

    const profile = await loadProfile(payload.sub);
    const access_token = signAccessToken({
      user_id: profile.id,
      email: profile.email,
      plan: profile.plan,
    });
    const { token: new_refresh_token } = signRefreshToken({ user_id: profile.id });

    const { error: insertError } = await supabase.from('revoked_refresh_tokens').insert({
      jti: payload.jti,
      user_id: payload.sub,
      expires_at: new Date(payload.exp * 1000).toISOString(),
    });
    if (insertError) {
      console.error('[auth] /refresh revoke insert failed', insertError);
    }

    res.json({ access_token, refresh_token: new_refresh_token });
  } catch (error) {
    console.error('[auth] /refresh error', error);
    const status = error.status || 500;
    res.status(status).json({ error: error.message || 'internal_error' });
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) return res.status(204).end();

    let payload;
    try {
      payload = verifyRefreshToken(parsed.data.refresh_token);
    } catch {
      return res.status(204).end();
    }

    const { error } = await supabase.from('revoked_refresh_tokens').upsert(
      {
        jti: payload.jti,
        user_id: payload.sub,
        expires_at: new Date(payload.exp * 1000).toISOString(),
      },
      { onConflict: 'jti' }
    );
    if (error) {
      console.error('[auth] /logout upsert failed', error);
    }

    res.status(204).end();
  } catch (error) {
    console.error('[auth] /logout error', error);
    res.status(204).end();
  }
});

export default router;

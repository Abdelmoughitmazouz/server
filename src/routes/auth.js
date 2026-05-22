import express from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../jwt.js';
import { saveGoogleProviderTokens } from '../google-provider-tokens.js';
import { invalidateSubscriptionsFingerprintCache } from '../youtube-subscriptions.js';

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
    .select('id, email, plan, allowed_channels, primary_channel_id, channels_limit')
    .eq('id', user_id)
    .maybeSingle();
  if (error) throw Object.assign(new Error('profile_lookup_failed'), { status: 500 });
  return data || {
    id: user_id,
    email: fallbackUser?.email || null,
    plan: 'free',
    allowed_channels: [],
    primary_channel_id: null,
    channels_limit: 1,
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
      console.error('[auth] exchange rejected: missing supabase token', {
        source: extracted.source,
        bodyKeys: Object.keys(req.body || {}),
        issues: extracted.issues || null,
      });
      return res.status(400).json({
        error: 'missing_supabase_token',
        detail: extracted.issues || null,
      });
    }

    console.log('[auth] exchange request accepted', {
      source: extracted.source,
      bodyKeys: Object.keys(req.body || {}),
      hasAuthorizationHeader: !!req.headers.authorization,
    });

    const { data, error } = await supabase.auth.getUser(extracted.token);
    if (error || !data?.user) {
      console.error('[auth] exchange rejected: invalid supabase token', {
        source: extracted.source,
        bodyKeys: Object.keys(req.body || {}),
        supabaseError: error?.message || error || null,
      });
      return res.status(401).json({ error: 'invalid_supabase_token' });
    }

    const profile = await loadProfile(data.user.id, data.user);
    const body = exchangeBodySchema.safeParse(req.body || {});
    if (body.success && body.data.provider_token) {
      const savedProviderToken = await saveGoogleProviderTokens(profile.id, {
        provider_token: body.data.provider_token,
        provider_refresh_token: body.data.provider_refresh_token || null,
        provider_token_expires_at: tokenExpiry(body.data.provider_token_expires_at),
      });
      if (savedProviderToken) {
        await invalidateSubscriptionsFingerprintCache(profile.id);
      }
    }

    const access_token = signAccessToken({
      user_id: profile.id,
      email: profile.email,
      plan: profile.plan,
    });
    const { token: refresh_token } = signRefreshToken({ user_id: profile.id });

    res.json({ access_token, refresh_token, profile });
  } catch (e) { next(e); }
});

const refreshSchema = z.object({ refresh_token: z.string().min(10) });

router.post('/refresh', async (req, res, next) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });

    let payload;
    try {
      payload = verifyRefreshToken(parsed.data.refresh_token);
    } catch {
      return res.status(401).json({ error: 'invalid_refresh_token' });
    }

    const { data: revoked } = await supabase
      .from('revoked_refresh_tokens')
      .select('jti')
      .eq('jti', payload.jti)
      .maybeSingle();
    if (revoked) return res.status(401).json({ error: 'revoked' });

    const profile = await loadProfile(payload.sub);
    const access_token = signAccessToken({
      user_id: profile.id,
      email: profile.email,
      plan: profile.plan,
    });
    const { token: new_refresh_token } = signRefreshToken({ user_id: profile.id });

    // Rotation: revoke the consumed jti so a stolen refresh token can't be replayed.
    await supabase.from('revoked_refresh_tokens').insert({
      jti: payload.jti,
      user_id: payload.sub,
      expires_at: new Date(payload.exp * 1000).toISOString(),
    });

    res.json({ access_token, refresh_token: new_refresh_token });
  } catch (e) { next(e); }
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

    await supabase.from('revoked_refresh_tokens').upsert(
      {
        jti: payload.jti,
        user_id: payload.sub,
        expires_at: new Date(payload.exp * 1000).toISOString(),
      },
      { onConflict: 'jti' }
    );

    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;

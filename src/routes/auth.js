import express from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken, verifyAccessToken } from '../jwt.js';
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

// دالة مصادقة ذكية تقبل توكن السيرفر أو توكن Supabase
async function authenticateRequest(req) {
  const h = req.headers.authorization || '';
  const token = h.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  // 1. تجربة فك توكن السيرفر أولاً (HS256)
  try {
    const payload = verifyAccessToken(token);
    if (payload?.user_id) {
      return { id: payload.user_id, source: 'server_jwt' };
    }
  } catch (_) {}

  // 2. تجربة فك توكن Supabase (ES256 / GoTrue)
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (data?.user?.id) {
      return { id: data.user.id, source: 'supabase_jwt', user: data.user };
    }
  } catch (_) {}

  return null;
}

// دالة تحميل بيانات المستخدم
async function loadProfile(user_id, fallbackUser) {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, brand_email, channel_title, primary_channel_id, allowed_channels, channels_limit, plan, created_at, subscription_expires_at, subscribed_at')
    .eq('id', user_id)
    .maybeSingle();

  if (error && error.code !== '42P01') {
    console.error('[auth] loadProfile query failed', error);
    throw Object.assign(new Error(`profile_lookup_failed: ${error.message}`), { status: 500 });
  }

  if (data) return data;

  const email = fallbackUser?.email || null;
  const isBrand = email?.includes('@pages.plusgoogle.com');

  const newUserPayload = {
    id: user_id,
    email,
    brand_email: isBrand ? email : null,
    plan: 'free',
    channels_limit: 1,
    allowed_channels: [],
  };

  await supabase.from('users').upsert(newUserPayload, { onConflict: 'id' });

  return {
    ...newUserPayload,
    primary_channel_id: null,
    channel_title: null,
    created_at: new Date().toISOString(),
    subscription_expires_at: null,
    subscribed_at: null,
  };
}

// دالة جلب بيانات القناة وتحديث قاعدة البيانات
async function fetchAndLinkYouTubeChannel(userId, providerToken, currentProfile) {
  if (!providerToken) return null;
  try {
    console.log(`[auth] Fetching YouTube channel info for user ${userId}...`);
    const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true', {
      headers: { Authorization: `Bearer ${providerToken}` }
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('[auth] YouTube API request failed:', res.status, errText);
      return null;
    }

    const data = await res.json();
    const channel = data.items?.[0];

    if (!channel?.id) {
      console.warn('[auth] No YouTube channel found for this provider token');
      return null;
    }

    const channelId = channel.id;
    const channelTitle = channel.snippet?.title || '';
    const email = currentProfile?.email || '';
    const isBrand = email.includes('@pages.plusgoogle.com');

    const allowed = Array.isArray(currentProfile?.allowed_channels) ? [...currentProfile.allowed_channels] : [];
    if (!allowed.includes(channelId)) {
      allowed.push(channelId);
    }

    const updatePayload = {
      channel_title: channelTitle,
      primary_channel_id: currentProfile?.primary_channel_id || channelId,
      allowed_channels: allowed,
    };

    if (isBrand) {
      updatePayload.brand_email = email;
    }

    const { data: updated, error: updateErr } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', userId)
      .select('id, email, brand_email, channel_title, primary_channel_id, allowed_channels, channels_limit, plan, created_at, subscription_expires_at, subscribed_at')
      .maybeSingle();

    if (updateErr) {
      console.error('[auth] Failed to update user with YouTube channel info:', updateErr);
      return null;
    }

    console.log(`[auth] Successfully updated user ${userId} -> Channel: ${channelTitle} (${channelId})`);
    return updated;
  } catch (err) {
    console.error('[auth] fetchAndLinkYouTubeChannel error:', err);
    return null;
  }
}

function tokenExpiry(value) {
  if (typeof value === 'number') return new Date(value * 1000).toISOString();
  return value || null;
}

// مسار Exchange
router.post('/exchange', async (req, res) => {
  try {
    const auth = await authenticateRequest(req);
    const body = exchangeBodySchema.safeParse(req.body || {});
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || body.data?.access_token || body.data?.supabase_access_token;

    if (!token) {
      return res.status(400).json({ error: 'missing_supabase_token' });
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'invalid_supabase_token', detail: error?.message || null });
    }

    let profile = await loadProfile(data.user.id, data.user);

    if (body.success && body.data.provider_token) {
      try {
        await saveGoogleProviderTokens(profile.id, {
          provider_token: body.data.provider_token,
          provider_refresh_token: body.data.provider_refresh_token || null,
          provider_token_expires_at: tokenExpiry(body.data.provider_token_expires_at),
          email: profile.email || data.user.email || null,
        });
        await invalidateSubscriptionsFingerprintCache(profile.id);

        const linkedProfile = await fetchAndLinkYouTubeChannel(profile.id, body.data.provider_token, profile);
        if (linkedProfile) {
          profile = linkedProfile;
        }
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
    res.status(error.status || 500).json({ error: error.message || 'internal_error' });
  }
});

const storeGoogleTokenSchema = z.object({
  provider_token: z.string().min(10),
  provider_refresh_token: z.string().min(10).optional(),
  provider_token_expires_at: z.union([z.string().datetime(), z.number()]).optional(),
}).passthrough();

// مسار store-google-token المصحح
router.post('/store-google-token', async (req, res) => {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return res.status(401).json({ error: 'invalid_token' });
    }

    const parsed = storeGoogleTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'bad_request', detail: parsed.error.issues });
    }

    const userId = auth.id;
    let profile = await loadProfile(userId, auth.user);

    await saveGoogleProviderTokens(userId, {
      provider_token: parsed.data.provider_token,
      provider_refresh_token: parsed.data.provider_refresh_token || null,
      provider_token_expires_at: tokenExpiry(parsed.data.provider_token_expires_at),
      email: profile.email || null,
    });

    await invalidateSubscriptionsFingerprintCache(userId);

    const linkedProfile = await fetchAndLinkYouTubeChannel(userId, parsed.data.provider_token, profile);

    res.json({ ok: true, profile: linkedProfile || profile });
  } catch (error) {
    console.error('[auth] /store-google-token error:', error);
    res.status(500).json({ error: error.message || 'internal_error' });
  }
});

const refreshSchema = z.object({ refresh_token: z.string().min(10) });

router.post('/refresh', async (req, res) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request' });

    let payload;
    try {
      payload = verifyRefreshToken(parsed.data.refresh_token);
    } catch (err) {
      return res.status(401).json({ error: 'invalid_refresh_token', detail: err.message });
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

    await supabase.from('revoked_refresh_tokens').insert({
      jti: payload.jti,
      user_id: payload.sub,
      expires_at: new Date(payload.exp * 1000).toISOString(),
    });

    res.json({ access_token, refresh_token: new_refresh_token });
  } catch (error) {
    res.status(500).json({ error: error.message || 'internal_error' });
  }
});

router.post('/logout', async (req, res) => {
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
  } catch {
    res.status(204).end();
  }
});

export default router;
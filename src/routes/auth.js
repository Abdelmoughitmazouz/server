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

// دالة جلب بيانات المستخدم كاملة مع حقول القناة والبراند
async function loadProfile(user_id, fallbackUser) {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, google_email, brand_email, channel_title, primary_channel_id, allowed_channels, channels_limit, plan, created_at, subscription_expires_at, subscribed_at')
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
  const isBrand = email?.includes('@pages.plusgoogle.com');

  const newUserPayload = {
    id: user_id,
    email,
    google_email: isBrand ? null : email,
    brand_email: isBrand ? email : null,
    plan: 'free',
    channels_limit: 1,
    allowed_channels: [],
  };

  const { error: insertError } = await supabase
    .from('users')
    .upsert(newUserPayload, { onConflict: 'id' });

  if (insertError) {
    console.error('[auth] loadProfile user upsert failed', {
      userId: user_id,
      errorCode: insertError.code,
      errorMessage: insertError.message,
    });
  }

  return {
    ...newUserPayload,
    primary_channel_id: null,
    channel_title: null,
    created_at: new Date().toISOString(),
    subscription_expires_at: null,
    subscribed_at: null,
  };
}

// دالة استخراج معرف القناة من Google YouTube Data API وربطها تلقائياً
async function fetchAndLinkYouTubeChannel(userId, providerToken, currentProfile) {
  if (!providerToken) return null;
  try {
    const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true', {
      headers: { Authorization: `Bearer ${providerToken}` },
    });

    if (!res.ok) {
      console.warn('[auth] YouTube API channels request failed:', res.status, await res.text().catch(() => ''));
      return null;
    }

    const data = await res.json();
    const channel = data.items?.[0];
    if (!channel?.id) {
      console.warn('[auth] No YouTube channel found for provider_token');
      return null;
    }

    const channelId = channel.id;
    const channelTitle = channel.snippet?.title || '';
    const email = currentProfile?.email || '';
    const isBrand = email.includes('@pages.plusgoogle.com');

    const existingAllowed = Array.isArray(currentProfile?.allowed_channels) ? [...currentProfile.allowed_channels] : [];
    if (!existingAllowed.includes(channelId)) {
      existingAllowed.push(channelId);
    }

    const updatePayload = {
      channel_title: channelTitle,
      primary_channel_id: currentProfile?.primary_channel_id || channelId,
      allowed_channels: existingAllowed,
    };

    if (isBrand) {
      updatePayload.brand_email = email;
    } else if (email) {
      updatePayload.google_email = email;
    }

    const { data: updated, error: updateErr } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', userId)
      .select('id, email, google_email, brand_email, channel_title, primary_channel_id, allowed_channels, channels_limit, plan, created_at, subscription_expires_at, subscribed_at')
      .maybeSingle();

    if (updateErr) {
      console.error('[auth] Failed to update user with YouTube channel info:', updateErr);
      return null;
    }

    console.log(`[auth] Auto-linked YouTube channel "${channelTitle}" (${channelId}) to user ${userId}`);
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

// مسار تبديل التوكن والمصادقة
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

    let profile = await loadProfile(data.user.id, data.user);
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

        // ربط القناة تلقائياً
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
    const status = error.status || 500;
    res.status(status).json({
      error: error.message || 'internal_error',
      ...(error.supabaseError ? { supabase_error: error.supabaseError } : {}),
    });
  }
});

const storeGoogleTokenSchema = z.object({
  provider_token: z.string().min(10),
  provider_refresh_token: z.string().min(10).optional(),
  provider_token_expires_at: z.union([z.string().datetime(), z.number()]).optional(),
}).passthrough();

// مسار حفظ توكن جوجل وربط القناة للمستخدم المسجل
router.post('/store-google-token', requireAuth, async (req, res, next) => {
  try {
    const parsed = storeGoogleTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'bad_request', detail: parsed.error.issues });
    }

    const userId = req.user.id;
    let profile = await loadProfile(userId);

    await saveGoogleProviderTokens(userId, {
      provider_token: parsed.data.provider_token,
      provider_refresh_token: parsed.data.provider_refresh_token || null,
      provider_token_expires_at: tokenExpiry(parsed.data.provider_token_expires_at),
      email: profile.email || null,
    });

    await invalidateSubscriptionsFingerprintCache(userId);

    // ربط القناة تلقائياً
    const linkedProfile = await fetchAndLinkYouTubeChannel(userId, parsed.data.provider_token, profile);

    res.json({ ok: true, profile: linkedProfile || profile });
  } catch (error) {
    console.error('[auth] /store-google-token error:', error);
    res.status(500).json({ error: error.message || 'internal_error' });
  }
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
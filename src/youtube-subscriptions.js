import { config } from './config.js';
import { supabase } from './supabase.js';
import {
  loadGoogleProviderTokens,
  updateGoogleAccessToken,
} from './google-provider-tokens.js';

const CACHE_TTL_MS = 60 * 1000;
const UC_ID_RE = /^UC[\w-]{20,}$/;
const YOUTUBE_SUBSCRIPTIONS_URL = 'https://www.googleapis.com/youtube/v3/subscriptions';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const memoryCache = new Map();

function googleReauthRequired() {
  return Object.assign(new Error('google_reauth_required'), {
    status: 200,
    reason: 'google_reauth_required',
  });
}

function isCacheFresh(cachedAt) {
  const time = Date.parse(cachedAt || 0);
  return Number.isFinite(time) && Date.now() - time < CACHE_TTL_MS;
}

export function fingerprintForChannelIds(channelIds) {
  return [...new Set(channelIds.filter((id) => UC_ID_RE.test(id)))].sort().join('|');
}

function fingerprintResult(channelIds, cachedAt = new Date().toISOString()) {
  const channels = [...new Set(channelIds.filter((id) => UC_ID_RE.test(id)))];
  return {
    ok: true,
    fingerprint: fingerprintForChannelIds(channels),
    subscriptionCount: channels.length,
    channelIds: channels,
    cachedAt,
  };
}

async function loadCachedFingerprint(userId) {
  const memory = memoryCache.get(userId);
  if (memory && isCacheFresh(memory.cachedAt)) return memory;

  const { data, error } = await supabase
    .from('youtube_subscription_fingerprint_cache')
    .select('fingerprint, subscription_count, channel_ids, cached_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error && error.code !== '42P01' && error.code !== 'PGRST205') {
    throw Object.assign(new Error('youtube_subscription_cache_lookup_failed'), { status: 500 });
  }
  if (!data || !isCacheFresh(data.cached_at)) return null;

  const cached = {
    ok: true,
    fingerprint: data.fingerprint,
    subscriptionCount: data.subscription_count,
    channelIds: Array.isArray(data.channel_ids) ? data.channel_ids : [],
    cachedAt: data.cached_at,
  };
  memoryCache.set(userId, cached);
  return cached;
}

async function cacheFingerprint(userId, result) {
  memoryCache.set(userId, result);
  const { error } = await supabase
    .from('youtube_subscription_fingerprint_cache')
    .upsert({
      user_id: userId,
      fingerprint: result.fingerprint,
      subscription_count: result.subscriptionCount,
      channel_ids: result.channelIds,
      cached_at: result.cachedAt,
    }, { onConflict: 'user_id' });
  if (error && error.code !== '42P01' && error.code !== 'PGRST205') {
    throw Object.assign(new Error('youtube_subscription_cache_store_failed'), { status: 500 });
  }
}

export async function invalidateSubscriptionsFingerprintCache(userId) {
  memoryCache.delete(userId);
  const { error } = await supabase
    .from('youtube_subscription_fingerprint_cache')
    .delete()
    .eq('user_id', userId);
  if (error && error.code !== '42P01' && error.code !== 'PGRST205') {
    throw Object.assign(new Error('youtube_subscription_cache_clear_failed'), { status: 500 });
  }
}

async function refreshGoogleAccessToken(userId, refreshToken) {
  if (!refreshToken || !config.googleOauthClientId) throw googleReauthRequired();
  const body = new URLSearchParams({
    client_id: config.googleOauthClientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  if (config.googleOauthClientSecret) body.set('client_secret', config.googleOauthClientSecret);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }).catch(() => null);
  const data = await response?.json().catch(() => null);
  if (!response?.ok || !data?.access_token) throw googleReauthRequired();

  await updateGoogleAccessToken(userId, data.access_token, Number(data.expires_in));
  return data.access_token;
}

async function fetchYoutubePage(accessToken, pageToken) {
  const params = new URLSearchParams({
    part: 'snippet',
    mine: 'true',
    maxResults: '50',
  });
  if (pageToken) params.set('pageToken', pageToken);
  const response = await fetch(`${YOUTUBE_SUBSCRIPTIONS_URL}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => null);
  const data = await response?.json().catch(() => null);
  return { response, data };
}

async function fetchYoutubeChannelIds(accessToken) {
  const channelIds = [];
  let pageToken = '';

  do {
    const { response, data } = await fetchYoutubePage(accessToken, pageToken);
    if (!response) throw Object.assign(new Error('youtube_subscriptions_fetch_failed'), { status: 502 });
    if (!response.ok) {
      throw Object.assign(new Error('youtube_subscriptions_fetch_failed'), {
        status: response.status === 401 ? 401 : 502,
        youtubeStatus: response.status,
      });
    }
    for (const item of data?.items || []) {
      const channelId = item?.snippet?.resourceId?.channelId;
      if (UC_ID_RE.test(channelId)) channelIds.push(channelId);
    }
    pageToken = data?.nextPageToken || '';
  } while (pageToken);

  return channelIds;
}

export async function getSubscriptionsFingerprint(userId, { force = false } = {}) {
  if (!force) {
    const cached = await loadCachedFingerprint(userId);
    if (cached) return cached;
  }

  const credentials = await loadGoogleProviderTokens(userId);
  if (!credentials?.accessToken) throw googleReauthRequired();

  let channelIds;
  try {
    channelIds = await fetchYoutubeChannelIds(credentials.accessToken);
  } catch (error) {
    if (error.status !== 401) throw error;
    const accessToken = await refreshGoogleAccessToken(userId, credentials.refreshToken);
    try {
      channelIds = await fetchYoutubeChannelIds(accessToken);
    } catch (refreshedError) {
      if (refreshedError.status === 401) throw googleReauthRequired();
      throw refreshedError;
    }
  }

  const result = fingerprintResult(channelIds);
  await cacheFingerprint(userId, result);
  return result;
}

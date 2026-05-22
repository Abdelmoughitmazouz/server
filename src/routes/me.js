import express from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import {
  fingerprintForChannelIds,
  getSubscriptionsFingerprint,
} from '../youtube-subscriptions.js';

const router = express.Router();

const BASE_COLS   = 'id, email, plan, allowed_channels, primary_channel_id, channels_limit';
const EXTRA_COLS  = 'name, subscription_expires_at, subscribed_at';
const MIN_SUBSCRIPTION_OVERLAP = 3;
const channelIdSchema = z.string().regex(/^UC[\w-]{20,}$/);

function uniqueChannelIds(values) {
  return [...new Set(values.filter((value) => channelIdSchema.safeParse(value).success))];
}

function channelIdsFromFolders(folders) {
  const ids = [];

  for (const folder of folders || []) {
    const channels = Array.isArray(folder?.metadata?.channels) ? folder.metadata.channels : [];
    for (const channel of channels) {
      if (typeof channel === 'string') {
        ids.push(channel);
      } else if (channel?.id) {
        ids.push(channel.id);
      } else if (channel?.channelId) {
        ids.push(channel.channelId);
      }
    }
  }

  return uniqueChannelIds(ids);
}

async function loadVerifiedSubscriptionContext(userId) {
  const [{ data: snapshots, error: snapshotsError }, { data: folders, error: foldersError }] =
    await Promise.all([
      supabase
        .from('youtube_context_snapshots')
        .select('subscription_channel_ids, subscription_fingerprint')
        .eq('user_id', userId),
      supabase
        .from('folders')
        .select('metadata')
        .eq('user_id', userId),
    ]);

  // Migration 002 may roll out after this server deploy. Folder metadata keeps
  // existing users fail-closed but usable until verified snapshots are seeded.
  let snapshotRows = snapshots || [];
  if (snapshotsError?.code === '42703' || snapshotsError?.code === 'PGRST204') {
    const { data: legacySnapshots, error: legacyError } = await supabase
      .from('youtube_context_snapshots')
      .select('subscription_channel_ids')
      .eq('user_id', userId);
    if (legacyError) {
      throw Object.assign(new Error('youtube_context_snapshot_lookup_failed'), { status: 500 });
    }
    snapshotRows = legacySnapshots || [];
  } else if (snapshotsError && snapshotsError.code !== '42P01' && snapshotsError.code !== 'PGRST205') {
    throw Object.assign(new Error('youtube_context_snapshot_lookup_failed'), { status: 500 });
  }
  if (foldersError) {
    throw Object.assign(new Error('youtube_context_folder_lookup_failed'), { status: 500 });
  }

  const snapshotIds = snapshotRows.flatMap((snapshot) =>
    Array.isArray(snapshot.subscription_channel_ids) ? snapshot.subscription_channel_ids : []
  );
  const fingerprints = snapshotRows
    .map((snapshot) => snapshot.subscription_fingerprint ||
      fingerprintForChannelIds(snapshot.subscription_channel_ids || []))
    .filter(Boolean);

  return {
    channelIds: uniqueChannelIds([...snapshotIds, ...channelIdsFromFolders(folders)]),
    fingerprints: new Set(fingerprints),
  };
}

function hasSubscriptionOverlap(currentSubscriptions, verifiedSubscriptions) {
  const known = new Set(verifiedSubscriptions);
  if (known.size < MIN_SUBSCRIPTION_OVERLAP) return false;

  let overlap = 0;
  for (const id of currentSubscriptions) {
    if (known.has(id) && ++overlap >= MIN_SUBSCRIPTION_OVERLAP) return true;
  }
  return false;
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    // Try extended select first; gracefully fall back if columns don't exist yet.
    let { data, error } = await supabase
      .from('users')
      .select(`${BASE_COLS}, ${EXTRA_COLS}`)
      .eq('id', req.user.user_id)
      .maybeSingle();

    if (error) {
      ({ data, error } = await supabase
        .from('users')
        .select(BASE_COLS)
        .eq('id', req.user.user_id)
        .maybeSingle());
    }

    if (error) return next(Object.assign(new Error('profile_lookup_failed'), { status: 500 }));

    const profile = data || {
      id: req.user.user_id,
      email: req.user.email,
      plan: 'free',
      allowed_channels: [],
      primary_channel_id: null,
      channels_limit: 1,
    };

    res.json({
      profile,
      min_extension_version: config.minExtensionVersion,
    });
  } catch (e) { next(e); }
});

function returnGoogleReauth(res, error) {
  if (error?.reason !== 'google_reauth_required') return false;
  res.json({ ok: false, reason: 'google_reauth_required' });
  return true;
}

router.get('/subscriptions-fingerprint', requireAuth, async (req, res, next) => {
  try {
    const subscriptions = await getSubscriptionsFingerprint(req.user.user_id);
    return res.json({
      ok: true,
      fingerprint: subscriptions.fingerprint,
      subscriptionCount: subscriptions.subscriptionCount,
    });
  } catch (e) {
    if (returnGoogleReauth(res, e)) return;
    next(e);
  }
});

router.post('/validate-youtube-context', requireAuth, async (req, res, next) => {
  try {
    const currentSubscriptions = await getSubscriptionsFingerprint(req.user.user_id);
    const verifiedSubscriptions = await loadVerifiedSubscriptionContext(req.user.user_id);
    const exactFingerprintMatch = verifiedSubscriptions.fingerprints.has(
      currentSubscriptions.fingerprint
    );

    if (!exactFingerprintMatch &&
        !hasSubscriptionOverlap(currentSubscriptions.channelIds, verifiedSubscriptions.channelIds)) {
      return res.json({ ok: false, reason: 'youtube_account_mismatch' });
    }

    return res.json({ ok: true });
  } catch (e) {
    if (returnGoogleReauth(res, e)) return;
    next(e);
  }
});

export default router;

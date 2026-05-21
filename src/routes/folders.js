import express from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { limitFor } from '../plans.js';

const router = express.Router();

const channelIdSchema = z.string().regex(/^UC[\w-]{20,}$/);
const folderIdSchema = z.string().uuid();
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{3,8}$/);
const nameSchema = z.string().min(1).max(100);

const metadataSchema = z
  .record(z.unknown())
  .refine((v) => JSON.stringify(v).length <= 10_000, { message: 'metadata_too_large' })
  .default({});

const folderInputSchema = z.object({
  id: folderIdSchema,
  name: nameSchema,
  color: colorSchema,
  metadata: metadataSchema.optional(),
  created_at: z.string().datetime().optional(),
});

const putBodySchema = z.object({
  channel_id: channelIdSchema,
  folders: z.array(folderInputSchema).max(500),
});

function summarizeFoldersPayload(body) {
  const folders = Array.isArray(body?.folders) ? body.folders : [];
  return {
    channel_id: body?.channel_id ?? null,
    folderCount: folders.length,
    folders: folders.map((folder) => ({
      id: folder?.id ?? null,
      idType: typeof folder?.id,
      name: folder?.name ?? null,
      color: folder?.color ?? null,
      created_at: folder?.created_at ?? null,
      metadataKeys: folder?.metadata && typeof folder.metadata === 'object'
        ? Object.keys(folder.metadata)
        : [],
      channelsCount: Array.isArray(folder?.metadata?.channels)
        ? folder.metadata.channels.length
        : null,
      firstChannelSample: Array.isArray(folder?.metadata?.channels) && folder.metadata.channels.length > 0
        ? folder.metadata.channels[0]
        : null,
    })),
  };
}

router.use(requireAuth);

// Single source of truth for plan + linked channels. Read fresh on every
// request — JWT plan can be 15 min stale, and allowed_channels can change at
// any time when the user links/unlinks a channel on the website.
async function loadAccess(user_id) {
  const { data, error } = await supabase
    .from('users')
    .select('plan, allowed_channels, primary_channel_id')
    .eq('id', user_id)
    .maybeSingle();
  if (error) throw Object.assign(new Error('user_load_failed'), { status: 500 });

  const plan = (data?.plan || 'free').toLowerCase();
  const list = Array.isArray(data?.allowed_channels) ? data.allowed_channels : [];
  // primary_channel_id is the legacy single-channel field; merge so old rows
  // without allowed_channels populated still authorize correctly.
  const allowed = data?.primary_channel_id && !list.includes(data.primary_channel_id)
    ? [data.primary_channel_id, ...list]
    : list;
  return { plan, allowed_channels: allowed };
}

function channelNotLinked(res, { channel_id, plan, allowed_channels }) {
  return res.status(403).json({
    error: 'channel_not_linked',
    channel_id,
    plan,
    allowed_channels,
    channels_limit: limitFor(plan).channels,
  });
}

router.get('/', async (req, res, next) => {
  try {
    const channel_id = req.query.channel_id ? String(req.query.channel_id) : null;
    if (!channel_id) {
      return res.status(400).json({ error: 'missing_channel_id' });
    }
    if (!channelIdSchema.safeParse(channel_id).success) {
      return res.status(400).json({ error: 'bad_channel_id' });
    }

    const access = await loadAccess(req.user.user_id);

    if (channel_id) {
      if (!access.allowed_channels.includes(channel_id)) {
        return channelNotLinked(res, { channel_id, ...access });
      }
    } else if (access.allowed_channels.length === 0) {
      // No linked channels yet — return empty rather than leaking historical rows.
      return res.json({ folders: [] });
    }

    let q = supabase
      .from('folders')
      .select('id, name, color, workspace_channel_id, metadata, created_at')
      .eq('user_id', req.user.user_id);
    if (channel_id) {
      q = q.eq('workspace_channel_id', channel_id);
    } else {
      q = q.in('workspace_channel_id', access.allowed_channels);
    }

    const { data, error } = await q;
    if (error) {
      console.error('[folders] fetch failed', error);
      return res.status(500).json({ error: 'folders_fetch_failed' });
    }
    // Always return an array — never 404 for a valid linked channel with no folders yet.
    return res.json({ folders: Array.isArray(data) ? data : [] });
  } catch (e) { next(e); }
});

router.put('/', async (req, res, next) => {
  try {
    const parsed = putBodySchema.safeParse(req.body);
    if (!parsed.success) {
      console.error('[folders] bad_request validation failed', {
        issues: parsed.error.issues,
        body: summarizeFoldersPayload(req.body),
      });
      console.error('[folders] bad_request issues JSON:\n' + JSON.stringify(parsed.error.issues, null, 2));
      return res.status(400).json({ error: 'bad_request', detail: parsed.error.issues });
    }
    const { channel_id, folders } = parsed.data;

    console.log('[folders] sync request accepted', summarizeFoldersPayload(parsed.data));

    const access = await loadAccess(req.user.user_id);
    if (!access.allowed_channels.includes(channel_id)) {
      return channelNotLinked(res, { channel_id, ...access });
    }

    const { folders_per_workspace: limit } = limitFor(access.plan);
    if (folders.length > limit) {
      return res.status(403).json({
        error: 'folder_limit_exceeded',
        plan: access.plan,
        limit,
        attempted: folders.length,
      });
    }

    // user_id always comes from the JWT, never the body — a client cannot write
    // folders for someone else regardless of what it sends.
    const rows = folders.map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color,
      workspace_channel_id: channel_id,
      user_id: req.user.user_id,
      metadata: f.metadata || {},
      ...(f.created_at ? { created_at: f.created_at } : {}),
    }));

    const { data: applied, error: upsertErr } = await supabase
      .from('folders')
      .upsert(rows, { onConflict: 'id' })
      .select('id, name, color, workspace_channel_id, metadata, created_at');

    if (upsertErr) {
      // Defence-in-depth: the legacy Supabase trigger may also raise this.
      if (upsertErr.message?.includes('folder_limit_exceeded')) {
        return res.status(403).json({ error: 'folder_limit_exceeded', plan: access.plan, limit });
      }
      console.error('[folders] upsert failed', upsertErr);
      return res.status(500).json({ error: 'folders_upsert_failed' });
    }

    let deleted_ids = [];
    const localIds = rows.map((r) => r.id);
    let delQ = supabase
      .from('folders')
      .delete()
      .eq('user_id', req.user.user_id)
      .eq('workspace_channel_id', channel_id);
    if (localIds.length > 0) {
      delQ = delQ.not('id', 'in', `(${localIds.join(',')})`);
    }
    const { data: delData, error: delErr } = await delQ.select('id');
    if (delErr) {
      console.error('[folders] cleanup failed', delErr);
    } else {
      deleted_ids = (delData || []).map((r) => r.id);
    }

    res.json({ folders: applied || [], deleted_ids });
  } catch (e) { next(e); }
});

// Delete is intentionally NOT channel-checked: a user must always be able to
// remove their own data, including stragglers from a channel they've since
// unlinked. Scope is enforced by (id, user_id) on the DELETE.
router.delete('/:id', async (req, res, next) => {
  try {
    const parsed = folderIdSchema.safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: 'bad_id' });

    const { data, error } = await supabase
      .from('folders')
      .delete()
      .eq('id', parsed.data)
      .eq('user_id', req.user.user_id)
      .select('id');

    if (error) {
      console.error('[folders] delete failed', error);
      return res.status(500).json({ error: 'folder_delete_failed' });
    }
    if (!data || data.length === 0) return res.status(404).json({ error: 'not_found' });

    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;

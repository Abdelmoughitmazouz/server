import express from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { limitFor } from '../plans.js';
import { getOrCreateWorkspace } from '../services/workspace.js';

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

router.use(requireAuth);

async function resolveWorkspace(userId, channelId) {
  return getOrCreateWorkspace(userId, channelId);
}

router.get('/', async (req, res, next) => {
  try {
    const channelId = req.headers['x-workspace-channel'] || req.query.channel_id;
    if (!channelId) {
      return res.status(400).json({ error: 'missing_channel_id' });
    }
    if (!channelIdSchema.safeParse(channelId).success) {
      return res.status(400).json({ error: 'bad_channel_id' });
    }

    const workspace = await resolveWorkspace(req.user.user_id, channelId);

    const { data, error } = await supabase
      .from('folders')
      .select('id, name, color, workspace_id, metadata, created_at')
      .eq('workspace_id', workspace.id);

    if (error) {
      console.error('[folders] fetch failed', error);
      return res.status(500).json({ error: 'folders_fetch_failed' });
    }

    return res.json({ folders: Array.isArray(data) ? data : [], workspace_id: workspace.id });
  } catch (e) { next(e); }
});

router.put('/', async (req, res, next) => {
  try {
    const parsed = putBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'bad_request', detail: parsed.error.issues });
    }
    const { channel_id, folders } = parsed.data;

    const workspace = await resolveWorkspace(req.user.user_id, channel_id);

    const { folders_per_workspace: limit } = limitFor((await supabase
      .from('users')
      .select('plan')
      .eq('id', req.user.user_id)
      .maybeSingle()).data?.plan || 'free');
    if (folders.length > limit) {
      return res.status(403).json({
        error: 'folder_limit_exceeded',
        plan: (await supabase.from('users').select('plan').eq('id', req.user.user_id).maybeSingle()).data?.plan || 'free',
        limit,
        attempted: folders.length,
      });
    }

    const rows = folders.map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color,
      workspace_id: workspace.id,
      user_id: req.user.user_id,
      metadata: f.metadata || {},
      ...(f.created_at ? { created_at: f.created_at } : {}),
    }));

    const { data: applied, error: upsertErr } = await supabase
      .from('folders')
      .upsert(rows, { onConflict: 'id' })
      .select('id, name, color, workspace_id, metadata, created_at');

    if (upsertErr) {
      if (upsertErr.message?.includes('folder_limit_exceeded')) {
        return res.status(403).json({ error: 'folder_limit_exceeded' });
      }
      console.error('[folders] upsert failed', upsertErr);
      return res.status(500).json({ error: 'folders_upsert_failed' });
    }

    let deleted_ids = [];
    const localIds = rows.map((r) => r.id);
    let delQ = supabase
      .from('folders')
      .delete()
      .eq('workspace_id', workspace.id);
    if (localIds.length > 0) {
      delQ = delQ.not('id', 'in', `(${localIds.join(',')})`);
    }
    const { data: delData, error: delErr } = await delQ.select('id');
    if (delErr) {
      console.error('[folders] cleanup failed', delErr);
    } else {
      deleted_ids = (delData || []).map((r) => r.id);
    }

    res.json({ folders: applied || [], deleted_ids, workspace_id: workspace.id });
  } catch (e) { next(e); }
});

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

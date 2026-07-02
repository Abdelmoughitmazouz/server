import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  getOrCreateWorkspace,
  listWorkspaces,
  deleteWorkspace,
  renameWorkspace,
  updateWorkspaceMeta,
  countWorkspaces,
} from '../services/workspace.js';
import { supabase } from '../supabase.js';

const router = express.Router();

router.use(requireAuth);

const channelIdSchema = z.string().regex(/^UC[\w-]{20,}$/);

router.get('/', async (req, res, next) => {
  try {
    const workspaces = await listWorkspaces(req.user.user_id);
    const workspaceCount = await countWorkspaces(req.user.user_id);

    const enriched = await Promise.all(workspaces.map(async (w) => {
      const { count: folderCount } = await supabase
        .from('folders')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', w.id);

      const { count: subscriptionCount } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', w.id);

      return {
        ...w,
        folder_count: folderCount || 0,
        subscription_count: subscriptionCount || 0,
      };
    }));

    res.json({ workspaces: enriched, count: workspaceCount });
  } catch (e) { next(e); }
});

router.get('/current', async (req, res, next) => {
  try {
    const channelId = req.headers['x-workspace-channel'] || req.query.channel_id;
    if (!channelId || !channelIdSchema.safeParse(channelId).success) {
      return res.status(400).json({ error: 'bad_or_missing_channel_id' });
    }

    const workspace = await getOrCreateWorkspace(req.user.user_id, channelId);

    const { count: folderCount } = await supabase
      .from('folders')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspace.id);

    const { count: subscriptionCount } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspace.id);

    res.json({
      workspace: {
        ...workspace,
        folder_count: folderCount || 0,
        subscription_count: subscriptionCount || 0,
      },
    });
  } catch (e) { next(e); }
});

const createBodySchema = z.object({
  channel_id: channelIdSchema,
  channel_name: z.string().max(200).optional(),
  channel_handle: z.string().max(200).optional(),
  channel_avatar: z.string().max(1000).optional(),
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = createBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'bad_request', detail: parsed.error.issues });
    }

    const { channel_id, ...meta } = parsed.data;
    const workspace = await getOrCreateWorkspace(req.user.user_id, channel_id, meta);
    res.status(201).json({ workspace });
  } catch (e) {
    if (e.reason === 'workspace_limit_reached') {
      return res.status(403).json({ error: 'workspace_limit_reached', current: e.current, limit: e.limit });
    }
    next(e);
  }
});

const renameBodySchema = z.object({ name: z.string().min(1).max(200) });

router.patch('/:id', async (req, res, next) => {
  try {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ error: 'bad_id' });

    const parsed = renameBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'bad_request', detail: parsed.error.issues });

    const workspace = await renameWorkspace(idParsed.data, req.user.user_id, parsed.data.name);
    res.json({ workspace });
  } catch (e) {
    if (e.reason === 'workspace_not_found') return res.status(404).json({ error: 'workspace_not_found' });
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ error: 'bad_id' });

    const workspace = await updateWorkspaceMeta(idParsed.data, req.user.user_id, req.body);
    res.json({ workspace });
  } catch (e) {
    if (e.reason === 'workspace_not_found') return res.status(404).json({ error: 'workspace_not_found' });
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ error: 'bad_id' });

    await deleteWorkspace(idParsed.data, req.user.user_id);
    res.status(204).end();
  } catch (e) {
    if (e.reason === 'workspace_not_found') return res.status(404).json({ error: 'workspace_not_found' });
    next(e);
  }
});

router.get('/:id/stats', async (req, res, next) => {
  try {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ error: 'bad_id' });

    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', idParsed.data)
      .eq('user_id', req.user.user_id)
      .single();

    if (wsError || !workspace) return res.status(404).json({ error: 'workspace_not_found' });

    const { count: folderCount } = await supabase
      .from('folders')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspace.id);

    const { count: subscriptionCount } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspace.id);

    res.json({
      workspace,
      folder_count: folderCount || 0,
      subscription_count: subscriptionCount || 0,
    });
  } catch (e) { next(e); }
});

export default router;

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
  parent_id: z.string().uuid().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  metadata: metadataSchema.optional(),
  created_at: z.string().datetime().optional(),
});

const putBodySchema = z.object({
  channel_id: channelIdSchema,
  folders: z.array(folderInputSchema).max(500),
});

router.use(requireAuth);

// دالة ذكية لإيجاد أو تحديث مساحة العمل لتفادي خطأ workspace_limit_reached
async function resolveWorkspace(userId, channelId) {
  // 1. جلب بيانات وخطة المستخدم
  const { data: userProfile } = await supabase
    .from('users')
    .select('plan, primary_channel_id, allowed_channels')
    .eq('id', userId)
    .maybeSingle();

  const plan = userProfile?.plan || 'free';
  const { workspaces: wsLimit } = limitFor(plan);

  // 2. البحث عن مساحة عمل موجودة بنفس القناة
  const { data: existingWs } = await supabase
    .from('workspaces')
    .select('*')
    .eq('user_id', userId)
    .eq('channel_id', channelId)
    .maybeSingle();

  if (existingWs) return existingWs;

  // 3. إذا كان المستخدم في الخطة المجانية ولديه مساحة عمل سابقة لقناة أخرى، نحدثها للقناة الحالية
  if (wsLimit === 1) {
    const { data: anyWs } = await supabase
      .from('workspaces')
      .select('*')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (anyWs) {
      const { data: updatedWs } = await supabase
        .from('workspaces')
        .update({
          channel_id: channelId,
          workspace_channel_id: channelId,
          updated_at: new Date().toISOString()
        })
        .eq('id', anyWs.id)
        .select()
        .single();

      if (updatedWs) return updatedWs;
    }
  }

  // 4. إنشاء مساحة عمل جديدة إذا لم تكن الحدود قد اكتملت
  return getOrCreateWorkspace(userId, channelId);
}

// GET /api/folders
router.get('/', async (req, res, next) => {
  try {
    const channelId = req.headers['x-workspace-channel'] || req.query.channel_id;
    if (!channelId) return res.status(400).json({ error: 'missing_channel_id' });
    if (!channelIdSchema.safeParse(channelId).success) {
      return res.status(400).json({ error: 'bad_channel_id' });
    }

    const userId = req.user.user_id || req.user.id;
    let workspace;
    try {
      workspace = await resolveWorkspace(userId, channelId);
    } catch (e) {
      if (e.reason === 'workspace_limit_reached' || e.message === 'workspace_limit_reached') {
        return res.status(403).json({ error: 'channel_not_linked', reason: 'workspace_limit_reached' });
      }
      throw e;
    }

    const { data, error } = await supabase
      .from('folders')
      .select('id, name, color, parent_id, workspace_id, channel_id, workspace_channel_id, metadata, created_at')
      .eq('workspace_id', workspace.id);

    if (error) {
      console.error('[folders] fetch failed', error);
      return res.status(500).json({ error: 'folders_fetch_failed' });
    }

    return res.json({ folders: Array.isArray(data) ? data : [], workspace_id: workspace.id });
  } catch (e) {
    next(e);
  }
});

// PUT /api/folders
router.put('/', async (req, res, next) => {
  try {
    const parsed = putBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'bad_request', detail: parsed.error.issues });
    }
    const { channel_id, folders } = parsed.data;
    const userId = req.user.user_id || req.user.id;

    let workspace;
    try {
      workspace = await resolveWorkspace(userId, channel_id);
    } catch (e) {
      if (e.reason === 'workspace_limit_reached' || e.message === 'workspace_limit_reached') {
        return res.status(403).json({ error: 'channel_not_linked', reason: 'workspace_limit_reached' });
      }
      throw e;
    }

    const { data: userProfile } = await supabase
      .from('users')
      .select('plan')
      .eq('id', userId)
      .maybeSingle();

    const plan = userProfile?.plan || 'free';
    const { folders_per_workspace: limit } = limitFor(plan);

    if (folders.length > limit) {
      return res.status(403).json({
        error: 'folder_limit_exceeded',
        plan,
        limit,
        attempted: folders.length,
      });
    }

    const rows = folders.map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color,
      parent_id: f.parent_id || f.parentId || null,
      workspace_id: String(workspace.id),
      channel_id: channel_id,
      workspace_channel_id: channel_id,
      user_id: userId,
      metadata: {
        ...(f.metadata || {}),
        parentId: f.parent_id || f.parentId || null,
      },
      ...(f.created_at ? { created_at: f.created_at } : {}),
    }));

    if (rows.length > 0) {
      const { data: applied, error: upsertErr } = await supabase
        .from('folders')
        .upsert(rows, { onConflict: 'id' })
        .select('id, name, color, parent_id, workspace_id, channel_id, metadata, created_at');

      if (upsertErr) {
        if (upsertErr.message?.includes('folder_limit_exceeded')) {
          return res.status(403).json({ error: 'folder_limit_exceeded' });
        }
        console.error('[folders] upsert failed', upsertErr);
        return res.status(500).json({ error: 'folders_upsert_failed' });
      }
    }

    let deleted_ids = [];
    const localIds = rows.map((r) => r.id);
    let delQ = supabase
      .from('folders')
      .delete()
      .eq('workspace_id', String(workspace.id));

    if (localIds.length > 0) {
      delQ = delQ.not('id', 'in', `(${localIds.join(',')})`);
    }

    const { data: delData, error: delErr } = await delQ.select('id');
    if (delErr) {
      console.error('[folders] cleanup failed', delErr);
    } else {
      deleted_ids = (delData || []).map((r) => r.id);
    }

    console.log(`[folders] Successfully synced ${rows.length} folder(s) for workspace ${workspace.id}`);
    res.json({ folders: rows, deleted_ids, workspace_id: workspace.id });
  } catch (e) {
    next(e);
  }
});

// DELETE /api/folders/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const parsed = folderIdSchema.safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ error: 'bad_id' });

    const userId = req.user.user_id || req.user.id;

    const { data, error } = await supabase
      .from('folders')
      .delete()
      .eq('id', parsed.data)
      .eq('user_id', userId)
      .select('id');

    if (error) {
      console.error('[folders] delete failed', error);
      return res.status(500).json({ error: 'folder_delete_failed' });
    }
    if (!data || data.length === 0) return res.status(404).json({ error: 'not_found' });

    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

export default router;
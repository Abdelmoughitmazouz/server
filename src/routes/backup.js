import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../supabase.js';
import { limitFor } from '../plans.js';
import { getOrCreateWorkspace } from '../services/workspace.js';

const router = express.Router();
router.use(requireAuth);

const channelIdSchema = z.string().regex(/^UC[\w-]{20,}$/);

// ── 1. تصدير المجلدات من قاعدة البيانات مباشرة ──
router.get('/export-folders', async (req, res, next) => {
  try {
    const channelId = req.headers['x-workspace-channel'] || req.query.channel_id;
    if (!channelId || !channelIdSchema.safeParse(channelId).success) {
      return res.status(400).json({ error: 'bad_channel_id' });
    }

    const userId = req.user.user_id || req.user.id;
    const workspace = await getOrCreateWorkspace(userId, channelId);

    const { data: folders, error } = await supabase
      .from('folders')
      .select('id, name, color, parent_id, metadata, created_at')
      .eq('workspace_id', workspace.id);

    if (error) throw error;

    const payload = {
      _source: 'foldertube',
      _type: 'folders',
      _version: '1.0.9',
      exportedAt: new Date().toISOString(),
      folders: (folders || []).map(f => ({
        id: f.id,
        name: f.name,
        color: f.color,
        parentId: f.parent_id || f.metadata?.parentId || null,
        channels: Array.isArray(f.metadata?.channels) ? f.metadata.channels : []
      }))
    };

    res.json({ ok: true, data: payload });
  } catch (err) {
    next(err);
  }
});

// ── 2. استيراد المجلدات وفحصها وحفظها في خطوة واحدة ──
router.post('/import-folders', async (req, res, next) => {
  try {
    const { channel_id, backupData } = req.body;
    if (!channel_id || !channelIdSchema.safeParse(channel_id).success) {
      return res.status(400).json({ error: 'bad_channel_id' });
    }

    if (!backupData || backupData._source !== 'foldertube' || !Array.isArray(backupData.folders)) {
      return res.status(400).json({ error: 'invalid_backup_format', message: 'Not a valid FolderTube backup file' });
    }

    const userId = req.user.user_id || req.user.id;
    const workspace = await getOrCreateWorkspace(userId, channel_id);

    // معرفة خطة المستخدم والحد الأقصى
    const { data: userProfile } = await supabase
      .from('users')
      .select('plan')
      .eq('id', userId)
      .maybeSingle();

    const plan = userProfile?.plan || 'free';
    const { folders_per_workspace: limit } = limitFor(plan);

    let rawFolders = backupData.folders;
    if (rawFolders.length > limit) {
      // دمج المجلدات الزائدة إن كان المستخدم مجانياً
      const kept = rawFolders.slice(0, limit - 1);
      const remaining = rawFolders.slice(limit - 1);
      const mergedChannels = remaining.flatMap(f => f.channels || []);
      kept.push({
        id: crypto.randomUUID(),
        name: 'Imported Other',
        color: '#a29bfe',
        parentId: null,
        channels: mergedChannels
      });
      rawFolders = kept;
    }

    const rows = rawFolders.map((f, idx) => {
      const folderId = f.id && typeof f.id === 'string' && f.id.length > 10 ? f.id : crypto.randomUUID();
      return {
        id: folderId,
        name: String(f.name || 'Untitled').slice(0, 90).trim(),
        color: f.color || '#3ea6ff',
        parent_id: f.parentId || null,
        workspace_id: String(workspace.id),
        channel_id: channel_id,
        workspace_channel_id: channel_id,
        user_id: userId,
        metadata: {
          channels: Array.isArray(f.channels) ? f.channels : [],
          parentId: f.parentId || null,
          index: idx,
          sortMode: 'manual'
        },
        created_at: new Date().toISOString()
      };
    });

    if (rows.length > 0) {
      const { error: upsertErr } = await supabase
        .from('folders')
        .upsert(rows, { onConflict: 'id' });

      if (upsertErr) throw upsertErr;
    }

    res.json({ ok: true, folders: rows, count: rows.length });
  } catch (err) {
    next(err);
  }
});

export default router;
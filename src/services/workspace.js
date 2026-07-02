import { supabase } from '../supabase.js';
import { limitFor } from '../plans.js';

function workspaceLimitReached(current, max) {
  return Object.assign(new Error('workspace_limit_reached'), {
    status: 403,
    reason: 'workspace_limit_reached',
    current,
    limit: max,
  });
}

function workspaceNotFound() {
  return Object.assign(new Error('workspace_not_found'), {
    status: 404,
    reason: 'workspace_not_found',
  });
}

export async function getWorkspace(userId, channelId) {
  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('user_id', userId)
    .eq('channel_id', channelId)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error('workspace_lookup_failed'), {
      status: 500,
      supabaseError: error,
    });
  }

  return data || null;
}

export async function createWorkspace(userId, channelId, channelMeta = {}) {
  const { data, error } = await supabase
    .from('workspaces')
    .insert({
      user_id: userId,
      channel_id: channelId,
      channel_name: channelMeta.channel_name || null,
      channel_handle: channelMeta.channel_handle || null,
      channel_avatar: channelMeta.channel_avatar || null,
    })
    .select()
    .single();

  if (error) {
    throw Object.assign(new Error('workspace_create_failed'), {
      status: 500,
      supabaseError: error,
    });
  }

  return data;
}

export async function getOrCreateWorkspace(userId, channelId, channelMeta = {}) {
  const existing = await getWorkspace(userId, channelId);
  if (existing) return existing;

  await checkWorkspaceLimit(userId);
  return createWorkspace(userId, channelId, channelMeta);
}

export async function countWorkspaces(userId) {
  const { count, error } = await supabase
    .from('workspaces')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) {
    throw Object.assign(new Error('workspace_count_failed'), {
      status: 500,
      supabaseError: error,
    });
  }

  return count || 0;
}

export async function checkWorkspaceLimit(userId) {
  const { data: user, error } = await supabase
    .from('users')
    .select('plan')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error('user_load_failed'), { status: 500 });
  }

  const plan = (user?.plan || 'free').toLowerCase();
  const { workspaces: maxWorkspaces } = limitFor(plan);
  const current = await countWorkspaces(userId);

  if (current >= maxWorkspaces) {
    throw workspaceLimitReached(current, maxWorkspaces);
  }
}

export async function deleteWorkspace(id, userId) {
  const { data, error } = await supabase
    .from('workspaces')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .single();

  if (error) {
    throw Object.assign(new Error('workspace_delete_failed'), {
      status: 500,
      supabaseError: error,
    });
  }

  if (!data) throw workspaceNotFound();
  return data;
}

export async function renameWorkspace(id, userId, name) {
  const { data, error } = await supabase
    .from('workspaces')
    .update({ channel_name: name, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw Object.assign(new Error('workspace_rename_failed'), {
      status: 500,
      supabaseError: error,
    });
  }

  if (!data) throw workspaceNotFound();
  return data;
}

export async function updateWorkspaceMeta(id, userId, meta) {
  const updates = { updated_at: new Date().toISOString() };
  if (meta.channel_name !== undefined) updates.channel_name = meta.channel_name;
  if (meta.channel_handle !== undefined) updates.channel_handle = meta.channel_handle;
  if (meta.channel_avatar !== undefined) updates.channel_avatar = meta.channel_avatar;

  const { data, error } = await supabase
    .from('workspaces')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    throw Object.assign(new Error('workspace_update_failed'), {
      status: 500,
      supabaseError: error,
    });
  }

  if (!data) throw workspaceNotFound();
  return data;
}

export async function listWorkspaces(userId) {
  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw Object.assign(new Error('workspaces_list_failed'), {
      status: 500,
      supabaseError: error,
    });
  }

  return data || [];
}

import express from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { supabase } from '../supabase.js';
import { signAccessToken, signRefreshToken } from '../jwt.js';

const router = express.Router();

function explainError(err) {
  if (!err) return null;
  return {
    code: err.code || null,
    message: err.message || String(err),
    details: err.details || null,
    hint: err.hint || null,
  };
}

const tokenBody = z.object({ email: z.string().email() });

router.post('/token', async (req, res, next) => {
  try {
    const parsed = tokenBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'bad_request', detail: parsed.error.issues });
    }
    const { email } = parsed.data;

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, plan')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        error: 'lookup_failed',
        supabase_error: explainError(error),
      });
    }
    if (!user) {
      return res.status(404).json({ error: 'user_not_found', email });
    }

    const access_token = signAccessToken({
      user_id: user.id,
      email: user.email,
      plan: user.plan,
    });
    const { token: refresh_token } = signRefreshToken({ user_id: user.id });

    res.json({ access_token, refresh_token, profile: user });
  } catch (e) { next(e); }
});

router.get('/diagnose', async (req, res) => {
  const key = config.supabaseServiceRoleKey || '';
  const report = {
    config: {
      supabase_url: config.supabaseUrl,
      service_role_key_length: key.length,
      service_role_key_prefix: key.slice(0, 12),
      service_role_key_suffix: key.slice(-6),
      service_role_key_role: (() => {
        try {
          const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString('utf8'));
          return payload.role || null;
        } catch { return null; }
      })(),
    },
    checks: {},
  };

  try {
    const { count, error } = await supabase
      .from('google_oauth_credentials')
      .select('*', { count: 'exact', head: true });
    report.checks.google_oauth_credentials = error
      ? { ok: false, error: explainError(error) }
      : { ok: true, count };
  } catch (e) {
    report.checks.google_oauth_credentials = { ok: false, error: String(e) };
  }

  try {
    const { count, error } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });
    report.checks.users_count = error
      ? { ok: false, error: explainError(error) }
      : { ok: true, count };
  } catch (e) {
    report.checks.users_count = { ok: false, error: String(e) };
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, plan')
      .limit(5);
    report.checks.users_sample = error
      ? { ok: false, error: explainError(error) }
      : { ok: true, rows: data };
  } catch (e) {
    report.checks.users_sample = { ok: false, error: String(e) };
  }

  try {
    const { count, error } = await supabase
      .from('folders')
      .select('*', { count: 'exact', head: true });
    report.checks.folders_count = error
      ? { ok: false, error: explainError(error) }
      : { ok: true, count };
  } catch (e) {
    report.checks.folders_count = { ok: false, error: String(e) };
  }

  try {
    const { count, error } = await supabase
      .from('workspaces')
      .select('*', { count: 'exact', head: true });
    report.checks.workspaces_count = error
      ? { ok: false, error: explainError(error) }
      : { ok: true, count };
  } catch (e) {
    report.checks.workspaces_count = { ok: false, error: String(e) };
  }

  try {
    const { count, error } = await supabase
      .from('revoked_refresh_tokens')
      .select('*', { count: 'exact', head: true });
    report.checks.revoked_refresh_tokens = error
      ? { ok: false, error: explainError(error) }
      : { ok: true, count };
  } catch (e) {
    report.checks.revoked_refresh_tokens = { ok: false, error: String(e) };
  }

  res.json(report);
});

export default router;

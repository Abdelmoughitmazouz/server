import express from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { supabase } from '../supabase.js';
import { signAccessToken, signRefreshToken } from '../jwt.js';

const router = express.Router();

// Format a Supabase error so the full PostgREST/PG diagnostic comes back to
// the caller. Safe ONLY because this whole router is mounted behind
// DEV_TOKEN_ENABLED — never expose this from production routes.
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
      .select('id, email, plan, allowed_channels, primary_channel_id, channels_limit')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      console.error('[dev/token] supabase error:', error);
      return res.status(500).json({
        error: 'lookup_failed',
        supabase_error: explainError(error),
        hint: 'Run GET /api/dev/diagnose for full schema/connectivity report.',
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

// GET /api/dev/diagnose — runs a battery of Supabase checks and reports
// exactly which one failed. Use this to localise auth/key/schema problems
// without grepping through server logs. Each check is independent — one
// failure does not skip the rest.
router.get('/diagnose', async (req, res) => {
  const key = config.supabaseServiceRoleKey || '';
  const report = {
    config: {
      supabase_url: config.supabaseUrl,
      service_role_key_length: key.length,
      service_role_key_prefix: key.slice(0, 12),
      service_role_key_suffix: key.slice(-6),
      // The service_role JWT decodes to {role: "service_role"}. The anon key
      // decodes to {role: "anon"}. We surface the role from the JWT payload
      // so you can spot the classic mistake of pasting the anon key.
      service_role_key_role: (() => {
        try {
          const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString('utf8'));
          return payload.role || null;
        } catch { return null; }
      })(),
    },
    checks: {},
  };

  // 1. Count rows in public.users — confirms table exists and key works.
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

  // 2. Sample rows — confirms the columns we expect exist.
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, plan, allowed_channels, primary_channel_id')
      .limit(5);
    report.checks.users_sample = error
      ? { ok: false, error: explainError(error) }
      : { ok: true, rows: data };
  } catch (e) {
    report.checks.users_sample = { ok: false, error: String(e) };
  }

  // 3. Folders table reachable.
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

  // 4. revoked_refresh_tokens — confirms migration 001 was applied.
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

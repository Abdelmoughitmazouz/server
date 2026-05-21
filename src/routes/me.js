import express from 'express';
import { supabase } from '../supabase.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const BASE_COLS   = 'id, email, plan, allowed_channels, primary_channel_id, channels_limit';
const EXTRA_COLS  = 'name, subscription_expires_at, subscribed_at';

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

export default router;

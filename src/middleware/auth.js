import { verifyAccessToken } from '../jwt.js';

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: 'missing_token' });
  try {
    const payload = verifyAccessToken(m[1]);
    req.user = { user_id: payload.sub, email: payload.email, plan: payload.plan };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'token_expired' });
    return res.status(401).json({ error: 'invalid_token' });
  }
}

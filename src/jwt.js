import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from './config.js';

const ISS = 'foldertube';
const ACCESS_AUD = 'foldertube-extension';
const REFRESH_AUD = 'foldertube-refresh';

export function signAccessToken({ user_id, email, plan }) {
  return jwt.sign(
    { sub: user_id, email, plan },
    config.jwtSecret,
    { expiresIn: config.accessTokenTtl, audience: ACCESS_AUD, issuer: ISS }
  );
}

export function signRefreshToken({ user_id }) {
  const jti = crypto.randomBytes(16).toString('hex');
  const token = jwt.sign(
    { sub: user_id, jti },
    config.jwtSecret,
    { expiresIn: config.refreshTokenTtl, audience: REFRESH_AUD, issuer: ISS }
  );
  return { token, jti };
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwtSecret, { audience: ACCESS_AUD, issuer: ISS });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, config.jwtSecret, { audience: REFRESH_AUD, issuer: ISS });
}

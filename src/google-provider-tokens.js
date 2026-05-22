import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from './config.js';
import { supabase } from './supabase.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function encryptionKey() {
  return createHash('sha256').update(config.googleTokenEncryptionKey).digest();
}

function encrypt(token) {
  if (!token) return null;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

function decrypt(ciphertext) {
  if (!ciphertext) return null;
  const [iv, tag, encrypted] = ciphertext.split('.');
  if (!iv || !tag || !encrypted) throw new Error('google_token_ciphertext_invalid');
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export async function saveGoogleProviderTokens(userId, tokens) {
  if (!tokens?.provider_token) return false;

  const row = {
    user_id: userId,
    access_token_ciphertext: encrypt(tokens.provider_token),
    access_token_expires_at: tokens.provider_token_expires_at || null,
    updated_at: new Date().toISOString(),
  };
  if (tokens.provider_refresh_token) {
    row.refresh_token_ciphertext = encrypt(tokens.provider_refresh_token);
  }

  const { error } = await supabase
    .from('google_oauth_credentials')
    .upsert(row, { onConflict: 'user_id' });
  if (error) throw Object.assign(new Error('google_provider_token_store_failed'), { status: 500 });
  return true;
}

export async function loadGoogleProviderTokens(userId) {
  const { data, error } = await supabase
    .from('google_oauth_credentials')
    .select('access_token_ciphertext, refresh_token_ciphertext, access_token_expires_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw Object.assign(new Error('google_provider_token_lookup_failed'), { status: 500 });
  if (!data?.access_token_ciphertext) return null;

  return {
    accessToken: decrypt(data.access_token_ciphertext),
    refreshToken: decrypt(data.refresh_token_ciphertext),
    accessTokenExpiresAt: data.access_token_expires_at || null,
  };
}

export async function updateGoogleAccessToken(userId, accessToken, expiresInSeconds) {
  const accessTokenExpiresAt = Number.isFinite(expiresInSeconds)
    ? new Date(Date.now() + expiresInSeconds * 1000).toISOString()
    : null;
  const { error } = await supabase
    .from('google_oauth_credentials')
    .update({
      access_token_ciphertext: encrypt(accessToken),
      access_token_expires_at: accessTokenExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
  if (error) throw Object.assign(new Error('google_provider_token_update_failed'), { status: 500 });
}

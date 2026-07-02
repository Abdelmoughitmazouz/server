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
  if (typeof token !== 'string') {
    console.warn('[google-provider-tokens] encrypt received non-string token');
    return null;
  }
  try {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return [
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  } catch (err) {
    console.error('[google-provider-tokens] encrypt failed', err);
    return null;
  }
}

function decrypt(ciphertext) {
  if (!ciphertext) return null;
  if (typeof ciphertext !== 'string') {
    console.warn('[google-provider-tokens] decrypt received non-string ciphertext');
    return null;
  }
  const parts = ciphertext.split('.');
  if (parts.length !== 3) {
    console.error('[google-provider-tokens] decrypt invalid ciphertext format');
    return null;
  }
  const [iv, tag, encrypted] = parts;
  if (!iv || !tag || !encrypted) {
    console.error('[google-provider-tokens] decrypt missing iv/tag/encrypted');
    return null;
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch (err) {
    console.error('[google-provider-tokens] decrypt failed', err);
    return null;
  }
}

export async function saveGoogleProviderTokens(userId, tokens) {
  if (!tokens?.provider_token) {
    console.warn('[google-provider-tokens] saveGoogleProviderTokens called without provider_token', { userId });
    return false;
  }

  const row = {
    user_id: userId,
    email: tokens.email || null,
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
  if (error) {
    console.error('[google-provider-tokens] upsert failed', {
      userId,
      errorCode: error.code,
      errorMessage: error.message,
      errorDetails: error.details,
      errorHint: error.hint,
    });
    throw Object.assign(new Error(`google_provider_token_store_failed: ${error.message}`), {
      status: 500,
      supabaseError: { code: error.code, message: error.message, details: error.details, hint: error.hint },
    });
  }
  return true;
}

export async function loadGoogleProviderTokens(userId) {
  const { data, error } = await supabase
    .from('google_oauth_credentials')
    .select('access_token_ciphertext, refresh_token_ciphertext, access_token_expires_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[google-provider-tokens] load failed', {
      userId,
      errorCode: error.code,
      errorMessage: error.message,
    });
    throw Object.assign(new Error(`google_provider_token_lookup_failed: ${error.message}`), {
      status: 200,
      reason: 'google_provider_token_missing',
    });
  }
  if (!data?.access_token_ciphertext) return null;

  try {
    return {
      accessToken: decrypt(data.access_token_ciphertext),
      refreshToken: decrypt(data.refresh_token_ciphertext),
      accessTokenExpiresAt: data.access_token_expires_at || null,
    };
  } catch {
    throw Object.assign(new Error('google_provider_token_decrypt_failed'), {
      status: 200,
      reason: 'google_provider_token_missing',
    });
  }
}

export async function updateGoogleAccessToken(userId, accessToken, expiresInSeconds) {
  if (!accessToken) {
    console.warn('[google-provider-tokens] updateGoogleAccessToken called without accessToken', { userId });
    return;
  }
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
  if (error) {
    console.error('[google-provider-tokens] update failed', {
      userId,
      errorCode: error.code,
      errorMessage: error.message,
    });
    throw Object.assign(new Error(`google_provider_token_update_failed: ${error.message}`), { status: 500 });
  }
}

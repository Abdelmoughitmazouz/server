import 'dotenv/config';

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[config] missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const DEFAULT_ALLOWED_ORIGINS = [
  'https://folder-tube.vercel.app',
  'https://foldertube.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

function parseOrigins(value) {
  return String(value || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT) || 3001,
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  jwtSecret: required('JWT_SECRET'),
  allowedOrigins: Array.from(new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...parseOrigins(process.env.ALLOWED_ORIGINS),
  ])),
  accessTokenTtl: '15m',
  refreshTokenTtl: '30d',
  minExtensionVersion: process.env.MIN_EXTENSION_VERSION || '1.0.7',
  devTokenEnabled: process.env.DEV_TOKEN_ENABLED === 'true',
  googleOauthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
  googleOauthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
  googleTokenEncryptionKey: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET,
};

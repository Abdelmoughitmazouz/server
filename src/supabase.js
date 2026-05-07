import { AuthClient } from '@supabase/auth-js';
import { PostgrestClient } from '@supabase/postgrest-js';
import { config } from './config.js';

const baseUrl = config.supabaseUrl.replace(/\/+$/, '');

const headers = {
  apikey: config.supabaseServiceRoleKey,
  Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
};

const rest = new PostgrestClient(`${baseUrl}/rest/v1`, {
  headers,
  schema: 'public',
});

const auth = new AuthClient({
  url: `${baseUrl}/auth/v1`,
  headers,
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
  skipAutoInitialize: true,
  hasCustomAuthorizationHeader: true,
});

export const supabase = {
  auth,
  from: rest.from.bind(rest),
  schema: rest.schema.bind(rest),
  rpc: rest.rpc.bind(rest),
};

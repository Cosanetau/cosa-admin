import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://hfyjnejbmelaskfkhpuv.supabase.co';
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function getSupabaseConfig() {
  return { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey };
}

export function createSupabaseAdmin() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase service role is not configured.');
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

export function createSupabaseUserClient(accessToken) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase anon key is not configured.');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

function formatSupabaseError(error, fallback) {
  return error?.message || error?.error_description || error?.details || fallback;
}

function getAdminAllowlist() {
  const raw = String(process.env.COSA_ADMIN_EMAILS || '@cosa.net.au').trim();
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const allowlist = getAdminAllowlist();

  return allowlist.some((entry) => {
    if (entry.startsWith('@')) {
      return normalized.endsWith(entry);
    }

    return normalized === entry;
  });
}

export async function requireCosAdmin(request) {
  try {
    const { supabaseAnonKey, supabaseServiceRoleKey } = getSupabaseConfig();

    if (!supabaseAnonKey || !supabaseServiceRoleKey) {
      return {
        error: 'Server is not configured. Add Supabase keys in Vercel.',
        status: 500,
      };
    }

    const accessToken = String(request.headers.authorization || '')
      .replace(/^Bearer\s+/i, '')
      .trim();

    if (!accessToken) {
      return { error: 'Missing login session.', status: 401 };
    }

    const supabaseUser = createSupabaseUserClient(accessToken);
    const supabaseAdmin = createSupabaseAdmin();

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return { error: 'Invalid or expired session.', status: 401 };
    }

    if (!isAdminEmail(user.email)) {
      return { error: 'This account is not authorised for COSA Admin.', status: 403 };
    }

    return {
      user,
      supabaseAdmin,
    };
  } catch (error) {
    return {
      error: formatSupabaseError(error, 'Authentication check failed.'),
      status: 500,
    };
  }
}

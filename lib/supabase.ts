import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function createSupabaseClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * 匿名キーの Supabase クライアント（Auth / 一般テーブル）。
 * URL / ANON KEY 未設定時は null。
 */
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createSupabaseClient(supabaseUrl, supabaseAnonKey) : null;

/**
 * プロフィール保存用。SERVICE_ROLE があれば優先（RLS 回避）。
 * 無ければ anon クライアントを返す。
 */
export function getSupabaseAdminOrAnon(): SupabaseClient | null {
  if (!supabaseUrl) return null;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRole) return createSupabaseClient(supabaseUrl, serviceRole);
  return supabase;
}

export const APP_NAME_REALESTATE = 'realestate' as const;

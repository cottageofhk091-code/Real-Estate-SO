import { createClient, type EmailOtpType } from '@supabase/supabase-js';

export type AuthLinkKind = 'signup' | 'recovery' | 'magiclink';

function getSupabaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
}

function getServiceRoleKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
}

export function hasSupabaseAdminAuth(): boolean {
  return Boolean(getSupabaseUrl() && getServiceRoleKey());
}

export function getSupabaseAdmin() {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) {
    throw new Error('認証サービスが設定されていません（SUPABASE_SERVICE_ROLE_KEY）。');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getPublicAppUrl(req?: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '');
  if (env) return env;
  const origin = req?.headers.get('origin')?.replace(/\/$/, '');
  if (origin) return origin;
  return 'https://real-estate-so.vercel.app';
}

export function buildAuthActionUrl(
  tokenHash: string,
  type: EmailOtpType,
  req?: Request
): string {
  const base = getPublicAppUrl(req);
  const path =
    type === 'recovery'
      ? '/auth/password-reset-notice'
      : type === 'signup' || type === 'email' || type === 'magiclink'
        ? '/auth/confirmed'
        : '/auth/callback';
  const url = new URL(path, `${base}/`);
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', type);
  return url.toString();
}

type AuthUserRow = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
};

export async function findAuthUserByEmail(email: string): Promise<AuthUserRow | null> {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) return null;
  const endpoint = `${url.replace(/\/$/, '')}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
  const res = await fetch(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { users?: AuthUserRow[]; user?: AuthUserRow } | AuthUserRow[];
  const rows = Array.isArray(json) ? json : json.users ?? (json.user ? [json.user] : []);
  const match =
    rows.find((row) => (row.email || '').toLowerCase() === email.toLowerCase()) ?? rows[0];
  return match?.id ? match : null;
}

export function isAuthUserConfirmed(user: AuthUserRow): boolean {
  return Boolean(user.email_confirmed_at || user.confirmed_at);
}

export async function generateAuthActionLink(input: {
  type: AuthLinkKind;
  email: string;
  password?: string;
  data?: Record<string, string>;
  req?: Request;
}): Promise<{ hashedToken: string; actionUrl: string }> {
  const admin = getSupabaseAdmin();
  const redirectTo =
    input.type === 'recovery'
      ? `${getPublicAppUrl(input.req)}/auth/password-reset-notice`
      : `${getPublicAppUrl(input.req)}/auth/confirmed`;

  const result =
    input.type === 'signup'
      ? await admin.auth.admin.generateLink({
          type: 'signup',
          email: input.email,
          password: input.password || '',
          options: { redirectTo, data: input.data },
        })
      : await admin.auth.admin.generateLink({
          type: input.type,
          email: input.email,
          options: { redirectTo },
        });

  if (result.error) {
    throw new Error(result.error.message);
  }
  const hashedToken = result.data.properties?.hashed_token;
  if (!hashedToken) {
    throw new Error('認証リンクの生成に失敗しました。');
  }
  const type: EmailOtpType =
    input.type === 'signup' ? 'signup' : input.type === 'recovery' ? 'recovery' : 'magiclink';
  return {
    hashedToken,
    actionUrl: buildAuthActionUrl(hashedToken, type, input.req),
  };
}

import { NextResponse } from 'next/server';
import { translateAuthError } from '@/lib/auth-error-translator';

/** 秘密値は出さない。設定の有無だけ返す。 */
export function authEnvFlags() {
  const has = (name: string) => Boolean(process.env[name]?.trim());
  return {
    NEXT_PUBLIC_SUPABASE_URL: has('NEXT_PUBLIC_SUPABASE_URL'),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: has('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: has('SUPABASE_SERVICE_ROLE_KEY'),
    RESEND_API_KEY: has('RESEND_API_KEY'),
    KV_REST_API_URL: has('KV_REST_API_URL'),
    KV_REST_API_TOKEN: has('KV_REST_API_TOKEN'),
    UPSTASH_REDIS_REST_URL: has('UPSTASH_REDIS_REST_URL'),
    UPSTASH_REDIS_REST_TOKEN: has('UPSTASH_REDIS_REST_TOKEN'),
  };
}

export function serializeUnknownError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const extra = err as Error & {
      code?: unknown;
      details?: unknown;
      hint?: unknown;
      status?: unknown;
    };
    return {
      name: err.name,
      message: err.message,
      code: extra.code ?? null,
      details: extra.details ?? null,
      hint: extra.hint ?? null,
      status: extra.status ?? null,
    };
  }
  if (err && typeof err === 'object') {
    const rec = err as Record<string, unknown>;
    return {
      name: typeof rec.name === 'string' ? rec.name : null,
      message: typeof rec.message === 'string' ? rec.message : String(err),
      code: rec.code ?? rec.Code ?? null,
      details: rec.details ?? rec.detail ?? null,
      hint: rec.hint ?? null,
      status: rec.status ?? rec.statusCode ?? null,
    };
  }
  return { message: String(err) };
}

export function jsonServiceUnavailable(
  label: string,
  error: string,
  detail?: unknown
) {
  const payload = {
    error: translateAuthError(error),
    detail: detail ?? null,
    env: authEnvFlags(),
  };
  console.error(`[${label}] 503`, error, payload.detail, payload.env);
  return NextResponse.json(payload, { status: 503 });
}

export function jsonErrorWithDetail(
  label: string,
  status: number,
  error: string,
  detail?: unknown
) {
  const payload = {
    error: translateAuthError(error),
    detail: detail ?? null,
    env: authEnvFlags(),
  };
  console.error(`[${label}] ${status}`, error, payload.detail, payload.env);
  return NextResponse.json(payload, { status });
}

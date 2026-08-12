import { Redis } from '@upstash/redis';

/**
 * Vercel KV / Upstash Redis（REST）クライアント。
 *
 * 参照する環境変数（どちらのペアでも可）:
 * - Vercel 連携で自動付与されことが多い:
 *   KV_REST_API_URL / KV_REST_API_TOKEN
 * - Upstash Console 由来:
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 *
 * クライアント生成は SDK の Redis.fromEnv() に委譲し、上記両方を公式どおり解決する。
 * 未設定時は fail-closed（インメモリへサイレントフォールバックしない）。
 */
let redis: Redis | null | undefined;

export class KvNotConfiguredError extends Error {
  constructor() {
    super(
      '権利ストア（KV / Upstash Redis）が未設定です。KV_REST_API_URL と KV_REST_API_TOKEN（または UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN）を設定してください。'
    );
    this.name = 'KvNotConfiguredError';
  }
}

/** .env の引用符や空白を除去 */
function readEnv(name: string): string {
  const raw = process.env[name];
  if (!raw) return '';
  return raw.trim().replace(/^["']|["']$/g, '');
}

/** ダミー / プレースホルダ値は「未設定」扱い（誤検知防止） */
function isUsableKvCredential(value: string): boolean {
  if (!value) return false;
  const v = value.toLowerCase();
  const placeholders = [
    'your-kv',
    'your_kv',
    'your-upstash',
    'your_upstash',
    'example.com',
    'example.upstash',
    'placeholder',
    'changeme',
    'change-me',
    'xxx',
    'todo',
  ];
  return !placeholders.some((p) => v.includes(p));
}

function resolveKvPair(): { url: string; token: string } | null {
  const kvUrl = readEnv('KV_REST_API_URL');
  const kvToken = readEnv('KV_REST_API_TOKEN');
  if (isUsableKvCredential(kvUrl) && isUsableKvCredential(kvToken)) {
    return { url: kvUrl, token: kvToken };
  }

  const upstashUrl = readEnv('UPSTASH_REDIS_REST_URL');
  const upstashToken = readEnv('UPSTASH_REDIS_REST_TOKEN');
  if (isUsableKvCredential(upstashUrl) && isUsableKvCredential(upstashToken)) {
    return { url: upstashUrl, token: upstashToken };
  }

  return null;
}

export function isKvConfigured(): boolean {
  return resolveKvPair() !== null;
}

export function getRedis(): Redis | null {
  if (redis !== undefined) return redis;

  const pair = resolveKvPair();
  if (!pair) {
    redis = null;
    return null;
  }

  // fromEnv は process.env を直接読むため、解決済みの実値で明示初期化
  // （ダミー値や引用符付き値が混在しても正しいペアだけを使う）
  redis = new Redis({ url: pair.url, token: pair.token });
  return redis;
}

/** KV 必須。未設定時は例外（fail-closed）。 */
export function requireRedis(): Redis {
  const client = getRedis();
  if (!client) {
    throw new KvNotConfiguredError();
  }
  return client;
}

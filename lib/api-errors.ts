/**
 * API → フロント向けエラー分類とユーザー表示メッセージの共通定義
 */

export type ApiErrorKind = 'config' | 'temporary' | 'client' | 'unknown';

export const USER_ERROR_MESSAGES = {
  config:
    'サービス設定に問題があります。管理者にお問い合わせください。開発環境では GEMINI_API_KEY が .env.local に設定されているか確認してください。',
  temporary:
    '現在アクセスが集中しているか、AIサービス側で一時的な障害が発生しています。お手数ですが、しばらくしてからもう一度お試しください。',
  client: '入力内容を確認のうえ、もう一度お試しください。',
  unknown: '処理中にエラーが発生しました。お手数ですが、もう一度お試しください。',
} as const;

export type ApiErrorCode =
  | 'CONFIG_MISSING_GEMINI_API_KEY'
  | 'CONFIG_INVALID_GEMINI_API_KEY'
  | 'GEMINI_UPSTREAM_TEMPORARY'
  | 'GEMINI_ALL_MODELS_FAILED'
  | 'GEMINI_API_ERROR'
  | 'REQUEST_INVALID'
  | 'PARSE_FAILED'
  | 'SERVER_ENV_ERROR';

export function kindFromCode(code?: string | null): ApiErrorKind {
  if (!code) return 'unknown';
  if (code.startsWith('CONFIG_')) return 'config';
  if (
    code === 'GEMINI_UPSTREAM_TEMPORARY' ||
    code === 'GEMINI_ALL_MODELS_FAILED' ||
    code === 'GEMINI_API_ERROR' ||
    code === 'SERVER_ENV_ERROR' ||
    code === 'PARSE_FAILED'
  ) {
    return 'temporary';
  }
  if (code === 'REQUEST_INVALID') return 'client';
  return 'unknown';
}

export function isRetryableKind(kind: ApiErrorKind): boolean {
  return kind === 'temporary' || kind === 'unknown';
}

export function userMessageForKind(
  kind: ApiErrorKind,
  options?: { isDev?: boolean; serverMessage?: string }
): string {
  const base = USER_ERROR_MESSAGES[kind] ?? USER_ERROR_MESSAGES.unknown;
  if (options?.isDev && options.serverMessage && kind === 'config') {
    return options.serverMessage;
  }
  if (options?.isDev && options.serverMessage && kind === 'temporary') {
    // 開発時は一時障害でも詳細を添える
    return `${base}\n（詳細: ${options.serverMessage.slice(0, 240)}）`;
  }
  return base;
}

/** Gemini / Google 側の失敗を config / temporary に分類 */
export function classifyUpstreamGeminiError(input: {
  status?: number;
  message: string;
}): { kind: ApiErrorKind; code: ApiErrorCode; httpStatus: number } {
  const { status, message } = input;
  const lower = message.toLowerCase();

  if (
    /api[_ ]?key|api key not valid|invalid.*key|permission.?denied|unauthenticated|401|403|設定されていません|GEMINI_API_KEY/i.test(
      message
    ) ||
    status === 401 ||
    status === 403
  ) {
    return {
      kind: 'config',
      code: /missing|設定されていません/i.test(message)
        ? 'CONFIG_MISSING_GEMINI_API_KEY'
        : 'CONFIG_INVALID_GEMINI_API_KEY',
      httpStatus: 500,
    };
  }

  if (
    status === 404 ||
    status === 408 ||
    status === 429 ||
    (typeof status === 'number' && status >= 500) ||
    /not found|no longer available|high demand|overloaded|unavailable|resource.?exhausted|rate.?limit|quota|timeout|timed?\s*out|econnreset|fetch failed/i.test(
      lower
    )
  ) {
    return {
      kind: 'temporary',
      code: 'GEMINI_UPSTREAM_TEMPORARY',
      httpStatus:
        typeof status === 'number' && status >= 400 && status < 600 ? status : 503,
    };
  }

  return {
    kind: 'temporary',
    code: 'GEMINI_API_ERROR',
    httpStatus: typeof status === 'number' && status >= 400 ? status : 500,
  };
}

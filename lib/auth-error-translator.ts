const UNKNOWN_ERROR = 'エラーが発生しました。時間をおいて再度お試しください。';

const RULES: Array<[RegExp, string]> = [
  [
    /invalid login credentials|invalid_credentials/,
    'メールアドレスまたはパスワードが正しくありません。',
  ],
  [
    /invalid.*(email|credentials|login)/,
    'メールアドレスまたはパスワードが正しくありません。',
  ],
  [
    /user already registered|user already exists|already registered|already been registered|user_already_exists|identity_already_exists/,
    'このメールアドレスは既に登録されています。',
  ],
  [
    /password should be at least|password is too short|at least 6 character|weak_password/,
    'パスワードは6文字以上で入力してください。',
  ],
  [
    /email not confirmed|email_not_confirmed|not confirmed/,
    'メールアドレスの確認が完了していません。届いたメールのリンクをご確認ください。',
  ],
  [
    /token has expired or is invalid|token has expired|otp_expired|email link is invalid|token.*invalid|expired.*(?:token|link|otp)/,
    '認証リンクの有効期限が切れているか、無効です。再度お試しください。',
  ],
  [
    /auth session missing|session not found|invalid session/,
    'セッションの期限が切れました。再度ログインしてください。',
  ],
  [
    /too many requests|rate limit exceeded|rate.?limit|over_email_send_rate_limit|over_request_rate_limit/,
    'リクエストが多すぎます。少し時間を置いてから再度お試しください。',
  ],
  [/unable to validate email|invalid email|email address.*invalid|validation_failed/, 'メールアドレスの形式を確認してください。'],
  [/signup is disabled|signup_disabled/, '現在、新規登録を受け付けていません。'],
  [/for security purposes/, '短時間に同じ操作が繰り返されました。しばらくしてから再度お試しください。'],
  [/same password|should be different from the old password/, '新しいパスワードは、現在のパスワードと別のものを設定してください。'],
  [/user not found/, 'このメールアドレスのアカウントが見つかりません。'],
  [/access denied|unauthorized/, '認証に失敗しました。もう一度お試しください。'],
  [/network|fetch failed|failed to fetch|load failed/, '通信に失敗しました。しばらくしてから再度お試しください。'],
  [/failed to send|could not send|email.*fail|resend/, '認証メールの送信に失敗しました。もう一度お試しください。'],
  [/kv.?not.?configured|upstash|権利ストア/, '権利情報の準備ができていません。しばらくしてから再度お試しください。'],
  [/stripe/i, '決済の準備ができていません。しばらくしてから再度お試しください。'],
];

function extractMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? `${error.message} ${code}` : error.message;
  }
  if (typeof error === 'object') {
    const rec = error as {
      message?: unknown;
      error?: unknown;
      error_description?: unknown;
      msg?: unknown;
      code?: unknown;
      detail?: unknown;
    };
    if (typeof rec.message === 'string' && rec.message.trim()) return rec.message;
    if (typeof rec.error === 'string' && rec.error.trim()) return rec.error;
    if (typeof rec.error_description === 'string' && rec.error_description.trim()) {
      return rec.error_description;
    }
    if (typeof rec.msg === 'string' && rec.msg.trim()) return rec.msg;
    if (typeof rec.code === 'string' && rec.code.trim()) return rec.code;
    if (typeof rec.detail === 'string' && rec.detail.trim()) return rec.detail;
    if (rec.detail && typeof rec.detail === 'object') {
      const nested = extractMessage(rec.detail);
      if (nested) return nested;
    }
  }
  return '';
}

function looksJapanese(value: string): boolean {
  return /[ぁ-んァ-ン一-龯]/.test(value);
}

/**
 * Supabase Auth / API の英語エラーを画面表示用の日本語へ変換する。
 * すでに日本語の文はそのまま返す。
 */
export function translateAuthError(error: unknown, fallback = UNKNOWN_ERROR): string {
  const raw = extractMessage(error).trim();
  if (!raw) return fallback;
  if (looksJapanese(raw)) return raw;

  const lower = raw.toLowerCase();
  for (const [pattern, ja] of RULES) {
    if (pattern.test(lower)) return ja;
  }
  return fallback;
}

/** 分析・チャットなど認証以外の API エラーも同じルールで日本語化する。 */
export function translateApiError(error: unknown, fallback = UNKNOWN_ERROR): string {
  return translateAuthError(error, fallback);
}

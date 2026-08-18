import { GoogleGenerativeAI, type GenerateContentResult } from '@google/generative-ai';
import { classifyUpstreamGeminiError } from '@/lib/api-errors';
import { emitOpsEventFireAndForget } from '@/lib/ops-events';
import { installVercelFsGuard, isFilesystemError } from '@/lib/vercel-fs-guard';

installVercelFsGuard();

/**
 * Gemini モデル定数
 *
 * 注意:
 * - gemini-1.5-* / gemini-2.0-* / gemini-2.5-* は新規ユーザー向けに 404
 * - 2026-07 以降の推奨: gemini-3.6-flash / gemini-3.5-flash*
 * - モデル名は必ず "gemini-..." のみ（"models/" 接頭辞なし）
 * - このモジュールではローカルファイルへの保存（fs）は行わない
 */
export const GEMINI_ANALYZE_MODEL = 'gemini-3.6-flash';
export const GEMINI_CHAT_MODEL = 'gemini-3.6-flash';

/** フォールバック候補（analyze）: メイン → 予備の順 */
export const GEMINI_ANALYZE_MODELS = [
  GEMINI_ANALYZE_MODEL,
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-latest',
] as const;

/** フォールバック候補（chat） */
export const GEMINI_CHAT_MODELS = [
  GEMINI_CHAT_MODEL,
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-latest',
] as const;

/** ローカル / Vercel で使われがちな別名も許容 */
const GEMINI_API_KEY_ENV_NAMES = [
  'GEMINI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GOOGLE_API_KEY',
] as const;

export function getGeminiApiKey(): string {
  for (const name of GEMINI_API_KEY_ENV_NAMES) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return '';
}

export function hasGeminiApiKey(): boolean {
  return Boolean(getGeminiApiKey());
}

/** キー値は出さず、読み込み状況だけ返す（サーバーログ用） */
export function getGeminiApiKeyDiagnostics(): {
  configured: boolean;
  source: string | null;
  length: number;
  looksQuoted: boolean;
} {
  for (const name of GEMINI_API_KEY_ENV_NAMES) {
    const raw = process.env[name];
    if (raw === undefined) continue;
    const trimmed = raw.trim();
    if (!trimmed) {
      return { configured: false, source: name, length: 0, looksQuoted: false };
    }
    return {
      configured: true,
      source: name,
      length: trimmed.length,
      looksQuoted: /^["'].*["']$/.test(trimmed),
    };
  }
  return { configured: false, source: null, length: 0, looksQuoted: false };
}

/** undefined を落として JSON でも空に見えないオブジェクトにする */
export function compactDefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** SDK / URL 用に models/ 接頭辞を除去する */
export function normalizeGeminiModelId(model: string): string {
  return String(model || '')
    .trim()
    .replace(/^models\//i, '');
}

function parseStatusFromMessage(message: string): { status?: number; statusText?: string } {
  const match = message.match(/\[(\d{3})\s+([^\]]+)\]/);
  if (!match) return {};
  const status = Number(match[1]);
  if (!Number.isFinite(status)) return {};
  return { status, statusText: match[2].trim() };
}

/** Google Generative AI SDK のエラーから status / body を抽出 */
export function extractGeminiErrorDetails(error: unknown): {
  message: string;
  status?: number;
  statusText?: string;
  statusCode?: number | string;
  errorDetails?: unknown;
  responseBody?: unknown;
  summary: string;
} {
  if (!(error instanceof Error) && (typeof error !== 'object' || error === null)) {
    const message = String(error);
    return { message, summary: message };
  }

  const err = error as Error & {
    status?: number;
    statusText?: string;
    statusCode?: number | string;
    code?: number | string;
    errorDetails?: unknown;
    response?: {
      status?: number;
      statusText?: string;
      data?: unknown;
      body?: unknown;
    };
  };

  const message = error instanceof Error ? error.message : String(error);
  const fromMessage = parseStatusFromMessage(message);
  const status =
    typeof err.status === 'number'
      ? err.status
      : typeof err.response?.status === 'number'
        ? err.response.status
        : fromMessage.status;
  const statusText = err.statusText ?? err.response?.statusText ?? fromMessage.statusText;
  const statusCode = err.statusCode ?? err.code;
  const responseBody = err.response?.data ?? err.response?.body ?? err.errorDetails;

  const summaryParts = [
    typeof status === 'number' ? String(status) : null,
    statusText || null,
    message.replace(/^\[GoogleGenerativeAI Error\]:\s*/i, '').slice(0, 280),
  ].filter(Boolean);

  return {
    message,
    status,
    statusText,
    statusCode,
    errorDetails: err.errorDetails,
    responseBody,
    summary: summaryParts.join(' | '),
  };
}

/**
 * 次モデルへフォールバックすべきか。
 * - 404 / 408 / 429 / 5xx → フォールバック
 * - API キー不正など設定系 → 即停止
 */
export function shouldFallbackToNextModel(error: unknown): boolean {
  const details = extractGeminiErrorDetails(error);
  const classified = classifyUpstreamGeminiError({
    status: details.status,
    message: details.message,
  });

  if (classified.kind === 'config') return false;

  const status = details.status;
  if (status === 404 || status === 408 || status === 429) return true;
  if (typeof status === 'number' && status >= 500 && status <= 599) return true;

  // status 不明でもモデル廃止・混雑・一時障害っぽい文言ならフォールバック
  if (
    /no longer available|not found|high demand|overloaded|unavailable|resource.?exhausted|rate.?limit|quota|timeout|timed?\s*out|econnreset|fetch failed|empty.?response|空のレスポンス/i.test(
      details.message
    )
  ) {
    return true;
  }

  // 不明エラーも予備モデルを試す（最終的に全失敗なら通知）
  return true;
}

export type GeminiModelAttempt = {
  model: string;
  ok: boolean;
  at: string;
  status?: number;
  statusText?: string;
  summary?: string;
  fallbackTriggered?: boolean;
};

export class GeminiFallbackExhaustedError extends Error {
  readonly attempts: GeminiModelAttempt[];
  readonly lastDetails: ReturnType<typeof extractGeminiErrorDetails>;

  constructor(attempts: GeminiModelAttempt[], lastError: unknown) {
    const details = extractGeminiErrorDetails(lastError);
    const models = attempts.map((a) => a.model).join(', ');
    super(
      `すべての Gemini モデルで失敗しました（試行: ${models}）。最後のエラー: ${details.summary}`
    );
    this.name = 'GeminiFallbackExhaustedError';
    this.attempts = attempts;
    this.lastDetails = details;
  }
}

export function createGeminiClient(apiKey = getGeminiApiKey()) {
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY が設定されていません。.env.local に GEMINI_API_KEY を追加し、開発サーバーを再起動してください。'
    );
  }
  return new GoogleGenerativeAI(apiKey);
}

type InlineImage = {
  inlineData: {
    mimeType: string;
    data: string;
  };
};

type GenerateParams = {
  model: string;
  prompt: string;
  images?: InlineImage[];
  generationConfig?: {
    maxOutputTokens?: number;
    temperature?: number;
    responseMimeType?: string;
  };
};

export type GeminiGenerateResult = {
  text: string;
  modelUsed: string;
  attempts: GeminiModelAttempt[];
};

/**
 * getGenerativeModel({ model: "gemini-..." }) 形式で呼び出し。
 * モデル名に models/ を付けない。
 */
export async function generateGeminiContent({
  model,
  prompt,
  images = [],
  generationConfig,
}: GenerateParams): Promise<string> {
  installVercelFsGuard();

  const genAI = createGeminiClient();
  const modelId = normalizeGeminiModelId(model);

  const generativeModel = genAI.getGenerativeModel({
    model: modelId,
    generationConfig,
  });

  const parts: Array<string | InlineImage> = [prompt, ...images];

  try {
    const result: GenerateContentResult = await generativeModel.generateContent(parts);
    const text = result.response.text();
    if (!text) {
      throw new Error(`モデル ${modelId} から空のレスポンスが返されました。`);
    }
    return text;
  } catch (error: unknown) {
    if (isFilesystemError(error)) {
      console.warn('FS write skipped (generateGeminiContent)', error);
    }
    const details = extractGeminiErrorDetails(error);
    console.error(
      '[Gemini] generateContent failed',
      compactDefined({
        model: modelId,
        message: details.message,
        summary: details.summary,
        status: details.status,
        statusText: details.statusText,
        statusCode: details.statusCode,
        responseBody: details.responseBody,
        errorDetails: details.errorDetails,
        at: new Date().toISOString(),
      })
    );
    throw error;
  }
}

type FallbackOptions = {
  route?: string;
};

/**
 * メインモデル失敗（404/500 等）時に予備モデルへ自動リトライする。
 */
export async function generateGeminiContentWithFallback(
  models: readonly string[],
  params: Omit<GenerateParams, 'model'>,
  options: FallbackOptions = {}
): Promise<GeminiGenerateResult> {
  installVercelFsGuard();
  const attempts: GeminiModelAttempt[] = [];
  let lastError: unknown = null;
  const normalizedModels = models.map((m) => normalizeGeminiModelId(m));

  console.info('[Gemini] trying models', {
    at: new Date().toISOString(),
    models: normalizedModels,
    route: options.route ?? null,
  });

  for (let i = 0; i < models.length; i++) {
    const modelId = normalizedModels[i];
    const isPrimary = i === 0;
    try {
      console.info(`[Gemini] calling model: ${modelId}`, {
        at: new Date().toISOString(),
        attempt: i + 1,
        of: models.length,
      });
      const text = await generateGeminiContent({ ...params, model: modelId });
      attempts.push({
        model: modelId,
        ok: true,
        at: new Date().toISOString(),
      });

      if (!isPrimary) {
        emitOpsEventFireAndForget({
          code: 'GEMINI_MODEL_FALLBACK_SUCCESS',
          severity: 'warn',
          message: `メインモデル失敗後、予備モデル ${modelId} で成功しました`,
          route: options.route,
          notify: true,
          details: {
            modelUsed: modelId,
            primaryModel: normalizedModels[0],
            attempts,
          },
        });
      }

      return { text, modelUsed: modelId, attempts };
    } catch (err) {
      lastError = err;
      const details = extractGeminiErrorDetails(err);
      const canFallback =
        i < models.length - 1 && shouldFallbackToNextModel(err);

      attempts.push({
        model: modelId,
        ok: false,
        at: new Date().toISOString(),
        status: details.status,
        statusText: details.statusText,
        summary: details.summary,
        fallbackTriggered: canFallback,
      });

      console.warn(
        `[Gemini] model failed: ${modelId}`,
        compactDefined({
          at: new Date().toISOString(),
          summary: details.summary,
          message: details.message,
          status: details.status,
          statusText: details.statusText,
          statusCode: details.statusCode,
          responseBody: details.responseBody,
          willFallback: canFallback,
          nextModel: canFallback ? normalizedModels[i + 1] : null,
        })
      );

      emitOpsEventFireAndForget({
        code: canFallback ? 'GEMINI_MODEL_FALLBACK' : 'GEMINI_MODEL_FAILED',
        severity: canFallback ? 'warn' : 'error',
        message: canFallback
          ? `モデル ${modelId} が失敗したため ${normalizedModels[i + 1]} へフォールバックします`
          : `モデル ${modelId} が失敗し、フォールバック不可または最終候補です`,
        route: options.route,
        // 中間フォールバックはログ中心。最終失敗は別イベントで通知
        notify: !canFallback,
        details: compactDefined({
          model: modelId,
          status: details.status,
          statusText: details.statusText,
          summary: details.summary,
          nextModel: canFallback ? normalizedModels[i + 1] : undefined,
          attempt: i + 1,
          total: models.length,
        }),
      });

      if (isFilesystemError(err)) {
        console.warn('FS write skipped (model fallback continues)', err);
      }

      if (!canFallback) {
        break;
      }
    }
  }

  const exhausted = new GeminiFallbackExhaustedError(
    attempts,
    lastError || new Error('利用可能なGeminiモデルでのレスポンス取得に失敗しました。')
  );

  emitOpsEventFireAndForget({
    code: 'GEMINI_ALL_MODELS_FAILED',
    severity: 'critical',
    message: exhausted.message,
    route: options.route,
    notify: true,
    details: {
      attempts,
      lastSummary: exhausted.lastDetails.summary,
      lastStatus: exhausted.lastDetails.status,
      modelsTried: normalizedModels,
    },
  });

  throw exhausted;
}

import '@/lib/vercel-fs-guard-init';
import { NextResponse } from 'next/server';
import {
  USER_ERROR_MESSAGES,
  classifyUpstreamGeminiError,
  kindFromCode,
  type ApiErrorKind,
} from '@/lib/api-errors';
import {
  GEMINI_ANALYZE_MODELS,
  GeminiFallbackExhaustedError,
  compactDefined,
  extractGeminiErrorDetails,
  generateGeminiContentWithFallback,
  getGeminiApiKeyDiagnostics,
  hasGeminiApiKey,
} from '@/lib/gemini';
import { emitOpsEventFireAndForget } from '@/lib/ops-events';
import { installVercelFsGuard, isFilesystemError } from '@/lib/vercel-fs-guard';

try {
  installVercelFsGuard();
} catch (e) {
  console.warn('FS write skipped (guard install)', e);
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PropertyType = 'rental' | 'purchase';
type HouseholdType = 'single' | 'family';

function labelPropertyType(type: PropertyType | string | undefined): string {
  return type === 'purchase' ? '分譲（購入）' : '賃貸';
}

function labelHouseholdType(type: HouseholdType | string | undefined): string {
  return type === 'family' ? 'ファミリー（同居あり）' : '一人暮らし';
}

function logAnalyzeError(label: string, error: unknown): void {
  const details = extractGeminiErrorDetails(error);
  const err = error as {
    message?: unknown;
    stack?: unknown;
    name?: unknown;
    code?: unknown;
    cause?: unknown;
  };
  console.error('Analyze API Error details:', details.summary || error);
  console.error(
    label,
    compactDefined({
      at: new Date().toISOString(),
      summary: details.summary,
      message: details.message || (error instanceof Error ? error.message : String(error)),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : typeof error,
      code: err?.code ?? details.statusCode,
      cause: err?.cause,
      httpStatus: details.status,
      statusText: details.statusText,
      responseBody: details.responseBody,
      errorDetails: details.errorDetails,
    })
  );
}

function jsonError(
  message: string,
  status: number,
  extra?: {
    code?: string;
    kind?: ApiErrorKind;
    retryable?: boolean;
    details?: Record<string, unknown>;
  }
) {
  const code = extra?.code;
  const kind = extra?.kind ?? kindFromCode(code);
  const retryable =
    typeof extra?.retryable === 'boolean' ? extra.retryable : kind === 'temporary' || kind === 'unknown';
  const userFacing =
    kind === 'config'
      ? USER_ERROR_MESSAGES.config
      : kind === 'temporary'
        ? USER_ERROR_MESSAGES.temporary
        : kind === 'client'
          ? message || USER_ERROR_MESSAGES.client
          : message || USER_ERROR_MESSAGES.unknown;

  const payload = compactDefined({
    error: userFacing,
    detail: message !== userFacing ? message : undefined,
    code,
    kind,
    retryable,
    details: extra?.details ? compactDefined(extra.details) : undefined,
  });
  return NextResponse.json(payload, { status });
}

/**
 * POST /api/analyze
 * - ローカル fs への永続保存は行わない
 * - 例外時も必ず JSON を返し、プロセスをクラッシュさせない
 */
export async function POST(req: Request) {
  try {
    try {
      installVercelFsGuard();
    } catch (e) {
      console.warn('FS write skipped (guard install in POST)', e);
    }

    let body: {
      text?: unknown;
      images?: unknown;
      propertyType?: unknown;
      householdType?: unknown;
    };

    try {
      body = (await req.json()) as typeof body;
    } catch (parseBodyError: unknown) {
      logAnalyzeError('Analyze API body parse error:', parseBodyError);
      return jsonError('リクエストボディの解析に失敗しました。', 400, {
        code: 'REQUEST_INVALID',
        kind: 'client',
        retryable: false,
      });
    }

    const text = typeof body.text === 'string' ? body.text : '';
    const images = body.images;
    const propertyType = body.propertyType;
    const householdType = body.householdType;

    if (!text && (!images || (Array.isArray(images) && images.length === 0))) {
      return jsonError('テキストまたは画像を入力してください。', 400, {
        code: 'REQUEST_INVALID',
        kind: 'client',
        retryable: false,
      });
    }

    const keyDiag = getGeminiApiKeyDiagnostics();
    console.info('[analyze] Gemini API key diagnostics', {
      at: new Date().toISOString(),
      ...keyDiag,
    });

    if (!hasGeminiApiKey()) {
      logAnalyzeError(
        'Analyze API config error:',
        new Error('GEMINI_API_KEY missing (also checked GOOGLE_GENERATIVE_AI_API_KEY / GOOGLE_API_KEY)')
      );
      emitOpsEventFireAndForget({
        code: 'CONFIG_MISSING_GEMINI_API_KEY',
        severity: 'critical',
        message: 'GEMINI_API_KEY が未設定のため /api/analyze が失敗しました',
        route: '/api/analyze',
        notify: true,
        details: { ...keyDiag },
      });
      return jsonError(
        'サーバー側の設定エラーです。GEMINI_API_KEY が未設定です。.env.local に追加して開発サーバーを再起動してください。',
        500,
        {
          code: 'CONFIG_MISSING_GEMINI_API_KEY',
          kind: 'config',
          retryable: false,
          details: { ...keyDiag },
        }
      );
    }

    if (keyDiag.looksQuoted) {
      console.warn(
        '[analyze] GEMINI_API_KEY appears wrapped in quotes. Remove surrounding quotes in .env.local.'
      );
    }

    const propertyLabel = labelPropertyType(propertyType as PropertyType | string | undefined);
    const householdLabel = labelHouseholdType(householdType as HouseholdType | string | undefined);
    const isRental = propertyType !== 'purchase';

    const prompt = `
あなたはプロの不動産鑑定士・宅地建物取引士です。
以下の物件情報を客観的かつ厳しく分析し、レスポンスを返してください。

【ユーザーの前提条件（重要）】
ユーザーは【${propertyLabel}】かつ【${householdLabel}】を探しています。
分析・評価・チェックリストは、この前提に最適化してください。
- 賃貸の場合: 家賃交渉余地、更新料、退去時コスト、騒音・隣人リスク、更新後の家賃上昇リスクなどを重視
- 分譲（購入）の場合: 資産価値、管理状態、修繕積立、将来のリセール、ローン適格性などを重視
- 一人暮らしの場合: セキュリティ、生活動線、収納、単身向け設備、夜間の安全性を重視
- ファミリーの場合: 通学・通勤、周辺の子育て環境、部屋数・動線、騒音、将来の住み替えを重視

【共通ルール：アクションプラン必須】
PRO機能②③④の各テキストには、必ず次を含めてください。
1) 根拠・可能性（推定で可）
2) ユーザーがどう考えるべきか
3) 具体的な行動（内見・交渉・撮影・見送り・追加確認など）
単なるデータ解説だけで終わらせないこと。

【PRO機能②：現地内見の絶対確認チェックリスト】
viewingChecklist は抽象表現禁止。必ず
「（リスク/可能性）のため、内見時は（具体的なチェックや撮影行動）を行う」形式で5〜8項目。

【PRO機能③：価格・家賃の履歴トラッキング】
priceHistoryReport を出力。
${
  isRental
    ? `賃貸向け: 空室期間・家賃値下げ履歴（推定可）と交渉アドバイスを含める。
例: 「空室が長引いている可能性が高いため、初期費用減額や家賃△円前後の交渉を検討。内見後に管理会社へ根拠を伝えて指値する。」`
    : `分譲向け: 売れ残り期間・価格改定履歴（推定可）と指値アドバイスを含める。
例: 「掲載長期化と値下げ履歴から、契約時に〇〇万円前後の指値余地あり。内見後に類似成約事例を根拠に交渉する。」`
}

【PRO機能④：将来予測レポート（5年後・10年後）】
futureForecastReport を出力。
${
  isRental
    ? `賃貸向け: 将来の周辺環境変化と家賃相場推移予測、更新時の判断アクションを含める。`
    : `分譲向け: 10年後の想定リセールバリューと資産価値推移、保有/売却判断のアクションを含める。`
}

必ず以下のJSONフォーマットのみで出力してください。

{
  "score": 0〜100の数値 (例: 78),
  "summary": "全体の総評 (100〜150文字程度)",
  "pros": ["メリット1", "メリット2", "メリット3"],
  "cons": ["デメリット・注意点1", "デメリット・注意点2", "デメリット・注意点3"],
  "details": {
    "priceEvaluation": "価格・家賃の妥当性に関する詳細分析",
    "locationEvaluation": "立地・周辺環境・交通の便に関する詳細分析",
    "layoutEvaluation": "間取り・設備・住み心地に関する詳細分析"
  },
  "viewingChecklist": [
    "リスク理由 + 内見時の具体チェック/撮影行動1",
    "リスク理由 + 内見時の具体チェック/撮影行動2",
    "リスク理由 + 内見時の具体チェック/撮影行動3",
    "リスク理由 + 内見時の具体チェック/撮影行動4",
    "リスク理由 + 内見時の具体チェック/撮影行動5"
  ],
  "priceHistoryReport": [
    "履歴の示唆 + どう考えるべきか + 交渉/指値アクション1",
    "履歴の示唆 + どう考えるべきか + 交渉/指値アクション2",
    "履歴の示唆 + どう考えるべきか + 交渉/指値アクション3"
  ],
  "futureForecastReport": [
    "5年後予測 + どう考えるべきか + 具体アクション1",
    "10年後予測 + どう考えるべきか + 具体アクション2",
    "総合判断 + どう考えるべきか + 具体アクション3"
  ]
}

【入力された物件テキスト】
${text || 'なし'}
`;

    const imageParts =
      Array.isArray(images) && images.length > 0
        ? images.filter(
            (img: unknown): img is { inlineData: { mimeType: string; data: string } } =>
              !!img &&
              typeof img === 'object' &&
              'inlineData' in img &&
              typeof (img as { inlineData?: { mimeType?: string; data?: string } }).inlineData
                ?.mimeType === 'string' &&
              typeof (img as { inlineData?: { mimeType?: string; data?: string } }).inlineData
                ?.data === 'string'
          )
        : [];

    let responseText = '';
    try {
      const geminiResult = await generateGeminiContentWithFallback(
        GEMINI_ANALYZE_MODELS,
        {
          prompt,
          images: imageParts,
          generationConfig: {
            responseMimeType: 'application/json',
          },
        },
        { route: '/api/analyze' }
      );
      responseText = geminiResult.text;
      console.info('[analyze] Gemini success', {
        at: new Date().toISOString(),
        modelUsed: geminiResult.modelUsed,
        attempts: geminiResult.attempts.length,
      });
    } catch (geminiError: unknown) {
      logAnalyzeError('Analyze API Gemini error:', geminiError);
      if (isFilesystemError(geminiError)) {
        console.warn('FS write skipped (during Gemini analyze)', geminiError);
        return jsonError(
          '一時的なサーバー環境エラーが発生しました。お手数ですが、もう一度お試しください。',
          503,
          { code: 'SERVER_ENV_ERROR', kind: 'temporary', retryable: true }
        );
      }

      if (geminiError instanceof GeminiFallbackExhaustedError) {
        return jsonError(geminiError.message, 503, {
          code: 'GEMINI_ALL_MODELS_FAILED',
          kind: 'temporary',
          retryable: true,
          details: {
            summary: geminiError.lastDetails.summary,
            status: geminiError.lastDetails.status,
            statusText: geminiError.lastDetails.statusText,
            attempts: geminiError.attempts,
            modelsTried: [...GEMINI_ANALYZE_MODELS],
          },
        });
      }

      const details = extractGeminiErrorDetails(geminiError);
      const classified = classifyUpstreamGeminiError({
        status: details.status,
        message: details.message,
      });
      console.error(
        '[analyze] Gemini upstream failure',
        compactDefined({
          at: new Date().toISOString(),
          summary: details.summary,
          status: details.status,
          statusText: details.statusText,
          kind: classified.kind,
          code: classified.code,
          modelsTried: [...GEMINI_ANALYZE_MODELS],
        })
      );
      emitOpsEventFireAndForget({
        code: classified.code,
        severity: classified.kind === 'config' ? 'critical' : 'error',
        message: details.summary || details.message,
        route: '/api/analyze',
        notify: true,
        details: compactDefined({
          status: details.status,
          statusText: details.statusText,
          modelsTried: [...GEMINI_ANALYZE_MODELS],
        }),
      });
      return jsonError(details.summary || details.message, classified.httpStatus, {
        code: classified.code,
        kind: classified.kind,
        retryable: classified.kind === 'temporary',
        details: compactDefined({
          summary: details.summary,
          status: details.status,
          statusText: details.statusText,
          statusCode: details.statusCode,
          responseBody: details.responseBody,
          modelsTried: [...GEMINI_ANALYZE_MODELS],
        }),
      });
    }

    let parsedData: Record<string, unknown>;
    try {
      parsedData = JSON.parse(responseText) as Record<string, unknown>;
    } catch (parseError: unknown) {
      logAnalyzeError('Analyze API JSON parse error:', parseError);
      emitOpsEventFireAndForget({
        code: 'PARSE_FAILED',
        severity: 'error',
        message: 'Gemini 応答の JSON 解析に失敗しました',
        route: '/api/analyze',
        notify: true,
      });
      return jsonError('分析結果の解析に失敗しました。もう一度お試しください。', 502, {
        code: 'PARSE_FAILED',
        kind: 'temporary',
        retryable: true,
      });
    }

    // 旧フィールド互換（失敗してもレスポンスは返す）
    try {
      if (!parsedData.futureForecastReport && Array.isArray(parsedData.marketForecastReport)) {
        parsedData.futureForecastReport = parsedData.marketForecastReport;
      }
      if (!parsedData.priceHistoryReport && Array.isArray(parsedData.marketForecastReport)) {
        parsedData.priceHistoryReport = (parsedData.marketForecastReport as unknown[]).slice(0, 2);
      }
    } catch (e) {
      console.warn('FS write skipped / compat mapping skipped', e);
    }

    return NextResponse.json(parsedData);
  } catch (error: unknown) {
    // 最終ガード: いかなる例外でも JSON を返してクラッシュさせない
    logAnalyzeError('Analyze API Error details:', error);

    if (isFilesystemError(error)) {
      console.warn('FS write skipped (analyze top-level)', error);
      return jsonError(
        '一時的なサーバー環境エラーが発生しました。お手数ですが、もう一度お試しください。',
        503,
        { code: 'SERVER_ENV_ERROR', kind: 'temporary', retryable: true }
      );
    }

    const details = extractGeminiErrorDetails(error);
    const classified = classifyUpstreamGeminiError({
      status: details.status,
      message: details.message,
    });
    emitOpsEventFireAndForget({
      code: 'ANALYZE_FAILED',
      severity: 'error',
      message: details.summary || details.message,
      route: '/api/analyze',
      notify: true,
    });
    return jsonError(details.summary || details.message, classified.httpStatus, {
      code: classified.code,
      kind: classified.kind,
      retryable: classified.kind === 'temporary',
    });
  }
}

import '@/lib/vercel-fs-guard-init';
import { NextResponse } from 'next/server';
import {
  USER_ERROR_MESSAGES,
  classifyUpstreamGeminiError,
  kindFromCode,
  type ApiErrorKind,
} from '@/lib/api-errors';
import {
  GEMINI_CHAT_MODELS,
  GeminiFallbackExhaustedError,
  compactDefined,
  extractGeminiErrorDetails,
  generateGeminiContentWithFallback,
  getGeminiApiKeyDiagnostics,
  hasGeminiApiKey,
} from '@/lib/gemini';
import { emitOpsEventFireAndForget } from '@/lib/ops-events';
import { installVercelFsGuard, isFilesystemError } from '@/lib/vercel-fs-guard';

installVercelFsGuard();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  return NextResponse.json(
    compactDefined({
      error: userFacing,
      detail: message !== userFacing ? message : undefined,
      code,
      kind,
      retryable,
      details: extra?.details ? compactDefined(extra.details) : undefined,
    }),
    { status }
  );
}

export async function POST(req: Request) {
  installVercelFsGuard();

  try {
    const {
      propertyInfo,
      previousAnalysis,
      messageHistory,
      newMessage,
      propertyType,
      householdType,
    } = await req.json();

    if (!newMessage || typeof newMessage !== 'string' || !newMessage.trim()) {
      return jsonError('メッセージが入力されていません', 400, {
        code: 'REQUEST_INVALID',
        kind: 'client',
        retryable: false,
      });
    }

    const keyDiag = getGeminiApiKeyDiagnostics();
    console.info('[chat] Gemini API key diagnostics', {
      at: new Date().toISOString(),
      ...keyDiag,
    });

    if (!hasGeminiApiKey()) {
      console.error('Chat API config error: GEMINI_API_KEY missing', keyDiag);
      emitOpsEventFireAndForget({
        code: 'CONFIG_MISSING_GEMINI_API_KEY',
        severity: 'critical',
        message: 'GEMINI_API_KEY が未設定のため /api/chat が失敗しました',
        route: '/api/chat',
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

    const propertyLabel = propertyType === 'purchase' ? '分譲（購入）' : '賃貸';
    const householdLabel = householdType === 'family' ? 'ファミリー（同居あり）' : '一人暮らし';

    const analysisBrief = previousAnalysis
      ? [
          `スコア:${previousAnalysis.score ?? '-'}`,
          previousAnalysis.summary ? `総評:${String(previousAnalysis.summary).slice(0, 160)}` : '',
          Array.isArray(previousAnalysis.pros)
            ? `メリット:${previousAnalysis.pros.slice(0, 2).join(' / ')}`
            : '',
          Array.isArray(previousAnalysis.cons)
            ? `注意:${previousAnalysis.cons.slice(0, 2).join(' / ')}`
            : '',
        ]
          .filter(Boolean)
          .join(' | ')
      : '（なし）';

    const recentHistory =
      Array.isArray(messageHistory) && messageHistory.length > 0
        ? messageHistory
            .slice(-6)
            .map((msg: { role?: string; text?: string }) => {
              const role = msg.role === 'model' ? 'AI' : 'ユーザー';
              return `${role}: ${(msg.text || '').slice(0, 200)}`;
            })
            .join('\n')
        : '（なし）';

    const prompt = `あなたは不動産の本音アドバイザー。フランクで遠慮のないプロとして答える。
対象:【${propertyLabel}】【${householdLabel}】
物件情報:${(propertyInfo || '情報なし').slice(0, 800)}
事前査定:${analysisBrief}

【回答の組み立て】
1) 結論（最初の1文でスパッと言い切る）
2) 必要に応じて根拠・理由（物件情報や査定結果に触れて具体的に）
3) 必要に応じて具体アドバイス（交渉・内見・確認・見送りなど）

【分量（可変・厳守）】
- 簡単な質問（Yes/No、一言確認、簡単な交渉可否など）は100〜150文字程度で素早く返答する。
- 詳細な解説が必要な質問（理由・根拠・注意点・比較・判断プロセスなど）では、文字数制限を気にせず途中で打ち切らず、最後まで丁寧に回答を完成させる。
- 絶対に文の途中で終わらせない。途切れたように見える出力は禁止。

【口調】
- フランク・本音・プロの直言を維持
- 例:「〜だよ」「〜は微妙だね」「正直ここは交渉した方がいい」「〜チェックしてみて」
- 敬語・接客用語（「です・ます」「ご検討ください」等）は使わない
- 曖昧な逃げ言葉の連発は禁止。必要なら推定である旨を一言添えて判断を示す

会話履歴:
${recentHistory}

今回の質問:
${newMessage.trim()}

質問の難易度に合わせて分量を調整し、途切れることなく最後まで回答を完成させてください。`;

    let reply: string;
    try {
      const geminiResult = await generateGeminiContentWithFallback(
        GEMINI_CHAT_MODELS,
        {
          prompt,
          generationConfig: {
            maxOutputTokens: 1500,
            temperature: 0.75,
          },
        },
        { route: '/api/chat' }
      );
      reply = geminiResult.text;
      console.info('[chat] Gemini success', {
        at: new Date().toISOString(),
        modelUsed: geminiResult.modelUsed,
        attempts: geminiResult.attempts.length,
      });
    } catch (chatError: unknown) {
      if (isFilesystemError(chatError)) {
        console.warn('FS write skipped (during Gemini chat)', chatError);
        return jsonError(
          '一時的なサーバー環境エラーが発生しました。お手数ですが、もう一度お試しください。',
          503,
          { code: 'SERVER_ENV_ERROR', kind: 'temporary', retryable: true }
        );
      }

      if (chatError instanceof GeminiFallbackExhaustedError) {
        return jsonError(chatError.message, 503, {
          code: 'GEMINI_ALL_MODELS_FAILED',
          kind: 'temporary',
          retryable: true,
          details: {
            summary: chatError.lastDetails.summary,
            status: chatError.lastDetails.status,
            attempts: chatError.attempts,
            modelsTried: [...GEMINI_CHAT_MODELS],
          },
        });
      }

      throw chatError;
    }

    return NextResponse.json({ reply: reply.trim() });
  } catch (error: unknown) {
    const details = extractGeminiErrorDetails(error);
    console.error(
      'Chat route error:',
      compactDefined({
        at: new Date().toISOString(),
        summary: details.summary,
        message: details.message,
        status: details.status,
        statusText: details.statusText,
        statusCode: details.statusCode,
        responseBody: details.responseBody,
        errorDetails: details.errorDetails,
      })
    );
    if (isFilesystemError(error)) {
      console.warn('FS write skipped (chat top-level)', error);
      return jsonError(
        '一時的なサーバー環境エラーが発生しました。お手数ですが、もう一度お試しください。',
        503,
        { code: 'SERVER_ENV_ERROR', kind: 'temporary', retryable: true }
      );
    }

    const classified = classifyUpstreamGeminiError({
      status: details.status,
      message: details.message,
    });
    emitOpsEventFireAndForget({
      code: classified.code,
      severity: classified.kind === 'config' ? 'critical' : 'error',
      message: details.summary || details.message,
      route: '/api/chat',
      notify: true,
      details: compactDefined({
        status: details.status,
        statusText: details.statusText,
        modelsTried: [...GEMINI_CHAT_MODELS],
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
        modelsTried: [...GEMINI_CHAT_MODELS],
      }),
    });
  }
}

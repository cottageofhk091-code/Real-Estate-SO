import { GoogleGenerativeAI, type GenerateContentResult } from '@google/generative-ai';

/**
 * Gemini モデル定数
 *
 * 注意:
 * - gemini-1.5-* / gemini-2.0-* はシャットダウン済み（v1beta で 404）
 * - gemini-2.5-pro は新規ユーザー向けに提供されない場合がある
 * - モデル名は必ず "gemini-..." のみ（"models/" 接頭辞なし）
 */
export const GEMINI_ANALYZE_MODEL = 'gemini-2.5-flash';
export const GEMINI_CHAT_MODEL = 'gemini-2.5-flash';

/** フォールバック候補（analyze） */
export const GEMINI_ANALYZE_MODELS = [
  GEMINI_ANALYZE_MODEL,
  'gemini-flash-latest',
  'gemini-2.5-flash-lite',
] as const;

/** フォールバック候補（chat） */
export const GEMINI_CHAT_MODELS = [
  GEMINI_CHAT_MODEL,
  'gemini-flash-latest',
  'gemini-2.5-flash-lite',
] as const;

/** SDK / URL 用に models/ 接頭辞を除去する */
export function normalizeGeminiModelId(model: string): string {
  return String(model || '')
    .trim()
    .replace(/^models\//i, '');
}

export function createGeminiClient(apiKey = process.env.GEMINI_API_KEY || '') {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY が設定されていません。');
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
  const genAI = createGeminiClient();
  const modelId = normalizeGeminiModelId(model);

  const generativeModel = genAI.getGenerativeModel({
    model: modelId,
    generationConfig,
  });

  const parts: Array<string | InlineImage> = [prompt, ...images];
  const result: GenerateContentResult = await generativeModel.generateContent(parts);
  const text = result.response.text();
  if (!text) {
    throw new Error(`モデル ${modelId} から空のレスポンスが返されました。`);
  }
  return text;
}

/** 候補モデルを順に試し、最初に成功した応答を返す */
export async function generateGeminiContentWithFallback(
  models: readonly string[],
  params: Omit<GenerateParams, 'model'>
): Promise<string> {
  let lastError: unknown = null;

  for (const model of models) {
    try {
      return await generateGeminiContent({ ...params, model });
    } catch (err) {
      lastError = err;
      console.warn(`[Gemini] model failed: ${normalizeGeminiModelId(model)}`, err);
    }
  }

  throw lastError || new Error('利用可能なGeminiモデルでのレスポンス取得に失敗しました。');
}

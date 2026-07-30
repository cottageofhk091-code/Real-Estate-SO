import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "gemini-3.6-flash";
const GEMINI_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 2;
const MIN_TEXT_LENGTH = 10;
const MAX_TEXT_LENGTH = 5000;
const MAX_IMAGES = 4;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const USER_FRIENDLY_ERROR =
  "ただいまアクセスが集中しているか、一時的に通信が不安定になっています。恐れ入りますが、数十秒ほど時間を置いて再度お試しください。";

const SYSTEM_PROMPT = `返答は必ず純粋なJSONフォーマットのみ（マークダウン記法不要）で出力してください。\`\`\`json や挨拶文は一切禁止です。

あなたはベテランの不動産コンサルタントです。提供された物件概要テキスト（SUUMO等）および間取り図・外観写真などの画像をプロ目線で査定し、次のJSONオブジェクトのみを返してください:
{
  "score": 0から100の整数（高いほどおすすめ・リスクが低い）,
  "scoreLabel": "おすすめ度の短いラベル（例: 条件次第で検討可）",
  "summary": "査定の総評を1〜2文で",
  "merits": [
    { "title": "短いタイトル", "description": "具体的な説明" }
  ],
  "demerits": [
    {
      "title": "短いタイトル",
      "description": "具体的な説明",
      "severity": "high" | "medium" | "low"
    }
  ],
  "advice": "内見・契約前に取るべき行動のアドバイス（2〜4文）",
  "imageInsights": [
    {
      "category": "間取り|外観|日当たり|築年・状態|設備|その他",
      "finding": "画像から読み取れた具体的な所見",
      "implication": "入居判断への影響・注意点"
    }
  ],
  "checklist": [
    {
      "category": "カテゴリ名（例: 水回り、周辺環境、設備）",
      "item": "内見時に確認する具体的な項目"
    }
  ]
}

- merits は2〜4件、demerits は3〜6件、checklist は5〜10件を目安にする
- 画像がある場合は imageInsights を2〜6件、間取りの特徴・採光・動線・外観の印象・設備・築年/劣化の推測などを具体的に書く
- 画像がない場合は imageInsights は空配列 [] にする
- テキストと画像の両方がある場合は、矛盾や補完関係も指摘する`;

type UploadedImage = {
  mimeType: string;
  data: string;
};

function getApiKey(): string | null {
  const raw =
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    process.env.GOOGLE_GENAI_API_KEY ??
    "";
  const key = raw.trim().replace(/^["']|["']$/g, "");
  if (!key || key === "YOUR_API_KEY") return null;
  return key;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return "Gemini API の応答がタイムアウトしました。しばらくして再試行してください。";
    }
    return error.message || "解析中にエラーが発生しました。";
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "解析中にエラーが発生しました。";
  }
}

function getErrorStatus(error: unknown): number {
  const message = toErrorMessage(error);

  if (message.includes("RESOURCE_EXHAUSTED") || message.includes("429")) {
    return 429;
  }

  if (message.includes("NOT_FOUND") || message.includes("404")) {
    return 404;
  }

  if (
    message.includes("タイムアウト") ||
    message.includes("timeout") ||
    message.includes("Timeout")
  ) {
    return 504;
  }

  if (message.includes("400") || message.includes("INVALID_ARGUMENT")) {
    return 400;
  }

  return 500;
}

function isRetryableStatus(status: number): boolean {
  return (
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status >= 500
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractOutputText(interaction: {
  output_text?: string | null;
  steps?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
}): string {
  if (interaction.output_text?.trim()) {
    return interaction.output_text.trim();
  }

  const fromSteps =
    interaction.steps
      ?.filter((step) => step.type === "model_output")
      .flatMap((step) => step.content ?? [])
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text ?? "")
      .join("\n")
      .trim() ?? "";

  return fromSteps;
}

function sanitizeAiJsonText(raw: string): string {
  let text = String(raw ?? "").trim();

  text = text.replace(/```(?:json|JSON|js|javascript)?\s*/gi, "");
  text = text.replace(/```/g, "");
  text = text.trim();

  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    text = match[0];
  }

  text = text.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");

  return text.trim();
}

function parseAiJson(raw: string): unknown {
  const sanitized = sanitizeAiJsonText(raw);
  if (!sanitized) {
    throw new Error("AI応答が空です");
  }

  try {
    return JSON.parse(sanitized);
  } catch (firstError) {
    const repaired = sanitized.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(repaired);
    } catch {
      throw firstError;
    }
  }
}

function normalizeImages(raw: unknown): UploadedImage[] {
  if (!Array.isArray(raw)) return [];

  const images: UploadedImage[] = [];

  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const mimeType =
      typeof (item as { mimeType?: unknown }).mimeType === "string"
        ? (item as { mimeType: string }).mimeType.trim().toLowerCase()
        : "";
    let data =
      typeof (item as { data?: unknown }).data === "string"
        ? (item as { data: string }).data.trim()
        : "";

    if (!mimeType || !data) continue;
    if (!ALLOWED_IMAGE_TYPES.has(mimeType)) continue;

    // data URL 形式なら base64 部分のみ抽出
    const dataUrlMatch = data.match(/^data:([^;]+);base64,(.+)$/i);
    if (dataUrlMatch) {
      data = dataUrlMatch[2];
    }

    if (!data) continue;
    images.push({ mimeType: mimeType === "image/jpg" ? "image/jpeg" : mimeType, data });

    if (images.length >= MAX_IMAGES) break;
  }

  return images;
}

export async function GET() {
  const apiKey = getApiKey();
  return NextResponse.json({
    ok: true,
    route: "/api/analyze",
    methods: ["POST"],
    model: MODEL,
    api: "interactions",
    multimodal: true,
    maxImages: MAX_IMAGES,
    hasApiKey: Boolean(apiKey),
    apiKeyLength: apiKey?.length ?? 0,
  });
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error("[/api/analyze] JSON parse error:", parseError);
      return NextResponse.json(
        { error: "入力内容を確認して、もう一度お試しください。" },
        { status: 400 },
      );
    }

    const text =
      typeof body === "object" &&
      body !== null &&
      "text" in body &&
      typeof (body as { text: unknown }).text === "string"
        ? (body as { text: string }).text.trim()
        : "";

    const images = normalizeImages(
      typeof body === "object" && body !== null && "images" in body
        ? (body as { images: unknown }).images
        : [],
    );

    if (!text && images.length === 0) {
      return NextResponse.json(
        { error: "物件テキスト、または間取り図・外観写真を入力してください。" },
        { status: 400 },
      );
    }

    if (text && text.length < MIN_TEXT_LENGTH && images.length === 0) {
      return NextResponse.json(
        { error: "物件情報を10文字以上入力してください。" },
        { status: 400 },
      );
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: "物件情報は5,000文字以内で入力してください。" },
        { status: 400 },
      );
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      console.error(
        "[/api/analyze] GEMINI_API_KEY is missing or still YOUR_API_KEY",
      );
      return NextResponse.json({ error: USER_FRIENDLY_ERROR }, { status: 500 });
    }

    console.log("[/api/analyze] start", {
      api: "interactions",
      model: MODEL,
      textLength: text.length,
      imageCount: images.length,
      apiKeyLength: apiKey.length,
    });

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: GEMINI_TIMEOUT_MS },
    });

    const promptText = `返答は必ず純粋なJSONフォーマットのみ（マークダウン記法不要）で出力してください。

${
  text
    ? `以下の物件概要テキストを解析してください。\n\n---\n${text}\n---`
    : "物件テキストは未入力です。添付画像（間取り図・外観写真など）から読み取れる情報を中心に査定してください。"
}
${
  images.length > 0
    ? `\n添付画像が ${images.length} 枚あります。間取りの特徴、日当たり・採光、動線、外観の印象、設備、築年や劣化の推測などを imageInsights に含めてください。`
    : ""
}`;

    const inputParts: Array<
      | { type: "text"; text: string }
      | { type: "image"; data: string; mime_type: string }
    > = [{ type: "text", text: promptText }];

    for (const image of images) {
      inputParts.push({
        type: "image",
        data: image.data,
        mime_type: image.mimeType,
      });
    }

    let interaction:
      | {
          output_text?: string | null;
          steps?: Array<{
            type?: string;
            content?: Array<{ type?: string; text?: string }>;
          }>;
        }
      | undefined;
    let lastApiError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const abortController = new AbortController();
      const timeoutId = setTimeout(
        () => abortController.abort(),
        GEMINI_TIMEOUT_MS,
      );

      try {
        interaction = await Promise.race([
          ai.interactions.create({
            model: MODEL,
            store: false,
            system_instruction: SYSTEM_PROMPT,
            input: inputParts,
            generation_config: {
              temperature: 0.2,
              max_output_tokens: 4096,
            },
          }),
          new Promise<never>((_, reject) => {
            abortController.signal.addEventListener(
              "abort",
              () => reject(new Error("Gemini API request timeout")),
              { once: true },
            );
          }),
        ]);
        lastApiError = undefined;
        clearTimeout(timeoutId);
        break;
      } catch (apiError) {
        clearTimeout(timeoutId);
        lastApiError = apiError;
        const status = getErrorStatus(apiError);
        console.error(
          `[/api/analyze] Gemini attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`,
          apiError,
        );

        if (!isRetryableStatus(status) || attempt === MAX_RETRIES) {
          return NextResponse.json(
            { error: USER_FRIENDLY_ERROR, status },
            { status },
          );
        }

        const waitMs = 2000 * (attempt + 1);
        console.log(`[/api/analyze] retrying in ${waitMs}ms...`);
        await sleep(waitMs);
      }
    }

    if (!interaction) {
      console.error(
        "[/api/analyze] no interaction after retries:",
        lastApiError,
      );
      return NextResponse.json(
        { error: USER_FRIENDLY_ERROR, status: 500 },
        { status: 500 },
      );
    }

    const rawText = extractOutputText(interaction);
    if (!rawText) {
      console.error("[/api/analyze] empty response from Gemini Interactions");
      return NextResponse.json({ error: USER_FRIENDLY_ERROR }, { status: 502 });
    }

    let parsed: {
      score?: unknown;
      scoreLabel?: unknown;
      summary?: unknown;
      merits?: unknown;
      demerits?: unknown;
      advice?: unknown;
      imageInsights?: unknown;
      checklist?: unknown;
    };
    try {
      parsed = parseAiJson(rawText) as typeof parsed;
    } catch (jsonError) {
      console.error(
        "[/api/analyze] invalid JSON from Gemini:",
        jsonError,
        sanitizeAiJsonText(rawText).slice(0, 500),
      );
      return NextResponse.json({ error: USER_FRIENDLY_ERROR }, { status: 502 });
    }

    if (!Array.isArray(parsed.demerits) || !Array.isArray(parsed.checklist)) {
      console.error("[/api/analyze] unexpected shape:", parsed);
      return NextResponse.json({ error: USER_FRIENDLY_ERROR }, { status: 502 });
    }

    const score =
      typeof parsed.score === "number"
        ? Math.max(0, Math.min(100, Math.round(parsed.score)))
        : 50;

    return NextResponse.json({
      score,
      scoreLabel:
        typeof parsed.scoreLabel === "string" ? parsed.scoreLabel : "査定完了",
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      merits: Array.isArray(parsed.merits) ? parsed.merits : [],
      demerits: parsed.demerits,
      advice: typeof parsed.advice === "string" ? parsed.advice : "",
      imageInsights: Array.isArray(parsed.imageInsights)
        ? parsed.imageInsights
        : [],
      checklist: parsed.checklist,
      model: MODEL,
    });
  } catch (error) {
    console.error("[/api/analyze] unhandled error:", error);
    return NextResponse.json({ error: USER_FRIENDLY_ERROR }, { status: 500 });
  }
}

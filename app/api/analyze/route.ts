import '@/lib/vercel-fs-guard-init';
import { NextResponse } from 'next/server';
import { GEMINI_ANALYZE_MODELS, generateGeminiContentWithFallback } from '@/lib/gemini';

type PropertyType = 'rental' | 'purchase';
type HouseholdType = 'single' | 'family';

function labelPropertyType(type: PropertyType | string | undefined): string {
  return type === 'purchase' ? '分譲（購入）' : '賃貸';
}

function labelHouseholdType(type: HouseholdType | string | undefined): string {
  return type === 'family' ? 'ファミリー（同居あり）' : '一人暮らし';
}

export async function POST(req: Request) {
  try {
    const { text, images, propertyType, householdType } = await req.json();

    if (!text && (!images || images.length === 0)) {
      return NextResponse.json(
        { error: 'テキストまたは画像を入力してください。' },
        { status: 400 }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'サーバー側の設定エラーです。' }, { status: 500 });
    }

    const propertyLabel = labelPropertyType(propertyType);
    const householdLabel = labelHouseholdType(householdType);
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

    const responseText = await generateGeminiContentWithFallback(GEMINI_ANALYZE_MODELS, {
      prompt,
      images: imageParts,
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const parsedData = JSON.parse(responseText);

    // 旧フィールド互換: marketForecastReport しか無い場合は将来予測へ寄せる
    if (!parsedData.futureForecastReport && Array.isArray(parsedData.marketForecastReport)) {
      parsedData.futureForecastReport = parsedData.marketForecastReport;
    }
    if (!parsedData.priceHistoryReport && Array.isArray(parsedData.marketForecastReport)) {
      parsedData.priceHistoryReport = parsedData.marketForecastReport.slice(0, 2);
    }

    return NextResponse.json(parsedData);
  } catch (error: unknown) {
    console.error('API Error:', error);
    const message = error instanceof Error ? error.message : '分析処理中にエラーが発生しました。';
    let status = 500;
    if (/quota|429|resource.?exhausted|rate.?limit/i.test(message)) status = 429;
    else if (/404|not found|is not found/i.test(message)) status = 404;
    else if (/timeout|timed?\s*out|deadline/i.test(message)) status = 504;
    return NextResponse.json({ error: message }, { status });
  }
}

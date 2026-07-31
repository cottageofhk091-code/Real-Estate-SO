import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || "");

export async function POST(req: NextRequest) {
  try {
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEYが設定されていません。" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { image, targetType = "single" } = body;

    if (!image) {
      return NextResponse.json(
        { error: "画像データが見つかりません。" },
        { status: 400 }
      );
    }

    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const mimeTypeMatch = image.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/jpeg";

    let targetInstructions = "";
    if (targetType === "family") {
      targetInstructions = `
【分析視点：ファミリー向け】
- 子育て環境、周辺の安全面、学校や公園へのアクセスを重視して評価してください。
- 間取りの使い勝手（収納の多さ、家事動線、プライバシー確保など）を注視してください。
- 近隣の音問題や騒音リスクについて言及してください。
      `;
    } else if (targetType === "investment") {
      targetInstructions = `
【分析視点：収益物件・不動産投資用】
- 資産価値、将来の利回り可能性、賃貸需要の高さ（立地・最寄り駅スペック）を重視してください。
- 修繕リスクや物件の維持管理コストになりそうな注意点を挙げてください。
- ターゲット層（単身者向けかファミリー向けか等）と空室リスクについて分析してください。
      `;
    } else {
      targetInstructions = `
【分析視点：一人暮らし向け】
- 通勤・通学の利便性、スーパー・コンビニ・ドラッグストア等の買い物環境を重視してください。
- 一人暮らしに最適な広さ・設備（オートロック、宅配ボックス、バス・トイレ別など）を評価してください。
- 家賃対効果や一人暮らしでの住みやすさ・防犯面を注視してください。
      `;
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
あなたはプロの不動産鑑定士および物件選定コンサルタントです。
提供された物件情報（図面、マイソク、スペック画像、写真など）を詳細に解析し、以下の基準で評価を行ってください。

${targetInstructions}

以下のJSON形式のみで回答を出力してください。Markdownなどの余計な装飾や解説は含めないでください。

{
  "propertyName": "物件名（画像から読み取れる場合。不明な場合は'不動産物件'）",
  "score": 85,
  "summary": "物件の全体的な要約・評価のまとめ（200文字程度）",
  "pros": [
    "長所・メリット1",
    "長所・メリット2",
    "長所・メリット3"
  ],
  "cons": [
    "短所・注意点1",
    "短所・注意点2",
    "短所・注意点3"
  ],
  "checkpoints": [
    "内見時や検討時に確認すべき重要ポイント1",
    "内見時や検討時に確認すべき重要ポイント2"
  ]
}
`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      },
    ]);

    const responseText = result.response.text();
    const cleanedText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
    const analysisResult = JSON.parse(cleanedText);

    return NextResponse.json(analysisResult);
  } catch (error: any) {
    console.error("Analysis Error:", error);
    return NextResponse.json(
      { error: "物件情報の解析中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}
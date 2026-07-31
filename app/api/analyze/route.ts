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

    // 目的別の追加指示
    let targetContext = "";
    if (targetType === "family") {
      targetContext = "【分析視点：ファミリー向け】特に子育て環境、治安・安全面、家事動線や収納力、周辺の生活利便性を重視して評価してください。";
    } else if (targetType === "investment") {
      targetContext = "【分析視点：収益物件用】特に資産価値、将来の空室リスク、修繕コストリスク、想定ターゲットへの訴求力を重視して評価してください。";
    } else {
      targetContext = "【分析視点：一人暮らし向け】特に通勤通学の利便性、近隣の買い出し環境、防犯性・設備スペック、コスパを重視して評価してください。";
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
あなたはプロの不動産コンサルタントです。添付された物件画像（マイソク、間取り図、物件写真等）を詳しく分析し、以下の条件に従って評価を行ってください。

${targetContext}

回答は必ず以下のJSON形式のみで返してください。余計な解説やMarkdown装飾は含めないでください。

{
  "propertyName": "物件名（不明な場合は'該当物件'）",
  "score": 80,
  "summary": "物件の全体的な評価・概要まとめ（150〜200文字程度）",
  "pros": [
    "メリット・良い点1",
    "メリット・良い点2",
    "メリット・良い点3"
  ],
  "cons": [
    "デメリット・気になる点1",
    "デメリット・気になる点2",
    "デメリット・気になる点3"
  ],
  "checkpoints": [
    "内見時や事前確認でのチェックポイント1",
    "内見時や事前確認でのチェックポイント2"
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
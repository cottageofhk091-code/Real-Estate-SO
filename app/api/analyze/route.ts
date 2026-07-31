// app/api/analyze/route.ts
import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(request: Request) {
  try {
    const { text, images } = await request.json();

    if (!text && (!images || images.length === 0)) {
      return NextResponse.json(
        { error: 'テキストまたは画像を少なくとも1つ入力してください。' },
        { status: 400 }
      );
    }

    const prompt = `
あなたはプロの不動産コンサルタントおよび一級建築士の視点を持つ「不動産査定・セカンドオピニオンAI」です。
ユーザーから提供された物件情報（テキストおよび画像）をプロの目で厳しく精査し、以下のJSON形式厳守で詳細な査定・アドバイスを出力してください。

【出力要件】
1. 単なる要約ではなく、購入・賃貸を検討しているユーザーが失敗しないための「プロならではの具体的・多角的なアドバイス」を記述してください。
2. 専門用語を使う場合は分かりやすく解説を補足してください。
3. リスクやデメリットも隠さず客観的に指摘してください。

【出力JSONフォーマット】（※必ずこのJSONのみを出力してください）
{
  "score": 85,
  "summary": "物件の全体像、コスパ、総合的なおすすめ度を解説した概要文章（200〜300文字程度）",
  "pros": [
    "おすすめポイント1（具体的な理由やメリット）",
    "おすすめポイント2",
    "おすすめポイント3"
  ],
  "cons": [
    "懸念点・リスク1（注意すべき理由や対策）",
    "懸念点・リスク2",
    "懸念点・リスク3"
  ],
  "details": {
    "priceEvaluation": "周辺相場との比較、家賃・管理費・初期費用の適正感についての解説",
    "locationEvaluation": "駅徒歩、周辺の買い出し・治安・生活利便性、日当たりや周辺環境のリスク評価",
    "layoutEvaluation": "間取りの使い勝手、生活動線、収納量、構造による防音性・耐震性の評価"
  },
  "viewingChecklist": [
    "【場所/項目】内見時に現地で確認すべき具体的なチェックポイント1",
    "【場所/項目】内見時に現地で確認すべき具体的なチェックポイント2",
    "【場所/項目】内見時に現地で確認すべき具体的なチェックポイント3",
    "【場所/項目】内見時に現地で確認すべき具体的なチェックポイント4",
    "【場所/項目】内見時に現地で確認すべき具体的なチェックポイント5"
  ]
}

以下が入力された物件情報です：
${text ? `【テキスト情報】:\n${text}\n` : ''}
${images && images.length > 0 ? `【画像添付あり】: 送信された画像・間取り図も総合的に判断してください。` : ''}
`;

    const contents: any[] = [{ text: prompt }];

    if (images && images.length > 0) {
      images.forEach((img: { inlineData: { mimeType: string; data: string } }) => {
        contents.push({
          inlineData: {
            mimeType: img.inlineData.mimeType,
            data: img.inlineData.data,
          },
        });
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error('AIからの応答が空でした。');
    }

    const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsedData = JSON.parse(cleanedText);

    return NextResponse.json(parsedData);
  } catch (error: any) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: error.message || '解析処理中にエラーが発生しました。' },
      { status: 500 }
    );
  }
}
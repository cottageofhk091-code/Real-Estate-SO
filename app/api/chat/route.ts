// app/api/chat/route.ts
import { NextResponse } from 'next/server';

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  return key;
}

export async function POST(req: Request) {
  try {
    const { propertyInfo, previousAnalysis, messageHistory, newMessage } = await req.json();

    if (!newMessage) {
      return NextResponse.json({ error: 'メッセージが入力されていません' }, { status: 400 });
    }

    const apiKey = getApiKey();

    // これまでの査定データと会話履歴をAIへのプロンプト（指示文）に組み込む
    const systemInstruction = `
あなたは不動産査定のプロフェッショナルAIアドバイザーです。
ユーザーは以下の「対象物件情報」および「事前の査定結果」について質問を行っています。

【対象物件情報】
${propertyInfo || '（入力されたテキスト情報なし）'}

【事前の査定結果サマリー】
${JSON.stringify(previousAnalysis, null, 2)}

上記を踏まえ、ユーザーからの質問に対して親身かつ論理的・客観的に回答してください。
回答は分かりやすく、親しみやすい日本語（敬語）で書いてください。
`;

    // チャット履歴の構築
    const contents = [
      {
        role: 'user',
        parts: [{ text: systemInstruction }]
      },
      {
        role: 'model',
        parts: [{ text: '承知いたしました。対象物件の情報と査定結果を把握しました。どのようなご質問でしょうか？' }]
      }
    ];

    // ユーザーのこれまでの会話履歴をセット
    if (Array.isArray(messageHistory)) {
      messageHistory.forEach((msg: { role: 'user' | 'model'; text: string }) => {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        });
      });
    }

    // 今回の新しいメッセージを追加
    contents.push({
      role: 'user',
      parts: [{ text: newMessage }]
    });

    // Gemini API (v1beta/models/gemini-1.5-flash:generateContent) を呼び出し
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini Chat API Error:', errText);
      return NextResponse.json({ error: 'AIチャット応答の生成に失敗しました' }, { status: 500 });
    }

    const data = await response.json();
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || '申し訳ありません。回答を取得できませんでした。';

    return NextResponse.json({ reply: replyText });

  } catch (error: any) {
    console.error('Chat route error:', error);
    return NextResponse.json({ error: error.message || '内部エラーが発生しました' }, { status: 500 });
  }
}
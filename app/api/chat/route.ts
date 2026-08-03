import { NextResponse } from 'next/server';
import { GEMINI_CHAT_MODELS, generateGeminiContentWithFallback } from '@/lib/gemini';

export async function POST(req: Request) {
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
      return NextResponse.json({ error: 'メッセージが入力されていません' }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'サーバー側の設定エラーです。' }, { status: 500 });
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
3) 必要に応じて具体的アドバイス（交渉・内見・確認・見送りなど）

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

    const reply = await generateGeminiContentWithFallback(GEMINI_CHAT_MODELS, {
      prompt,
      generationConfig: {
        // 詳細回答の途切れ防止（日本語の長文も余裕を持ってカバー）
        maxOutputTokens: 1500,
        temperature: 0.75,
      },
    });

    return NextResponse.json({ reply: reply.trim() });
  } catch (error: unknown) {
    console.error('Chat route error:', error);
    const message = error instanceof Error ? error.message : '内部エラーが発生しました';
    let status = 500;
    if (/quota|429|resource.?exhausted|rate.?limit/i.test(message)) status = 429;
    else if (/404|not found|is not found/i.test(message)) status = 404;
    else if (/timeout|timed?\s*out|deadline/i.test(message)) status = 504;
    return NextResponse.json({ error: message }, { status });
  }
}

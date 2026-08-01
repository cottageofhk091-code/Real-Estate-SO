'use client';

import { useState } from 'react';

interface AnalysisResult {
  score: number;
  summary: string;
  pros: string[];
  cons: string[];
  details: {
    priceEvaluation: string;
    locationEvaluation: string;
    layoutEvaluation: string;
  };
  viewingChecklist: string[];
}

export default function Home() {
  const [inputText, setInputText] = useState('');
  const [images, setImages] = useState<{ inlineData: { mimeType: string; data: string } }[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Data = (reader.result as string).split(',')[1];
        setImages((prev) => [
          ...prev,
          { inlineData: { mimeType: file.type, data: base64Data } },
        ]);
        setImagePreviews((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleAnalyze = async () => {
    if (!inputText && images.length === 0) {
      setError('物件概要（テキスト）または画像を入力してください。');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, images }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '解析に失敗しました。');
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || '予期せぬエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', color: '#f8fafc', paddingBottom: '80px', fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
      
      {/* 1. ヘッダー */}
      <header style={{ backgroundColor: 'rgba(30, 41, 59, 0.8)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #334155', padding: '16px 24px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🏠</span>
            <span style={{ fontSize: '20px', fontWeight: '800', background: 'linear-gradient(to right, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              物件セカンドオピニオン AI
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.15)', padding: '4px 12px', borderRadius: '20px', border: '1px solid rgba(56, 189, 248, 0.3)', letterSpacing: '1px' }}>
              PRO VERSION
            </span>
          </div>
        </div>
      </header>

      {/* 2. ヒーローセクション（メインタイトル） */}
      <section style={{ textAlign: 'center', padding: '60px 20px 40px', background: 'radial-gradient(circle at top, rgba(56, 189, 248, 0.15) 0%, rgba(15, 23, 42, 0) 70%)' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <span style={{ color: '#38bdf8', fontSize: '13px', fontWeight: 'bold', letterSpacing: '2px', textTransform: 'uppercase', display: 'block', marginBottom: '12px' }}>
            不動産屋の営業トークに惑わされない
          </span>
          <h1 style={{ fontSize: '32px', fontWeight: '900', color: '#ffffff', lineHeight: '1.3', marginBottom: '16px' }}>
            AI不動産プロ査定で<br />
            <span style={{ background: 'linear-gradient(to right, #38bdf8, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              「隠されたリスク」
            </span>
            を即時に完全見抜く
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '15px', lineHeight: '1.6', maxWidth: '600px', margin: '0 auto' }}>
            SUUMOやHOME'Sのテキスト、間取り図画像を貼り付けるだけ。不動産鑑定士並みのロジックで適正相場・潜むデメリット・内見チェックポイントをAIが自動診断します。
          </p>
        </div>
      </section>

      {/* 3. 3つの簡単なステップ */}
      <section style={{ maxWidth: '1000px', margin: '0 auto 40px', padding: '0 20px' }}>
        <h2 style={{ textAlign: 'center', fontSize: '14px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '24px' }}>
          HOW IT WORKS — 簡単 3 ステップ
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
          
          <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '20px', position: 'relative' }}>
            <span style={{ fontSize: '32px', fontWeight: '900', color: '#334155', position: 'absolute', top: '12px', right: '16px' }}>01</span>
            <div style={{ fontSize: '24px', marginBottom: '10px' }}>📋</div>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#f8fafc', marginBottom: '8px' }}>情報をコピー</h3>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, lineHeight: '1.5' }}>
              ポータルサイトの「物件概要」テキスト（家賃、広さ、築年数、駅徒歩など）をコピーします。
            </p>
          </div>

          <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '20px', position: 'relative' }}>
            <span style={{ fontSize: '32px', fontWeight: '900', color: '#334155', position: 'absolute', top: '12px', right: '16px' }}>02</span>
            <div style={{ fontSize: '24px', marginBottom: '10px' }}>📸</div>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#f8fafc', marginBottom: '8px' }}>画像添付（任意）</h3>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, lineHeight: '1.5' }}>
              間取り図や外観の写真画像があればアップロード。AIが図面から採光や動線も読解します。
            </p>
          </div>

          <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '20px', position: 'relative' }}>
            <span style={{ fontSize: '32px', fontWeight: '900', color: '#334155', position: 'absolute', top: '12px', right: '16px' }}>03</span>
            <div style={{ fontSize: '24px', marginBottom: '10px' }}>⚡</div>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#f8fafc', marginBottom: '8px' }}>AI即時セカンドオピニオン</h3>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, lineHeight: '1.5' }}>
              数秒で100点満点のスコア、妥当性評価、プロ視点の注意点リストを分析出力します。
            </p>
          </div>

        </div>
      </section>

      {/* 4. メイン入力フォーム */}
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '0 20px' }}>
        <section style={{ backgroundColor: '#1e293b', padding: '28px', borderRadius: '20px', border: '1px solid #3b82f6', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 0 15px rgba(59, 130, 246, 0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ width: '8px', height: '8px', backgroundColor: '#38bdf8', borderRadius: '50%', display: 'inline-block' }}></span>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#ffffff', margin: 0 }}>
              物件診断フォーム
            </h2>
          </div>
          
          <textarea
            style={{ width: '100%', height: '160px', padding: '16px', borderRadius: '12px', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#f8fafc', fontSize: '14px', boxSizing: 'border-box', outline: 'none', resize: 'vertical', lineHeight: '1.6' }}
            placeholder="ここに物件のテキスト情報（家賃、共益費、所在地、築年数、構造、駅徒歩、設備など）をそのまま貼り付けてください..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />

          <div style={{ marginTop: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#94a3b8', marginBottom: '10px' }}>
              📷 間取り図・外観・内装画像を追加（マルチモーダルAI解析）
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              style={{ fontSize: '13px', color: '#94a3b8' }}
            />

            {imagePreviews.length > 0 && (
              <div style={{ display: 'flex', gap: '12px', marginTop: '14px', overflowX: 'auto', paddingBottom: '6px' }}>
                {imagePreviews.map((src, idx) => (
                  <img
                    key={idx}
                    src={src}
                    alt={`Preview ${idx}`}
                    style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '10px', border: '2px solid #3b82f6' }}
                  />
                ))}
              </div>
            )}
          </div>

          {error && (
            <div style={{ marginTop: '20px', padding: '14px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', fontSize: '14px', borderRadius: '10px' }}>
              ⚠️ {error}
            </div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={loading}
            style={{ width: '100%', marginTop: '24px', backgroundColor: loading ? '#475569' : '#2563eb', color: '#ffffff', fontWeight: '800', padding: '16px', borderRadius: '12px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '16px', boxShadow: loading ? 'none' : '0 4px 14px rgba(37, 99, 235, 0.4)', transition: 'all 0.2s' }}
          >
            {loading ? 'AIがプロの眼で分析中...' : '🔍 この物件をプロAI査定する'}
          </button>
        </section>

        {/* 5. 査定結果表示エリア */}
        {result && (
          <div style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* 総合スコアと概要 */}
            <section style={{ backgroundColor: '#1e293b', padding: '28px', borderRadius: '20px', border: '1px solid #334155', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #334155', paddingBottom: '20px' }}>
                <div>
                  <span style={{ color: '#38bdf8', fontSize: '12px', fontWeight: 'bold', letterSpacing: '1px' }}>AI OVERALL EVALUATION</span>
                  <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: '#f8fafc', margin: '4px 0 0 0' }}>総合診断スコア</h3>
                </div>
                <div style={{ backgroundColor: 'rgba(37, 99, 235, 0.2)', border: '2px solid #3b82f6', color: '#60a5fa', padding: '8px 24px', borderRadius: '24px', textAlign: 'center' }}>
                  <span style={{ fontSize: '36px', fontWeight: '900' }}>{result.score}</span>
                  <span style={{ fontSize: '13px', color: '#93c5fd', marginLeft: '4px' }}>/ 100</span>
                </div>
              </div>
              <p style={{ fontSize: '15px', lineHeight: '1.8', color: '#cbd5e1', margin: 0 }}>{result.summary}</p>
            </section>

            {/* メリット & デメリット */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              <section style={{ backgroundColor: 'rgba(22, 101, 52, 0.15)', border: '1px solid #22c55e', padding: '24px', borderRadius: '20px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#4ade80', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>👍</span> プロが評価するアドバンテージ
                </h3>
                <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '14px', color: '#bbf7d0', lineHeight: '1.7' }}>
                  {result.pros.map((pro, i) => (
                    <li key={i} style={{ marginBottom: '8px' }}>{pro}</li>
                  ))}
                </ul>
              </section>

              <section style={{ backgroundColor: 'rgba(153, 27, 27, 0.15)', border: '1px solid #ef4444', padding: '24px', borderRadius: '20px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#f87171', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>⚠️</span> 潜むリスク・注意すべき欠点
                </h3>
                <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '14px', color: '#fecaca', lineHeight: '1.7' }}>
                  {result.cons.map((con, i) => (
                    <li key={i} style={{ marginBottom: '8px' }}>{con}</li>
                  ))}
                </ul>
              </section>
            </div>

            {/* 詳細分析 */}
            <section style={{ backgroundColor: '#1e293b', padding: '28px', borderRadius: '20px', border: '1px solid #334155' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#f8fafc', margin: '0 0 20px 0', borderBottom: '1px solid #334155', paddingBottom: '12px' }}>
                分野別ディープアナリシス
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ backgroundColor: '#0f172a', padding: '16px', borderRadius: '12px', border: '1px solid #334155' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 'bold', color: '#38bdf8', margin: '0 0 6px 0' }}>💰 価格・費用感の妥当性</h4>
                  <p style={{ fontSize: '14px', color: '#cbd5e1', margin: 0, lineHeight: '1.6' }}>{result.details.priceEvaluation}</p>
                </div>
                <div style={{ backgroundColor: '#0f172a', padding: '16px', borderRadius: '12px', border: '1px solid #334155' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 'bold', color: '#38bdf8', margin: '0 0 6px 0' }}>📍 立地・生活利便性・環境</h4>
                  <p style={{ fontSize: '14px', color: '#cbd5e1', margin: 0, lineHeight: '1.6' }}>{result.details.locationEvaluation}</p>
                </div>
                <div style={{ backgroundColor: '#0f172a', padding: '16px', borderRadius: '12px', border: '1px solid #334155' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 'bold', color: '#38bdf8', margin: '0 0 6px 0' }}>📐 間取り・居住性・設備構造</h4>
                  <p style={{ fontSize: '14px', color: '#cbd5e1', margin: 0, lineHeight: '1.6' }}>{result.details.layoutEvaluation}</p>
                </div>
              </div>
            </section>

            {/* 内見チェックリスト */}
            <section style={{ backgroundColor: 'rgba(146, 64, 14, 0.15)', border: '1px solid #f59e0b', padding: '28px', borderRadius: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#fbbf24', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📋</span> 現地内見で絶対に確認すべきポイント
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {result.viewingChecklist.map((item, i) => (
                  <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: '#fef3c7', cursor: 'pointer', backgroundColor: 'rgba(0, 0, 0, 0.2)', padding: '12px', borderRadius: '8px' }}>
                    <input type="checkbox" style={{ width: '18px', height: '18px', accentColor: '#f59e0b' }} />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* 6. PROプラン・機能比較・安心の説明 */}
        <section style={{ marginTop: '60px', backgroundColor: '#1e293b', padding: '32px', borderRadius: '24px', border: '1px solid #334155', textAlign: 'center' }}>
          <span style={{ color: '#a855f7', fontSize: '12px', fontWeight: 'bold', letterSpacing: '2px', textTransform: 'uppercase' }}>
            PREMIUM OPINION
          </span>
          <h2 style={{ fontSize: '22px', fontWeight: 'bold', color: '#ffffff', margin: '8px 0 16px 0' }}>
            なぜAIセカンドオピニオンが必要なのか？
          </h2>
          <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: '1.7', maxWidth: '650px', margin: '0 auto 28px' }}>
            不動産屋は「契約を取ること」が目的のため、ネガティブな情報を積極的に教えてくれないケースがあります。当AIは完全第三者の中立な立場から、最新の相場・構造データをもとに冷徹かつ公正に査定します。
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', textAlign: 'left' }}>
            <div style={{ backgroundColor: '#0f172a', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
              <div style={{ color: '#38bdf8', fontWeight: 'bold', marginBottom: '6px' }}>🛡️ 完全中立な査定</div>
              <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.5' }}>特定の不動産会社への誘導なし。客観的数値のみで評価。</div>
            </div>
            <div style={{ backgroundColor: '#0f172a', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
              <div style={{ color: '#38bdf8', fontWeight: 'bold', marginBottom: '6px' }}>👁️ 画像読解機能</div>
              <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.5' }}>間取り図の壁位置や柱の飛び出し、周辺画像も高精度認識。</div>
            </div>
            <div style={{ backgroundColor: '#0f172a', padding: '20px', borderRadius: '12px', border: '1px solid #334155' }}>
              <div style={{ color: '#38bdf8', fontWeight: 'bold', marginBottom: '6px' }}>📝 内見リスト出力</div>
              <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.5' }}>現地で失敗しないための「個別確認リスト」を自動作成。</div>
            </div>
          </div>
        </section>
      </main>

      {/* 7. フッター */}
      <footer style={{ marginTop: '60px', textAlign: 'center', borderTop: '1px solid #334155', paddingTop: '30px', color: '#64748b', fontSize: '13px' }}>
        <p>© 物件セカンドオピニオン AI Pro All Rights Reserved.</p>
      </footer>
    </div>
  );
}
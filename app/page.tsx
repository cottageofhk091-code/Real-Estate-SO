// app/page.tsx
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

  // 画像アップロードハンドラー
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

  // 査定実行
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
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* ヘッダー */}
      <header className="bg-slate-900 text-white py-6 px-4 shadow-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">AI不動産セカンドオピニオン</h1>
            <p className="text-xs text-slate-400 mt-1">プロの建築士・コンサルタント視点で物件を厳しくチェック</p>
          </div>
          <span className="bg-emerald-500/20 text-emerald-300 text-xs px-3 py-1 rounded-full border border-emerald-500/30">
            PRO AI VER. 2.5
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 mt-8 space-y-8">
        {/* 入力エリア */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <span className="w-2 h-6 bg-blue-600 rounded-full inline-block"></span>
            物件情報の入力
          </h2>

          <textarea
            className="w-full h-36 p-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm resize-none"
            placeholder="SUUMOやHOME'Sの物件概要、ポータルサイトのテキストをそのまま貼り付けてください（価格、駅徒歩、築年数、構造、管理費など）"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />

          {/* 画像添付 */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              間取り図や外観画像（任意）
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            />

            {/* プレビュー */}
            {imagePreviews.length > 0 && (
              <div className="flex gap-3 mt-3 overflow-x-auto pb-2">
                {imagePreviews.map((src, idx) => (
                  <img
                    key={idx}
                    src={src}
                    alt={`Preview ${idx}`}
                    className="w-20 h-20 object-cover rounded-lg border border-slate-200"
                  />
                ))}
              </div>
            )}
          </div>

          {/* エラー表示 */}
          {error && (
            <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          {/* 査定ボタン */}
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg flex justify-center items-center gap-2 text-base"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>プロAIが精査中...</span>
              </>
            ) : (
              'プロ視点で物件をAI査定する'
            )}
          </button>
        </section>

        {/* 査定結果表示エリア */}
        {result && (
          <div className="space-y-6">
            {/* スコア・概要カード */}
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 pb-6 border-b border-slate-100">
                <div>
                  <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                    総合評価
                  </span>
                  <h3 className="text-xl font-bold mt-2">査定結果サマリー</h3>
                </div>
                <div className="flex items-baseline gap-1 bg-slate-900 text-white px-6 py-3 rounded-2xl">
                  <span className="text-xs text-slate-400">SCORE</span>
                  <span className="text-4xl font-extrabold text-emerald-400">{result.score}</span>
                  <span className="text-sm text-slate-400">/100</span>
                </div>
              </div>
              <p className="text-slate-700 leading-relaxed text-sm">{result.summary}</p>
            </section>

            {/* Pros / Cons 2列レイアウト */}
            <div className="grid md:grid-cols-2 gap-6">
              <section className="bg-emerald-50/50 border border-emerald-200/80 p-5 rounded-2xl">
                <h3 className="font-bold text-emerald-900 mb-3 flex items-center gap-2">
                  <span className="text-emerald-600">✓</span> おすすめポイント
                </h3>
                <ul className="space-y-2 text-sm text-emerald-950">
                  {result.pros.map((pro, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">•</span>
                      <span>{pro}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="bg-rose-50/50 border border-rose-200/80 p-5 rounded-2xl">
                <h3 className="font-bold text-rose-900 mb-3 flex items-center gap-2">
                  <span className="text-rose-600">⚠️</span> 懸念点・リスク
                </h3>
                <ul className="space-y-2 text-sm text-rose-950">
                  {result.cons.map((con, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-rose-500 font-bold">•</span>
                      <span>{con}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            {/* 詳細分析 */}
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
              <h3 className="font-bold text-base border-b pb-3">プロの目線・カテゴリ別分析</h3>
              <div className="space-y-4 text-sm">
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">💰 価格・コストの適正感</h4>
                  <p className="text-slate-600 bg-slate-50 p-3 rounded-lg">{result.details.priceEvaluation}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">📍 立地・周辺環境・治安</h4>
                  <p className="text-slate-600 bg-slate-50 p-3 rounded-lg">{result.details.locationEvaluation}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">📐 間取り・住み心地・建物構造</h4>
                  <p className="text-slate-600 bg-slate-50 p-3 rounded-lg">{result.details.layoutEvaluation}</p>
                </div>
              </div>
            </section>

            {/* 内見チェックリスト */}
            <section className="bg-amber-50/40 border border-amber-200 p-6 rounded-2xl">
              <h3 className="font-bold text-amber-900 mb-3 flex items-center gap-2">
                📋 現地内見時の個別チェックリスト
              </h3>
              <div className="space-y-2 text-sm">
                {result.viewingChecklist.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white p-3 rounded-lg border border-amber-100 shadow-sm">
                    <input type="checkbox" className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500" />
                    <span className="text-slate-800">{item}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
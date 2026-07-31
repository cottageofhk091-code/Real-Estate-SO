"use client";

import { useState } from "react";
import Image from "next/image";

type TargetType = "single" | "family" | "investment";

interface AnalysisResult {
  propertyName: string;
  score: number;
  summary: string;
  pros: string[];
  cons: string[];
  checkpoints: string[];
}

export default function Home() {
  const [targetType, setTargetType] = useState<TargetType>("single");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
        setResult(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedImage) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: selectedImage,
          targetType: targetType,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "解析に失敗しました。");
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || "予期せぬエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 pb-16">
      {/* ヘッダー */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 text-center">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center justify-center gap-2">
            🏢 物件AIアナライザー
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            マイソク・間取り図からAIが最適診断
          </p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
        {/* STEP 1: 目的の選択 */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
          <label className="block text-sm sm:text-base font-bold text-slate-700 mb-3">
            1. 検討目的を選択してください
          </label>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setTargetType("single")}
              className={`py-3 px-2 rounded-xl text-xs sm:text-sm font-bold transition-all border text-center ${
                targetType === "single"
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm scale-[1.02]"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              }`}
            >
              👤 一人暮らし
            </button>
            <button
              type="button"
              onClick={() => setTargetType("family")}
              className={`py-3 px-2 rounded-xl text-xs sm:text-sm font-bold transition-all border text-center ${
                targetType === "family"
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm scale-[1.02]"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              }`}
            >
              👨‍👩‍👧 ファミリー
            </button>
            <button
              type="button"
              onClick={() => setTargetType("investment")}
              className={`py-3 px-2 rounded-xl text-xs sm:text-sm font-bold transition-all border text-center ${
                targetType === "investment"
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm scale-[1.02]"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              }`}
            >
              📈 収益物件用
            </button>
          </div>
        </div>

        {/* STEP 2: 画像アップロード */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
          <label className="block text-sm sm:text-base font-bold text-slate-700 mb-3">
            2. 物件画像（マイソク・図面）を添付
          </label>
          
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            id="file-upload"
            className="hidden"
          />
          
          <label
            htmlFor="file-upload"
            className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 transition-all text-center"
          >
            {selectedImage ? (
              <div className="relative w-full h-48 sm:h-64">
                <Image
                  src={selectedImage}
                  alt="物件プレビュー"
                  fill
                  className="object-contain rounded-lg"
                />
              </div>
            ) : (
              <div className="space-y-2 py-4">
                <div className="text-4xl">📸</div>
                <p className="text-sm sm:text-base font-bold text-slate-700">
                  タップして画像を選択
                </p>
                <p className="text-xs text-slate-400">
                  マイソク・図面・スクリーンショット等
                </p>
              </div>
            )}
          </label>

          {/* 解析実行ボタン */}
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!selectedImage || loading}
            className={`w-full mt-4 py-4 rounded-xl text-base sm:text-lg font-bold transition-all shadow-md active:scale-[0.99] ${
              !selectedImage || loading
                ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {loading ? "🔍 AIが詳しく解析中..." : "🚀 AIで物件を解析する"}
          </button>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200 text-sm font-medium">
            ⚠️ {error}
          </div>
        )}

        {/* STEP 3: 解析結果表示 */}
        {result && (
          <div className="bg-white p-5 sm:p-8 rounded-2xl shadow-md border border-slate-200 space-y-6">
            {/* 物件名 ＆ スコア */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100">
              <div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 inline-block mb-2">
                  {targetType === "single" && "一人暮らし向け評価"}
                  {targetType === "family" && "ファミリー向け評価"}
                  {targetType === "investment" && "収益物件向け評価"}
                </span>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                  {result.propertyName}
                </h2>
              </div>
              <div className="flex items-baseline gap-1 bg-amber-50 px-4 py-2 rounded-2xl border border-amber-200 self-end sm:self-auto">
                <span className="text-xs text-amber-700 font-bold">評価点:</span>
                <span className="text-3xl font-extrabold text-amber-600">
                  {result.score}
                </span>
                <span className="text-xs text-amber-600 font-bold">/ 100</span>
              </div>
            </div>

            {/* サマリー */}
            <div>
              <h3 className="text-sm font-bold text-slate-700 mb-2">📝 概要診断</h3>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-xl">
                {result.summary}
              </p>
            </div>

            {/* メリット */}
            <div>
              <h3 className="text-sm font-bold text-emerald-700 mb-2">✨ おすすめポイント（メリット）</h3>
              <ul className="space-y-2">
                {result.pros.map((pro, index) => (
                  <li
                    key={index}
                    className="text-xs sm:text-sm text-slate-700 bg-emerald-50/60 p-3 rounded-lg border border-emerald-100 flex items-start gap-2"
                  >
                    <span className="text-emerald-500 font-bold">✓</span>
                    {pro}
                  </li>
                ))}
              </ul>
            </div>

            {/* デメリット */}
            <div>
              <h3 className="text-sm font-bold text-rose-700 mb-2">⚠️ 気になる点（デメリット）</h3>
              <ul className="space-y-2">
                {result.cons.map((con, index) => (
                  <li
                    key={index}
                    className="text-xs sm:text-sm text-slate-700 bg-rose-50/60 p-3 rounded-lg border border-rose-100 flex items-start gap-2"
                  >
                    <span className="text-rose-500 font-bold">!</span>
                    {con}
                  </li>
                ))}
              </ul>
            </div>

            {/* 内見時の確認ポイント */}
            <div>
              <h3 className="text-sm font-bold text-blue-700 mb-2">🔍 内見時のチェックポイント</h3>
              <ul className="space-y-2">
                {result.checkpoints.map((point, index) => (
                  <li
                    key={index}
                    className="text-xs sm:text-sm text-slate-700 bg-blue-50/60 p-3 rounded-lg border border-blue-100 flex items-start gap-2"
                  >
                    <span className="text-blue-500 font-bold">・</span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
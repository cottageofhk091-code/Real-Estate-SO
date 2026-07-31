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
    <main className="min-h-screen bg-gray-50 text-gray-800 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* タイトル */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            物件画像 AI解析
          </h1>
          <p className="text-xs sm:text-sm text-gray-500">
            マイソクや間取り図をアップロードしてAI診断
          </p>
        </div>

        {/* 評価目的の切り替え */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
            評価視点を選択
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setTargetType("single")}
              className={`py-2.5 px-2 text-xs sm:text-sm font-medium rounded-lg border transition-all ${
                targetType === "single"
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
              }`}
            >
              一人暮らし
            </button>
            <button
              type="button"
              onClick={() => setTargetType("family")}
              className={`py-2.5 px-2 text-xs sm:text-sm font-medium rounded-lg border transition-all ${
                targetType === "family"
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
              }`}
            >
              ファミリー
            </button>
            <button
              type="button"
              onClick={() => setTargetType("investment")}
              className={`py-2.5 px-2 text-xs sm:text-sm font-medium rounded-lg border transition-all ${
                targetType === "investment"
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
              }`}
            >
              収益物件用
            </button>
          </div>
        </div>

        {/* 画像アップロードエリア */}
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            id="file-upload"
            className="hidden"
          />
          <label
            htmlFor="file-upload"
            className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 transition-all text-center min-h-[160px]"
          >
            {selectedImage ? (
              <div className="relative w-full h-48 sm:h-56">
                <Image
                  src={selectedImage}
                  alt="物件プレビュー"
                  fill
                  className="object-contain rounded"
                />
              </div>
            ) : (
              <div className="space-y-1 text-gray-500">
                <div className="text-3xl mb-1">📁</div>
                <p className="text-sm font-semibold">タップして画像を選択</p>
                <p className="text-xs text-gray-400">マイソク・間取り図・写真など</p>
              </div>
            )}
          </label>

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!selectedImage || loading}
            className={`w-full py-3.5 px-4 rounded-lg text-sm sm:text-base font-bold transition-all shadow ${
              !selectedImage || loading
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98]"
            }`}
          >
            {loading ? "解析中..." : "物件を解析する"}
          </button>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="p-4 bg-red-50 text-red-600 text-sm rounded-lg border border-red-200">
            {error}
          </div>
        )}

        {/* 解析結果表示 */}
        {result && (
          <div className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-gray-200 space-y-5">
            <div className="flex justify-between items-start border-b pb-4">
              <div>
                <span className="text-xs text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded">
                  {targetType === "single" && "一人暮らし向け"}
                  {targetType === "family" && "ファミリー向け"}
                  {targetType === "investment" && "収益物件用"}
                </span>
                <h2 className="text-lg font-bold text-gray-900 mt-1">
                  {result.propertyName}
                </h2>
              </div>
              <div className="text-right">
                <span className="text-xs text-gray-500 block">総合スコア</span>
                <span className="text-2xl font-bold text-blue-600">
                  {result.score}<span className="text-xs text-gray-400"> / 100</span>
                </span>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-gray-500 mb-1">概要診断</h3>
              <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 p-3 rounded-lg">
                {result.summary}
              </p>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-green-700 mb-2">長所・メリット</h3>
              <ul className="space-y-1.5">
                {result.pros.map((pro, idx) => (
                  <li key={idx} className="text-xs sm:text-sm text-gray-700 flex items-start gap-1.5 bg-green-50/50 p-2 rounded">
                    <span className="text-green-600 font-bold">✓</span>
                    {pro}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-red-700 mb-2">短所・注意点</h3>
              <ul className="space-y-1.5">
                {result.cons.map((con, idx) => (
                  <li key={idx} className="text-xs sm:text-sm text-gray-700 flex items-start gap-1.5 bg-red-50/50 p-2 rounded">
                    <span className="text-red-500 font-bold">▲</span>
                    {con}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-blue-700 mb-2">内見時のチェックポイント</h3>
              <ul className="space-y-1.5">
                {result.checkpoints.map((pt, idx) => (
                  <li key={idx} className="text-xs sm:text-sm text-gray-700 flex items-start gap-1.5 bg-blue-50/50 p-2 rounded">
                    <span className="text-blue-500 font-bold">・</span>
                    {pt}
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
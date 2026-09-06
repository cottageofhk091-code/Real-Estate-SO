'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  
  const [inputText, setInputText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [propertyType, setPropertyType] = useState('戸建て');
  const [householdType, setHouseholdType] = useState('単身');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleAnalyze = async () => {
    if (!inputText.trim() && images.length === 0) {
      setError('テキストまたは画像を入力してください。');
      return;
    }

    setLoading(true);
    setError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          text: inputText,
          images,
          propertyType,
          householdType,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '分析中にエラーが発生しました。');
      }

      if (data) {
        setResult(data);
        setLoading(false);

        // 生成・診断完了時に /success へ遷移
        router.push('/success');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('分析がキャンセルされました。');
      } else {
        setError(err.message || '予期せぬエラーが発生しました。');
      }
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return (
    <main className="container mx-auto p-4 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6 text-center">診断・分析フォーム</h1>

      <div className="space-y-4 bg-white p-6 rounded-lg shadow">
        <div>
          <label className="block text-sm font-medium mb-1">住宅形態</label>
          <select
            value={propertyType}
            onChange={(e) => setPropertyType(e.target.value)}
            className="w-full border rounded p-2"
          >
            <option value="戸建て">戸建て</option>
            <option value="マンション">マンション</option>
            <option value="アパート">アパート</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">世帯人数</label>
          <select
            value={householdType}
            onChange={(e) => setHouseholdType(e.target.value)}
            className="w-full border rounded p-2"
          >
            <option value="単身">単身</option>
            <option value="2人家族">2人家族</option>
            <option value="ファミリー">ファミリー</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">相談・分析内容</label>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            rows={4}
            className="w-full border rounded p-2"
            placeholder="内容を入力してください..."
          />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex gap-2">
          {!loading ? (
            <button
              onClick={handleAnalyze}
              className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
            >
              分析を開始する
            </button>
          ) : (
            <button
              onClick={handleCancel}
              className="w-full bg-gray-500 text-white py-2 rounded hover:bg-gray-600 transition"
            >
              処理を中断する
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
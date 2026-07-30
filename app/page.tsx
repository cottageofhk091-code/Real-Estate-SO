"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import PremiumModal from "./components/PremiumModal";
import SiteInfoModal, { SiteInfoType } from "./components/SiteInfoModal";

type Severity = "high" | "medium" | "low";

type Merit = {
  title: string;
  description: string;
};

type Demerit = {
  title: string;
  description: string;
  severity: Severity;
};

type ChecklistItem = {
  category: string;
  item: string;
};

type ImageInsight = {
  category: string;
  finding: string;
  implication: string;
};

type UploadedImage = {
  id: string;
  name: string;
  mimeType: string;
  data: string;
  previewUrl: string;
};

type AnalyzeResult = {
  score: number;
  scoreLabel: string;
  summary: string;
  merits: Merit[];
  demerits: Demerit[];
  advice: string;
  imageInsights: ImageInsight[];
  checklist: ChecklistItem[];
};

const LOADING_MESSAGES = [
  "物件データを査定中...",
  "プロの視点で評価中...",
  "周辺条件と設備を照合中...",
  "隠れたリスクを洗い出し中...",
  "内見チェックリストを作成中...",
];

const MIN_TEXT_LENGTH = 10;
const MAX_TEXT_LENGTH = 5000;
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const FRIENDLY_ERROR =
  "ただいまアクセスが集中しているか、一時的に通信が不安定になっています。恐れ入りますが、数十秒ほど時間を置いて再度お試しください。";

function validateAnalyzeInput(
  text: string,
  imageCount: number,
): string | null {
  const trimmed = text.trim();

  if (!trimmed && imageCount === 0) {
    return "物件テキスト、または間取り図・外観写真を入力してください。";
  }

  if (trimmed && trimmed.length < MIN_TEXT_LENGTH && imageCount === 0) {
    return "物件情報を10文字以上入力してください。";
  }

  if (trimmed.length > MAX_TEXT_LENGTH) {
    return "物件情報は5,000文字以内で入力してください。";
  }

  return null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("画像の読み込みに失敗しました。"));
    };
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました。"));
    reader.readAsDataURL(file);
  });
}

function extractBase64(dataUrl: string): string {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/i);
  return match ? match[1] : dataUrl;
}

function toFriendlyErrorMessage(err: unknown): string {
  if (err instanceof Error && err.name === "AbortError") {
    return FRIENDLY_ERROR;
  }

  const message = err instanceof Error ? err.message : "";

  // バリデーション系はそのまま表示
  if (
    message.includes("10文字以上") ||
    message.includes("5,000文字") ||
    message.includes("入力してください") ||
    message.includes("画像") ||
    message.includes("枚まで")
  ) {
    return message;
  }

  // API が返した日本語メッセージのうち、ユーザー向けの短い警告はそのまま
  if (
    message.includes("物件情報") ||
    message.includes("物件テキスト") ||
    message.includes("入力内容を確認") ||
    message.includes("アクセスが集中")
  ) {
    return message;
  }

  return FRIENDLY_ERROR;
}

const HOW_TO_STEPS = [
  {
    step: "01",
    title: "物件情報を入力",
    body: "物件概要テキストを貼るか、間取り図・外観写真をアップロード。",
    icon: "📋",
    iconLabel: "コピー＆ペースト",
    badgeClass: "bg-gradient-to-r from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-500/25",
    cardClass:
      "border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-white hover:-translate-y-1 hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-200/50",
    iconWrapClass: "bg-indigo-100 text-indigo-700 ring-indigo-200",
  },
  {
    step: "02",
    title: "プロ視点でAI解析",
    body: "家賃・立地・設備・周辺リスクを、経験豊富な査定目線で照合します。",
    icon: "⚡",
    iconLabel: "AI解析",
    badgeClass: "bg-gradient-to-r from-violet-600 to-indigo-500 text-white shadow-md shadow-violet-500/25",
    cardClass:
      "border-violet-100 bg-gradient-to-br from-violet-50/80 via-white to-white hover:-translate-y-1 hover:border-violet-300 hover:shadow-lg hover:shadow-violet-200/50",
    iconWrapClass: "bg-violet-100 text-violet-700 ring-violet-200",
  },
  {
    step: "03",
    title: "結果で判断する",
    body: "スコア・メリット・デメリット・内見チェックで次の一手が明確に。",
    icon: "📊",
    iconLabel: "結果確認",
    badgeClass: "bg-gradient-to-r from-sky-500 to-cyan-400 text-white shadow-md shadow-sky-500/25",
    cardClass:
      "border-sky-100 bg-gradient-to-br from-sky-50/80 via-white to-white hover:-translate-y-1 hover:border-sky-300 hover:shadow-lg hover:shadow-sky-200/50",
    iconWrapClass: "bg-sky-100 text-sky-700 ring-sky-200",
  },
];

const PREMIUM_FEATURES = [
  {
    title: "将来の資産価値推移グラフ",
    body: "築年・立地・周辺再開発を踏まえた価値シミュレーションを可視化。",
  },
  {
    title: "ハザードマップ災害リスク評価",
    body: "洪水・土砂・地震など、地図データ連動の災害リスクを自動判定。",
  },
  {
    title: "周辺相場と比較した適正価格判定",
    body: "近隣成約データから、今の家賃が割安か割高かを定量評価。",
  },
];

const SEVERITY_LABEL: Record<Severity, string> = {
  high: "重要度 高",
  medium: "重要度 中",
  low: "重要度 低",
};

const SEVERITY_CARD: Record<Severity, string> = {
  high: "border-red-200/80 bg-gradient-to-br from-red-50 to-white",
  medium: "border-orange-200/80 bg-gradient-to-br from-orange-50 to-white",
  low: "border-amber-200/80 bg-gradient-to-br from-amber-50 to-white",
};

const SEVERITY_BADGE: Record<Severity, string> = {
  high: "bg-red-600 text-white",
  medium: "bg-orange-500 text-white",
  low: "bg-amber-500 text-white",
};

function normalizeSeverity(value: unknown): Severity {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

function parseJsonSafely(raw: string): unknown {
  let text = raw.trim();
  text = text.replace(/^```(?:json|JSON)?\s*/i, "");
  text = text.replace(/\s*```$/i, "");
  text = text.replace(/```(?:json|JSON)?\s*/gi, "");
  text = text.replace(/```/g, "");
  text = text.trim();

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }

  return JSON.parse(text);
}

function scoreTone(score: number): {
  ring: string;
  text: string;
  badge: string;
  label: string;
} {
  if (score >= 75) {
    return {
      ring: "stroke-emerald-500",
      text: "text-emerald-700",
      badge: "bg-emerald-100 text-emerald-800",
      label: "好条件寄り",
    };
  }
  if (score >= 50) {
    return {
      ring: "stroke-indigo-500",
      text: "text-indigo-700",
      badge: "bg-indigo-100 text-indigo-800",
      label: "要確認",
    };
  }
  return {
    ring: "stroke-rose-500",
    text: "text-rose-700",
    badge: "bg-rose-100 text-rose-800",
    label: "慎重に検討",
  };
}

function ScoreGauge({ score }: { score: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  const tone = scoreTone(score);

  return (
    <div className="relative mx-auto flex size-36 items-center justify-center">
      <svg className="size-36 -rotate-90" viewBox="0 0 128 128" aria-hidden>
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          className="text-slate-200"
        />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`${tone.ring} transition-all duration-700 ease-out`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-bold tracking-tight ${tone.text}`}>
          {score}
        </span>
        <span className="text-xs font-medium text-slate-500">/ 100</span>
      </div>
    </div>
  );
}

function PremiumSection({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="mt-14 rounded-3xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-xl sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold tracking-wide text-indigo-100 ring-1 ring-white/15 transition hover:bg-white/15"
          >
            🔒 プレミアム機能（Coming Soon）
          </button>
          <p className="text-sm text-slate-300">
            有料プランで解放予定の、さらに深い査定機能です。
          </p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="rounded-lg bg-white px-3.5 py-2 text-xs font-bold text-slate-950 transition hover:bg-indigo-50 sm:text-sm"
        >
          プラン詳細を見る
        </button>
      </div>

      <h2 className="text-2xl font-bold tracking-tight text-white">
        プロが使う次の一手を、もうすぐ手元に
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
        無料解析の先にある、投資判断・災害リスク・相場比較まで一気通貫で見られるプレミアム機能を準備中です。
      </p>

      <ul className="mt-6 grid gap-3 sm:grid-cols-3">
        {PREMIUM_FEATURES.map((feature) => (
          <li key={feature.title}>
            <button
              type="button"
              onClick={onOpen}
              className="relative h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 text-left backdrop-blur transition hover:border-indigo-300/40 hover:bg-white/10"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(99,102,241,0.18),_transparent_55%)]" />
              <div className="relative">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-lg" aria-hidden>
                    🔒
                  </span>
                  <span className="rounded bg-indigo-400/20 px-2 py-0.5 text-[10px] font-bold tracking-wider text-indigo-200">
                    LOCKED
                  </span>
                </div>
                <p className="font-semibold text-white">{feature.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  {feature.body}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Home() {
  const [propertyText, setPropertyText] = useState("");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState("");
  const [checkedItems, setCheckedItems] = useState<boolean[]>([]);
  const [isPremiumOpen, setIsPremiumOpen] = useState(false);
  const [siteInfoType, setSiteInfoType] = useState<SiteInfoType | null>(null);
  const isAnalyzingRef = useRef(false);
  const analyzeRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imagesRef = useRef(images);
  imagesRef.current = images;

  useEffect(() => {
    if (!isLoading) {
      setLoadingMessageIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 1800);

    return () => window.clearInterval(timer);
  }, [isLoading]);

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((image) =>
        URL.revokeObjectURL(image.previewUrl),
      );
    };
  }, []);

  const handleImagesSelected = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      setError(`画像は最大${MAX_IMAGES}枚までです。`);
      return;
    }

    const selected = files.slice(0, remaining);
    const nextImages: UploadedImage[] = [];
    let localError = "";

    for (const file of selected) {
      const mimeType = file.type.toLowerCase();
      if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
        localError = "JPG / PNG / WebP / GIF 形式の画像を選択してください。";
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        localError = "各画像は4MB以下にしてください。";
        continue;
      }

      try {
        const dataUrl = await readFileAsDataUrl(file);
        nextImages.push({
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          mimeType: mimeType === "image/jpg" ? "image/jpeg" : mimeType,
          data: extractBase64(dataUrl),
          previewUrl: URL.createObjectURL(file),
        });
      } catch {
        localError = "画像の読み込みに失敗しました。";
      }
    }

    if (files.length > remaining) {
      localError = `画像は最大${MAX_IMAGES}枚までです。`;
    }

    if (nextImages.length > 0) {
      setImages((prev) => [...prev, ...nextImages]);
    }
    if (localError) setError(localError);
    else setError("");
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const target = prev.find((image) => image.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((image) => image.id !== id);
    });
  };

  const handleAnalyze = async () => {
    if (isAnalyzingRef.current) return;

    const validationError = validateAnalyzeInput(propertyText, images.length);
    if (validationError) {
      setError(validationError);
      setShowResults(false);
      setResult(null);
      return;
    }

    isAnalyzingRef.current = true;

    setIsLoading(true);
    setShowResults(false);
    setError("");
    setResult(null);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: propertyText,
          images: images.map((image) => ({
            mimeType: image.mimeType,
            data: image.data,
          })),
        }),
        signal: controller.signal,
      });

      let data: {
        error?: string;
        status?: number;
        score?: unknown;
        scoreLabel?: unknown;
        summary?: unknown;
        merits?: unknown;
        demerits?: unknown;
        advice?: unknown;
        imageInsights?: unknown;
        checklist?: unknown;
      } = {};
      try {
        const responseText = await response.text();
        const parsed = parseJsonSafely(responseText);
        data =
          typeof parsed === "object" && parsed !== null
            ? (parsed as typeof data)
            : {};
      } catch {
        throw new Error(FRIENDLY_ERROR);
      }

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string" ? data.error : FRIENDLY_ERROR,
        );
      }

      const demerits: Demerit[] = Array.isArray(data.demerits)
        ? data.demerits.map(
            (item: {
              title?: string;
              description?: string;
              severity?: string;
            }) => ({
              title: item.title ?? "懸念点",
              description: item.description ?? "",
              severity: normalizeSeverity(item.severity),
            }),
          )
        : [];

      const merits: Merit[] = Array.isArray(data.merits)
        ? data.merits.map((item: { title?: string; description?: string }) => ({
            title: item.title ?? "メリット",
            description: item.description ?? "",
          }))
        : [];

      const checklist: ChecklistItem[] = Array.isArray(data.checklist)
        ? data.checklist.map(
            (item: { category?: string; item?: string }) => ({
              category: item.category ?? "その他",
              item: item.item ?? "",
            }),
          )
        : [];

      const imageInsights: ImageInsight[] = Array.isArray(data.imageInsights)
        ? data.imageInsights.map(
            (item: {
              category?: string;
              finding?: string;
              implication?: string;
            }) => ({
              category: item.category ?? "その他",
              finding: item.finding ?? "",
              implication: item.implication ?? "",
            }),
          )
        : [];

      const score =
        typeof data.score === "number"
          ? Math.max(0, Math.min(100, Math.round(data.score)))
          : Math.max(
              20,
              100 -
                demerits.reduce((sum, item) => {
                  if (item.severity === "high") return sum + 18;
                  if (item.severity === "medium") return sum + 10;
                  return sum + 5;
                }, 0),
            );

      setResult({
        score,
        scoreLabel:
          typeof data.scoreLabel === "string" ? data.scoreLabel : "査定完了",
        summary: typeof data.summary === "string" ? data.summary : "",
        merits,
        demerits,
        advice: typeof data.advice === "string" ? data.advice : "",
        imageInsights,
        checklist,
      });
      setCheckedItems(checklist.map(() => false));
      setShowResults(true);
    } catch (err) {
      console.error("Analyze failed:", err);
      setError(toFriendlyErrorMessage(err));
      setShowResults(false);
      setResult(null);
    } finally {
      window.clearTimeout(timeoutId);
      setIsLoading(false);
      isAnalyzingRef.current = false;
    }
  };

  const toggleCheck = (index: number) => {
    setCheckedItems((prev) =>
      prev.map((value, i) => (i === index ? !value : value)),
    );
  };

  const scrollToAnalyze = () => {
    analyzeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const tone = result ? scoreTone(result.score) : null;
  const checkedCount = checkedItems.filter(Boolean).length;

  return (
    <div className="min-h-full bg-[radial-gradient(ellipse_at_top,_#eef2ff_0%,_#f8fafc_42%,_#e2e8f0_100%)]">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-slate-950 text-sm font-bold text-white shadow-sm shadow-indigo-500/20">
              AI
            </span>
            <div>
              <p className="text-sm font-bold tracking-tight text-slate-950 sm:text-base">
                AI物件アナライザー{" "}
                <span className="bg-gradient-to-r from-indigo-600 to-slate-800 bg-clip-text text-transparent">
                  PRO
                </span>
              </p>
              <p className="text-[11px] font-medium tracking-wide text-slate-500">
                Professional Property Intel
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPremiumOpen(true)}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-800 transition hover:bg-indigo-100 sm:text-sm"
            >
              プレミアムプラン
            </button>
            <button
              type="button"
              onClick={scrollToAnalyze}
              className="rounded-lg bg-slate-950 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 sm:text-sm"
            >
              無料で解析する
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <section className="fade-up relative overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-slate-950 px-6 py-10 text-white shadow-xl sm:px-10 sm:py-14">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,_rgba(99,102,241,0.35),_transparent_42%),radial-gradient(circle_at_85%_10%,_rgba(148,163,184,0.2),_transparent_35%)]" />
          <div className="relative max-w-3xl">
            <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-indigo-200 uppercase">
              AI × 不動産プロ査定
            </p>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              物件テキストを貼るだけ。
              <br />
              <span className="bg-gradient-to-r from-white via-indigo-100 to-indigo-300 bg-clip-text text-transparent">
                裏側のリスクと掘り出し度
              </span>
              が分かる。
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-lg">
              不動産屋が言いづらい条件の弱み、見落としがちな周辺リスク、内見で確認すべきポイントをAIがプロ目線で即座に可視化します。
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={scrollToAnalyze}
                className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-indigo-50"
              >
                今すぐ査定を始める
              </button>
              <a
                href="#how-to"
                className="rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                使い方を見る
              </a>
            </div>
          </div>
        </section>

        <section id="how-to" className="mt-10">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-wide text-indigo-700 uppercase">
                How to use
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">
                使い方ガイド（3ステップ）
              </h2>
            </div>
          </div>
          <ol className="grid gap-4 sm:grid-cols-3">
            {HOW_TO_STEPS.map((item, index) => (
              <li
                key={item.step}
                className={`fade-up fade-up-delay-${index + 1} group rounded-2xl border p-5 shadow-sm transition duration-300 ease-out ${item.cardClass}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[11px] font-bold tracking-wider ${item.badgeClass}`}
                  >
                    STEP {item.step}
                  </span>
                  <span
                    className={`inline-flex size-11 items-center justify-center rounded-xl text-xl ring-1 transition duration-300 group-hover:scale-110 ${item.iconWrapClass}`}
                    title={item.iconLabel}
                    aria-label={item.iconLabel}
                  >
                    {item.icon}
                  </span>
                </div>
                <p className="mt-4 text-base font-bold text-slate-900">
                  {item.title}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  {item.body}
                </p>
                <p className="mt-3 text-xs font-semibold tracking-wide text-slate-400">
                  {item.iconLabel}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <div
          ref={analyzeRef}
          className="mt-10 space-y-4 rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-lg shadow-slate-200/60 backdrop-blur sm:p-7"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900 sm:text-xl">
                物件情報を解析
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                物件概要テキストや間取り図・外観写真から、プロ視点の査定を開始します。
              </p>
            </div>
            <span className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-100">
              FREE ANALYZE
            </span>
          </div>

          <label htmlFor="property-text" className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">
              物件テキスト
              <span className="ml-2 font-normal text-slate-400">
                （画像のみでも解析可）
              </span>
            </span>
            <textarea
              id="property-text"
              value={propertyText}
              onChange={(e) => setPropertyText(e.target.value)}
              rows={12}
              disabled={isLoading}
              placeholder={`例）\n家賃 8.5万円 / 管理費 5,000円\n間取り 1LDK / 専有面積 35.2㎡\n築年数 2008年3月 / 駅徒歩12分\nオートロック・独立洗面台・エアコン付…`}
              className="w-full resize-y rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base leading-relaxed text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-50"
            />
          </label>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-700">
                間取り図・外観写真
              </span>
              <span className="text-xs text-slate-400">
                JPG / PNG / WebP · 最大{MAX_IMAGES}枚 · 各4MB以下
              </span>
            </div>

            <input
              ref={fileInputRef}
              id="property-images"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
              multiple
              disabled={isLoading || images.length >= MAX_IMAGES}
              onChange={(e) => {
                void handleImagesSelected(e);
              }}
              className="sr-only"
            />

            <button
              type="button"
              disabled={isLoading || images.length >= MAX_IMAGES}
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-center transition hover:border-indigo-300 hover:bg-indigo-50/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-white text-lg shadow-sm ring-1 ring-slate-200">
                🖼️
              </span>
              <span className="text-sm font-semibold text-slate-800">
                画像をアップロード
              </span>
              <span className="text-xs text-slate-500">
                タップまたはクリックでファイルを選択
              </span>
            </button>

            {images.length > 0 && (
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {images.map((image) => (
                  <li
                    key={image.id}
                    className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.previewUrl}
                      alt={image.name}
                      className="aspect-square w-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 to-transparent px-2 pb-2 pt-6">
                      <p className="truncate text-[11px] font-medium text-white">
                        {image.name}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => removeImage(image.id)}
                      aria-label={`${image.name}を削除`}
                      className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-slate-950/80 text-sm font-bold text-white transition hover:bg-red-600 disabled:opacity-50"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={handleAnalyze}
            onTouchEnd={(e) => {
              e.preventDefault();
              void handleAnalyze();
            }}
            disabled={isLoading}
            className="relative z-10 inline-flex w-full cursor-pointer items-center justify-center rounded-xl bg-slate-950 px-6 py-3.5 text-base font-semibold text-white transition active:scale-95 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-500 disabled:active:scale-100 sm:w-auto"
          >
            {isLoading ? "査定実行中..." : "プロの目線で解析する"}
          </button>
        </div>

        {isLoading && (
          <div
            className="mt-10 overflow-hidden rounded-3xl border border-indigo-100 bg-white p-6 shadow-sm"
            role="status"
            aria-live="polite"
          >
            <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-start sm:text-left">
              <div className="relative flex size-16 shrink-0 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-indigo-200/60" />
                <span className="absolute inset-1 animate-spin rounded-full border-[3px] border-indigo-100 border-t-indigo-700" />
                <span className="relative size-3 rounded-full bg-indigo-700" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold text-slate-900 transition-opacity duration-300">
                  {LOADING_MESSAGES[loadingMessageIndex]}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  家賃・立地・設備・周辺環境をプロ目線で照合しています。通常数十秒かかります。
                </p>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="loading-bar h-full w-1/3 rounded-full bg-gradient-to-r from-slate-900 to-indigo-600" />
                </div>
              </div>
            </div>
          </div>
        )}

        {error && !isLoading && (
          <div
            className={`mt-10 rounded-2xl px-5 py-4 text-sm shadow-sm ${
              error.includes("文字") ||
              error.includes("画像") ||
              error.includes("入力してください")
                ? "border border-amber-200 bg-amber-50 text-amber-900"
                : "border border-red-200 bg-red-50 text-red-800"
            }`}
            role="alert"
          >
            <p className="font-semibold">
              {error.includes("文字") ||
              error.includes("画像") ||
              error.includes("入力してください")
                ? "入力内容をご確認ください"
                : "解析エラー"}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{error}</p>
          </div>
        )}

        {showResults && result && tone && !isLoading && (
          <section className="mt-12 space-y-8">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
                <ScoreGauge score={result.score} />
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <p className="text-sm font-medium tracking-wide text-slate-500">
                    総合査定スコア
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <h2 className="text-2xl font-bold text-slate-900">
                      {result.scoreLabel}
                    </h2>
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-semibold ${tone.badge}`}
                    >
                      {tone.label}
                    </span>
                  </div>
                  {result.summary && (
                    <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
                      {result.summary}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {result.merits.length > 0 && (
              <div>
                <div className="mb-4 flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900">メリット</h2>
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                    {result.merits.length}件
                  </span>
                </div>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {result.merits.map((item, index) => (
                    <li
                      key={`${item.title}-${index}`}
                      className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm"
                    >
                      <p className="font-semibold text-emerald-900">
                        {item.title}
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-emerald-900/80">
                        {item.description}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.imageInsights.length > 0 && (
              <div>
                <div className="mb-4 flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900">
                    画像からの所見
                  </h2>
                  <span className="rounded-md bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
                    {result.imageInsights.length}件
                  </span>
                </div>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {result.imageInsights.map((item, index) => (
                    <li
                      key={`${item.category}-${index}`}
                      className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4 shadow-sm"
                    >
                      <span className="inline-block rounded-md bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
                        {item.category}
                      </span>
                      <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-900">
                        {item.finding}
                      </p>
                      {item.implication && (
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                          {item.implication}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div className="mb-4 flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900">
                  隠れたデメリット
                </h2>
                <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                  {result.demerits.length}件
                </span>
              </div>
              <ul className="space-y-3">
                {result.demerits.map((item, index) => (
                  <li
                    key={`${item.title}-${index}`}
                    className={`rounded-2xl border p-4 shadow-sm ${SEVERITY_CARD[item.severity]}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">
                        {item.title}
                      </p>
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-semibold ${SEVERITY_BADGE[item.severity]}`}
                      >
                        {SEVERITY_LABEL[item.severity]}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-700">
                      {item.description}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            {result.advice && (
              <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm sm:p-6">
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900">
                    プロからのアドバイス
                  </h2>
                  <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
                    ACTION
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-slate-700 sm:text-base">
                  {result.advice}
                </p>
              </div>
            )}

            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900">
                  内見チェックリスト
                </h2>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {checkedCount}/{result.checklist.length} 完了
                </span>
              </div>
              <ul className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                {result.checklist.map((item, index) => (
                  <li key={`${item.category}-${item.item}-${index}`}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-3 transition hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={checkedItems[index] ?? false}
                        onChange={() => toggleCheck(index)}
                        className="mt-1 size-4 shrink-0 accent-indigo-700"
                      />
                      <span
                        className={`text-sm leading-relaxed sm:text-base ${
                          checkedItems[index]
                            ? "text-slate-400 line-through"
                            : "text-slate-700"
                        }`}
                      >
                        <span className="mr-2 inline-block rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs font-semibold text-indigo-700">
                          {item.category}
                        </span>
                        {item.item}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <PremiumSection onOpen={() => setIsPremiumOpen(true)} />
      </main>

      <footer className="border-t border-slate-200 bg-white/80">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-7 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">
                AI物件アナライザー PRO
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                物件テキストをプロ視点で即座に可視化するAI査定ツール
              </p>
            </div>
            <nav
              aria-label="フッターナビゲーション"
              className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-slate-600"
            >
              <button
                type="button"
                onClick={() => setSiteInfoType("terms")}
                className="underline-offset-2 transition hover:text-indigo-700 hover:underline"
              >
                免責事項・利用規約
              </button>
              <button
                type="button"
                onClick={() => setSiteInfoType("privacy")}
                className="underline-offset-2 transition hover:text-indigo-700 hover:underline"
              >
                プライバシーポリシー
              </button>
              <button
                type="button"
                onClick={() => setSiteInfoType("contact")}
                className="underline-offset-2 transition hover:text-indigo-700 hover:underline"
              >
                お問い合わせ・ご意見
              </button>
            </nav>
          </div>
          <p className="text-[11px] text-slate-400">
            © {new Date().getFullYear()} AI物件アナライザー PRO
          </p>
        </div>
      </footer>

      <PremiumModal
        open={isPremiumOpen}
        onClose={() => setIsPremiumOpen(false)}
      />
      <SiteInfoModal
        type={siteInfoType}
        onClose={() => setSiteInfoType(null)}
      />
    </div>
  );
}

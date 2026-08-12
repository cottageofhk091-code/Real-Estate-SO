"use client";

import { FormEvent, useEffect, useId, useState } from "react";
import { PRICE_MONTHLY_YEN } from "@/lib/pricing";

const FEATURED_BENEFIT = {
  icon: "💬",
  title: "解析した物件へのAIプロ個別チャット相談",
  body: "内見のコツ、周辺環境の見極め、家賃交渉の切り口まで。解析結果をもとに、何度でも深く質問できる専属チャットです。",
  badge: "最注目特典",
};

const PREMIUM_BENEFITS = [
  "ハザードマップ詳細分析",
  "将来の資産価値グラフ",
  "プロによるセカンドオピニオン",
  "周辺相場との適正価格判定",
  "内見前リスクレポートのPDF出力",
];

type PremiumModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function PremiumModal({ open, onClose }: PremiumModalProps) {
  const titleId = useId();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [plan, setPlan] = useState<"monthly" | "yearly">("yearly");

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setSubmitted(false);
      setEmail("");
      setPlan("yearly");
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) return;
    setSubmitted(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        aria-label="モーダルを閉じる"
        onClick={onClose}
      />

      <div className="relative z-10 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-2xl sm:p-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 rounded-lg bg-white/10 px-2.5 py-1 text-sm text-slate-200 transition hover:bg-white/20"
          aria-label="閉じる"
        >
          ✕
        </button>

        <div className="pr-8">
          <p className="text-xs font-semibold tracking-[0.2em] text-indigo-200 uppercase">
            Premium Plan
          </p>
          <h2 id={titleId} className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
            AI物件アナライザー{" "}
            <span className="bg-gradient-to-r from-indigo-200 to-white bg-clip-text text-transparent">
              PRO
            </span>
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            無料解析のその先へ。この物件について、AIプロに何度でも深く相談できます。
          </p>
        </div>

        {!submitted ? (
          <>
            <div className="relative mt-6 overflow-hidden rounded-2xl border border-indigo-300/40 bg-gradient-to-br from-indigo-500/25 via-slate-900/40 to-white/5 p-4 shadow-[0_0_40px_rgba(99,102,241,0.18)] sm:p-5">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(165,180,252,0.28),_transparent_55%)]" />
              <div className="relative">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-amber-300 px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-slate-950">
                    {FEATURED_BENEFIT.badge}
                  </span>
                  <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-indigo-100 ring-1 ring-white/15">
                    PRO ONLY
                  </span>
                </div>
                <div className="mt-3 flex items-start gap-3">
                  <span
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-2xl ring-1 ring-white/20"
                    aria-hidden
                  >
                    {FEATURED_BENEFIT.icon}
                  </span>
                  <div>
                    <p className="text-base font-bold leading-snug text-white sm:text-lg">
                      {FEATURED_BENEFIT.title}
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-indigo-50/90">
                      {FEATURED_BENEFIT.body}
                    </p>
                    <p className="mt-2 text-xs font-medium text-indigo-200">
                      有料版なら、解析した物件についてさらに深く相談できます。
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <ul className="mt-4 space-y-2.5">
              {PREMIUM_BENEFITS.map((benefit) => (
                <li
                  key={benefit}
                  className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm"
                >
                  <span className="mt-0.5 text-indigo-300" aria-hidden>
                    ✓
                  </span>
                  <span className="text-slate-100">{benefit}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPlan("monthly")}
                className={`rounded-2xl border p-4 text-left transition ${
                  plan === "monthly"
                    ? "border-indigo-300 bg-indigo-500/20 ring-1 ring-indigo-300/50"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <p className="text-xs font-medium text-slate-300">月額プラン</p>
                <p className="mt-1 text-xl font-bold">
                  ¥{PRICE_MONTHLY_YEN.toLocaleString("ja-JP")}
                  <span className="ml-1 text-xs font-medium text-slate-400">
                    /月
                  </span>
                </p>
              </button>
              <button
                type="button"
                onClick={() => setPlan("yearly")}
                className={`relative rounded-2xl border p-4 text-left transition ${
                  plan === "yearly"
                    ? "border-indigo-300 bg-indigo-500/20 ring-1 ring-indigo-300/50"
                    : "border-white/10 bg-white/5 hover:bg-white/10"
                }`}
              >
                <span className="absolute -top-2 right-3 rounded bg-indigo-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">
                  お得
                </span>
                <p className="text-xs font-medium text-slate-300">年額プラン</p>
                <p className="mt-1 text-xl font-bold">
                  ¥9,800
                  <span className="ml-1 text-xs font-medium text-slate-400">
                    /年
                  </span>
                </p>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-3">
              <label htmlFor="premium-email" className="block">
                <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-300">
                  メールアドレス
                </span>
                <input
                  id="premium-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-400/30"
                />
              </label>
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-indigo-50"
              >
                先行体験に応募する / 近日公開通知を受け取る
              </button>
              <p className="text-center text-[11px] leading-relaxed text-slate-400">
                選択中: {plan === "yearly" ? "年額 9,800円" : `月額 ${PRICE_MONTHLY_YEN.toLocaleString("ja-JP")}円`}
                （税込・予定価格）。登録はいつでも解除できます。
              </p>
            </form>
          </>
        ) : (
          <div className="mt-8 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-8 text-center">
            <p className="text-3xl" aria-hidden>
              ✨
            </p>
            <p className="mt-3 text-lg font-bold text-white">
              ご登録ありがとうございます！
            </p>
            <p className="mt-2 text-sm leading-relaxed text-emerald-100">
              準備ができ次第ご案内いたします。
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 inline-flex rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-indigo-50"
            >
              閉じる
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

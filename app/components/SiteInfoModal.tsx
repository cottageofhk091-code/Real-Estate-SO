"use client";

import { FormEvent, useEffect, useId, useState } from "react";

export type SiteInfoType = "terms" | "privacy" | "contact";

type SiteInfoModalProps = {
  type: SiteInfoType | null;
  onClose: () => void;
};

const CONTENT: Record<
  Exclude<SiteInfoType, "contact">,
  { title: string; body: string }
> = {
  terms: {
    title: "免責事項・利用規約",
    body: "当サービス『AI物件アナライザー』が提供する解析結果は、AI技術による推定・参考情報であり、不動産鑑定や法律・建築上の保証を行うものではありません。最終的な契約・購入判断はご自身の責任で行ってください。当サービスを利用したことによる損害等について、運営者は一切の責任を負いません。",
  },
  privacy: {
    title: "プライバシーポリシー",
    body: "当サービスでは、サービス向上および解析実行のために入力データやアクセス情報を利用する場合があります。取得した個人情報は法令に基づき適切に管理し、第三者への無断提供は行いません。",
  },
};

export default function SiteInfoModal({ type, onClose }: SiteInfoModalProps) {
  const titleId = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!type) return;

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
  }, [type, onClose]);

  useEffect(() => {
    if (!type) {
      setName("");
      setEmail("");
      setMessage("");
      setSubmitted(false);
    }
  }, [type]);

  if (!type) return null;

  const handleContactSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !message.trim()) return;
    setSubmitted(true);
  };

  const title =
    type === "contact" ? "お問い合わせ・ご意見" : CONTENT[type].title;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
        aria-label="モーダルを閉じる"
        onClick={onClose}
      />

      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 rounded-lg bg-slate-100 px-2.5 py-1 text-sm text-slate-600 transition hover:bg-slate-200"
          aria-label="閉じる"
        >
          ✕
        </button>

        <p className="text-xs font-semibold tracking-[0.18em] text-indigo-600 uppercase">
          AI物件アナライザー
        </p>
        <h2
          id={titleId}
          className="mt-2 pr-8 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl"
        >
          {title}
        </h2>

        {type !== "contact" && (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <p className="text-sm leading-relaxed text-slate-700 sm:text-base">
              {CONTENT[type].body}
            </p>
          </div>
        )}

        {type === "contact" && !submitted && (
          <>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">
              サービスへのご要望、バグ報告、お問い合わせは下記フォームよりお寄せください。
            </p>
            <form onSubmit={handleContactSubmit} className="mt-5 space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  お名前（任意）
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="山田 太郎"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  メールアドレス
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  ご意見・お問い合わせ内容
                </span>
                <textarea
                  required
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="ご要望や不具合の詳細をご記入ください"
                  className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700"
              >
                送信する
              </button>
              <p className="text-center text-[11px] text-slate-500">
                または{" "}
                <a
                  href="mailto:support@ai-property-analyzer.example"
                  className="font-medium text-indigo-700 underline-offset-2 hover:underline"
                >
                  support@ai-property-analyzer.example
                </a>{" "}
                まで直接ご連絡ください。
              </p>
            </form>
          </>
        )}

        {type === "contact" && submitted && (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-7 text-center">
            <p className="text-lg font-bold text-emerald-900">
              送信ありがとうございました
            </p>
            <p className="mt-2 text-sm leading-relaxed text-emerald-800">
              内容を確認のうえ、必要に応じてご連絡いたします。
            </p>
          </div>
        )}

        {type !== "contact" && (
          <button
            type="button"
            onClick={onClose}
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700"
          >
            閉じる
          </button>
        )}

        {type === "contact" && submitted && (
          <button
            type="button"
            onClick={onClose}
            className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700"
          >
            閉じる
          </button>
        )}
      </div>
    </div>
  );
}

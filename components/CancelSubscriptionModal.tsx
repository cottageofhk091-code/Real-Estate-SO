'use client';

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';

export const CANCEL_REASONS = [
  '料金が高い',
  '使う頻度が減った',
  '必要な機能が足りない',
  '一時的に利用を休止したい',
  'その他',
] as const;

export type CancelReason = (typeof CANCEL_REASONS)[number];

type Props = {
  open: boolean;
  onClose: () => void;
  userId: string;
  stripeCustomerId?: string | null;
  email?: string | null;
  defaultName?: string | null;
};

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 120,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
  background: 'rgba(15, 23, 42, 0.55)',
};

const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: '480px',
  maxHeight: '90vh',
  overflow: 'auto',
  background: '#ffffff',
  borderRadius: '16px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
  padding: '22px',
};

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 700,
  color: '#64748b',
  marginBottom: '6px',
};

const fieldStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: '10px',
  border: '1px solid #cbd5e1',
  padding: '10px 12px',
  fontSize: '14px',
  color: '#0f172a',
  background: '#fff',
};

export function CancelSubscriptionModal({
  open,
  onClose,
  userId,
  stripeCustomerId,
  email,
  defaultName,
}: Props) {
  const [reason, setReason] = useState<CancelReason>(CANCEL_REASONS[0]);
  const [detail, setDetail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason(CANCEL_REASONS[0]);
    setDetail('');
    setError(null);
    setLoading(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, loading]);

  if (!open) return null;

  const openPortal = async () => {
    const res = await fetch('/api/create-portal-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        stripeCustomerId: stripeCustomerId || undefined,
      }),
    });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      throw new Error(data.error || 'Stripe契約管理ページを開けませんでした。');
    }
    window.location.href = data.url;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const message = [
      '【月額PRO 解約前アンケート】',
      `解約理由: ${reason}`,
      detail.trim() ? `詳細:\n${detail.trim()}` : '',
      `userId: ${userId}`,
    ]
      .filter(Boolean)
      .join('\n');

    // アンケート送信はベストエフォート（失敗しても Portal へ進む）
    try {
      await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: defaultName?.trim() || '（未入力）',
          email: email?.trim() || 'noreply@example.com',
          type: '解約・契約について',
          message,
        }),
      });
    } catch {
      // ignore
    }

    try {
      await openPortal();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '契約管理ページの表示に失敗しました。');
      setLoading(false);
    }
  };

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="cancel-survey-title">
      <button
        type="button"
        aria-label="背景をタップして閉じる"
        onClick={() => {
          if (!loading) onClose();
        }}
        style={{ position: 'absolute', inset: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
      />
      <div style={{ ...cardStyle, position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
          <div>
            <h2 id="cancel-survey-title" style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>
              解約前アンケート
            </h2>
            <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
              解約理由を選んだあと、Stripeの契約管理ページで解約・カード変更・請求確認ができます。
            </p>
          </div>
          <button
            type="button"
            aria-label="閉じる"
            disabled={loading}
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '999px',
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              color: '#64748b',
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>
              解約理由 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              value={reason}
              disabled={loading}
              onChange={(e) => setReason(e.target.value as CancelReason)}
              style={fieldStyle}
              required
            >
              {CANCEL_REASONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>詳細（任意）</label>
            <textarea
              value={detail}
              disabled={loading}
              onChange={(e) => setDetail(e.target.value)}
              rows={3}
              placeholder="差し支えなければ詳細をご記入ください"
              style={{ ...fieldStyle, resize: 'vertical' }}
            />
          </div>

          {error && (
            <p style={{ margin: 0, fontSize: '13px', color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 16px',
              fontWeight: 800,
              fontSize: '14px',
              color: '#fff',
              background: loading ? '#94a3b8' : 'linear-gradient(to right, #4f46e5, #2563eb)',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Stripeへ移動中...' : '回答して契約管理ページへ進む'}
          </button>

          <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', lineHeight: 1.6 }}>
            ※実際の解約・カード変更は次の Stripe カスタマーポータル上で完了します。
          </p>
        </form>
      </div>
    </div>
  );
}

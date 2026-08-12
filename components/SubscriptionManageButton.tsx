'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { CancelSubscriptionModal } from '@/components/CancelSubscriptionModal';

type Mode = 'manage' | 'join';
type Variant = 'default' | 'compact';

type Props = {
  mode: Mode;
  userId: string;
  stripeCustomerId?: string | null;
  email?: string | null;
  defaultName?: string | null;
  /** join 時の遷移先（未指定時は /?openPaywall=1&plan=pro） */
  onJoin?: () => void;
  variant?: Variant;
  className?: string;
  /** 追加の注記を差し替えたい場合 */
  note?: ReactNode;
};

const noteStyle: CSSProperties = {
  margin: '8px 0 0 0',
  fontSize: '11px',
  color: '#64748b',
  lineHeight: 1.6,
};

export function SubscriptionManageButton({
  mode,
  userId,
  stripeCustomerId,
  email,
  defaultName,
  onJoin,
  variant = 'default',
  note,
}: Props) {
  const [surveyOpen, setSurveyOpen] = useState(false);

  const manageButtonStyle: CSSProperties =
    variant === 'compact'
      ? {
          fontSize: '12px',
          fontWeight: 700,
          color: '#b91c1c',
          background: '#fff',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          padding: '6px 10px',
          cursor: 'pointer',
        }
      : {
          width: '100%',
          boxSizing: 'border-box',
          background: '#fff',
          color: '#b91c1c',
          border: '1px solid #fecaca',
          borderRadius: '10px',
          padding: '12px 16px',
          fontWeight: 800,
          cursor: 'pointer',
          fontSize: '13px',
          textAlign: 'center',
        };

  const joinButtonStyle: CSSProperties = {
    width: variant === 'compact' ? 'auto' : '100%',
    boxSizing: 'border-box',
    background: 'linear-gradient(to right, #4f46e5, #2563eb)',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    padding: variant === 'compact' ? '8px 12px' : '12px 16px',
    fontWeight: 800,
    cursor: 'pointer',
    fontSize: '13px',
    textAlign: 'center',
  };

  if (mode === 'join') {
    return (
      <div>
        <button
          type="button"
          onClick={() => {
            if (onJoin) {
              onJoin();
              return;
            }
            window.location.href = '/?openPaywall=1&plan=pro';
          }}
          style={joinButtonStyle}
        >
          月額PROプランに登録する
        </button>
        {note !== undefined ? (
          note
        ) : (
          <p style={noteStyle}>※未加入のため契約管理ポータルは利用できません。決済画面へ進みます。</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <button type="button" onClick={() => setSurveyOpen(true)} style={manageButtonStyle}>
        {variant === 'compact' ? '解約・契約管理を開く' : '⚙️ 解約・サブスク管理'}
      </button>
      {note !== undefined ? (
        note
      ) : (
        <p style={noteStyle}>
          ※解約理由の簡単なアンケートのあと、Stripeカスタマーポータルで解約・カード変更・請求履歴の確認ができます。
        </p>
      )}

      <CancelSubscriptionModal
        open={surveyOpen}
        onClose={() => setSurveyOpen(false)}
        userId={userId}
        stripeCustomerId={stripeCustomerId}
        email={email}
        defaultName={defaultName}
      />
    </div>
  );
}

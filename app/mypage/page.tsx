'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SubscriptionManageButton } from '@/components/SubscriptionManageButton';
import {
  type AppUser,
  VIEW_HISTORY_QUERY,
  VIEW_PURCHASED_QUERY,
  clearClientSessionCaches,
  ensureDevDummyPurchases,
  loginAsAccountUser,
  logoutToGuestUser,
  mergeServerEntitlements,
  readUserState,
  writeUserState,
} from '@/lib/plan';
import {
  ANALYSIS_HISTORY_LIMIT_MONTHLY,
  ANALYSIS_HISTORY_LIMIT_SINGLE,
  ANALYSIS_HISTORY_SAVE_NOTE,
} from '@/lib/analysis-history';
import { PRICE_SINGLE_YEN, formatYen } from '@/lib/pricing';

const COLORS = {
  pageBg: '#f8fafc',
  pageBgDeep: '#f1f5f9',
  card: '#ffffff',
  cardAlt: '#f8fafc',
  border: '#e2e8f0',
  text: '#0f172a',
  textMuted: '#475569',
  textDim: '#64748b',
  accent: '#2563eb',
  accentStrong: '#4f46e5',
  cardShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
};

const IS_DEV = process.env.NODE_ENV === 'development';

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function MyPage() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let next = readUserState();
    if (IS_DEV) {
      next = ensureDevDummyPurchases(next);
    }
    setUser(next);

    const requestedUserId = next.userId;

    void (async () => {
      try {
        const res = await fetch(
          `/api/entitlements?userId=${encodeURIComponent(requestedUserId)}`,
          { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }
        );
        if (!res.ok) return;
        const ent = await res.json();
        if (ent.userId && ent.userId !== requestedUserId) {
          console.warn('[mypage] entitlements userId mismatch; ignored', {
            requestedUserId,
            remoteUserId: ent.userId,
          });
          return;
        }
        const latest = readUserState();
        if (latest.userId !== requestedUserId) return;

        if (!ent.found) {
          setUser(latest);
          return;
        }
        const merged = mergeServerEntitlements(latest, ent);
        writeUserState(merged);
        setUser(merged);
      } catch {
        // ignore
      }
    })();
  }, []);

  const persist = (next: AppUser) => {
    writeUserState(next);
    setUser(next);
  };

  const handleStartMonthly = () => {
    // 決済前登録はホームのPaywallフローへ誘導
    window.location.href = '/?openPaywall=1&plan=pro';
  };

  const handleLogout = () => {
    if (!user) return;
    const next = logoutToGuestUser(user);
    persist(next);
    clearClientSessionCaches();
    setMessage('ログアウトしました。分析履歴・購入データはアカウントごとに分離して保存されます。');
  };

  const applyDevLoginState = (loggedIn: boolean) => {
    if (!user) return;
    if (loggedIn) {
      const email = user.email || `dev_${user.userId.slice(-6)}@example.com`;
      const next = loginAsAccountUser({
        email,
        provider: user.authProvider || 'email',
        previous: user,
      });
      persist(next);
      setMessage('DEV: ログイン状態に切り替えました。');
      return;
    }
    handleLogout();
  };

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: COLORS.pageBgDeep, padding: '40px 20px', color: COLORS.text }}>
        読み込み中...
      </div>
    );
  }

  if (!user.isLoggedIn) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: `linear-gradient(180deg, ${COLORS.pageBg} 0%, ${COLORS.pageBgDeep} 100%)`,
          color: COLORS.text,
          fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        <header
          style={{
            backgroundColor: 'rgba(255,255,255,0.92)',
            borderBottom: `1px solid ${COLORS.border}`,
            padding: '16px 24px',
          }}
        >
          <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '22px' }}>🏠</span>
              <span
                style={{
                  fontSize: '18px',
                  fontWeight: 800,
                  background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                物件セカンドオピニオン AI
              </span>
            </Link>
            <Link
              href="/?openAuth=1"
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#1d4ed8',
                textDecoration: 'none',
                padding: '6px 12px',
                borderRadius: '999px',
                border: '1px solid #93c5fd',
                background: '#eff6ff',
              }}
            >
              ログイン / 新規登録
            </Link>
          </div>
        </header>
        <main style={{ maxWidth: '560px', margin: '60px auto', padding: '0 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔒</div>
          <h1 style={{ fontSize: '22px', fontWeight: 900, margin: '0 0 10px 0' }}>ログインが必要です</h1>
          <p style={{ margin: '0 0 24px 0', color: COLORS.textMuted, fontSize: '14px', lineHeight: 1.7 }}>
            マイページはログイン後にご利用いただけます。トップページから「ログイン / 新規登録」を行ってください。
          </p>
          <Link
            href="/?openAuth=1"
            style={{
              display: 'inline-block',
              textDecoration: 'none',
              background: 'linear-gradient(to right, #4f46e5, #2563eb)',
              color: '#fff',
              fontWeight: 800,
              padding: '12px 22px',
              borderRadius: '999px',
              fontSize: '14px',
            }}
          >
            ログイン画面へ
          </Link>
          {IS_DEV && (
            <div
              style={{
                marginTop: '28px',
                padding: '14px',
                borderRadius: '12px',
                border: '1px dashed #f59e0b',
                background: '#fffbeb',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#b45309', marginBottom: '10px' }}>
                [DEV] ログイン状態トグル
              </div>
              <button
                type="button"
                onClick={() => applyDevLoginState(true)}
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #c4b5fd',
                  background: '#f5f3ff',
                  color: '#5b21b6',
                  cursor: 'pointer',
                }}
              >
                🔐 ログイン状態にする
              </button>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: `linear-gradient(180deg, ${COLORS.pageBg} 0%, ${COLORS.pageBgDeep} 100%)`,
        color: COLORS.text,
        fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        paddingBottom: '60px',
      }}
    >
      <header
        style={{
          backgroundColor: 'rgba(255,255,255,0.92)',
          borderBottom: `1px solid ${COLORS.border}`,
          padding: '16px 24px',
          position: 'sticky',
          top: 0,
          zIndex: 20,
        }}
      >
        <div
          style={{
            maxWidth: '960px',
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '22px' }}>🏠</span>
            <span
              style={{
                fontSize: '18px',
                fontWeight: 800,
                background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              物件セカンドオピニオン AI
            </span>
          </Link>
          <nav style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: COLORS.accentStrong }}>👤 マイページ</span>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#b91c1c',
                background: '#fef2f2',
                padding: '6px 12px',
                borderRadius: '999px',
                border: '1px solid #fecaca',
                cursor: 'pointer',
              }}
            >
              🚪 ログアウト
            </button>
            <Link
              href="/"
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: COLORS.textMuted,
                textDecoration: 'none',
                padding: '6px 12px',
                borderRadius: '999px',
                border: `1px solid ${COLORS.border}`,
                background: COLORS.card,
              }}
            >
              診断トップへ
            </Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: '960px', margin: '0 auto', padding: '28px 20px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 900, margin: '0 0 8px 0' }}>マイページ</h1>
        <p style={{ margin: '0 0 8px 0', color: COLORS.textMuted, fontSize: '14px' }}>
          契約状況と分析履歴を確認できます。
        </p>
        <p
          style={{
            margin: '0 0 24px 0',
            padding: '12px 14px',
            borderRadius: '10px',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#92400e',
            fontSize: '13px',
            lineHeight: 1.65,
          }}
        >
          {ANALYSIS_HISTORY_SAVE_NOTE}
          （単発: 最大{ANALYSIS_HISTORY_LIMIT_SINGLE}件 / 月額Pro: 最大{ANALYSIS_HISTORY_LIMIT_MONTHLY}件）
        </p>

        {message && (
          <div
            style={{
              marginBottom: '16px',
              padding: '12px 14px',
              borderRadius: '10px',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#1e40af',
              fontSize: '13px',
            }}
          >
            {message}
          </div>
        )}

        <section
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: '16px',
            padding: '22px',
            boxShadow: COLORS.cardShadow,
            marginBottom: '20px',
          }}
        >
          <h2 style={{ margin: '0 0 14px 0', fontSize: '16px', fontWeight: 800 }}>ユーザー基本情報</h2>
          <div style={{ display: 'grid', gap: '10px', fontSize: '14px', color: COLORS.textMuted }}>
            <div>
              <span style={{ color: COLORS.textDim, fontSize: '12px' }}>顧客ID（userId）</span>
              <div style={{ fontWeight: 700, color: COLORS.text, wordBreak: 'break-all' }}>{user.userId}</div>
            </div>
            <div>
              <span style={{ color: COLORS.textDim, fontSize: '12px' }}>メールアドレス</span>
              <div style={{ fontWeight: 700, color: COLORS.text }}>
                {user.email || (user.isLoggedIn ? '未設定' : '未ログイン（ゲスト）')}
              </div>
            </div>
            <div>
              <span style={{ color: COLORS.textDim, fontSize: '12px' }}>ログイン状態</span>
              <div style={{ fontWeight: 700, color: COLORS.text }}>
                {user.isLoggedIn
                  ? `ログイン中（${user.authProvider === 'google' ? 'Google' : 'メール'}）`
                  : '未ログイン'}
              </div>
            </div>
            <div>
              <span style={{ color: COLORS.textDim, fontSize: '12px' }}>現在の契約プラン</span>
              <div style={{ fontWeight: 800, color: COLORS.accentStrong, fontSize: '18px' }}>
                {user.plan === 'MONTHLY' ? 'MONTHLY（月額Pro）' : 'FREE（無料・基本分析無制限 / 単発Pro購入可）'}
              </div>
            </div>
          </div>

          <div style={{ marginTop: '18px' }}>
            {user.plan === 'MONTHLY' ? (
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '14px',
                  background: '#f8fafc',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>
                  月額PROプランの管理・解約
                </div>
                <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
                  解約・カード情報の変更・請求履歴の確認は、アンケート回答後の Stripe カスタマーポータルから行えます。
                </p>
                <SubscriptionManageButton
                  mode="manage"
                  userId={user.userId}
                  stripeCustomerId={user.stripeCustomerId}
                  email={user.email}
                />
              </div>
            ) : (
              <SubscriptionManageButton
                mode="join"
                userId={user.userId}
                stripeCustomerId={user.stripeCustomerId}
                email={user.email}
                onJoin={handleStartMonthly}
              />
            )}
          </div>
        </section>

        <section
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: '16px',
            padding: '22px',
            boxShadow: COLORS.cardShadow,
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>分析履歴</h2>
            <span style={{ fontSize: '12px', color: COLORS.textDim, fontWeight: 700 }}>
              {(user.analysisHistory || []).length}件
              {user.plan === 'MONTHLY'
                ? `（上限 ${ANALYSIS_HISTORY_LIMIT_MONTHLY}件）`
                : `（単発上限 ${ANALYSIS_HISTORY_LIMIT_SINGLE}件）`}
              {IS_DEV ? '（DEVダミー含む場合あり）' : ''}
            </span>
          </div>

          {(user.analysisHistory || []).length === 0 ? (
            <p style={{ margin: 0, color: COLORS.textMuted, fontSize: '14px' }}>
              まだ保存された分析履歴はありません。月額Pro、または単発{formatYen(PRICE_SINGLE_YEN)}でPro分析を実行するとここに保存されます。
            </p>
          ) : (
            <div style={{ display: 'grid', gap: '14px' }}>
              {(user.analysisHistory || [])
                .slice()
                .sort((a, b) => +new Date(b.analyzedAt) - +new Date(a.analyzedAt))
                .map((item) => (
                  <article
                    key={`${item.propertyId}-${item.analyzedAt}`}
                    style={{
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: '14px',
                      padding: '16px',
                      background: COLORS.cardAlt,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: COLORS.text }}>
                        {item.title}
                      </h3>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: item.sourcePlan === 'MONTHLY' ? COLORS.accentStrong : COLORS.accent,
                          background:
                            item.sourcePlan === 'MONTHLY'
                              ? 'rgba(79, 70, 229, 0.08)'
                              : 'rgba(37, 99, 235, 0.08)',
                          border: `1px solid ${
                            item.sourcePlan === 'MONTHLY'
                              ? 'rgba(79, 70, 229, 0.25)'
                              : 'rgba(37, 99, 235, 0.25)'
                          }`,
                          borderRadius: '999px',
                          padding: '4px 10px',
                        }}
                      >
                        {item.sourcePlan === 'MONTHLY' ? '月額Pro' : '単発'}
                      </span>
                    </div>
                    <p style={{ margin: '0 0 6px 0', fontSize: '13px', color: COLORS.textMuted, wordBreak: 'break-all' }}>
                      {item.locationOrUrl}
                    </p>
                    <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: COLORS.textDim }}>
                      分析日時: {formatDate(item.analyzedAt)} ／ 世帯:{' '}
                      {item.householdType === 'family' ? 'ファミリー' : '一人暮らし'} ／{' '}
                      {item.propertyType === 'purchase' ? '分譲' : '賃貸'}
                      {typeof item.cachedResult?.score === 'number'
                        ? ` ／ スコア: ${item.cachedResult.score}`
                        : ''}
                    </p>
                    <p style={{ margin: '0 0 12px 0', fontSize: '11px', color: COLORS.textDim, wordBreak: 'break-all' }}>
                      propertyId: {item.propertyId}
                    </p>
                    <Link
                      href={`/?${VIEW_HISTORY_QUERY}=${encodeURIComponent(item.propertyId)}`}
                      style={{
                        display: 'inline-block',
                        background: 'linear-gradient(to right, #4f46e5, #2563eb)',
                        color: '#fff',
                        textDecoration: 'none',
                        fontWeight: 800,
                        fontSize: '13px',
                        padding: '10px 14px',
                        borderRadius: '10px',
                      }}
                    >
                      この分析結果を開く
                    </Link>
                  </article>
                ))}
            </div>
          )}
        </section>

        <section
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: '16px',
            padding: '22px',
            boxShadow: COLORS.cardShadow,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>単発Pro購入（権利）</h2>
            <span style={{ fontSize: '12px', color: COLORS.textDim, fontWeight: 700 }}>
              {user.purchasedProperties.length}件（最新1件のみ保持）
            </span>
          </div>

          {user.purchasedProperties.length === 0 ? (
            <p style={{ margin: 0, color: COLORS.textMuted, fontSize: '14px' }}>
              単発{formatYen(PRICE_SINGLE_YEN)}の購入履歴はありません。新規単発購入時は前回の単発権利は上書きされます。
            </p>
          ) : (
            <div style={{ display: 'grid', gap: '14px' }}>
              {user.purchasedProperties
                .slice()
                .sort((a, b) => +new Date(b.purchasedAt) - +new Date(a.purchasedAt))
                .map((item) => (
                  <article
                    key={item.propertyId}
                    style={{
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: '14px',
                      padding: '16px',
                      background: COLORS.cardAlt,
                    }}
                  >
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', fontWeight: 800, color: COLORS.text }}>
                      {item.title}
                    </h3>
                    <p style={{ margin: '0 0 6px 0', fontSize: '13px', color: COLORS.textMuted, wordBreak: 'break-all' }}>
                      {item.locationOrUrl}
                    </p>
                    <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: COLORS.textDim }}>
                      購入日時: {formatDate(item.purchasedAt)} ／ 世帯:{' '}
                      {item.householdType === 'family' ? 'ファミリー' : '一人暮らし'} ／{' '}
                      {item.propertyType === 'purchase' ? '分譲' : '賃貸'}
                    </p>
                    <Link
                      href={`/?${VIEW_PURCHASED_QUERY}=${encodeURIComponent(item.propertyId)}`}
                      style={{
                        display: 'inline-block',
                        background: 'linear-gradient(to right, #4f46e5, #2563eb)',
                        color: '#fff',
                        textDecoration: 'none',
                        fontWeight: 800,
                        fontSize: '13px',
                        padding: '10px 14px',
                        borderRadius: '10px',
                      }}
                    >
                      この物件のProレポートを見る
                    </Link>
                  </article>
                ))}
            </div>
          )}
        </section>

        {IS_DEV && (
          <div
            style={{
              marginTop: '24px',
              padding: '16px',
              borderRadius: '12px',
              border: '1px dashed #f59e0b',
              backgroundColor: '#fffbeb',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#b45309', marginBottom: '10px' }}>
              [DEV] ログイン状態トグル — isLoggedIn={String(user.isLoggedIn)}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button
                type="button"
                onClick={() => applyDevLoginState(true)}
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #c4b5fd',
                  background: '#f5f3ff',
                  color: '#5b21b6',
                  cursor: 'pointer',
                }}
              >
                🔐 ログイン状態にする
              </button>
              <button
                type="button"
                onClick={() => applyDevLoginState(false)}
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #fdba74',
                  background: '#fff7ed',
                  color: '#c2410c',
                  cursor: 'pointer',
                }}
              >
                🔓 ログアウト状態にする
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase-browser';

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const client = createBrowserSupabase();
    if (!client) {
      setError('認証の準備ができていません。');
      setReady(true);
      return;
    }

    // 1. URLハッシュまたはクエリパラメータからトークンの存在を判定
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const hasAuthToken =
      hash.includes('access_token=') ||
      hash.includes('type=recovery') ||
      search.includes('code=');

    // 2. 認証状態のイベント監視
    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (session || event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setHasSession(true);
        setReady(true);
      }
    });

    // 3. セッションチェック
    const init = async () => {
      const { data } = await client.auth.getSession();
      if (data.session) {
        setHasSession(true);
        setReady(true);
      } else if (hasAuthToken) {
        // URLにトークンがある場合はSupabaseがセッションを確立するのを少し待つ
        setTimeout(async () => {
          const { data: retryData } = await client.auth.getSession();
          if (retryData.session) {
            setHasSession(true);
          }
          setReady(true);
        }, 1200);
      } else {
        setReady(true);
      }
    };

    void init();

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('パスワードは8文字以上で入力してください。');
      return;
    }
    if (password !== passwordConfirm) {
      setError('確認用パスワードが一致しません。');
      return;
    }

    const client = createBrowserSupabase();
    if (!client) {
      setError('認証の準備ができていません。');
      return;
    }

    setSubmitting(true);
    try {
      const { error: updateError } = await client.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message || 'パスワードの更新に失敗しました。');
        setSubmitting(false);
        return;
      }
      setDone(true);
      setSubmitting(false);
    } catch {
      setError('パスワード更新中に通信エラーが発生しました。');
      setSubmitting(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
        color: '#0f172a',
        padding: '48px 20px',
        fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 440,
          margin: '0 auto',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 20,
          padding: '28px 24px',
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
        }}
      >
        <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#4f46e5' }}>
          物件セカンドオピニオン AI
        </p>
        <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800 }}>パスワード再設定</h1>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: '#64748b', lineHeight: 1.7 }}>
          新しいパスワードを入力してください。氏名・住所・電話番号などの個人情報は不要です。
        </p>

        {!ready && (
          <p style={{ margin: '20px 0', color: '#64748b', fontSize: 14, textAlign: 'center' }}>
            認証情報を確認中...
          </p>
        )}

        {ready && done && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <p style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
              パスワードを更新しました。
            </p>
            <Link
              href="/?openAuth=1"
              style={{
                display: 'inline-block',
                background: 'linear-gradient(to right, #2563eb, #4f46e5)',
                color: '#fff',
                fontWeight: 800,
                padding: '12px 20px',
                borderRadius: 10,
                textDecoration: 'none',
                fontSize: 14,
              }}
            >
              ログイン画面へ
            </Link>
          </div>
        )}

        {ready && !done && (
          <>
            {!hasSession && (
              <div
                style={{
                  marginBottom: 16,
                  padding: 12,
                  borderRadius: 10,
                  background: '#fff7ed',
                  border: '1px solid #fed7aa',
                  color: '#9a3412',
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                再設定リンクが無効か期限切れの可能性があります。ログイン画面から「パスワードをお忘れですか？」で再度メールを送信してください。
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                新しいパスワード（8文字以上）
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting || !hasSession}
                  autoComplete="new-password"
                  style={{
                    marginTop: 6,
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                新しいパスワード（確認）
                <input
                  type="password"
                  required
                  minLength={8}
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  disabled={submitting || !hasSession}
                  autoComplete="new-password"
                  style={{
                    marginTop: 6,
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    fontSize: 14,
                  }}
                />
              </label>

              {error && (
                <div
                  style={{
                    padding: 12,
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#b91c1c',
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                >
                  ⚠️ {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !hasSession}
                style={{
                  marginTop: 4,
                  background: submitting || !hasSession ? '#94a3b8' : 'linear-gradient(to right, #2563eb, #4f46e5)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  padding: 12,
                  fontWeight: 800,
                  cursor: submitting || !hasSession ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                }}
              >
                {submitting ? '更新中...' : 'パスワードを更新する'}
              </button>
            </form>

            <p style={{ margin: '16px 0 0', textAlign: 'center' }}>
              <Link href="/" style={{ color: '#2563eb', fontSize: 13, fontWeight: 600 }}>
                ← トップへ戻る
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
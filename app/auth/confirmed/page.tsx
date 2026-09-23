'use client';

import { useEffect, useState } from 'react';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createBrowserSupabase } from '@/lib/supabase-browser';
import { notifySignupConfirmed } from '@/lib/auth-client';

const OTP_TYPES = new Set<EmailOtpType>([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]);

const SUCCESS_TITLE = '認証が完了しました';
const SUCCESS_BODY = '元の画面（タブ）に戻ってお続けください。このウィンドウは閉じて構いません。';

export default function AuthConfirmedPage() {
  const [status, setStatus] = useState<'working' | 'ok' | 'error'>('working');
  const [message, setMessage] = useState('メールアドレスを確認しています...');

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const client = createBrowserSupabase();
        if (!client) throw new Error('認証の準備ができていません。');

        const url = new URL(window.location.href);
        const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
        const tokenHash = url.searchParams.get('token_hash') || hashParams.get('token_hash');
        const typeRaw = url.searchParams.get('type') || hashParams.get('type');
        const type =
          typeRaw && OTP_TYPES.has(typeRaw as EmailOtpType) ? (typeRaw as EmailOtpType) : null;
        const code = url.searchParams.get('code');

        if (tokenHash && type) {
          const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type });
          if (error) throw error;
        } else if (code) {
          const { error } = await client.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        const { data } = await client.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          await fetch('/api/auth/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              access_token: token,
              grantBonus: type === 'signup' || type === 'email' || type === 'magiclink' || !type,
            }),
          });
        }

        if (cancelled) return;
        window.history.replaceState({}, '', '/auth/confirmed');
        notifySignupConfirmed();
        setStatus('ok');
        setMessage(SUCCESS_BODY);
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'リンクが無効か、有効期限が切れています。');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#f8fafc',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 20,
          padding: '32px 28px',
          textAlign: 'center',
        }}
      >
        <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, color: '#2563eb' }}>
          物件セカンドオピニオン
        </p>
        <h1 style={{ margin: '0 0 16px', fontSize: 22, lineHeight: 1.5, color: '#0f172a' }}>
          {status === 'working' ? '確認中' : status === 'ok' ? SUCCESS_TITLE : '確認できませんでした'}
        </h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.8, color: '#475569', whiteSpace: 'pre-wrap' }}>
          {message}
        </p>
        {status === 'ok' ? (
          <button
            type="button"
            onClick={() => window.close()}
            style={{
              marginTop: 24,
              minHeight: 48,
              padding: '12px 20px',
              border: 'none',
              borderRadius: 999,
              background: '#059669',
              color: '#fff',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            このウィンドウを閉じる
          </button>
        ) : null}
      </section>
    </main>
  );
}

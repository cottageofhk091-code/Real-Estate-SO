import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  email?: unknown;
  redirectTo?: unknown;
};

/**
 * パスワード再設定メールを送信する。
 */
export async function POST(req: Request) {
  try {
    if (!supabase) {
      return NextResponse.json(
        { error: 'パスワード再設定の準備ができていません。' },
        { status: 503 }
      );
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 });
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: '有効なメールアドレスを入力してください。' }, { status: 400 });
    }

    // リクエストヘッダーの origin （実際にアクセスしているドメイン）を最優先にする
    const origin =
      req.headers.get('origin') ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (typeof body.redirectTo === 'string' && body.redirectTo.trim()) ||
      '';

    const redirectTo = origin
      ? `${origin.replace(/\/$/, '')}/auth/reset-password`
      : undefined;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      ...(redirectTo ? { redirectTo } : {}),
    });

    if (error) {
      console.error('[auth/forgot-password] error:', error.message);
      return NextResponse.json(
        { error: error.message || '再設定メールの送信に失敗しました。' },
        { status: 400 }
      );
    }

    // ユーザー列挙を避けるため、成功メッセージは一律
    return NextResponse.json({
      ok: true,
      message: '登録済みの場合、パスワード再設定用のメールを送信しました。',
    });
  } catch (err) {
    console.error('[auth/forgot-password] unexpected:', err);
    return NextResponse.json(
      { error: 'パスワード再設定メールの送信中にエラーが発生しました。' },
      { status: 500 }
    );
  }
}
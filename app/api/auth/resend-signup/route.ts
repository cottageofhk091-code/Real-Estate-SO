import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  email?: unknown;
};

/**
 * 会員登録用 OTP メールの再送。
 */
export async function POST(req: Request) {
  try {
    if (!supabase) {
      return NextResponse.json({ error: '再送の準備ができていません。' }, { status: 503 });
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

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    });

    if (error) {
      console.error('[auth/resend-signup] error:', error.message);
      return NextResponse.json(
        { error: error.message || '確認コードの再送に失敗しました。' },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, email, message: '確認コードを再送しました。' });
  } catch (err) {
    console.error('[auth/resend-signup] unexpected:', err);
    return NextResponse.json({ error: '確認コードの再送中にエラーが発生しました。' }, { status: 500 });
  }
}

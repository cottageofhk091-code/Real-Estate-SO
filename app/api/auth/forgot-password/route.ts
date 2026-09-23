import { NextResponse } from 'next/server';
import { sendPasswordResetEmail } from '@/lib/auth-email';
import { generateAuthActionLink, hasSupabaseAdminAuth } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  email?: unknown;
};

export async function POST(req: Request) {
  try {
    if (!hasSupabaseAdminAuth()) {
      return NextResponse.json(
        { error: 'パスワード再設定の準備ができていません。' },
        { status: 503 }
      );
    }
    if (!process.env.RESEND_API_KEY?.trim()) {
      return NextResponse.json({ error: 'RESEND_API_KEY が未設定です。' }, { status: 500 });
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

    try {
      const link = await generateAuthActionLink({ type: 'recovery', email, req });
      const sent = await sendPasswordResetEmail(email, link.actionUrl);
      if (!sent.sent) {
        return NextResponse.json(
          { error: sent.error || '再設定メールの送信に失敗しました。' },
          { status: 502 }
        );
      }
    } catch (err) {
      console.error('[auth/forgot-password] generate/send:', err);
      // 未登録メールでも成功扱い（列挙防止）
    }

    return NextResponse.json({
      ok: true,
      message:
        '登録済みの場合、パスワード再設定用のメールを送信しました。この画面は開いたままお待ちください。',
    });
  } catch (err) {
    console.error('[auth/forgot-password] unexpected:', err);
    return NextResponse.json(
      { error: 'パスワード再設定メールの送信中にエラーが発生しました。' },
      { status: 500 }
    );
  }
}

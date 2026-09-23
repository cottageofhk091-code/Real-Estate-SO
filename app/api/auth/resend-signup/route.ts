import { NextResponse } from 'next/server';
import { sendSignupConfirmationEmail } from '@/lib/auth-email';
import {
  findAuthUserByEmail,
  generateAuthActionLink,
  hasSupabaseAdminAuth,
  isAuthUserConfirmed,
} from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  email?: unknown;
};

export async function POST(req: Request) {
  try {
    if (!hasSupabaseAdminAuth() || !process.env.RESEND_API_KEY?.trim()) {
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

    const existing = await findAuthUserByEmail(email);
    if (existing && isAuthUserConfirmed(existing)) {
      return NextResponse.json(
        { error: 'このメールアドレスは既に確認済みです。ログインしてください。' },
        { status: 400 }
      );
    }

    const link = await generateAuthActionLink({ type: 'magiclink', email, req });
    const sent = await sendSignupConfirmationEmail(email, link.actionUrl);
    if (!sent.sent) {
      return NextResponse.json(
        { error: sent.error || '確認メールの再送に失敗しました。' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      email,
      message: '確認メールを再送しました。この画面は開いたままお待ちください。',
    });
  } catch (err) {
    console.error('[auth/resend-signup] unexpected:', err);
    return NextResponse.json({ error: '確認メールの再送中にエラーが発生しました。' }, { status: 500 });
  }
}

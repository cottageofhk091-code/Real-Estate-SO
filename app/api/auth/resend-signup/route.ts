import { NextResponse } from 'next/server';
import { jsonServiceUnavailable, serializeUnknownError } from '@/lib/auth-api-error';
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
    if (!hasSupabaseAdminAuth()) {
      return jsonServiceUnavailable(
        'auth/resend-signup',
        '再送の準備ができていません（SUPABASE_SERVICE_ROLE_KEY 未設定）。',
        { message: 'SUPABASE_SERVICE_ROLE_KEY is missing', cause: 'supabase_service_role_missing' }
      );
    }
    if (!process.env.RESEND_API_KEY?.trim()) {
      return jsonServiceUnavailable(
        'auth/resend-signup',
        '再送の準備ができていません（RESEND_API_KEY 未設定）。',
        { message: 'RESEND_API_KEY is missing', cause: 'resend_api_key_missing' }
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
      return jsonServiceUnavailable(
        'auth/resend-signup',
        sent.error || '確認メールの再送に失敗しました。',
        { message: sent.error, body: sent.detail ?? null, cause: 'resend_send_failed' }
      );
    }

    return NextResponse.json({
      ok: true,
      email,
      message: '確認メールを再送しました。この画面は開いたままお待ちください。',
    });
  } catch (err) {
    const detail = serializeUnknownError(err);
    console.error('[auth/resend-signup] unexpected:', detail, err);
    return jsonServiceUnavailable(
      'auth/resend-signup',
      typeof detail.message === 'string' ? detail.message : '確認メールの再送中にエラーが発生しました。',
      detail
    );
  }
}

import { NextResponse } from 'next/server';
import { isAgeGroup, isPrefecture } from '@/lib/survey-options';
import { sendSignupConfirmationEmail } from '@/lib/auth-email';
import {
  findAuthUserByEmail,
  generateAuthActionLink,
  getSupabaseAdmin,
  hasSupabaseAdminAuth,
  isAuthUserConfirmed,
} from '@/lib/supabase-admin';
import { APP_NAME_REALESTATE } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SENT_MESSAGE =
  '確認メールを送りました。メール内の確認ボタンをクリックしてください。この画面は開いたままお待ちください。';

type RegisterBody = {
  email?: unknown;
  password?: unknown;
  age_group?: unknown;
  region?: unknown;
  agreedToTerms?: unknown;
};

export async function POST(req: Request) {
  try {
    if (!hasSupabaseAdminAuth()) {
      return NextResponse.json(
        { error: '会員登録の準備ができていません（SUPABASE_SERVICE_ROLE_KEY）。' },
        { status: 500 }
      );
    }
    if (!process.env.RESEND_API_KEY?.trim()) {
      return NextResponse.json({ error: 'RESEND_API_KEY が未設定です。' }, { status: 500 });
    }

    let body: RegisterBody;
    try {
      body = (await req.json()) as RegisterBody;
    } catch {
      return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 });
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const ageGroup = typeof body.age_group === 'string' ? body.age_group.trim() : '';
    const region = typeof body.region === 'string' ? body.region.trim() : '';
    const agreed = body.agreedToTerms === true;

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: '有効なメールアドレスを入力してください。' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'パスワードは8文字以上で入力してください。' }, { status: 400 });
    }
    if (!agreed) {
      return NextResponse.json(
        { error: '利用規約とプライバシーポリシーへの同意が必要です。' },
        { status: 400 }
      );
    }
    if (!isAgeGroup(ageGroup)) {
      return NextResponse.json({ error: '年代を選択してください。' }, { status: 400 });
    }
    if (!isPrefecture(region)) {
      return NextResponse.json({ error: '地域（都道府県）を選択してください。' }, { status: 400 });
    }

    const existing = await findAuthUserByEmail(email);
    if (existing && isAuthUserConfirmed(existing)) {
      return NextResponse.json({ error: 'このメールアドレスは既に登録されています。' }, { status: 409 });
    }

    if (existing && !isAuthUserConfirmed(existing)) {
      const admin = getSupabaseAdmin();
      const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
        password,
        user_metadata: {
          app_name: APP_NAME_REALESTATE,
          age_group: ageGroup,
          region,
        },
      });
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }
    }

    let link;
    try {
      link = await generateAuthActionLink({
        type: existing ? 'magiclink' : 'signup',
        email,
        password,
        data: {
          app_name: APP_NAME_REALESTATE,
          age_group: ageGroup,
          region,
        },
        req,
      });
    } catch (linkErr) {
      const detail = linkErr instanceof Error ? linkErr.message : String(linkErr);
      if (/already registered|already been registered|user_already_exists/i.test(detail)) {
        const again = await findAuthUserByEmail(email);
        if (again && isAuthUserConfirmed(again)) {
          return NextResponse.json({ error: 'このメールアドレスは既に登録されています。' }, { status: 409 });
        }
        link = await generateAuthActionLink({ type: 'magiclink', email, req });
      } else {
        return NextResponse.json({ error: detail || '確認メールの準備に失敗しました。' }, { status: 400 });
      }
    }

    const sent = await sendSignupConfirmationEmail(email, link.actionUrl);
    if (!sent.sent) {
      return NextResponse.json(
        { error: sent.error || '確認メールの送信に失敗しました。' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      requiresEmailConfirm: true,
      email,
      message: SENT_MESSAGE,
    });
  } catch (err) {
    console.error('[auth/register] unexpected:', err);
    return NextResponse.json(
      { error: '会員登録中にエラーが発生しました。もう一度お試しください。' },
      { status: 500 }
    );
  }
}

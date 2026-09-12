import { NextResponse } from 'next/server';
import { isAgeGroup, isPrefecture } from '@/lib/survey-options';
import { APP_NAME_REALESTATE, supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RegisterBody = {
  email?: unknown;
  password?: unknown;
  age_group?: unknown;
  region?: unknown;
  agreedToTerms?: unknown;
};

/**
 * 会員登録の第一段階: Supabase Auth にサインアップし、確認メール（OTP）を送る。
 * users_profiles は OTP 検証後に保存する。
 */
export async function POST(req: Request) {
  try {
    if (!supabase) {
      return NextResponse.json(
        { error: '会員登録の準備ができていません。しばらくしてから再度お試しください。' },
        { status: 503 }
      );
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
      return NextResponse.json(
        { error: 'パスワードは8文字以上で入力してください。' },
        { status: 400 }
      );
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

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          app_name: APP_NAME_REALESTATE,
          age_group: ageGroup,
          region,
          // 氏名・住所・電話は保存しない
        },
      },
    });

    if (signUpError) {
      console.error('[auth/register] signUp error:', signUpError.message);
      return NextResponse.json(
        { error: signUpError.message || '会員登録に失敗しました。' },
        { status: 400 }
      );
    }

    // すでに登録済みで未確認の場合など、identities が空のことがある
    if (signUpData.user && Array.isArray(signUpData.user.identities) && signUpData.user.identities.length === 0) {
      return NextResponse.json(
        {
          error:
            'このメールアドレスは既に登録されているか、確認待ちです。ログインするか、届いている確認メールをご確認ください。',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      requiresOtp: true,
      email,
      age_group: ageGroup,
      region,
      message: '確認コードをメールに送信しました。',
    });
  } catch (err) {
    console.error('[auth/register] unexpected:', err);
    return NextResponse.json(
      { error: '会員登録中にエラーが発生しました。もう一度お試しください。' },
      { status: 500 }
    );
  }
}

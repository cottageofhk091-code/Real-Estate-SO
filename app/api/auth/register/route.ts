import { NextResponse } from 'next/server';
import { isAgeGroup, isPrefecture } from '@/lib/survey-options';
import {
  APP_NAME_REALESTATE,
  getSupabaseAdminOrAnon,
  supabase,
} from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RegisterBody = {
  email?: unknown;
  password?: unknown;
  age_group?: unknown;
  region?: unknown;
  agreedToTerms?: unknown;
};

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

    const userId = signUpData.user?.id;
    if (!userId) {
      return NextResponse.json(
        { error: '会員登録に失敗しました。メール認証の設定をご確認ください。' },
        { status: 500 }
      );
    }

    const profileRow = {
      user_id: userId,
      app_name: APP_NAME_REALESTATE,
      membership_status: 'free' as const,
      age_group: ageGroup,
      region,
    };

    const profileClient = getSupabaseAdminOrAnon();
    if (!profileClient) {
      return NextResponse.json(
        { error: 'プロフィール保存の準備ができていません。' },
        { status: 503 }
      );
    }

    let profileSaved = true;
    const { error: insertError } = await profileClient.from('users_profiles').insert([profileRow]);
    if (insertError) {
      const { error: upsertError } = await profileClient
        .from('users_profiles')
        .upsert([profileRow], { onConflict: 'user_id' });
      if (upsertError) {
        console.error('[auth/register] profile error:', insertError.message, upsertError.message);
        profileSaved = false;
        return NextResponse.json(
          {
            error:
              'アカウントは作成されましたが、プロフィール保存に失敗しました。サポートまでご連絡ください。',
            userId,
            email,
            profileSaved: false,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      userId,
      email,
      membership_status: 'free',
      age_group: ageGroup,
      region,
      profileSaved,
    });
  } catch (err) {
    console.error('[auth/register] unexpected:', err);
    return NextResponse.json(
      { error: '会員登録中にエラーが発生しました。もう一度お試しください。' },
      { status: 500 }
    );
  }
}

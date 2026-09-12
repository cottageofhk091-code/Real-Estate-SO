import { NextResponse } from 'next/server';
import { isAgeGroup, isPrefecture } from '@/lib/survey-options';
import {
  APP_NAME_REALESTATE,
  getSupabaseAdminOrAnon,
  supabase,
} from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type VerifyBody = {
  email?: unknown;
  token?: unknown;
  age_group?: unknown;
  region?: unknown;
};

/**
 * 会員登録の第二段階: メール OTP を検証し、users_profiles を作成する。
 */
export async function POST(req: Request) {
  try {
    if (!supabase) {
      return NextResponse.json(
        { error: '認証の準備ができていません。しばらくしてから再度お試しください。' },
        { status: 503 }
      );
    }

    let body: VerifyBody;
    try {
      body = (await req.json()) as VerifyBody;
    } catch {
      return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 });
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    let ageGroup = typeof body.age_group === 'string' ? body.age_group.trim() : '';
    let region = typeof body.region === 'string' ? body.region.trim() : '';

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: '有効なメールアドレスを入力してください。' }, { status: 400 });
    }
    if (!/^\d{6}$/.test(token)) {
      return NextResponse.json({ error: '6桁の認証コードを入力してください。' }, { status: 400 });
    }

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'signup',
    });

    if (error) {
      console.error('[auth/verify-signup] verifyOtp error:', error.message);
      return NextResponse.json(
        { error: error.message || '認証コードが正しくないか、有効期限切れです。' },
        { status: 400 }
      );
    }

    const userId = data.user?.id;
    if (!userId) {
      return NextResponse.json({ error: '認証に失敗しました。もう一度お試しください。' }, { status: 500 });
    }

    const meta = (data.user?.user_metadata || {}) as Record<string, unknown>;
    if (!ageGroup && typeof meta.age_group === 'string') ageGroup = meta.age_group;
    if (!region && typeof meta.region === 'string') region = meta.region;

    if (!isAgeGroup(ageGroup)) ageGroup = '未回答';
    if (!isPrefecture(region)) region = '未回答';

    const profileRow = {
      user_id: userId,
      app_name: APP_NAME_REALESTATE,
      membership_status: 'free' as const,
      age_group: ageGroup,
      region,
      free_pro_credits: 1,
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
        console.error('[auth/verify-signup] profile error:', insertError.message, upsertError.message);
        profileSaved = false;
      }
    }

    return NextResponse.json({
      ok: true,
      userId,
      email: data.user?.email || email,
      membership_status: 'free',
      age_group: ageGroup,
      region,
      free_pro_credits: 1,
      profileSaved,
    });
  } catch (err) {
    console.error('[auth/verify-signup] unexpected:', err);
    return NextResponse.json(
      { error: '認証コードの確認中にエラーが発生しました。' },
      { status: 500 }
    );
  }
}

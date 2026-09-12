import { NextResponse } from 'next/server';
import { APP_NAME_REALESTATE, getSupabaseAdminOrAnon, supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

export async function POST(req: Request) {
  try {
    if (!supabase) {
      return NextResponse.json(
        { error: 'ログインの準備ができていません。しばらくしてから再度お試しください。' },
        { status: 503 }
      );
    }

    let body: LoginBody;
    try {
      body = (await req.json()) as LoginBody;
    } catch {
      return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 });
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: '有効なメールアドレスを入力してください。' }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: 'パスワードを入力してください。' }, { status: 400 });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error('[auth/login] error:', error.message);
      return NextResponse.json(
        { error: 'メールアドレスまたはパスワードが正しくありません。' },
        { status: 401 }
      );
    }

    const userId = data.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'ログインに失敗しました。' }, { status: 500 });
    }

    let freeProCredits = 0;
    const profileClient = getSupabaseAdminOrAnon();
    if (profileClient) {
      const { data: profile } = await profileClient
        .from('users_profiles')
        .select('free_pro_credits')
        .eq('user_id', userId)
        .eq('app_name', APP_NAME_REALESTATE)
        .maybeSingle();
      if (profile && typeof profile.free_pro_credits === 'number') {
        freeProCredits = Math.max(0, Math.floor(profile.free_pro_credits));
      }
    }

    return NextResponse.json({
      ok: true,
      userId,
      email: data.user.email || email,
      free_pro_credits: freeProCredits,
    });
  } catch (err) {
    console.error('[auth/login] unexpected:', err);
    return NextResponse.json(
      { error: 'ログイン中に通信エラーが発生しました。もう一度お試しください。' },
      { status: 500 }
    );
  }
}

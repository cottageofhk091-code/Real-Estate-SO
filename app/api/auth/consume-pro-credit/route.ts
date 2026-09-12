import { NextResponse } from 'next/server';
import { APP_NAME_REALESTATE, getSupabaseAdminOrAnon } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  userId?: unknown;
};

/**
 * 無料 Pro 体験クレジットを 1 → 0 に消費する。
 * すでに 0 の場合も成功扱い（冪等）。
 */
export async function POST(req: Request) {
  try {
    const profileClient = getSupabaseAdminOrAnon();
    if (!profileClient) {
      return NextResponse.json({ error: 'クレジット更新の準備ができていません。' }, { status: 503 });
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 });
    }

    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!userId) {
      return NextResponse.json({ error: 'userId が必要です。' }, { status: 400 });
    }

    const { data: profile, error: readError } = await profileClient
      .from('users_profiles')
      .select('free_pro_credits')
      .eq('user_id', userId)
      .eq('app_name', APP_NAME_REALESTATE)
      .maybeSingle();

    if (readError) {
      console.error('[consume-pro-credit] read error:', readError.message);
      return NextResponse.json({ error: 'クレジットの確認に失敗しました。' }, { status: 500 });
    }

    const current =
      profile && typeof profile.free_pro_credits === 'number'
        ? Math.max(0, Math.floor(profile.free_pro_credits))
        : 0;

    if (current <= 0) {
      return NextResponse.json({ ok: true, free_pro_credits: 0, consumed: false });
    }

    const { error: updateError } = await profileClient
      .from('users_profiles')
      .update({ free_pro_credits: 0 })
      .eq('user_id', userId)
      .eq('app_name', APP_NAME_REALESTATE);

    if (updateError) {
      console.error('[consume-pro-credit] update error:', updateError.message);
      return NextResponse.json({ error: 'クレジットの消費に失敗しました。' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, free_pro_credits: 0, consumed: true });
  } catch (err) {
    console.error('[consume-pro-credit] unexpected:', err);
    return NextResponse.json({ error: 'クレジット消費中にエラーが発生しました。' }, { status: 500 });
  }
}

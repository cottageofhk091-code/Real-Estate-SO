import { NextResponse } from 'next/server';
import { APP_NAME_REALESTATE, getSupabaseAdminOrAnon } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const userId = new URL(req.url).searchParams.get('userId')?.trim() || '';
  if (!userId) {
    return NextResponse.json({ error: 'userId が必要です。' }, { status: 400 });
  }

  const profileClient = getSupabaseAdminOrAnon();
  if (!profileClient) {
    return NextResponse.json({ error: 'クレジット確認の準備ができていません。' }, { status: 503 });
  }

  const { data: profile, error } = await profileClient
    .from('users_profiles')
    .select('free_pro_credits')
    .eq('user_id', userId)
    .eq('app_name', APP_NAME_REALESTATE)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'クレジットの確認に失敗しました。' }, { status: 500 });
  }

  const credits =
    profile && typeof profile.free_pro_credits === 'number'
      ? Math.max(0, Math.floor(profile.free_pro_credits))
      : 0;

  return NextResponse.json({ ok: true, free_pro_credits: credits });
}

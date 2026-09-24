import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { jsonErrorWithDetail, jsonServiceUnavailable, serializeUnknownError } from '@/lib/auth-api-error';
import { isAgeGroup, isPrefecture } from '@/lib/survey-options';
import { APP_NAME_REALESTATE, getSupabaseAdminOrAnon } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  access_token?: unknown;
  grantBonus?: unknown;
};

type CreditRow = {
  free_pro_credits?: unknown;
  free_credits?: unknown;
};

function readCredits(row: CreditRow | null): number {
  if (!row) return 0;
  if (typeof row.free_pro_credits === 'number') return Math.max(0, Math.floor(row.free_pro_credits));
  if (typeof row.free_credits === 'number') return Math.max(0, Math.floor(row.free_credits));
  return 0;
}

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!url || !anon) {
      return jsonServiceUnavailable(
        'auth/complete',
        '認証の準備ができていません（NEXT_PUBLIC_SUPABASE_URL / ANON_KEY）。',
        { message: 'Supabase public env missing', cause: 'supabase_public_env_missing' }
      );
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 });
    }

    const accessToken = typeof body.access_token === 'string' ? body.access_token.trim() : '';
    const grantBonus = body.grantBonus === true;
    if (!accessToken) {
      return NextResponse.json({ error: 'アクセストークンがありません。' }, { status: 400 });
    }

    const userClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data, error } = await userClient.auth.getUser(accessToken);
    if (error || !data.user?.id) {
      return NextResponse.json(
        { error: 'セッションが無効です。', detail: error ? serializeUnknownError(error) : null },
        { status: 401 }
      );
    }

    const userId = data.user.id;
    const email = (data.user.email || '').toLowerCase();
    const meta = (data.user.user_metadata || {}) as Record<string, unknown>;
    let ageGroup = typeof meta.age_group === 'string' ? meta.age_group : '';
    let region = typeof meta.region === 'string' ? meta.region : '';
    if (!isAgeGroup(ageGroup)) ageGroup = '未回答';
    if (!isPrefecture(region)) region = '未回答';

    const profileClient = getSupabaseAdminOrAnon();
    if (!profileClient) {
      return jsonServiceUnavailable(
        'auth/complete',
        'プロフィール保存の準備ができていません。',
        { message: 'getSupabaseAdminOrAnon() returned null', cause: 'profile_client_missing' }
      );
    }

    const { data: existing, error: selectError } = await profileClient
      .from('users_profiles')
      .select('free_pro_credits')
      .eq('user_id', userId)
      .eq('app_name', APP_NAME_REALESTATE)
      .maybeSingle();

    if (selectError) {
      const detail = serializeUnknownError(selectError);
      console.error('[auth/complete] users_profiles select error:', detail);
      return jsonServiceUnavailable(
        'auth/complete',
        selectError.message || 'users_profiles の参照に失敗しました。',
        { ...detail, cause: 'users_profiles_select_failed', table: 'users_profiles' }
      );
    }

    if (existing) {
      return NextResponse.json({
        ok: true,
        userId,
        email,
        free_pro_credits: readCredits(existing),
        bonusGranted: false,
      });
    }

    const initialCredits = grantBonus ? 1 : 0;
    const profileRow = {
      user_id: userId,
      app_name: APP_NAME_REALESTATE,
      membership_status: 'free' as const,
      age_group: ageGroup,
      region,
      free_pro_credits: initialCredits,
    };

    const { error: insertError } = await profileClient.from('users_profiles').insert([profileRow]);
    if (insertError) {
      const insertDetail = serializeUnknownError(insertError);
      console.error('[auth/complete] users_profiles insert error:', insertDetail, profileRow);

      const { data: again, error: againError } = await profileClient
        .from('users_profiles')
        .select('free_pro_credits')
        .eq('user_id', userId)
        .eq('app_name', APP_NAME_REALESTATE)
        .maybeSingle();
      if (again) {
        return NextResponse.json({
          ok: true,
          userId,
          email,
          free_pro_credits: readCredits(again),
          bonusGranted: false,
        });
      }

      return jsonServiceUnavailable(
        'auth/complete',
        insertError.message || 'プロフィールの保存に失敗しました。',
        {
          ...insertDetail,
          cause: 'users_profiles_insert_failed',
          table: 'users_profiles',
          column: 'free_pro_credits',
          retrySelect: againError ? serializeUnknownError(againError) : null,
        }
      );
    }

    console.log('[auth/complete] users_profiles created', {
      userId,
      app_name: APP_NAME_REALESTATE,
      free_pro_credits: initialCredits,
      grantBonus,
    });

    return NextResponse.json({
      ok: true,
      userId,
      email,
      free_pro_credits: initialCredits,
      bonusGranted: grantBonus,
    });
  } catch (err) {
    const detail = serializeUnknownError(err);
    console.error('[auth/complete] unexpected:', detail, err);
    return jsonServiceUnavailable(
      'auth/complete',
      typeof detail.message === 'string' ? detail.message : '認証完了処理に失敗しました。',
      detail
    );
  }
}

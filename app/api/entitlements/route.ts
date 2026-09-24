import { NextResponse } from 'next/server';
import {
  getServerUser,
  toClientAnalysisHistory,
  toClientPurchasedRecords,
} from '@/lib/entitlements';
import { jsonServiceUnavailable, serializeUnknownError } from '@/lib/auth-api-error';
import { KvNotConfiguredError, isKvConfigured } from '@/lib/kv';

/** Edge では Node fs が使えないため、mkdir('/var/task/data') 系エラーを構造的に排除 */
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function emptyEntitlements(userId: string) {
  return {
    found: false as const,
    userId,
    plan: 'FREE' as const,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: null,
    paymentFailedAt: null,
    email: null,
    purchasedPropertyIds: [] as string[],
    purchasedProperties: [] as ReturnType<typeof toClientPurchasedRecords>,
    analysisHistory: [] as ReturnType<typeof toClientAnalysisHistory>,
  };
}

/**
 * 利用権限（Entitlements）取得 API
 * - KV / Upstash Redis 必須（未設定時は 503 + 詳細 JSON）
 */
export async function GET(req: Request) {
  let userId = '';
  try {
    if (!isKvConfigured()) {
      return jsonServiceUnavailable(
        'entitlements',
        '権利ストア（KV / Upstash Redis）が未設定です。KV_REST_API_* または UPSTASH_REDIS_REST_* を設定してください。',
        { message: 'KV is not configured', cause: 'kv_not_configured' }
      );
    }

    const { searchParams } = new URL(req.url);
    userId = (searchParams.get('userId') || '').trim();
    if (!userId) {
      return NextResponse.json({ error: 'userId が必要です。' }, { status: 400 });
    }

    const record = await getServerUser(userId);
    if (!record) {
      return NextResponse.json(emptyEntitlements(userId), {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
        },
      });
    }

    const purchasedProperties = toClientPurchasedRecords(
      record.purchasedProperties.filter((p) => !String(p.propertyId).startsWith('pending:'))
    );

    return NextResponse.json({
      found: true,
      userId: record.userId,
      plan: record.plan,
      stripeCustomerId: record.stripeCustomerId || null,
      stripeSubscriptionId: record.stripeSubscriptionId || null,
      subscriptionStatus: record.subscriptionStatus || null,
      paymentFailedAt: record.paymentFailedAt || null,
      email: record.email || null,
      purchasedPropertyIds: record.purchasedPropertyIds,
      purchasedProperties,
      analysisHistory: toClientAnalysisHistory(record.analysisHistory),
      updatedAt: record.updatedAt,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      },
    });
  } catch (error: unknown) {
    const detail = serializeUnknownError(error);
    console.error('[entitlements] GET error:', detail, error);
    if (error instanceof KvNotConfiguredError) {
      return jsonServiceUnavailable('entitlements', error.message, detail);
    }
    return jsonServiceUnavailable(
      'entitlements',
      typeof detail.message === 'string' ? detail.message : '権利情報の取得に失敗しました。',
      detail
    );
  }
}

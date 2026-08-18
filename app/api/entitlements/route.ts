import { NextResponse } from 'next/server';
import {
  getServerUser,
  toClientAnalysisHistory,
  toClientPurchasedRecords,
} from '@/lib/entitlements';
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
 * - KV / Upstash Redis 必須（未設定時は 503）
 */
export async function GET(req: Request) {
  let userId = '';
  try {
    if (!isKvConfigured()) {
      return NextResponse.json(
        {
          error:
            '権利ストア（KV / Upstash Redis）が未設定です。KV_REST_API_* または UPSTASH_REDIS_REST_* を設定してください。',
        },
        { status: 503 }
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
    console.error('[entitlements] GET error:', error);
    if (error instanceof KvNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json(emptyEntitlements(userId || 'unknown'));
  }
}

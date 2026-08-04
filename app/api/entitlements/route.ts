import { NextResponse } from 'next/server';
import {
  getServerUser,
  toClientPurchasedRecords,
} from '@/lib/entitlements';

/** Edge では Node fs が使えないため、mkdir('/var/task/data') 系エラーを構造的に排除 */
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function emptyEntitlements(userId: string) {
  return {
    found: false as const,
    userId,
    plan: 'FREE' as const,
    stripeCustomerId: null,
    email: null,
    purchasedPropertyIds: [] as string[],
    purchasedProperties: [] as ReturnType<typeof toClientPurchasedRecords>,
  };
}

/**
 * 利用権限（Entitlements）取得 API
 * - ファイルシステム非依存（インメモリのみ）
 * - Vercel でも /data・./data・process.cwd() へは一切アクセスしない
 */
export async function GET(req: Request) {
  let userId = '';
  try {
    const { searchParams } = new URL(req.url);
    userId = (searchParams.get('userId') || '').trim();
    if (!userId) {
      return NextResponse.json({ error: 'userId が必要です。' }, { status: 400 });
    }

    const record = await getServerUser(userId);
    if (!record) {
      return NextResponse.json(emptyEntitlements(userId));
    }

    const purchasedProperties = toClientPurchasedRecords(
      record.purchasedProperties.filter((p) => !String(p.propertyId).startsWith('pending:'))
    );

    return NextResponse.json({
      found: true,
      userId: record.userId,
      plan: record.plan,
      stripeCustomerId: record.stripeCustomerId || null,
      email: record.email || null,
      purchasedPropertyIds: record.purchasedPropertyIds,
      purchasedProperties,
      updatedAt: record.updatedAt,
    });
  } catch (error: unknown) {
    console.error('[entitlements] GET error:', error);
    return NextResponse.json(emptyEntitlements(userId || 'unknown'));
  }
}

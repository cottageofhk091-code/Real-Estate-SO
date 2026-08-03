import { NextResponse } from 'next/server';
import { getServerUser, toClientPurchasedRecords } from '@/lib/server-user-store';

/** クライアント LocalStorage とサーバー権利情報を同期するための取得API */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId')?.trim() || '';
    if (!userId) {
      return NextResponse.json({ error: 'userId が必要です。' }, { status: 400 });
    }

    const record = await getServerUser(userId);
    if (!record) {
      return NextResponse.json({
        found: false,
        userId,
        plan: 'FREE',
        stripeCustomerId: null,
        purchasedPropertyIds: [],
        purchasedProperties: [],
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
      email: record.email || null,
      purchasedPropertyIds: record.purchasedPropertyIds,
      purchasedProperties,
      updatedAt: record.updatedAt,
    });
  } catch (error: unknown) {
    console.error('Entitlements GET error:', error);
    const message = error instanceof Error ? error.message : '権利情報の取得に失敗しました。';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getServerUser, toClientPurchasedRecords } from '@/lib/server-user-store';

function emptyEntitlements(userId: string) {
  return {
    found: false,
    userId,
    plan: 'FREE' as const,
    stripeCustomerId: null,
    purchasedPropertyIds: [] as string[],
    purchasedProperties: [] as unknown[],
  };
}

/** クライアント LocalStorage とサーバー権利情報を同期するための取得API */
export async function GET(req: Request) {
  let userId = '';
  try {
    const { searchParams } = new URL(req.url);
    userId = searchParams.get('userId')?.trim() || '';
    if (!userId) {
      return NextResponse.json({ error: 'userId が必要です。' }, { status: 400 });
    }

    // fs 不使用のインメモリストアのみ参照。失敗時はダミーを返す（Vercel で 500 にしない）
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
    console.error('Entitlements GET error:', error);
    // ファイルシステム起因のエラーでも画面を止めない
    return NextResponse.json(emptyEntitlements(userId || 'unknown'));
  }
}

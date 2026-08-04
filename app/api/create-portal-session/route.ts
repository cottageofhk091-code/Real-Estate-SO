import { NextResponse } from 'next/server';
import { getAppBaseUrl, getStripe } from '@/lib/stripe';
import { getServerUser } from '@/lib/entitlements';

type PortalBody = {
  userId?: string;
  stripeCustomerId?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PortalBody;
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    let customerId =
      typeof body.stripeCustomerId === 'string' ? body.stripeCustomerId.trim() : '';

    if (!customerId && userId) {
      const record = await getServerUser(userId);
      customerId = record?.stripeCustomerId || '';
    }

    if (!customerId) {
      return NextResponse.json(
        {
          error:
            'Stripe顧客IDが見つかりません。月額プランの決済完了後に契約管理をご利用ください。',
        },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const baseUrl = getAppBaseUrl(req);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/mypage`,
    });

    if (!session.url) {
      return NextResponse.json({ error: 'Portal URL の生成に失敗しました。' }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    console.error('Portal session error:', error);
    const message = error instanceof Error ? error.message : 'Portal Session の作成に失敗しました。';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

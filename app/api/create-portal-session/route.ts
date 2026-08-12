import { NextResponse } from 'next/server';
import { getAppBaseUrl, getStripe, isStripeSecretConfigured } from '@/lib/stripe';
import { getServerUser } from '@/lib/entitlements';
import { KvNotConfiguredError, isKvConfigured } from '@/lib/kv';

type PortalBody = {
  userId?: string;
  stripeCustomerId?: string;
};

export async function POST(req: Request) {
  try {
    if (!isStripeSecretConfigured()) {
      return NextResponse.json(
        { error: '決済機能の準備中です。しばらくしてから再度お試しください。' },
        { status: 503 }
      );
    }
    if (!isKvConfigured()) {
      return NextResponse.json(
        {
          error:
            '権利ストア（KV / Upstash Redis）が未設定です。KV_REST_API_* または UPSTASH_REDIS_REST_* を設定してください。',
        },
        { status: 503 }
      );
    }

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
    if (error instanceof KvNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : 'Portal Session の作成に失敗しました。';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

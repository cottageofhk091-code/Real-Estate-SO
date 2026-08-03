import { NextResponse } from 'next/server';
import { getAppBaseUrl, getStripe } from '@/lib/stripe';
import { getServerUser, upsertServerUser, type ServerPurchasedProperty } from '@/lib/server-user-store';

export type CheckoutPlanType = 'SINGLE' | 'MONTHLY';

type CheckoutBody = {
  planType?: CheckoutPlanType;
  propertyId?: string;
  userId?: string;
  email?: string | null;
  propertySnapshot?: ServerPurchasedProperty | null;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CheckoutBody;
    const planType = body.planType;
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const propertyId = typeof body.propertyId === 'string' ? body.propertyId.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';

    if (!userId) {
      return NextResponse.json({ error: 'userId が必要です。' }, { status: 400 });
    }
    if (planType !== 'SINGLE' && planType !== 'MONTHLY') {
      return NextResponse.json({ error: 'planType は SINGLE または MONTHLY です。' }, { status: 400 });
    }
    if (planType === 'SINGLE' && (!propertyId || propertyId === 'prop_empty')) {
      return NextResponse.json(
        { error: '単発プランでは有効な propertyId が必要です。' },
        { status: 400 }
      );
    }

    // 決済前にサーバー側ユーザーを確保（Webhookで参照）
    await upsertServerUser(userId, {
      email: email || null,
    });

    // 単発購入の物件スナップショットを pending として一時保存
    if (planType === 'SINGLE' && body.propertySnapshot) {
      const current = await getServerUser(userId);
      const pending = {
        ...body.propertySnapshot,
        propertyId,
      };
      const pendingList = (current?.purchasedProperties || []).filter(
        (p) => !String(p.propertyId).startsWith('pending:')
      );
      await upsertServerUser(userId, {
        purchasedProperties: [
          ...pendingList,
          { ...pending, propertyId: `pending:${propertyId}` },
        ],
      });
    }

    const stripe = getStripe();
    const baseUrl = getAppBaseUrl(req);
    const successUrl = `${baseUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/?checkout=cancel`;

    if (planType === 'SINGLE') {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'jpy',
              unit_amount: 500,
              product_data: {
                name: '物件セカンドオピニオン AI Pro（単発）',
                description: `1物件PRO診断買い切り（propertyId: ${propertyId}）`,
              },
            },
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: userId,
        customer_email: email || undefined,
        metadata: {
          userId,
          propertyId,
          planType: 'SINGLE',
        },
        payment_intent_data: {
          metadata: {
            userId,
            propertyId,
            planType: 'SINGLE',
          },
        },
      });

      if (!session.url) {
        return NextResponse.json({ error: 'Checkout URL の生成に失敗しました。' }, { status: 500 });
      }

      return NextResponse.json({ url: session.url, sessionId: session.id });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'jpy',
            unit_amount: 1980,
            recurring: { interval: 'month' },
            product_data: {
              name: '物件セカンドオピニオン AI Pro（月額）',
              description: '月額1,980円（税込）/ 全物件PRO機能解放',
            },
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      customer_email: email || undefined,
      metadata: {
        userId,
        planType: 'MONTHLY',
      },
      subscription_data: {
        metadata: {
          userId,
          planType: 'MONTHLY',
        },
      },
    });

    if (!session.url) {
      return NextResponse.json({ error: 'Checkout URL の生成に失敗しました。' }, { status: 500 });
    }

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (error: unknown) {
    console.error('Checkout API error:', error);
    const message = error instanceof Error ? error.message : 'Checkout Session の作成に失敗しました。';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

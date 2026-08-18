import { NextResponse } from 'next/server';
import {
  PRICE_MONTHLY_FIRST_YEN,
  PRICE_MONTHLY_YEN,
  buildSinglePriceDataLineItem,
  getAppBaseUrl,
  getStripe,
  isStripeSecretConfigured,
  resolveFirstMonthCouponId,
  resolveSingleCheckoutLineItem,
} from '@/lib/stripe';
import { KvNotConfiguredError, isKvConfigured } from '@/lib/kv';
import { getServerUser, upsertServerUser, type ServerPurchasedProperty } from '@/lib/entitlements';

export type CheckoutPlanType = 'SINGLE' | 'MONTHLY';

type CheckoutBody = {
  planType?: CheckoutPlanType;
  propertyId?: string;
  userId?: string;
  email?: string | null;
  propertySnapshot?: ServerPurchasedProperty | null;
};

const STRIPE_NOT_READY_MESSAGE =
  '決済機能の準備中です。しばらくしてから再度お試しください。';

const KV_NOT_READY_MESSAGE =
  '決済機能の準備中です（権利ストア未設定）。しばらくしてから再度お試しください。';

function isMissingStripePriceError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string; raw?: { code?: string } };
  const code = err.code || err.raw?.code;
  if (code === 'resource_missing') return true;
  const message = typeof err.message === 'string' ? err.message.toLowerCase() : '';
  return message.includes('no such price');
}

export async function POST(req: Request) {
  try {
    if (!isStripeSecretConfigured()) {
      return NextResponse.json({ error: STRIPE_NOT_READY_MESSAGE }, { status: 503 });
    }
    if (!isKvConfigured()) {
      console.error('[checkout] KV/Upstash Redis is not configured (fail-closed)');
      return NextResponse.json({ error: KV_NOT_READY_MESSAGE }, { status: 503 });
    }

    const body = (await req.json()) as CheckoutBody;
    const planType = body.planType;
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    let propertyId = typeof body.propertyId === 'string' ? body.propertyId.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';

    if (!userId) {
      return NextResponse.json({ error: 'userId が必要です。' }, { status: 400 });
    }
    if (planType !== 'SINGLE' && planType !== 'MONTHLY') {
      return NextResponse.json({ error: 'planType は SINGLE または MONTHLY です。' }, { status: 400 });
    }
    if (planType === 'SINGLE' && (!propertyId || propertyId === 'prop_empty')) {
      // 物件テキスト未入力でも購入可能。サーバー側で仮 ID を発行する。
      propertyId = `prop_pending_${userId.slice(-8)}_${Date.now().toString(36)}`;
    }

    await upsertServerUser(userId, {
      email: email || null,
    });

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
      const lineItem = await resolveSingleCheckoutLineItem(stripe, propertyId);
      const sessionParams = {
        mode: 'payment' as const,
        payment_method_types: ['card' as const],
        line_items: [lineItem],
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
      };

      let session;
      try {
        session = await stripe.checkout.sessions.create(sessionParams);
      } catch (error: unknown) {
        // Price ID が途中で無効化された場合など、price_data で再試行
        if ('price' in lineItem && isMissingStripePriceError(error)) {
          console.warn(
            '[checkout] single price id failed at session.create; retrying with price_data'
          );
          session = await stripe.checkout.sessions.create({
            ...sessionParams,
            line_items: [buildSinglePriceDataLineItem(propertyId)],
          });
        } else {
          throw error;
        }
      }

      if (!session.url) {
        return NextResponse.json({ error: 'Checkout URL の生成に失敗しました。' }, { status: 500 });
      }

      return NextResponse.json({ url: session.url, sessionId: session.id });
    }

    // 月額は常に lib/pricing の PRICE_MONTHLY_YEN で price_data を生成（固定 Price ID / クライアント金額は参照しない）
    const firstMonthCouponId = await resolveFirstMonthCouponId(stripe);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'jpy',
            unit_amount: PRICE_MONTHLY_YEN,
            recurring: { interval: 'month' },
            product_data: {
              name: '不動産セカンドオピニオンAI（月額）',
              description: `月額${PRICE_MONTHLY_YEN.toLocaleString('ja-JP')}円（税込）/ 初月${PRICE_MONTHLY_FIRST_YEN}円 / 全物件Pro詳細分析が使い放題`,
            },
          },
        },
      ],
      discounts: [{ coupon: firstMonthCouponId }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId,
      customer_email: email || undefined,
      metadata: {
        userId,
        planType: 'MONTHLY',
        firstMonthCouponId,
        unitAmountYen: String(PRICE_MONTHLY_YEN),
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
    if (error instanceof KvNotConfiguredError) {
      return NextResponse.json({ error: KV_NOT_READY_MESSAGE }, { status: 503 });
    }
    const raw = error instanceof Error ? error.message : '';
    if (raw.includes('STRIPE_SECRET_KEY')) {
      return NextResponse.json({ error: STRIPE_NOT_READY_MESSAGE }, { status: 503 });
    }
    const message = raw || 'Checkout Session の作成に失敗しました。';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

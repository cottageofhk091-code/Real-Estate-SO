import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, isStripeSecretConfigured } from '@/lib/stripe';
import { KvNotConfiguredError, isKvConfigured } from '@/lib/kv';
import {
  addPurchasedPropertyToServerUser,
  getServerUser,
  setMonthlyPlan,
  toClientPurchasedRecords,
  upsertServerUser,
} from '@/lib/entitlements';

/**
 * Checkout 成功後のフォールバック確認。
 * Webhook 未到達時でも session を Stripe から取得して権利を適用する。
 */
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

    const body = (await req.json()) as { sessionId?: string; userId?: string };
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const requestUserId = typeof body.userId === 'string' ? body.userId.trim() : '';

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId が必要です。' }, { status: 400 });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return NextResponse.json(
        {
          error: '決済が完了していません。',
          status: session.status,
          payment_status: session.payment_status,
        },
        { status: 402 }
      );
    }

    const metadata = session.metadata || {};
    const userId = metadata.userId || session.client_reference_id || requestUserId;
    if (!userId) {
      return NextResponse.json({ error: 'userId を特定できません。' }, { status: 400 });
    }
    if (requestUserId && requestUserId !== userId) {
      return NextResponse.json({ error: 'セッションとユーザーが一致しません。' }, { status: 403 });
    }

    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : session.customer && typeof session.customer === 'object'
          ? (session.customer as Stripe.Customer).id
          : null;
    const email = session.customer_details?.email || session.customer_email || null;
    const planType = metadata.planType;

    if (planType === 'SINGLE') {
      const propertyId = metadata.propertyId || '';
      if (propertyId) {
        const existing = await getServerUser(userId);
        const pending = existing?.purchasedProperties.find(
          (p) => p.propertyId === `pending:${propertyId}` || p.propertyId === propertyId
        );
        await addPurchasedPropertyToServerUser(userId, {
          propertyId,
          title: pending?.title,
          locationOrUrl: pending?.locationOrUrl,
          householdType: pending?.householdType,
          propertyType: pending?.propertyType,
          sourceText: pending?.sourceText,
          purchasedAt: new Date().toISOString(),
        });
        const after = await getServerUser(userId);
        if (after) {
          await upsertServerUser(userId, {
            purchasedProperties: after.purchasedProperties.filter(
              (p) => p.propertyId !== `pending:${propertyId}`
            ),
            stripeCustomerId: customerId || after.stripeCustomerId,
            email,
          });
        }
      }
    } else if (planType === 'MONTHLY') {
      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription && typeof session.subscription === 'object'
            ? session.subscription.id
            : null;
      await setMonthlyPlan(userId, customerId, email, {
        stripeSubscriptionId: subscriptionId,
        subscriptionStatus: 'active',
      });
    }

    const record = await getServerUser(userId);
    return NextResponse.json({
      ok: true,
      planType,
      userId,
      plan: record?.plan || 'FREE',
      stripeCustomerId: record?.stripeCustomerId || null,
      purchasedProperties: toClientPurchasedRecords(
        (record?.purchasedProperties || []).filter(
          (p) => !String(p.propertyId).startsWith('pending:')
        )
      ),
    });
  } catch (error: unknown) {
    console.error('Checkout confirm error:', error);
    if (error instanceof KvNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : '決済確認に失敗しました。';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

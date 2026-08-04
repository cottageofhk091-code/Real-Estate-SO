import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, getStripeWebhookSecret } from '@/lib/stripe';
import {
  addPurchasedPropertyToServerUser,
  getServerUser,
  setFreePlanByCustomerId,
  setFreePlanByUserId,
  setMonthlyPlan,
  upsertServerUser,
} from '@/lib/entitlements';

export const runtime = 'nodejs';

async function applyCheckoutCompleted(session: Stripe.Checkout.Session) {
  const metadata = session.metadata || {};
  const userId = metadata.userId || session.client_reference_id || '';
  const planType = metadata.planType;
  const customerId =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer && typeof session.customer === 'object'
        ? session.customer.id
        : null;
  const email =
    session.customer_details?.email ||
    session.customer_email ||
    null;

  if (!userId) {
    console.warn('checkout.session.completed: userId missing', session.id);
    return;
  }

  await upsertServerUser(userId, { email });

  if (planType === 'SINGLE') {
    const propertyId = metadata.propertyId || '';
    if (!propertyId) {
      console.warn('checkout.session.completed SINGLE: propertyId missing', session.id);
      return;
    }

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
    return;
  }

  if (planType === 'MONTHLY') {
    await setMonthlyPlan(userId, customerId, email);
  }
}

async function applySubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId || '';
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;

  if (userId) {
    await setFreePlanByUserId(userId);
    return;
  }
  if (customerId) {
    await setFreePlanByCustomerId(customerId);
  }
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const webhookSecret = getStripeWebhookSecret();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid signature';
    console.error('Webhook signature verification failed:', message);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        await applyCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      }
      case 'customer.subscription.deleted': {
        await applySubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    console.error('Webhook handler error:', error);
    const message = error instanceof Error ? error.message : 'Webhook handler failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

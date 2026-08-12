import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe";
import { KvNotConfiguredError, isKvConfigured } from "@/lib/kv";
import {
  addPurchasedPropertyToServerUser,
  applySubscriptionStatus,
  getServerUser,
  markPaymentFailedByCustomerId,
  setFreePlanByCustomerId,
  setFreePlanByUserId,
  setMonthlyPlan,
  upsertServerUser,
} from "@/lib/entitlements";

export const runtime = "nodejs";

function customerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  if ("deleted" in customer && customer.deleted) return null;
  return customer.id;
}

async function applyCheckoutCompleted(session: Stripe.Checkout.Session) {
  const metadata = session.metadata || {};
  const userId = metadata.userId || session.client_reference_id || "";
  const planType = metadata.planType;
  const customerId = customerIdOf(session.customer);
  const email =
    session.customer_details?.email ||
    session.customer_email ||
    null;

  if (!userId) {
    console.warn("checkout.session.completed: userId missing", session.id);
    return;
  }

  await upsertServerUser(userId, { email });

  if (planType === "SINGLE") {
    const propertyId = metadata.propertyId || "";
    if (!propertyId) {
      console.warn("checkout.session.completed SINGLE: propertyId missing", session.id);
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

  if (planType === "MONTHLY") {
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id || null;
    await setMonthlyPlan(userId, customerId, email, {
      stripeSubscriptionId: subscriptionId,
      subscriptionStatus: "active",
    });
  }
}

async function applySubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId || "";
  const customerId = customerIdOf(subscription.customer);

  if (userId) {
    await setFreePlanByUserId(userId);
    return;
  }
  if (customerId) {
    await setFreePlanByCustomerId(customerId);
  }
}

async function applySubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = customerIdOf(subscription.customer);
  if (!customerId) {
    console.warn("customer.subscription.updated: customer missing", subscription.id);
    return;
  }
  await applySubscriptionStatus(
    customerId,
    subscription.status,
    subscription.id,
    subscription.metadata?.userId || null
  );
}

async function applyInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = customerIdOf(invoice.customer);
  if (!customerId) {
    console.warn("invoice.payment_failed: customer missing", invoice.id);
    return;
  }

  const parentSub = invoice.parent?.subscription_details?.subscription;
  const subscriptionId =
    typeof parentSub === "string"
      ? parentSub
      : parentSub && typeof parentSub === "object"
        ? parentSub.id
        : null;

  await markPaymentFailedByCustomerId(customerId, subscriptionId);
}

export async function POST(req: Request) {
  if (!isKvConfigured()) {
    console.error("[webhook/stripe] KV/Upstash Redis is not configured (fail-closed)");
    return NextResponse.json(
      {
        error:
          "権利ストア（KV / Upstash Redis）が未設定です。KV_REST_API_* または UPSTASH_REDIS_REST_* を設定してください。",
      },
      { status: 503 }
    );
  }

  const stripe = getStripe();
  const webhookSecret = getStripeWebhookSecret();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error("Webhook signature verification failed:", message);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        await applyCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      }
      case "customer.subscription.deleted": {
        await applySubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      }
      case "customer.subscription.updated": {
        await applySubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      }
      case "invoice.payment_failed": {
        await applyInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    console.error("Webhook handler error:", error);
    if (error instanceof KvNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "Webhook handler failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

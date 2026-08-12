import Stripe from 'stripe';
import {
  PRICE_MONTHLY_FIRST_DISCOUNT_YEN,
  PRICE_MONTHLY_FIRST_YEN,
  PRICE_MONTHLY_YEN,
  PRICE_SINGLE_YEN,
} from '@/lib/pricing';

export {
  PRICE_MONTHLY_FIRST_DISCOUNT_YEN,
  PRICE_MONTHLY_FIRST_YEN,
  PRICE_MONTHLY_YEN,
  PRICE_SINGLE_YEN,
} from '@/lib/pricing';

let stripeClient: Stripe | null = null;
const FIRST_MONTH_COUPON_FALLBACK_ID = 'bukken_first_month_480_off';

export function isStripeSecretConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function getStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY が設定されていません。');
  }
  return key;
}

export function getStripePublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    throw new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY が設定されていません。');
  }
  return key;
}

export function getStripeWebhookSecret(): string {
  const key = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key) {
    throw new Error('STRIPE_WEBHOOK_SECRET が設定されていません。');
  }
  return key;
}

export function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(getStripeSecretKey());
  }
  return stripeClient;
}

export function getAppBaseUrl(req?: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');

  if (req) {
    const origin = req.headers.get('origin');
    if (origin) return origin.replace(/\/$/, '');
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    const proto = req.headers.get('x-forwarded-proto') || 'http';
    if (host) return `${proto}://${host}`.replace(/\/$/, '');
  }

  return 'http://localhost:3000';
}

/** 単発プランの固定 Price ID（未設定時は null → Checkout で price_data フォールバック） */
export function getStripePriceIdSingle(): string | null {
  const id = process.env.STRIPE_PRICE_ID_SINGLE?.trim();
  return id || null;
}

/** 月額プランの固定 Price ID（未設定時は null → Checkout で price_data フォールバック） */
export function getStripePriceIdMonthly(): string | null {
  const id = process.env.STRIPE_PRICE_ID_MONTHLY?.trim();
  return id || null;
}

/** 初月割引クーポン ID（任意） */
export function getStripeFirstMonthCouponId(): string | null {
  const id = process.env.STRIPE_FIRST_MONTH_COUPON_ID?.trim();
  return id || null;
}

export type CheckoutLineItem =
  | { quantity: number; price: string }
  | {
      quantity: number;
      price_data: {
        currency: string;
        unit_amount: number;
        product_data: { name: string; description?: string };
        recurring?: { interval: 'month' | 'year' };
      };
    };

/** 単発500円の price_data ラインアイテムを生成 */
export function buildSinglePriceDataLineItem(propertyId: string): CheckoutLineItem {
  return {
    quantity: 1,
    price_data: {
      currency: 'jpy',
      unit_amount: PRICE_SINGLE_YEN,
      product_data: {
        name: '不動産セカンドオピニオンAI（単発）',
        description: `1物件PRO診断買い切り（税込${PRICE_SINGLE_YEN}円 / propertyId: ${propertyId}）`,
      },
    },
  };
}

/**
 * 単発 Checkout 用ラインアイテム。
 * STRIPE_PRICE_ID_SINGLE が有効ならそれを使い、未設定・不存在・無効時は price_data(500円) へフォールバック。
 */
export async function resolveSingleCheckoutLineItem(
  stripe: Stripe,
  propertyId: string
): Promise<CheckoutLineItem> {
  const fallback = buildSinglePriceDataLineItem(propertyId);
  const priceId = getStripePriceIdSingle();
  if (!priceId) {
    return fallback;
  }

  try {
    const price = await stripe.prices.retrieve(priceId);
    if (price.deleted) {
      console.warn(
        `[checkout] STRIPE_PRICE_ID_SINGLE=${priceId} is deleted; falling back to price_data`
      );
      return fallback;
    }
    if (!price.active) {
      console.warn(
        `[checkout] STRIPE_PRICE_ID_SINGLE=${priceId} is inactive; falling back to price_data`
      );
      return fallback;
    }
    // 単発は one_time のみ許可（誤って月額 Price を指定した場合もフォールバック）
    if (price.type === 'recurring') {
      console.warn(
        `[checkout] STRIPE_PRICE_ID_SINGLE=${priceId} is recurring; falling back to price_data`
      );
      return fallback;
    }
    return { quantity: 1, price: price.id };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[checkout] STRIPE_PRICE_ID_SINGLE=${priceId} retrieve failed (${message}); falling back to price_data`
    );
    return fallback;
  }
}

/**
 * 初月のみ値引き（PRICE_MONTHLY_YEN → PRICE_MONTHLY_FIRST_YEN）になるクーポン ID を返す。
 * 環境変数があればそれを使い、なければ Stripe 上にフォールバッククーポンを確保する。
 */
export async function resolveFirstMonthCouponId(stripe: Stripe): Promise<string> {
  const fromEnv = getStripeFirstMonthCouponId();
  if (fromEnv) return fromEnv;

  try {
    const existing = await stripe.coupons.retrieve(FIRST_MONTH_COUPON_FALLBACK_ID);
    if (existing && !('deleted' in existing && existing.deleted)) {
      return existing.id;
    }
  } catch {
    // create below
  }

  const created = await stripe.coupons.create({
    id: FIRST_MONTH_COUPON_FALLBACK_ID,
    name: '初月割引（500円）',
    amount_off: PRICE_MONTHLY_FIRST_DISCOUNT_YEN,
    currency: 'jpy',
    duration: 'once',
  });
  return created.id;
}

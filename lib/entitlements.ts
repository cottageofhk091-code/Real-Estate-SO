import type { HouseholdType, PropertyType, PurchasedPropertyRecord, UserPlan } from '@/lib/plan';
import { isKvConfigured, requireRedis } from '@/lib/kv';

/**
 * Entitlements（利用権限）ストア
 * - Vercel KV / Upstash Redis に永続化（必須）
 * - KV 未設定時は fail-closed（インメモリへフォールバックしない）
 */

export type ServerPurchasedProperty = {
  propertyId: string;
  title?: string;
  locationOrUrl?: string;
  purchasedAt?: string;
  householdType?: HouseholdType;
  propertyType?: PropertyType;
  sourceText?: string;
};

export type ServerUserRecord = {
  userId: string;
  email?: string | null;
  plan: UserPlan;
  stripeCustomerId?: string | null;
  /** Stripe Subscription ID（sub_...） */
  stripeSubscriptionId?: string | null;
  /** active / past_due / canceled 等 */
  subscriptionStatus?: string | null;
  /** 直近の支払い失敗日時（ISO） */
  paymentFailedAt?: string | null;
  purchasedPropertyIds: string[];
  purchasedProperties: ServerPurchasedProperty[];
  updatedAt: string;
};

const USER_KEY_PREFIX = 'bukken:ent:user:';
const CUSTOMER_KEY_PREFIX = 'bukken:ent:cus:';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createDefaultRecord(userId: string): ServerUserRecord {
  return {
    userId,
    email: null,
    plan: 'FREE',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: null,
    paymentFailedAt: null,
    purchasedPropertyIds: [],
    purchasedProperties: [],
    updatedAt: new Date().toISOString(),
  };
}

function userKey(userId: string) {
  return `${USER_KEY_PREFIX}${userId}`;
}

function customerKey(customerId: string) {
  return `${CUSTOMER_KEY_PREFIX}${customerId}`;
}

function normalizeRecord(
  userId: string,
  raw: Partial<ServerUserRecord> | null | undefined
): ServerUserRecord {
  const base = createDefaultRecord(userId);
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    userId,
    plan: raw.plan === 'MONTHLY' ? 'MONTHLY' : 'FREE',
    purchasedPropertyIds: Array.isArray(raw.purchasedPropertyIds)
      ? raw.purchasedPropertyIds
      : base.purchasedPropertyIds,
    purchasedProperties: Array.isArray(raw.purchasedProperties)
      ? raw.purchasedProperties
      : base.purchasedProperties,
  };
}

async function readUser(userId: string): Promise<ServerUserRecord | null> {
  if (!userId) return null;
  const redis = requireRedis();
  const raw = await redis.get<ServerUserRecord>(userKey(userId));
  return raw ? clone(normalizeRecord(userId, raw)) : null;
}

async function writeUser(
  record: ServerUserRecord,
  previousCustomerId?: string | null
): Promise<ServerUserRecord> {
  const next = clone({
    ...normalizeRecord(record.userId, record),
    updatedAt: new Date().toISOString(),
  });

  const redis = requireRedis();
  const pipeline = redis.pipeline();
  pipeline.set(userKey(next.userId), next);

  const prev = previousCustomerId?.trim() || '';
  const curr = next.stripeCustomerId?.trim() || '';
  if (prev && prev !== curr) {
    pipeline.del(customerKey(prev));
  }
  if (curr) {
    pipeline.set(customerKey(curr), next.userId);
  }
  await pipeline.exec();
  return clone(next);
}

export async function getServerUser(userId: string): Promise<ServerUserRecord | null> {
  return readUser(userId);
}

export async function upsertServerUser(
  userId: string,
  patch: Partial<Omit<ServerUserRecord, 'userId' | 'updatedAt'>>
): Promise<ServerUserRecord> {
  const current = (await readUser(userId)) || createDefaultRecord(userId);
  const previousCustomerId = current.stripeCustomerId;
  const next: ServerUserRecord = {
    ...current,
    ...patch,
    userId,
    purchasedPropertyIds: patch.purchasedPropertyIds ?? current.purchasedPropertyIds,
    purchasedProperties: patch.purchasedProperties ?? current.purchasedProperties,
    updatedAt: new Date().toISOString(),
  };
  return writeUser(next, previousCustomerId);
}

export async function findServerUserByCustomerId(
  stripeCustomerId: string
): Promise<ServerUserRecord | null> {
  if (!stripeCustomerId) return null;

  const redis = requireRedis();
  const userId = await redis.get<string>(customerKey(stripeCustomerId));
  if (typeof userId === 'string' && userId) {
    return readUser(userId);
  }
  return null;
}

export async function addPurchasedPropertyToServerUser(
  userId: string,
  property: ServerPurchasedProperty
): Promise<ServerUserRecord> {
  const current = (await readUser(userId)) || createDefaultRecord(userId);
  const propertyId = property.propertyId;
  const purchasedPropertyIds = current.purchasedPropertyIds.includes(propertyId)
    ? current.purchasedPropertyIds
    : [...current.purchasedPropertyIds, propertyId];

  const without = current.purchasedProperties.filter((p) => p.propertyId !== propertyId);
  const purchasedProperties = [
    ...without,
    {
      ...property,
      propertyId,
      purchasedAt: property.purchasedAt || new Date().toISOString(),
    },
  ];

  return writeUser(
    {
      ...current,
      purchasedPropertyIds,
      purchasedProperties,
      updatedAt: new Date().toISOString(),
    },
    current.stripeCustomerId
  );
}

export async function setMonthlyPlan(
  userId: string,
  stripeCustomerId: string | null | undefined,
  email?: string | null,
  extras?: {
    stripeSubscriptionId?: string | null;
    subscriptionStatus?: string | null;
  }
): Promise<ServerUserRecord> {
  return upsertServerUser(userId, {
    plan: 'MONTHLY',
    stripeCustomerId: stripeCustomerId || null,
    email: email ?? undefined,
    stripeSubscriptionId: extras?.stripeSubscriptionId ?? undefined,
    subscriptionStatus: extras?.subscriptionStatus ?? 'active',
    paymentFailedAt: null,
  });
}

export async function setFreePlanByUserId(userId: string): Promise<ServerUserRecord | null> {
  const current = await getServerUser(userId);
  if (!current) return null;
  return upsertServerUser(userId, {
    plan: 'FREE',
    subscriptionStatus: 'canceled',
    stripeSubscriptionId: null,
    paymentFailedAt: null,
  });
}

export async function setFreePlanByCustomerId(
  stripeCustomerId: string
): Promise<ServerUserRecord | null> {
  const current = await findServerUserByCustomerId(stripeCustomerId);
  if (!current) return null;
  return upsertServerUser(current.userId, {
    plan: 'FREE',
    subscriptionStatus: 'canceled',
    stripeSubscriptionId: null,
    paymentFailedAt: null,
  });
}

/** 支払い失敗時: 猶予として MONTHLY は維持し、失敗フラグを立てる */
export async function markPaymentFailedByCustomerId(
  stripeCustomerId: string,
  subscriptionId?: string | null
): Promise<ServerUserRecord | null> {
  const current = await findServerUserByCustomerId(stripeCustomerId);
  if (!current) return null;
  return upsertServerUser(current.userId, {
    paymentFailedAt: new Date().toISOString(),
    subscriptionStatus: 'past_due',
    stripeSubscriptionId: subscriptionId ?? current.stripeSubscriptionId,
  });
}

export async function applySubscriptionStatus(
  stripeCustomerId: string,
  status: string,
  subscriptionId?: string | null,
  userIdFromMeta?: string | null
): Promise<ServerUserRecord | null> {
  let current =
    (userIdFromMeta ? await getServerUser(userIdFromMeta) : null) ||
    (await findServerUserByCustomerId(stripeCustomerId));

  if (!current && userIdFromMeta) {
    current = await upsertServerUser(userIdFromMeta, {
      stripeCustomerId,
      stripeSubscriptionId: subscriptionId || null,
    });
  }
  if (!current) return null;

  const normalized = status.toLowerCase();
  const activeLike = normalized === 'active' || normalized === 'trialing';
  const failedLike = normalized === 'past_due';
  const endedLike =
    normalized === 'canceled' ||
    normalized === 'unpaid' ||
    normalized === 'incomplete_expired' ||
    normalized === 'paused';

  if (activeLike) {
    return upsertServerUser(current.userId, {
      plan: 'MONTHLY',
      stripeCustomerId,
      stripeSubscriptionId: subscriptionId ?? current.stripeSubscriptionId,
      subscriptionStatus: normalized,
      paymentFailedAt: null,
    });
  }

  if (failedLike) {
    return upsertServerUser(current.userId, {
      plan: 'MONTHLY',
      stripeCustomerId,
      stripeSubscriptionId: subscriptionId ?? current.stripeSubscriptionId,
      subscriptionStatus: normalized,
      paymentFailedAt: new Date().toISOString(),
    });
  }

  if (endedLike) {
    return upsertServerUser(current.userId, {
      plan: 'FREE',
      stripeCustomerId,
      stripeSubscriptionId: subscriptionId ?? current.stripeSubscriptionId,
      subscriptionStatus: normalized,
    });
  }

  return upsertServerUser(current.userId, {
    stripeCustomerId,
    stripeSubscriptionId: subscriptionId ?? current.stripeSubscriptionId,
    subscriptionStatus: normalized,
  });
}

export function toClientPurchasedRecords(
  serverProps: ServerPurchasedProperty[]
): PurchasedPropertyRecord[] {
  return serverProps
    .filter((p) => !!p.propertyId)
    .map((p) => ({
      propertyId: p.propertyId,
      title: p.title || `購入済み物件（${p.propertyId.slice(0, 12)}）`,
      locationOrUrl: p.locationOrUrl || '住所/URL未設定',
      purchasedAt: p.purchasedAt || new Date().toISOString(),
      householdType: p.householdType === 'family' ? 'family' : 'single',
      propertyType: p.propertyType === 'purchase' ? 'purchase' : 'rental',
      sourceText: p.sourceText,
      cachedResult: null,
    }));
}

export { isKvConfigured };

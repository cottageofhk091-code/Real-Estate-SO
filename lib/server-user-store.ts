import type { HouseholdType, PropertyType, PurchasedPropertyRecord, UserPlan } from '@/lib/plan';

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
  purchasedPropertyIds: string[];
  purchasedProperties: ServerPurchasedProperty[];
  updatedAt: string;
};

type StoreFile = {
  users: Record<string, ServerUserRecord>;
};

/**
 * Vercel（/var/task）は読み取り専用のため、fs / mkdir / ./data は一切使わない。
 * 権利情報はプロセスメモリのみで保持する（コールドスタートで揮発）。
 */
const memoryStore: StoreFile = { users: {} };

function cloneStore(store: StoreFile): StoreFile {
  return JSON.parse(JSON.stringify(store)) as StoreFile;
}

function readStore(): StoreFile {
  return cloneStore(memoryStore);
}

function writeStore(store: StoreFile): void {
  memoryStore.users = cloneStore(store).users;
}

function createDefaultRecord(userId: string): ServerUserRecord {
  return {
    userId,
    email: null,
    plan: 'FREE',
    stripeCustomerId: null,
    purchasedPropertyIds: [],
    purchasedProperties: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function getServerUser(userId: string): Promise<ServerUserRecord | null> {
  if (!userId) return null;
  const store = readStore();
  return store.users[userId] || null;
}

export async function upsertServerUser(
  userId: string,
  patch: Partial<Omit<ServerUserRecord, 'userId' | 'updatedAt'>>
): Promise<ServerUserRecord> {
  const store = readStore();
  const current = store.users[userId] || createDefaultRecord(userId);
  const next: ServerUserRecord = {
    ...current,
    ...patch,
    userId,
    purchasedPropertyIds: patch.purchasedPropertyIds ?? current.purchasedPropertyIds,
    purchasedProperties: patch.purchasedProperties ?? current.purchasedProperties,
    updatedAt: new Date().toISOString(),
  };
  store.users[userId] = next;
  writeStore(store);
  return next;
}

export async function findServerUserByCustomerId(
  stripeCustomerId: string
): Promise<ServerUserRecord | null> {
  if (!stripeCustomerId) return null;
  const store = readStore();
  return (
    Object.values(store.users).find((u) => u.stripeCustomerId === stripeCustomerId) || null
  );
}

export async function addPurchasedPropertyToServerUser(
  userId: string,
  property: ServerPurchasedProperty
): Promise<ServerUserRecord> {
  const store = readStore();
  const current = store.users[userId] || createDefaultRecord(userId);
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

  const next: ServerUserRecord = {
    ...current,
    purchasedPropertyIds,
    purchasedProperties,
    updatedAt: new Date().toISOString(),
  };
  store.users[userId] = next;
  writeStore(store);
  return next;
}

export async function setMonthlyPlan(
  userId: string,
  stripeCustomerId: string | null | undefined,
  email?: string | null
): Promise<ServerUserRecord> {
  return upsertServerUser(userId, {
    plan: 'MONTHLY',
    stripeCustomerId: stripeCustomerId || null,
    email: email ?? undefined,
  });
}

export async function setFreePlanByUserId(userId: string): Promise<ServerUserRecord | null> {
  const current = await getServerUser(userId);
  if (!current) return null;
  return upsertServerUser(userId, { plan: 'FREE' });
}

export async function setFreePlanByCustomerId(
  stripeCustomerId: string
): Promise<ServerUserRecord | null> {
  const current = await findServerUserByCustomerId(stripeCustomerId);
  if (!current) return null;
  return upsertServerUser(current.userId, { plan: 'FREE' });
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

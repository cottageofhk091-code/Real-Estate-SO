import { promises as fs } from 'fs';
import path from 'path';
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
 * Vercel / Lambda / 本番ではプロジェクトルート（例: /var/task）が読み取り専用。
 * cwd 配下の data/ へは絶対に書かない。
 */
function useEphemeralFs(): boolean {
  if (process.env.VERCEL) return true;
  if (process.env.VERCEL_ENV) return true;
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return true;
  if (process.env.NODE_ENV === 'production') return true;
  try {
    const cwd = process.cwd();
    if (cwd.startsWith('/var/task') || cwd.startsWith('/vercel')) return true;
  } catch {
    return true;
  }
  return false;
}

/** 書き込み先は /tmp のみ（ローカル開発時のみプロジェクト配下） */
function getStorePaths(): { dir: string; file: string } | null {
  if (useEphemeralFs()) {
    return { dir: '/tmp/bukken-ai-data', file: '/tmp/bukken-ai-data/stripe-users.json' };
  }
  try {
    const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), 'data');
    return { dir, file: path.join(dir, 'stripe-users.json') };
  } catch {
    return { dir: '/tmp/bukken-ai-data', file: '/tmp/bukken-ai-data/stripe-users.json' };
  }
}

/** 同一インスタンス内の正本（Serverless ではこれが主ストレージ） */
let memoryStore: StoreFile = { users: {} };
let memoryHydrated = false;

function emptyStore(): StoreFile {
  return { users: {} };
}

function cloneStore(store: StoreFile): StoreFile {
  return JSON.parse(JSON.stringify(store)) as StoreFile;
}

async function tryReadFromDisk(): Promise<StoreFile | null> {
  const paths = getStorePaths();
  if (!paths) return null;
  try {
    const raw = await fs.readFile(paths.file, 'utf8');
    const parsed = JSON.parse(raw) as StoreFile;
    if (!parsed || typeof parsed !== 'object' || !parsed.users) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function tryWriteToDisk(store: StoreFile): Promise<void> {
  const paths = getStorePaths();
  if (!paths) return;
  try {
    await fs.mkdir(paths.dir, { recursive: true });
    await fs.writeFile(paths.file, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    // 読み取り専用FS・ENOENT 等でも絶対に throw しない
    console.warn('[server-user-store] disk write skipped:', err);
  }
}

async function readStore(): Promise<StoreFile> {
  if (!memoryHydrated) {
    const fromDisk = await tryReadFromDisk();
    if (fromDisk) {
      memoryStore = fromDisk;
    }
    memoryHydrated = true;
  }
  return cloneStore(memoryStore);
}

async function writeStore(store: StoreFile): Promise<void> {
  memoryStore = cloneStore(store);
  memoryHydrated = true;
  // best-effort のみ。失敗してもメモリ上の権利情報は保持
  await tryWriteToDisk(store);
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
  const store = await readStore();
  return store.users[userId] || null;
}

export async function upsertServerUser(
  userId: string,
  patch: Partial<Omit<ServerUserRecord, 'userId' | 'updatedAt'>>
): Promise<ServerUserRecord> {
  const store = await readStore();
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
  await writeStore(store);
  return next;
}

export async function findServerUserByCustomerId(
  stripeCustomerId: string
): Promise<ServerUserRecord | null> {
  if (!stripeCustomerId) return null;
  const store = await readStore();
  return (
    Object.values(store.users).find((u) => u.stripeCustomerId === stripeCustomerId) || null
  );
}

export async function addPurchasedPropertyToServerUser(
  userId: string,
  property: ServerPurchasedProperty
): Promise<ServerUserRecord> {
  const store = await readStore();
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
  await writeStore(store);
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

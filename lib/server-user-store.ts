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

/** Vercel / Lambda はプロジェクトルートが読み取り専用 */
function isServerlessRuntime(): boolean {
  return !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function getStorePaths(): { dir: string; file: string } {
  if (isServerlessRuntime()) {
    // Vercel / Lambda では書き込み可能な /tmp のみ使用
    const dir = '/tmp/data';
    return { dir, file: '/tmp/data/stripe-users.json' };
  }
  // ローカル開発: プロジェクト配下 data/（NFT トレース除外）
  const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), 'data');
  return { dir, file: path.join(dir, 'stripe-users.json') };
}

/** 同一インスタンス内のフォールバック（fs失敗時・コールドスタート間は揮発） */
let memoryStore: StoreFile | null = null;

function emptyStore(): StoreFile {
  return { users: {} };
}

function cloneStore(store: StoreFile): StoreFile {
  return JSON.parse(JSON.stringify(store)) as StoreFile;
}

async function ensureStore(): Promise<void> {
  const { dir, file } = getStorePaths();
  try {
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.access(file);
    } catch {
      await fs.writeFile(file, JSON.stringify(emptyStore(), null, 2), 'utf8');
    }
  } catch (err) {
    console.warn('[server-user-store] ensureStore failed; using in-memory fallback:', err);
    if (!memoryStore) memoryStore = emptyStore();
  }
}

async function readStore(): Promise<StoreFile> {
  if (memoryStore) {
    // メモリ優先（同一インスタンスでの一貫性）
    // /tmp からも読み込み、より新しい方を採用したいが簡易実装ではメモリを優先
    return cloneStore(memoryStore);
  }

  await ensureStore();
  const { file } = getStorePaths();
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as StoreFile;
    if (!parsed || typeof parsed !== 'object' || !parsed.users) {
      memoryStore = emptyStore();
      return cloneStore(memoryStore);
    }
    memoryStore = parsed;
    return cloneStore(parsed);
  } catch {
    if (!memoryStore) memoryStore = emptyStore();
    return cloneStore(memoryStore);
  }
}

async function writeStore(store: StoreFile): Promise<void> {
  memoryStore = cloneStore(store);

  const { dir, file } = getStorePaths();
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    // Vercel で書き込み不能でも API は落とさない（メモリで継続）
    console.warn('[server-user-store] writeStore failed; kept in-memory only:', err);
  }
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

import {
  normalizeAnalysisHistoryList,
  type AnalysisHistoryRecord,
  type AnalysisHistorySourcePlan,
} from '@/lib/analysis-history';

export type UserPlan = 'FREE' | 'MONTHLY';
export type PropertyType = 'rental' | 'purchase';
export type HouseholdType = 'single' | 'family';

export type PurchasedPropertyRecord = {
  propertyId: string;
  title: string;
  locationOrUrl: string;
  purchasedAt: string;
  householdType: HouseholdType;
  propertyType: PropertyType;
  sourceText?: string;
  /** 購入時点の診断結果（あればマイページから復元） */
  cachedResult?: AnalysisSnapshot | null;
};

export type AnalysisSnapshot = {
  score: number;
  summary: string;
  pros: string[];
  cons: string[];
  details: {
    priceEvaluation: string;
    locationEvaluation: string;
    layoutEvaluation: string;
  };
  viewingChecklist: string[];
  priceHistoryReport?: string[];
  futureForecastReport?: string[];
};

export type { AnalysisHistoryRecord, AnalysisHistorySourcePlan };

export type AppUser = {
  userId: string;
  email: string | null;
  isLoggedIn: boolean;
  authProvider: 'google' | 'email' | null;
  plan: UserPlan;
  purchasedProperties: PurchasedPropertyRecord[];
  /** 分析履歴（単発1件 / 月額Pro 5件） */
  analysisHistory: AnalysisHistoryRecord[];
  /** Stripe Customer ID（月額解約ポータル用） */
  stripeCustomerId: string | null;
};

export const USER_STORAGE_KEY = 'bukken_ai_user_state_v3';
export const VIEW_PURCHASED_QUERY = 'purchasedPropertyId';
export const VIEW_HISTORY_QUERY = 'analysisHistoryId';
/** email → userId の対応（アカウント切替用） */
const ACCOUNT_INDEX_KEY = 'bukken_ai_account_index_v1';
/** アカウント別スナップショット接頭辞 */
const ACCOUNT_SNAPSHOT_PREFIX = 'bukken_ai_account_snap_v1:';
/** チェックアウト一時コンテキスト */
export const CHECKOUT_CONTEXT_KEY = 'bukken_ai_checkout_context';
/** 旧キー互換 */
const LEGACY_V2_KEY = 'bukken_ai_user_state_v2';
const LEGACY_PLAN_KEY = 'bukken_ai_active_plan';
const LEGACY_PURCHASED_KEY = 'bukken_ai_purchased_property_ids';

export function normalizeAccountEmail(email: string): string {
  return String(email || '')
    .trim()
    .toLowerCase();
}

/** セッション系の一時キャッシュを破棄 */
export function clearClientSessionCaches(): void {
  try {
    sessionStorage.removeItem(CHECKOUT_CONTEXT_KEY);
  } catch {
    // ignore
  }
}

function readAccountIndex(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ACCOUNT_INDEX_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed || {})) {
      if (typeof v === 'string' && v) out[normalizeAccountEmail(k)] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeAccountIndex(index: Record<string, string>): void {
  try {
    localStorage.setItem(ACCOUNT_INDEX_KEY, JSON.stringify(index));
  } catch {
    // ignore
  }
}

function accountSnapshotKey(email: string): string {
  return `${ACCOUNT_SNAPSHOT_PREFIX}${normalizeAccountEmail(email)}`;
}

/** ログイン中アカウントの状態を email スロットへ退避 */
export function saveAccountSnapshot(user: AppUser): void {
  const email = normalizeAccountEmail(user.email || '');
  if (!email || !user.userId) return;
  try {
    const index = readAccountIndex();
    index[email] = user.userId;
    writeAccountIndex(index);
    localStorage.setItem(
      accountSnapshotKey(email),
      JSON.stringify(
        normalizeUser({
          ...user,
          email,
          isLoggedIn: true,
        })
      )
    );
  } catch {
    // ignore
  }
}

function loadAccountSnapshot(email: string): AppUser | null {
  const normalized = normalizeAccountEmail(email);
  if (!normalized) return null;
  try {
    const raw = localStorage.getItem(accountSnapshotKey(normalized));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppUser>;
    return normalizeUser({
      ...parsed,
      email: normalized,
      isLoggedIn: true,
    });
  } catch {
    return null;
  }
}

/**
 * ログアウト: 現アカウントを退避したうえで、履歴・購入・プランを含まないゲストへ切替
 */
export function logoutToGuestUser(current: AppUser): AppUser {
  if (current.isLoggedIn && current.email) {
    saveAccountSnapshot({ ...current, isLoggedIn: true });
  }
  clearClientSessionCaches();
  const guest = createFreshUser();
  writeUserState(guest);
  return guest;
}

/**
 * ログイン / アカウント切替:
 * - 直前アカウントをスナップショット保存
 * - 同一 email ならそのスナップショットを復元
 * - 別 email / 初回なら空の新規 userId（前ユーザーの履歴は持ち込まない）
 */
export function loginAsAccountUser(params: {
  email: string;
  provider: 'google' | 'email';
  previous: AppUser;
}): AppUser {
  const email = normalizeAccountEmail(params.email);
  if (!email) {
    return params.previous;
  }

  // 切替前アカウントを退避（同一 email の再ログイン含む）
  if (params.previous.isLoggedIn && params.previous.email) {
    saveAccountSnapshot(params.previous);
  } else if (params.previous.userId) {
    // ゲスト中に蓄積した単発/履歴が別アカウントへ漏れないよう破棄してからログイン
    clearClientSessionCaches();
  }

  clearClientSessionCaches();

  const index = readAccountIndex();
  const existingId = index[email];
  const saved = loadAccountSnapshot(email);

  let next: AppUser;
  if (saved && saved.userId) {
    next = normalizeUser({
      ...saved,
      email,
      isLoggedIn: true,
      authProvider: params.provider,
      userId: existingId || saved.userId,
    });
  } else {
    const userId = existingId || createGuestUserId();
    next = normalizeUser({
      ...createFreshUser(),
      userId,
      email,
      isLoggedIn: true,
      authProvider: params.provider,
      plan: 'FREE',
      purchasedProperties: [],
      analysisHistory: [],
      stripeCustomerId: null,
    });
  }

  index[email] = next.userId;
  writeAccountIndex(index);
  saveAccountSnapshot(next);
  writeUserState(next);
  return next;
}

export function createGuestUserId(): string {
  return `user_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

/** 物件テキスト（URL優先、なければ住所・建物名など）から一意の propertyId を生成 */
export function buildPropertyId(propertyText: string): string {
  const text = (propertyText || '').trim();
  if (!text) return 'prop_empty';

  const urlMatch = text.match(/https?:\/\/[^\s<>"']+/i);
  const source = (urlMatch?.[0] || text)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 800);

  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const compact = source
    .replace(/https?:\/\//i, '')
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]/gi, '')
    .slice(0, 24);

  return `prop_${(hash >>> 0).toString(36)}_${compact || 'id'}`;
}

export function extractPropertyTitle(sourceText: string): string {
  const lines = (sourceText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return '名称未設定の物件';
  const first = lines[0].replace(/^【.*?】/, '').trim();
  return first.slice(0, 48) || '名称未設定の物件';
}

export function extractLocationOrUrl(sourceText: string): string {
  const text = sourceText || '';
  const urlMatch = text.match(/https?:\/\/[^\s<>"']+/i);
  if (urlMatch) return urlMatch[0];
  const addrMatch = text.match(/(東京都|北海道|(?:京都|大阪)府|.{2,3}県)[^\n]{0,40}/);
  if (addrMatch) return addrMatch[0].trim();
  return text.split(/\r?\n/).map((l) => l.trim()).find(Boolean)?.slice(0, 60) || '住所/URL未設定';
}

export function canAccessProFeatures(params: {
  user: AppUser;
  currentPropertyId: string | null;
}): boolean {
  const { user, currentPropertyId } = params;

  if (user.plan === 'MONTHLY') return true;

  if (
    currentPropertyId &&
    user.purchasedProperties.some((p) => p.propertyId === currentPropertyId)
  ) {
    return true;
  }

  return false;
}

export function addPurchasedPropertyRecord(
  list: PurchasedPropertyRecord[],
  record: PurchasedPropertyRecord,
  options?: { singleOnly?: boolean }
): PurchasedPropertyRecord[] {
  if (!record.propertyId || record.propertyId === 'prop_empty') return list;
  // 単発: 常に最新1件のみ（上書き）
  if (options?.singleOnly) {
    return [record];
  }
  const without = list.filter((p) => p.propertyId !== record.propertyId);
  return [...without, record];
}

export function getPurchasedPropertyIds(user: AppUser): string[] {
  return user.purchasedProperties.map((p) => p.propertyId);
}

export function createDevDummyPurchases(): PurchasedPropertyRecord[] {
  const now = Date.now();
  return [
    {
      propertyId: 'prop_dev_dummy_shibuya',
      title: 'パークホームズ渋谷（ダミー）',
      locationOrUrl: '東京都渋谷区神南1-2-3 / https://example.com/bukken/shibuya-a',
      purchasedAt: new Date(now - 1000 * 60 * 60 * 24 * 3).toISOString(),
      householdType: 'single',
      propertyType: 'rental',
      sourceText:
        '【賃貸】パークホームズ渋谷\n住所: 東京都渋谷区神南1-2-3\n家賃: 148,000円\n管理費: 10,000円\n駅徒歩: 渋谷駅 8分\n間取り: 1LDK 40.2㎡\n築年: 2018年\nhttps://example.com/bukken/shibuya-a',
      cachedResult: {
        score: 78,
        summary:
          '立地と築年は良好。家賃はやや強気だが単身需要は堅い。内見時に騒音と収納を重点確認すべき物件。',
        pros: ['渋谷駅徒歩圏', '築浅で設備が新しい', '1LDKで生活動線が良い'],
        cons: ['家賃が相場比やや高め', '周辺の夜間騒音リスク', '更新料の確認が必要'],
        details: {
          priceEvaluation: '近隣同条件比で数千円高め。空室長期なら指値余地あり。',
          locationEvaluation: '商業地に近く利便性は高いが、繁華街騒音に注意。',
          layoutEvaluation: '40㎡前後の1LDK。採光は南向き想定で良好。',
        },
        viewingChecklist: [
          '夜間騒音のため、内見時は窓を開けて外音を確認し動画撮影する',
          '収納不足の可能性のため、クローゼット奥行きをメジャーで測る',
          '水回りの劣化確認のため、蛇口下と浴室パッキンを撮影する',
        ],
        priceHistoryReport: [
          '掲載が長引いている可能性が高いため、初期費用減額交渉を検討。内見後に管理会社へ根拠を伝えて指値する。',
        ],
        futureForecastReport: [
          '5年後も単身需要は見込める。更新時の値上げ条項を契約前に確認する。',
        ],
      },
    },
    {
      propertyId: 'prop_dev_dummy_setagaya',
      title: 'ファミリー向け分譲マンション（世田谷・ダミー）',
      locationOrUrl: '東京都世田谷区桜丘2-8-1',
      purchasedAt: new Date(now - 1000 * 60 * 60 * 24 * 10).toISOString(),
      householdType: 'family',
      propertyType: 'purchase',
      sourceText:
        '【分譲】世田谷区桜丘の3LDK\n価格: 6,480万円\n管理費: 18,000円\n修繕積立: 14,000円\n駅徒歩: 用賀駅 12分\n専有: 72㎡\n築年: 2009年',
      cachedResult: {
        score: 71,
        summary:
          '学区と広さはファミリー向き。駅距離と修繕積立の上昇余地が減点。購入前に管理組合資料確認が必須。',
        pros: ['3LDKで家族動線が良い', '住環境が落ち着いている', '共用部の印象が安定'],
        cons: ['駅徒歩がやや長い', '築年相応の設備更新費用', '修繕積立の値上げリスク'],
        details: {
          priceEvaluation: '近隣成約比で妥当寄り。指値は設備条件付きが現実的。',
          locationEvaluation: '閑静だが駅距離はネック。通学路の安全性は高い。',
          layoutEvaluation: '72㎡の3LDK。居室分離は良好、収納は平均的。',
        },
        viewingChecklist: [
          '修繕積立不足の可能性があるため、内見時に掲示板の総会資料を確認・撮影する',
          '結露リスク確認のため、北側居室の窓枠と壁際を撮影する',
          '共用廊下の管理状態を確認し、放置物の有無を記録する',
        ],
        priceHistoryReport: [
          '掲載長期化があれば、契約時に数十万円単位の指値余地を検討。類似成約を根拠に交渉する。',
        ],
        futureForecastReport: [
          '10年後のリセールは駅距離が影響。管理状態が良ければ資産性は維持しやすい。',
        ],
      },
    },
  ];
}

export function ensureDevDummyPurchases(user: AppUser): AppUser {
  if (process.env.NODE_ENV !== 'development') return user;
  // ログイン済みアカウントにはダミーを入れない（アカウント切替テストの混入防止）
  if (user.isLoggedIn) return user;
  if (user.purchasedProperties.length > 0) return user;
  const withDummies: AppUser = {
    ...user,
    purchasedProperties: createDevDummyPurchases(),
    analysisHistory: user.analysisHistory?.length
      ? user.analysisHistory
      : createDevDummyPurchases().map((p) => ({
          propertyId: p.propertyId,
          title: p.title,
          locationOrUrl: p.locationOrUrl,
          analyzedAt: p.purchasedAt,
          householdType: p.householdType,
          propertyType: p.propertyType,
          sourceText: p.sourceText,
          cachedResult: p.cachedResult,
          sourcePlan: 'SINGLE' as const,
        })),
  };
  writeUserState(withDummies);
  return withDummies;
}

export function readUserState(): AppUser {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppUser>;
      if (parsed && typeof parsed.userId === 'string') {
        return normalizeUser(parsed);
      }
    }
  } catch {
    // ignore
  }

  // v2 互換
  try {
    const rawV2 = localStorage.getItem(LEGACY_V2_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as {
        userId?: string;
        plan?: string;
        purchasedProperties?: unknown;
      };
      const purchased = normalizePurchasedList(parsed.purchasedProperties);
      const migrated: AppUser = {
        userId: parsed.userId || createGuestUserId(),
        email: null,
        isLoggedIn: false,
        authProvider: null,
        plan: parsed.plan === 'MONTHLY' ? 'MONTHLY' : 'FREE',
        purchasedProperties: purchased,
        analysisHistory: [],
        stripeCustomerId: null,
      };
      writeUserState(migrated);
      return migrated;
    }
  } catch {
    // ignore
  }

  // さらに古いキー
  try {
    const legacyPlan = localStorage.getItem(LEGACY_PLAN_KEY);
    const legacyPurchasedRaw = localStorage.getItem(LEGACY_PURCHASED_KEY);
    const purchased = normalizePurchasedList(
      legacyPurchasedRaw ? JSON.parse(legacyPurchasedRaw) : []
    );
    const migrated: AppUser = {
      userId: createGuestUserId(),
      email: null,
      isLoggedIn: false,
      authProvider: null,
      plan: legacyPlan === 'MONTHLY' ? 'MONTHLY' : 'FREE',
      purchasedProperties: purchased,
      analysisHistory: [],
      stripeCustomerId: null,
    };
    writeUserState(migrated);
    return migrated;
  } catch {
    // ignore
  }

  const fresh = createFreshUser();
  writeUserState(fresh);
  return fresh;
}

export function writeUserState(user: AppUser) {
  try {
    const normalized = normalizeUser(user);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(normalized));
    if (normalized.isLoggedIn && normalized.email) {
      saveAccountSnapshot(normalized);
    }
  } catch {
    // ignore
  }
}

export function createFreshUser(): AppUser {
  return {
    userId: createGuestUserId(),
    email: null,
    isLoggedIn: false,
    authProvider: null,
    plan: 'FREE',
    purchasedProperties: [],
    analysisHistory: [],
    stripeCustomerId: null,
  };
}

function normalizePurchasedList(raw: unknown): PurchasedPropertyRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): PurchasedPropertyRecord | null => {
      if (typeof item === 'string') {
        return {
          propertyId: item,
          title: `購入済み物件（${item.slice(0, 12)}）`,
          locationOrUrl: '住所/URL未設定',
          purchasedAt: new Date().toISOString(),
          householdType: 'single',
          propertyType: 'rental',
        };
      }
      if (!item || typeof item !== 'object') return null;
      const rec = item as Partial<PurchasedPropertyRecord>;
      if (typeof rec.propertyId !== 'string') return null;
      return {
        propertyId: rec.propertyId,
        title: typeof rec.title === 'string' ? rec.title : '名称未設定の物件',
        locationOrUrl:
          typeof rec.locationOrUrl === 'string' ? rec.locationOrUrl : '住所/URL未設定',
        purchasedAt:
          typeof rec.purchasedAt === 'string' ? rec.purchasedAt : new Date().toISOString(),
        householdType: rec.householdType === 'family' ? 'family' : 'single',
        propertyType: rec.propertyType === 'purchase' ? 'purchase' : 'rental',
        sourceText: typeof rec.sourceText === 'string' ? rec.sourceText : undefined,
        cachedResult: (rec.cachedResult as AnalysisSnapshot | null | undefined) ?? null,
      };
    })
    .filter((x): x is PurchasedPropertyRecord => !!x);
}

function normalizeUser(partial: Partial<AppUser>): AppUser {
  return {
    userId:
      typeof partial.userId === 'string' && partial.userId
        ? partial.userId
        : createGuestUserId(),
    email: typeof partial.email === 'string' ? partial.email : null,
    isLoggedIn: !!partial.isLoggedIn,
    authProvider:
      partial.authProvider === 'google' || partial.authProvider === 'email'
        ? partial.authProvider
        : null,
    plan: partial.plan === 'MONTHLY' ? 'MONTHLY' : 'FREE',
    purchasedProperties: normalizePurchasedList(partial.purchasedProperties),
    analysisHistory: normalizeAnalysisHistoryList(partial.analysisHistory),
    stripeCustomerId:
      typeof partial.stripeCustomerId === 'string' && partial.stripeCustomerId
        ? partial.stripeCustomerId
        : null,
  };
}

/** サーバー entitlements を LocalStorage ユーザーへマージ */
export function mergeServerEntitlements(
  local: AppUser,
  remote: {
    userId?: string | null;
    found?: boolean;
    plan?: UserPlan | string | null;
    stripeCustomerId?: string | null;
    email?: string | null;
    purchasedProperties?: PurchasedPropertyRecord[] | null;
    purchasedPropertyIds?: string[] | null;
    analysisHistory?: AnalysisHistoryRecord[] | null;
  }
): AppUser {
  // 別ユーザーの entitlements が混入しないよう厳密一致
  if (remote.userId && remote.userId !== local.userId) {
    console.warn('[mergeServerEntitlements] userId mismatch; ignoring remote', {
      local: local.userId,
      remote: remote.userId,
    });
    return local;
  }

  const remotePurchased = normalizePurchasedList(remote.purchasedProperties || []);
  const byId = new Map<string, PurchasedPropertyRecord>();

  // サーバーに見つかった場合は購入・履歴の権威をサーバー側に寄せる（ローカルの別垢混入を防ぐ）
  const preferRemoteLists = remote.found === true;

  if (!preferRemoteLists) {
    for (const item of local.purchasedProperties) {
      byId.set(item.propertyId, item);
    }
  }
  for (const item of remotePurchased) {
    const prev = byId.get(item.propertyId);
    byId.set(item.propertyId, prev ? { ...item, cachedResult: item.cachedResult ?? prev.cachedResult } : item);
  }

  // IDのみ届いた場合も補完
  for (const id of remote.purchasedPropertyIds || []) {
    if (!byId.has(id) && id && !id.startsWith('pending:')) {
      byId.set(id, {
        propertyId: id,
        title: `購入済み物件（${id.slice(0, 12)}）`,
        locationOrUrl: '住所/URL未設定',
        purchasedAt: new Date().toISOString(),
        householdType: 'single',
        propertyType: 'rental',
      });
    }
  }

  const remoteHistory = normalizeAnalysisHistoryList(remote.analysisHistory || []);
  const historyById = new Map<string, AnalysisHistoryRecord>();
  if (!preferRemoteLists) {
    for (const item of local.analysisHistory || []) {
      historyById.set(item.propertyId, item);
    }
  }
  for (const item of remoteHistory) {
    const prev = historyById.get(item.propertyId);
    historyById.set(
      item.propertyId,
      prev
        ? {
            ...item,
            cachedResult: item.cachedResult ?? prev.cachedResult,
            sourceText: item.sourceText ?? prev.sourceText,
          }
        : item
    );
  }
  // サーバー未登録でも、ログイン直後はローカル履歴を userId 整合の範囲でのみ維持
  if (preferRemoteLists && remoteHistory.length === 0 && (local.analysisHistory || []).length > 0) {
    // サーバーが空 = この userId に履歴なし。ローカル混入を捨てる
  } else if (!preferRemoteLists) {
    // keep local merged above
  }

  return normalizeUser({
    ...local,
    plan: remote.plan === 'MONTHLY' ? 'MONTHLY' : remote.plan === 'FREE' ? 'FREE' : local.plan,
    stripeCustomerId: remote.stripeCustomerId ?? local.stripeCustomerId,
    email: remote.email || local.email,
    purchasedProperties: Array.from(byId.values()),
    analysisHistory: Array.from(historyById.values()).sort(
      (a, b) => +new Date(a.analyzedAt) - +new Date(b.analyzedAt)
    ),
  });
}

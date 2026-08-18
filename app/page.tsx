'use client';

import { useState, useEffect, useRef, type CSSProperties, type FormEvent, type ChangeEvent } from 'react';
import { track } from '@vercel/analytics';
import { SubscriptionManageButton } from '@/components/SubscriptionManageButton';
import {
  PRICE_MONTHLY_FIRST_YEN,
  PRICE_MONTHLY_YEN,
  PRICE_SINGLE_YEN,
  formatYen,
} from '@/lib/pricing';
import {
  ANALYSIS_HISTORY_LIMIT_SINGLE,
  historyLimitForPlan,
  upsertAnalysisHistoryRecord,
  type AnalysisHistoryRecord,
} from '@/lib/analysis-history';
import {
  type AnalysisSnapshot,
  type AppUser,
  type UserPlan,
  CHECKOUT_CONTEXT_KEY,
  VIEW_HISTORY_QUERY,
  VIEW_PURCHASED_QUERY,
  addPurchasedPropertyRecord,
  buildPropertyId,
  canAccessProFeatures,
  clearClientSessionCaches,
  ensureDevDummyPurchases,
  extractLocationOrUrl,
  extractPropertyTitle,
  loginAsAccountUser,
  logoutToGuestUser,
  mergeServerEntitlements,
  readUserState,
  writeUserState,
} from '@/lib/plan';

interface AnalysisResult {
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
  /** @deprecated 互換用 */
  marketForecastReport?: string[];
}

const LOADING_STEPS = [
  '物件情報を読み込み中...',
  '周辺相場とリスクを照合中...',
  '間取り・生活動線・採光を分析中...',
  '潜むデメリットをチェック中...',
  'PRO分析（内見・履歴・将来予測）を作成中...',
];
const LOADING_STEP_INTERVAL_MS = 3500;
const PROGRESS_DURATION_MS = 60000;
const FORM_INPUT_HINT =
  '💡 情報（賃料、共益費、駅徒歩、設備、気になっている点など）が多ければ多いほど、AIがより詳細で精度の高い分析を行います。';
const INPUT_TEXT_MAX_LENGTH = 3000;
const INPUT_TEXT_WARN_LENGTH = 2800;
const SERVICE_DISCLAIMER =
  '⚠️ 免責事項：本サービスの分析・回答はAIによる推計であり、物件の契約や価値を保証するものではありません。最終的な契約・判断は必ずご自身の責任において、信頼できる不動産会社等にご確認のうえ行ってください。';
const API_FALLBACK_MESSAGE =
  '現在アクセスが集中しているか、AIサービス側で一時的な障害が発生しています。お手数ですが、しばらくしてからもう一度お試しください。';
const API_CONFIG_MESSAGE =
  'サービス設定に問題があります。管理者にお問い合わせください。開発環境では GEMINI_API_KEY が .env.local に設定されているか確認してください。';
const ANALYZE_TIMEOUT_MS = 90_000;
const CHAT_TIMEOUT_MS = 60_000;

type ModalType = 'terms' | 'privacy' | 'contact' | 'paywall' | 'agreement' | 'tokushoho' | 'auth' | null;
type PayPlan = 'ticket' | 'pro';
type PropertyType = 'rental' | 'purchase';
type HouseholdType = 'single' | 'family';
type ChatMessage = { role: 'user' | 'model'; text: string };

const PRO_FEATURES_BASE = [
  {
    icon: '💬',
    title: '【PRO機能①】専属AIアドバイザーと本音チャット相談',
    body: '物件データを前提に、結論→根拠→具体アドバイスまでフランクな本音で直言します。',
  },
  {
    icon: '📋',
    title: '【PRO機能②】現地内見の絶対確認チェックリスト',
    body: '現地で測る・撮る・確認する具体ポイントと撮影指示で、見落とし失敗を防ぎます。',
  },
] as const;

const PRO_FEATURE3_BY_TYPE: Record<PropertyType, { icon: string; title: string; body: string }> = {
  rental: {
    icon: '📊',
    title: '【PRO機能③】価格・家賃の履歴トラッキング',
    body: '空室期間・家賃値下げ履歴から交渉余地を可視化し、指値の根拠と行動手順を提示します。',
  },
  purchase: {
    icon: '📊',
    title: '【PRO機能③】価格・家賃の履歴トラッキング',
    body: '売れ残り期間・価格改定履歴から指値余地を可視化し、交渉の根拠と行動手順を提示します。',
  },
};

const PRO_FEATURE4_BY_TYPE: Record<PropertyType, { icon: string; title: string; body: string }> = {
  rental: {
    icon: '🔮',
    title: '【PRO機能④】将来予測レポート（5年後・10年後）',
    body: '将来の周辺環境変化と家賃相場推移を予測し、更新・住み替え判断のアクションを示します。',
  },
  purchase: {
    icon: '🔮',
    title: '【PRO機能④】将来予測レポート（5年後・10年後）',
    body: '10年後の想定リセールバリューと資産価値推移を予測し、保有/売却判断のアクションを示します。',
  },
};

const DEFAULT_PRICE_HISTORY_PREVIEW: Record<PropertyType, string[]> = {
  rental: [
    '空室が長期化している可能性が高いため、初期費用減額や家賃数千円単位の交渉余地を検討。内見後に管理会社へ根拠を伝えて指値する。',
    '直近の家賃値下げ履歴が見られる場合、追加の値引きより更新料・礼金の減額交渉が通りやすい。見積書の内訳を確認してから提案する。',
    '同エリア類似物件比で割高なら、条件変更が難しい場合は見送り候補に。比較表を作って判断基準を明確にする。',
  ],
  purchase: [
    '掲載長期化・値下げ履歴がある場合、契約時に価格の指値余地が高い。内見後に類似成約事例を根拠に交渉する。',
    '値下げ幅が小さい場合は価格以外（修繕・設備）の条件交渉を優先。ホームインスペクション実施を条件に付ける。',
    '周辺成約が弱い場合は焦らず追加内見を。指値根拠が揃うまで申込を保留する判断も有効。',
  ],
};

const DEFAULT_FUTURE_FORECAST_PREVIEW: Record<PropertyType, string[]> = {
  rental: [
    '5年後の家賃相場は横ばい〜緩やか変動が想定されるため、更新時の値上げ提示に備え、更新料・家賃改定条項を契約前に確認する。',
    '周辺再開発があれば住みやすさ向上の一方で騒音・混雑リスクも。内見時に工事掲示と動線を撮影して判断材料にする。',
    '10年スパンで住み替える想定なら、退去費用と更新コストを試算し、3年目更新の可否を先に決めておく。',
  ],
  purchase: [
    '5年後は流動性が重要。管理状態と修繕積立の健全性を確認し、資産性の低い間取りは避ける判断が有効。',
    '10年後の想定リセールは立地次第で差が出る。駅距離・学区・再開発を優先条件に置き直して比較する。',
    '将来の維持費上昇が見込まれるため、購入前に管理組合資料を取り寄せ、固定費込みの実質負担で判断する。',
  ],
};

const COLORS = {
  pageBg: '#f8fafc',
  pageBgDeep: '#f1f5f9',
  card: '#ffffff',
  cardAlt: '#f8fafc',
  elevated: '#e2e8f0',
  border: '#e2e8f0',
  borderBright: '#cbd5e1',
  text: '#0f172a',
  textMuted: '#475569',
  textDim: '#64748b',
  accent: '#2563eb',
  accentStrong: '#4f46e5',
  purple: '#4f46e5',
  scoreBg: 'rgba(37, 99, 235, 0.08)',
  cardShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
};

const IS_DEV = process.env.NODE_ENV === 'development';

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof Error && err.name === 'AbortError') return true;
  return false;
}

function isRetryableApiFailure(
  status: number,
  rawMessage: string,
  code?: string,
  kind?: string,
  retryableFlag?: boolean
): boolean {
  if (typeof retryableFlag === 'boolean') return retryableFlag;
  if (kind === 'config' || kind === 'client') return false;
  if (kind === 'temporary') return true;
  // サーバー設定ミスはリトライしても直らない
  if (
    code === 'CONFIG_MISSING_GEMINI_API_KEY' ||
    code === 'CONFIG_INVALID_GEMINI_API_KEY' ||
    /GEMINI_API_KEY|設定エラー|設定されていません/i.test(rawMessage)
  ) {
    return false;
  }
  if ([408, 404, 429, 502, 503, 504].includes(status)) return true;
  // 500 でも設定系は除外済み。一時障害のみリトライ扱い
  if (status === 500) {
    return /quota|rate.?limit|timeout|timed?\s*out|econnreset|fetch failed|network|overloaded|unavailable|resource.?exhausted/i.test(
      rawMessage
    );
  }
  return /quota|rate.?limit|timeout|timed?\s*out|econnreset|fetch failed|network|404|not found|resource.?exhausted|overloaded|unavailable/i.test(
    rawMessage
  );
}

function resolveApiErrorDisplay(input: {
  status: number;
  error?: string;
  detail?: string;
  code?: string;
  kind?: string;
  retryable?: boolean;
}): { message: string; retryable: boolean } {
  const kind = input.kind;
  const raw = input.error || `エラーが発生しました（${input.status}）`;
  const retryable = isRetryableApiFailure(
    input.status,
    raw,
    input.code,
    kind,
    input.retryable
  );

  if (kind === 'config' || input.code?.startsWith('CONFIG_')) {
    return {
      message: IS_DEV && input.detail ? input.detail : input.error || API_CONFIG_MESSAGE,
      retryable: false,
    };
  }

  if (kind === 'client') {
    return { message: raw, retryable: false };
  }

  if (retryable || kind === 'temporary') {
    return {
      message: IS_DEV && input.detail ? `${API_FALLBACK_MESSAGE}\n（詳細: ${input.detail.slice(0, 240)}）` : API_FALLBACK_MESSAGE,
      retryable: true,
    };
  }

  return { message: raw, retryable: false };
}

function DisclaimerNotice({ compact = false }: { compact?: boolean }) {
  return (
    <p
      style={{
        margin: 0,
        fontSize: compact ? '11px' : '12px',
        lineHeight: 1.7,
        color: COLORS.textDim,
        textAlign: 'left',
        backgroundColor: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: '10px',
        padding: compact ? '10px 12px' : '12px 14px',
      }}
    >
      {SERVICE_DISCLAIMER}
    </p>
  );
}

function ApiErrorPanel({
  message,
  onRetry,
  onContact,
  retryDisabled = false,
}: {
  message: string;
  onRetry: () => void;
  onContact?: () => void;
  retryDisabled?: boolean;
}) {
  return (
    <div
      role="alert"
      style={{
        marginTop: '16px',
        marginBottom: '10px',
        padding: '14px 16px',
        backgroundColor: '#fef2f2',
        border: '1px solid #fecaca',
        color: '#991b1b',
        fontSize: '14px',
        borderRadius: '12px',
        lineHeight: 1.7,
      }}
    >
      <p style={{ margin: '0 0 12px 0' }}>⚠️ {message}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <button
          type="button"
          onClick={onRetry}
          disabled={retryDisabled}
          style={{
            background: retryDisabled ? '#94a3b8' : 'linear-gradient(to right, #4f46e5, #2563eb)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 14px',
            fontWeight: 800,
            fontSize: '13px',
            cursor: retryDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          🔄 再試行する
        </button>
        {onContact && (
          <button
            type="button"
            onClick={onContact}
            style={{
              background: '#ffffff',
              color: '#b91c1c',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '8px 14px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            サポートへ連絡
          </button>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [inputText, setInputText] = useState('');
  const [images, setImages] = useState<{ inlineData: { mimeType: string; data: string } }[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorRetryable, setErrorRetryable] = useState(false);
  const [copied, setCopied] = useState(false);
  const [propertyType, setPropertyType] = useState<PropertyType>('rental');
  const [householdType, setHouseholdType] = useState<HouseholdType>('single');

  // userId / plan / purchasedProperties
  const [user, setUser] = useState<AppUser>({
    userId: 'user_guest',
    email: null,
    isLoggedIn: false,
    authProvider: null,
    plan: 'FREE',
    purchasedProperties: [],
    analysisHistory: [],
    stripeCustomerId: null,
  });
  const [currentPropertyId, setCurrentPropertyId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [pendingPayPlan, setPendingPayPlan] = useState<PayPlan | null>(null);
  /** authモーダルの用途: ヘッダーからのログイン or 決済前認証 */
  const [authIntent, setAuthIntent] = useState<'login' | 'paywall'>('login');

  // PROチャット
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatErrorRetryable, setChatErrorRetryable] = useState(false);

  // モーダル状態管理
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  // Paywall（クレジットカード / Stripe Checkout）
  const [selectedPlan, setSelectedPlan] = useState<PayPlan>('pro');
  const [paywallEmail, setPaywallEmail] = useState('');
  const [paywallSubmitting, setPaywallSubmitting] = useState(false);
  const [paywallMessage, setPaywallMessage] = useState<string | null>(null);
  const [stripeTestLoading, setStripeTestLoading] = useState<'SINGLE' | 'MONTHLY' | null>(null);
  const [stripeTestError, setStripeTestError] = useState<string | null>(null);
  const analyzeAbortRef = useRef<AbortController | null>(null);
  const analyzeTimedOutRef = useRef(false);
  const chatAbortRef = useRef<AbortController | null>(null);
  const chatTimedOutRef = useRef(false);
  const lastChatPayloadRef = useRef<{
    message: string;
    historyBeforeSend: ChatMessage[];
  } | null>(null);

  // LocalStorage からユーザー状態を復元
  useEffect(() => {
    let next = readUserState();
    if (IS_DEV) {
      next = ensureDevDummyPurchases(next);
    }
    setUser(next);
    if (next.email) setPaywallEmail(next.email);

    // サーバー entitlements 同期 + Checkout 戻り処理
    void (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const checkout = params.get('checkout');
        const sessionId = params.get('session_id');

        if (checkout === 'success' && sessionId) {
          const confirmRes = await fetch('/api/checkout/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, userId: next.userId }),
          });
          const confirmData = await confirmRes.json();
          if (confirmRes.ok) {
            next = mergeServerEntitlements(next, confirmData);
            // sessionStorage の診断コンテキストを購入レコードへ反映
            try {
              const rawCtx = sessionStorage.getItem(CHECKOUT_CONTEXT_KEY);
              if (rawCtx) {
                const ctx = JSON.parse(rawCtx) as {
                  propertyId?: string;
                  inputText?: string;
                  householdType?: HouseholdType;
                  propertyType?: PropertyType;
                  cachedResult?: AnalysisResult | null;
                };
                if (ctx.propertyId) {
                  const purchaseRecord = {
                    propertyId: ctx.propertyId,
                    title: extractPropertyTitle(ctx.inputText || ctx.propertyId),
                    locationOrUrl: extractLocationOrUrl(ctx.inputText || ctx.propertyId),
                    purchasedAt: new Date().toISOString(),
                    householdType: (ctx.householdType === 'family' ? 'family' : 'single') as HouseholdType,
                    propertyType: (ctx.propertyType === 'purchase' ? 'purchase' : 'rental') as PropertyType,
                    sourceText: ctx.inputText,
                    cachedResult: (ctx.cachedResult as AnalysisSnapshot | null) || null,
                  };
                  const isSingleCheckout = confirmData.planType === 'SINGLE';
                  next = {
                    ...next,
                    purchasedProperties: addPurchasedPropertyRecord(
                      next.purchasedProperties,
                      purchaseRecord,
                      { singleOnly: isSingleCheckout || next.plan !== 'MONTHLY' }
                    ),
                  };
                  if (ctx.cachedResult && isSingleCheckout) {
                    const historyRecord: AnalysisHistoryRecord = {
                      propertyId: ctx.propertyId,
                      title: purchaseRecord.title,
                      locationOrUrl: purchaseRecord.locationOrUrl,
                      analyzedAt: new Date().toISOString(),
                      householdType: purchaseRecord.householdType,
                      propertyType: purchaseRecord.propertyType,
                      sourceText: ctx.inputText,
                      cachedResult: ctx.cachedResult as AnalysisSnapshot,
                      sourcePlan: 'SINGLE',
                    };
                    next = {
                      ...next,
                      analysisHistory: upsertAnalysisHistoryRecord(
                        next.analysisHistory || [],
                        historyRecord,
                        ANALYSIS_HISTORY_LIMIT_SINGLE
                      ),
                    };
                  }
                  setCurrentPropertyId(ctx.propertyId);
                  if (ctx.inputText) setInputText(ctx.inputText);
                  if (ctx.householdType) setHouseholdType(ctx.householdType);
                  if (ctx.propertyType) setPropertyType(ctx.propertyType);
                  if (ctx.cachedResult) {
                    setResult(ctx.cachedResult);
                  }
                }
                sessionStorage.removeItem(CHECKOUT_CONTEXT_KEY);
              }
            } catch {
              // ignore
            }
            writeUserState(next);
            setUser(next);
            if (
              confirmData.planType === 'SINGLE' &&
              next.analysisHistory &&
              next.analysisHistory.length > 0
            ) {
              const latest = next.analysisHistory[next.analysisHistory.length - 1];
              void fetch('/api/analysis-history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId: next.userId,
                  propertyId: latest.propertyId,
                  sourceText: latest.sourceText,
                  householdType: latest.householdType,
                  propertyType: latest.propertyType,
                  cachedResult: latest.cachedResult,
                  clientPlan: 'FREE',
                  hasSinglePurchase: true,
                }),
              }).catch(() => undefined);
            }
            setPaywallMessage(
              confirmData.planType === 'SINGLE'
                ? '単発プランの決済が完了しました。この物件のPRO機能が解放され、分析履歴に保存されました。'
                : '月額PROプランの登録が完了しました。全物件でPRO機能をご利用いただけます。分析結果は最新5件までマイページに保存されます。'
            );
            setActiveModal('paywall');
          } else {
            setPaywallMessage(
              confirmData.error ||
                '決済の確認に失敗しました。反映まで数分かかる場合があります。マイページでご確認ください。'
            );
            setActiveModal('paywall');
          }
          window.history.replaceState({}, '', '/');
        } else if (checkout === 'cancel') {
          setPaywallMessage('決済がキャンセルされました。必要であれば再度お試しください。');
          setActiveModal('paywall');
          window.history.replaceState({}, '', '/');
        }

        const entRes = await fetch(
          `/api/entitlements?userId=${encodeURIComponent(next.userId)}`,
          { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }
        );
        if (entRes.ok) {
          const ent = await entRes.json();
          if (ent.found && ent.userId === next.userId) {
            const merged = mergeServerEntitlements(next, ent);
            writeUserState(merged);
            setUser(merged);
          }
        }
      } catch {
        // ignore sync errors
      }
    })();

    // マイページからの復元 / Paywall自動オープン
    try {
      const params = new URLSearchParams(window.location.search);
      const purchasedId = params.get(VIEW_PURCHASED_QUERY);
      const historyId = params.get(VIEW_HISTORY_QUERY);
      const openPaywallFlag = params.get('openPaywall');
      const openAuthFlag = params.get('openAuth');
      const planParam = params.get('plan');

      const restoreId = historyId || purchasedId;
      if (restoreId) {
        const historyRecord = next.analysisHistory?.find((p) => p.propertyId === restoreId);
        const purchaseRecord = next.purchasedProperties.find((p) => p.propertyId === restoreId);
        const record = historyRecord || purchaseRecord;
        if (record) {
          setCurrentPropertyId(record.propertyId);
          if (record.sourceText) setInputText(record.sourceText);
          if (record.householdType) setHouseholdType(record.householdType);
          if (record.propertyType) setPropertyType(record.propertyType);
          const cached =
            ('cachedResult' in record ? record.cachedResult : null) ||
            (purchaseRecord?.cachedResult ?? null);
          if (cached) {
            setResult(cached as AnalysisResult);
          }
        }
      }

      if (openPaywallFlag === '1') {
        if (planParam === 'ticket') setSelectedPlan('ticket');
        if (planParam === 'pro') setSelectedPlan('pro');
        // ログイン済みならPaywall、未ログインなら認証へ
        if (next.isLoggedIn) {
          setActiveModal('paywall');
        } else {
          setPendingPayPlan(planParam === 'ticket' ? 'ticket' : 'pro');
          setAuthIntent('paywall');
          setActiveModal('auth');
        }
      } else if (openAuthFlag === '1' && !next.isLoggedIn) {
        setAuthIntent('login');
        setActiveModal('auth');
      }
    } catch {
      // ignore
    }
  }, []);

  // ESCキーでモーダルを閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveModal(null);
        setPaywallMessage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 解析中: パルス/リング + ステップコメント + プログレスバー
  useEffect(() => {
    if (!loading) return;
    setLoadingStepIndex(0);
    setProgressPercent(0);

    const startTime = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / PROGRESS_DURATION_MS);
      setProgressPercent(Math.min(95, Math.floor(t * 95)));
      setLoadingStepIndex(
        Math.floor(elapsed / LOADING_STEP_INTERVAL_MS) % LOADING_STEPS.length
      );
    }, 100);

    return () => clearInterval(tick);
  }, [loading]);

  const openAuthModal = (intent: 'login' | 'paywall' = 'login') => {
    setAuthIntent(intent);
    setAuthEmail('');
    setAuthSubmitting(false);
    setError(null);
    setActiveModal('auth');
  };

  const persistUser = (next: AppUser) => {
    setUser(next);
    writeUserState(next);
  };

  /** Pro 分析結果を履歴へ保存（ローカル + サーバー） */
  const persistAnalysisHistory = async (params: {
    propertyId: string;
    sourceText: string;
    householdType: HouseholdType;
    propertyType: PropertyType;
    cachedResult: AnalysisResult;
    currentUser: AppUser;
  }) => {
    const { propertyId, sourceText, householdType, propertyType, cachedResult, currentUser } =
      params;
    const isMonthly = currentUser.plan === 'MONTHLY';
    const hasSinglePurchase = currentUser.purchasedProperties.some(
      (p) => p.propertyId === propertyId
    );
    if (!isMonthly && !hasSinglePurchase) return currentUser;

    const record: AnalysisHistoryRecord = {
      propertyId,
      title: extractPropertyTitle(sourceText || propertyId),
      locationOrUrl: extractLocationOrUrl(sourceText || propertyId),
      analyzedAt: new Date().toISOString(),
      householdType,
      propertyType,
      sourceText: sourceText || undefined,
      cachedResult: cachedResult as AnalysisSnapshot,
      sourcePlan: isMonthly ? 'MONTHLY' : 'SINGLE',
    };

    const maxItems = historyLimitForPlan(isMonthly ? 'MONTHLY' : 'FREE');
    let nextUser: AppUser = {
      ...currentUser,
      analysisHistory: upsertAnalysisHistoryRecord(
        currentUser.analysisHistory || [],
        record,
        maxItems
      ),
    };
    persistUser(nextUser);

    try {
      const res = await fetch('/api/analysis-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          userId: currentUser.userId,
          propertyId,
          sourceText,
          householdType,
          propertyType,
          cachedResult,
          clientPlan: currentUser.plan,
          hasSinglePurchase,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          analysisHistory?: AnalysisHistoryRecord[];
          persisted?: string;
          userId?: string;
        };
        if (
          data.persisted !== 'client_only' &&
          Array.isArray(data.analysisHistory) &&
          (!data.userId || data.userId === currentUser.userId)
        ) {
          nextUser = {
            ...nextUser,
            analysisHistory: data.analysisHistory,
          };
          persistUser(nextUser);
        }
      }
    } catch {
      // ローカル保存済みのためサーバー失敗は握りつぶす
    }
    return nextUser;
  };

  const openPaywall = (plan?: PayPlan) => {
    setPaywallMessage(null);
    setPaywallSubmitting(false);
    if (plan) setSelectedPlan(plan);

    // 未ログイン時は決済前にアカウント登録/ログインを挟む
    if (!user.isLoggedIn) {
      setPendingPayPlan(plan || selectedPlan);
      openAuthModal('paywall');
      return;
    }
    setActiveModal('paywall');
  };

  const completeAuthAndContinue = (email: string, provider: 'google' | 'email') => {
    const next = loginAsAccountUser({ email, provider, previous: user });
    persistUser(next);
    // 別アカウントの画面状態が残らないよう診断 UI をリセット
    setResult(null);
    setChatMessages([]);
    setChatInput('');
    setChatError(null);
    setCurrentPropertyId(null);
    setError(null);
    setAuthSubmitting(false);
    setAuthEmail('');
    const intent = authIntent;
    if (intent === 'paywall') {
      if (pendingPayPlan) setSelectedPlan(pendingPayPlan);
      setPendingPayPlan(null);
      setActiveModal('paywall');
      return;
    }
    setPendingPayPlan(null);
    setActiveModal(null);

    // 切替後 userId の entitlements を取り直し
    void (async () => {
      try {
        const entRes = await fetch(
          `/api/entitlements?userId=${encodeURIComponent(next.userId)}`,
          { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }
        );
        if (!entRes.ok) return;
        const ent = await entRes.json();
        if (ent.userId && ent.userId !== next.userId) return;
        if (!ent.found) {
          // サーバー未登録: ローカルのこのアカウント状態を維持（新規は空）
          return;
        }
        const merged = mergeServerEntitlements(next, ent);
        persistUser(merged);
      } catch {
        // ignore
      }
    })();
  };

  const handleLogout = () => {
    const next = logoutToGuestUser(user);
    persistUser(next);
    clearClientSessionCaches();
    setResult(null);
    setChatMessages([]);
    setChatInput('');
    setChatError(null);
    setCurrentPropertyId(null);
    setError(null);
    setActiveModal(null);
    setPaywallMessage(null);
  };

  const applyDevLoginState = (loggedIn: boolean) => {
    if (loggedIn) {
      const email = user.email || `dev_${user.userId.slice(-6)}@example.com`;
      const next = loginAsAccountUser({
        email,
        provider: user.authProvider || 'email',
        previous: user,
      });
      persistUser(next);
      return;
    }
    handleLogout();
  };

  const handleAuthEmailSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = authEmail.trim();
    if (!email || !email.includes('@')) {
      setError('有効なメールアドレスを入力してください。');
      return;
    }
    setAuthSubmitting(true);
    setError(null);
    // デモ: メール認証完了としてログイン状態にする
    setTimeout(() => {
      completeAuthAndContinue(email, 'email');
    }, 500);
  };

  const handleAuthGoogle = () => {
    setAuthSubmitting(true);
    setError(null);
    setTimeout(() => {
      const demoEmail = `user_${user.userId.slice(-6)}@gmail.com`;
      completeAuthAndContinue(demoEmail, 'google');
    }, 500);
  };

  const updateUser = (patch: Partial<AppUser>) => {
    persistUser({ ...user, ...patch });
  };

  /** DEV: 月額 / 無料へ切替（FREE時は購入履歴もクリアして初期化） */
  const applyDevPlan = (plan: UserPlan) => {
    if (!IS_DEV) return;
    if (plan === 'MONTHLY') {
      updateUser({ plan: 'MONTHLY' });
      setPaywallMessage(null);
      return;
    }
    persistUser({
      ...user,
      plan: 'FREE',
      purchasedProperties: [],
    });
    setPaywallMessage(null);
  };

  /** DEV: 現在の物件を purchasedProperties に追加して即座にモザイク解除 */
  const purchaseCurrentPropertyForDev = () => {
    if (!IS_DEV) return;
    const propertyId =
      currentPropertyId ||
      (inputText.trim() ? buildPropertyId(inputText) : null);

    if (!propertyId || propertyId === 'prop_empty') {
      setError('物件テキストを入力するか、先に解析してから購入テストしてください。');
      return;
    }

    setCurrentPropertyId(propertyId);
    setError(null);
    updateUser({
      purchasedProperties: addPurchasedPropertyRecord(
        user.purchasedProperties,
        {
          propertyId,
          title: extractPropertyTitle(inputText || propertyId),
          locationOrUrl: extractLocationOrUrl(inputText || propertyId),
          purchasedAt: new Date().toISOString(),
          householdType,
          propertyType,
          sourceText: inputText || undefined,
          cachedResult: (result as AnalysisSnapshot | null) || null,
        },
        { singleOnly: true }
      ),
    });
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Data = (reader.result as string).split(',')[1];
        setImages((prev) => [
          ...prev,
          { inlineData: { mimeType: file.type, data: base64Data } },
        ]);
        setImagePreviews((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleReset = () => {
    setInputText('');
    setImages([]);
    setImagePreviews([]);
    setResult(null);
    setError(null);
    setErrorRetryable(false);
    setCurrentPropertyId(null);
    setChatMessages([]);
    setChatInput('');
    setChatError(null);
    setChatErrorRetryable(false);
    lastChatPayloadRef.current = null;
  };

  const handleCopyResult = () => {
    if (!result) return;
    const copyText = `
【物件セカンドオピニオン AI 査定結果】
■ 総合スコア: ${result.score} / 100
■ 概要: ${result.summary}

【👍 メリット】
${result.pros.map((p) => `・${p}`).join('\n')}

【⚠️ リスク・注意点】
${result.cons.map((c) => `・${c}`).join('\n')}

【詳細分析】
・価格妥当性: ${result.details.priceEvaluation}
・立地・環境: ${result.details.locationEvaluation}
・間取り・設備: ${result.details.layoutEvaluation}

【📋 現地内見チェックリスト】
${result.viewingChecklist.map((v) => `[ ] ${v}`).join('\n')}
    `.trim();

    navigator.clipboard.writeText(copyText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCancelAnalyze = () => {
    analyzeTimedOutRef.current = false;
    analyzeAbortRef.current?.abort();
    analyzeAbortRef.current = null;
    setLoading(false);
    setLoadingStepIndex(0);
    setProgressPercent(0);
    setError(null);
    setErrorRetryable(false);
  };

  const handleAnalyze = async () => {
    if (!inputText && images.length === 0) {
      setError('物件概要（テキスト）または画像を入力してください。');
      setErrorRetryable(false);
      return;
    }

    if (inputText.length > INPUT_TEXT_MAX_LENGTH) {
      setError('入力テキストが長すぎます。3,000文字以内に収めてください。');
      setErrorRetryable(false);
      return;
    }

    analyzeAbortRef.current?.abort();
    const controller = new AbortController();
    analyzeAbortRef.current = controller;
    analyzeTimedOutRef.current = false;
    const timeoutId = window.setTimeout(() => {
      analyzeTimedOutRef.current = true;
      controller.abort();
    }, ANALYZE_TIMEOUT_MS);

    setLoading(true);
    setError(null);
    setErrorRetryable(false);
    setResult(null);
    setChatMessages([]);
    setChatInput('');
    setChatError(null);
    setChatErrorRetryable(false);

    const propertyId = buildPropertyId(inputText);
    setCurrentPropertyId(propertyId);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          text: inputText,
          images,
          propertyType,
          householdType,
        }),
      });

      let data: (AnalysisResult & {
        error?: string;
        detail?: string;
        code?: string;
        kind?: string;
        retryable?: boolean;
        details?: unknown;
      }) | null = null;
      try {
        data = (await res.json()) as AnalysisResult & {
          error?: string;
          detail?: string;
          code?: string;
          kind?: string;
          retryable?: boolean;
          details?: unknown;
        };
      } catch (parseErr) {
        console.error('[analyze] failed to parse JSON response', {
          status: res.status,
          statusText: res.statusText,
          parseErr,
        });
        throw Object.assign(new Error(API_FALLBACK_MESSAGE), { retryable: true });
      }

      if (!res.ok) {
        const display = resolveApiErrorDisplay({
          status: res.status,
          error: data?.error,
          detail: data?.detail,
          code: data?.code,
          kind: data?.kind,
          retryable: data?.retryable,
        });
        console.error(
          '[analyze] API error response',
          JSON.stringify(
            {
              status: res.status,
              statusText: res.statusText,
              code: data?.code ?? null,
              kind: data?.kind ?? null,
              retryable: display.retryable,
              error: data?.error ?? null,
              detail: data?.detail ?? null,
              details: data?.details ?? null,
              body: data,
            },
            null,
            2
          )
        );
        throw Object.assign(new Error(display.message), { retryable: display.retryable });
      }

      if (!data || typeof data.score !== 'number') {
        throw Object.assign(new Error(API_FALLBACK_MESSAGE), { retryable: true });
      }

      setProgressPercent(100);
      setResult(data);
      track('analyze_executed');

      const entitledForHistory =
        user.plan === 'MONTHLY' ||
        user.purchasedProperties.some((p) => p.propertyId === propertyId);
      if (entitledForHistory) {
        void persistAnalysisHistory({
          propertyId,
          sourceText: inputText,
          householdType,
          propertyType,
          cachedResult: data,
          currentUser: user,
        });
      }
    } catch (err: unknown) {
      if (isAbortError(err)) {
        if (analyzeTimedOutRef.current) {
          setError(API_FALLBACK_MESSAGE);
          setErrorRetryable(true);
        }
        return;
      }
      const retryable =
        typeof err === 'object' && err !== null && 'retryable' in err
          ? Boolean((err as { retryable?: boolean }).retryable)
          : true;
      const message = err instanceof Error && err.message ? err.message : API_FALLBACK_MESSAGE;
      const isNetworkLike =
        /failed to fetch|networkerror|load failed|network/i.test(message) ||
        message === 'Failed to fetch';
      setError(isNetworkLike ? API_FALLBACK_MESSAGE : message);
      setErrorRetryable(retryable || isNetworkLike);
    } finally {
      window.clearTimeout(timeoutId);
      if (analyzeAbortRef.current === controller) {
        analyzeAbortRef.current = null;
      }
      setLoading(false);
    }
  };

  const sendChatMessage = async (message: string, historyBeforeSend: ChatMessage[]) => {
    if (!result || isProContentLocked) {
      openPaywall();
      return;
    }

    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;
    chatTimedOutRef.current = false;
    const timeoutId = window.setTimeout(() => {
      chatTimedOutRef.current = true;
      controller.abort();
    }, CHAT_TIMEOUT_MS);

    lastChatPayloadRef.current = { message, historyBeforeSend };
    setChatLoading(true);
    setChatError(null);
    setChatErrorRetryable(false);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          propertyInfo: inputText,
          previousAnalysis: result,
          messageHistory: historyBeforeSend,
          newMessage: message,
          propertyType,
          householdType,
        }),
      });

      let data: {
        reply?: string;
        error?: string;
        detail?: string;
        code?: string;
        kind?: string;
        retryable?: boolean;
        details?: unknown;
      } | null = null;
      try {
        data = (await res.json()) as {
          reply?: string;
          error?: string;
          detail?: string;
          code?: string;
          kind?: string;
          retryable?: boolean;
          details?: unknown;
        };
      } catch (parseErr) {
        console.error('[chat] failed to parse JSON response', {
          status: res.status,
          statusText: res.statusText,
          parseErr,
        });
        throw Object.assign(new Error(API_FALLBACK_MESSAGE), { retryable: true });
      }

      if (!res.ok) {
        const display = resolveApiErrorDisplay({
          status: res.status,
          error: data?.error,
          detail: data?.detail,
          code: data?.code,
          kind: data?.kind,
          retryable: data?.retryable,
        });
        console.error(
          '[chat] API error response',
          JSON.stringify(
            {
              status: res.status,
              statusText: res.statusText,
              code: data?.code ?? null,
              kind: data?.kind ?? null,
              retryable: display.retryable,
              error: data?.error ?? null,
              detail: data?.detail ?? null,
              details: data?.details ?? null,
              body: data,
            },
            null,
            2
          )
        );
        throw Object.assign(new Error(display.message), { retryable: display.retryable });
      }

      setChatMessages((prev) => [
        ...prev,
        { role: 'model', text: data?.reply || '回答を取得できませんでした。' },
      ]);
      lastChatPayloadRef.current = null;
    } catch (err: unknown) {
      if (isAbortError(err)) {
        if (chatTimedOutRef.current) {
          setChatError(API_FALLBACK_MESSAGE);
          setChatErrorRetryable(true);
        }
        return;
      }
      const retryable =
        typeof err === 'object' && err !== null && 'retryable' in err
          ? Boolean((err as { retryable?: boolean }).retryable)
          : true;
      const messageText = err instanceof Error && err.message ? err.message : API_FALLBACK_MESSAGE;
      const isNetworkLike =
        /failed to fetch|networkerror|load failed|network/i.test(messageText) ||
        messageText === 'Failed to fetch';
      setChatError(isNetworkLike ? API_FALLBACK_MESSAGE : messageText);
      setChatErrorRetryable(retryable || isNetworkLike);
    } finally {
      window.clearTimeout(timeoutId);
      if (chatAbortRef.current === controller) {
        chatAbortRef.current = null;
      }
      setChatLoading(false);
    }
  };

  const handleChatSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!result || isProContentLocked) {
      openPaywall();
      return;
    }

    const message = chatInput.trim();
    if (!message || chatLoading) return;

    const historyBeforeSend = chatMessages;
    setChatMessages([...historyBeforeSend, { role: 'user', text: message }]);
    setChatInput('');
    await sendChatMessage(message, historyBeforeSend);
  };

  const handleChatRetry = async () => {
    const payload = lastChatPayloadRef.current;
    if (!payload || chatLoading) return;
    await sendChatMessage(payload.message, payload.historyBeforeSend);
  };

  const handleContactSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setContactError(null);
    setContactSubmitting(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const payload = {
      name: String(formData.get('name') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      type: String(formData.get('type') || '').trim(),
      message: String(formData.get('message') || '').trim(),
    };

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '送信に失敗しました。');
      }

      setContactSubmitted(true);
      form.reset();
      setTimeout(() => {
        setContactSubmitted(false);
        setContactError(null);
        setActiveModal(null);
      }, 2500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '予期せぬエラーが発生しました。';
      setContactError(message);
    } finally {
      setContactSubmitting(false);
    }
  };

  /** DEV専用: ログイン不要で Stripe Checkout へ遷移するテスト */
  const startStripeCheckoutTest = async (planType: 'SINGLE' | 'MONTHLY') => {
    if (!IS_DEV) return;
    setStripeTestLoading(planType);
    setStripeTestError(null);

    const testUserId = user.userId || 'user_stripe_test_local';
    const testEmail = user.email || 'stripe-test@example.com';
    const testPropertyId =
      currentPropertyId ||
      (inputText.trim() ? buildPropertyId(inputText) : 'prop_stripe_test_local');

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planType,
          userId: testUserId,
          email: testEmail,
          propertyId: planType === 'SINGLE' ? testPropertyId : undefined,
          propertySnapshot:
            planType === 'SINGLE'
              ? {
                  propertyId: testPropertyId,
                  title: 'Stripeローカル決済テスト物件',
                  locationOrUrl: 'https://example.com/stripe-test',
                  householdType,
                  propertyType,
                  sourceText: inputText || 'Stripe checkout local test',
                }
              : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Checkout Session の作成に失敗しました。');
      }

      window.location.href = data.url as string;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Stripe決済テストの開始に失敗しました。';
      setStripeTestError(message);
      setStripeTestLoading(null);
    }
  };

  const handlePaywallSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPaywallSubmitting(true);
    setPaywallMessage(null);

    // 物件テキスト未入力でも単発購入可能。空の場合は一意の仮 ID を発行する。
    const propertyId =
      currentPropertyId && currentPropertyId !== 'prop_empty'
        ? currentPropertyId
        : inputText.trim()
          ? buildPropertyId(inputText)
          : `prop_pending_${user.userId.slice(-8)}_${Date.now().toString(36)}`;
    setCurrentPropertyId(propertyId);

    const planType = selectedPlan === 'ticket' ? 'SINGLE' : 'MONTHLY';

    const email = paywallEmail.trim() || user.email || '';
    if (!email || !email.includes('@')) {
      setPaywallMessage('決済用のメールアドレスを入力してください。');
      setPaywallSubmitting(false);
      return;
    }

    try {
      if (email !== user.email) {
        persistUser({ ...user, email });
      }

      // 決済戻り後に診断結果を復元できるよう一時保存
      try {
        sessionStorage.setItem(
          CHECKOUT_CONTEXT_KEY,
          JSON.stringify({
            propertyId,
            inputText,
            householdType,
            propertyType,
            cachedResult: result,
            planType,
          })
        );
      } catch {
        // ignore
      }

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planType,
          userId: user.userId,
          propertyId: planType === 'SINGLE' ? propertyId : undefined,
          email,
          propertySnapshot:
            planType === 'SINGLE'
              ? {
                  propertyId,
                  title: extractPropertyTitle(inputText || propertyId),
                  locationOrUrl: extractLocationOrUrl(inputText || propertyId),
                  householdType,
                  propertyType,
                  sourceText: inputText || undefined,
                }
              : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Checkout Session の作成に失敗しました。');
      }

      window.location.href = data.url as string;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '決済の開始に失敗しました。';
      setPaywallMessage(message);
      setPaywallSubmitting(false);
    }
  };

  // 1) user.plan === MONTHLY → 全物件解放
  // 2) purchasedProperties.includes(currentPropertyId) → 当該物件のみ解放
  // 3) それ以外は基本分析のみ（Pro は課金が必要）
  const isProUser = user.plan === 'MONTHLY';
  const isCurrentPropertyPurchased =
    !!currentPropertyId &&
    user.purchasedProperties.some((p) => p.propertyId === currentPropertyId);
  const isProContentLocked = !canAccessProFeatures({
    user,
    currentPropertyId,
  });

  const planStatusLabel =
    user.plan === 'MONTHLY'
      ? `user.plan=MONTHLY / purchased=${user.purchasedProperties.length}`
      : `user.plan=FREE / purchased=${user.purchasedProperties.length}`;

  const proFeatures = [
    ...PRO_FEATURES_BASE,
    PRO_FEATURE3_BY_TYPE[propertyType],
    PRO_FEATURE4_BY_TYPE[propertyType],
  ];

  const priceHistoryLines =
    result?.priceHistoryReport && result.priceHistoryReport.length > 0
      ? result.priceHistoryReport
      : result?.marketForecastReport && result.marketForecastReport.length > 0
        ? result.marketForecastReport.slice(0, 2)
        : DEFAULT_PRICE_HISTORY_PREVIEW[propertyType];

  const futureForecastLines =
    result?.futureForecastReport && result.futureForecastReport.length > 0
      ? result.futureForecastReport
      : result?.marketForecastReport && result.marketForecastReport.length > 0
        ? result.marketForecastReport
        : DEFAULT_FUTURE_FORECAST_PREVIEW[propertyType];

  const optionChipStyle = (active: boolean): CSSProperties => ({
    flex: 1,
    minWidth: '120px',
    padding: '10px 12px',
    borderRadius: '10px',
    border: active ? '2px solid #2563eb' : `1px solid ${COLORS.border}`,
    backgroundColor: active ? 'rgba(37, 99, 235, 0.06)' : COLORS.cardAlt,
    color: COLORS.text,
    fontWeight: active ? 800 : 600,
    fontSize: '13px',
    cursor: loading ? 'not-allowed' : 'pointer',
    textAlign: 'center',
  });

  const planBadgeStyle: CSSProperties = {
    fontSize: '12px',
    fontWeight: 700,
    color: isProUser || isCurrentPropertyPurchased ? COLORS.accent : COLORS.textMuted,
    backgroundColor:
      isProUser || isCurrentPropertyPurchased
        ? 'rgba(37, 99, 235, 0.08)'
        : 'rgba(100, 116, 139, 0.08)',
    padding: '6px 12px',
    borderRadius: '999px',
    border: `1px solid ${
      isProUser || isCurrentPropertyPurchased
        ? 'rgba(37, 99, 235, 0.25)'
        : 'rgba(100, 116, 139, 0.25)'
    }`,
    whiteSpace: 'nowrap',
  };

  const planCardStyle = (active: boolean): CSSProperties => ({
    flex: 1,
    minWidth: '140px',
    textAlign: 'left',
    padding: '14px 16px',
    borderRadius: '12px',
    cursor: 'pointer',
    backgroundColor: active ? 'rgba(37, 99, 235, 0.06)' : COLORS.card,
    border: active ? '2px solid #2563eb' : `1px solid ${COLORS.border}`,
    color: COLORS.text,
    boxShadow: active ? 'none' : COLORS.cardShadow,
  });

  const freePlanCardStyle: CSSProperties = {
    flex: 1,
    minWidth: '140px',
    textAlign: 'left',
    padding: '14px 16px',
    borderRadius: '12px',
    backgroundColor: COLORS.cardAlt,
    border: `1px solid ${COLORS.border}`,
    color: COLORS.text,
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '8px',
    backgroundColor: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    color: COLORS.text,
    fontSize: '14px',
    boxSizing: 'border-box',
    outline: 'none',
  };

  const ProFeatureBlock = ({
    title,
    previewLines,
    locked,
  }: {
    title: string;
    previewLines: string[];
    locked: boolean;
  }) => (
    <section
      style={{
        position: 'relative',
        backgroundColor: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderRadius: '16px',
        padding: '28px',
        overflow: 'hidden',
        boxShadow: COLORS.cardShadow,
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      {!locked && (
        <div style={{ marginBottom: '12px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: COLORS.accent, backgroundColor: 'rgba(37, 99, 235, 0.08)', padding: '4px 10px', borderRadius: '999px', border: '1px solid rgba(37, 99, 235, 0.2)' }}>
            PRO限定
          </span>
        </div>
      )}
      <div
        style={{
          filter: locked ? 'blur(6px)' : 'none',
          userSelect: locked ? 'none' : 'auto',
          pointerEvents: locked ? 'none' : 'auto',
        }}
      >
        <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: COLORS.text, margin: '0 0 16px 0' }}>
          {title}
        </h3>
        {previewLines.map((line, i) => (
          <p key={i} style={{ fontSize: '14px', color: COLORS.textMuted, margin: '0 0 10px 0', lineHeight: 1.7 }}>
            {line}
          </p>
        ))}
      </div>
      {locked && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(180deg, rgba(248,250,252,0.55) 0%, rgba(241,245,249,0.92) 100%)',
            gap: '12px',
            padding: '20px',
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: '28px' }}>🔒</span>
          <p style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: COLORS.text }}>
            Pro機能で表示
          </p>
          <button
            type="button"
            onClick={() => openPaywall()}
            style={{
              background: 'linear-gradient(to right, #4f46e5, #2563eb)',
              color: '#ffffff',
              fontWeight: 800,
              padding: '10px 22px',
              borderRadius: '999px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              boxShadow: '0 8px 20px rgba(37, 99, 235, 0.25)',
            }}
          >
            単発{formatYen(PRICE_SINGLE_YEN)} / 月額で解放
          </button>
        </div>
      )}
    </section>
  );

  return (
    <div
      style={{
        background: `linear-gradient(180deg, ${COLORS.pageBg} 0%, ${COLORS.pageBgDeep} 100%)`,
        minHeight: '100vh',
        color: COLORS.text,
        paddingBottom: '80px',
        fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
    >

      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(0.95); opacity: 0.8; }
          50% { transform: scale(1.05); opacity: 0.4; }
          100% { transform: scale(0.95); opacity: 0.8; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes modalFadeIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes loadingStepFade {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes progressShimmer {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
        .loading-ring { animation: spin 1.2s linear infinite; }
        .pulse-container { animation: pulse-ring 2s ease-in-out infinite; }
        .modal-animate { animation: modalFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .loading-step-text { animation: loadingStepFade 0.5s ease forwards; }
        .progress-bar-fill {
          background: linear-gradient(90deg, #2563eb 0%, #4f46e5 45%, #60a5fa 55%, #4f46e5 100%);
          background-size: 200% 100%;
          animation: progressShimmer 1.4s linear infinite;
        }

        .pro-features-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
          align-items: stretch;
        }
        @media (max-width: 768px) {
          .pro-features-grid {
            grid-template-columns: 1fr;
          }
        }

        .steps-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          align-items: stretch;
        }
        .step-card {
          display: flex;
          flex-direction: column;
          height: 100%;
          box-sizing: border-box;
          background-color: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 22px 20px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
        }
        .step-card-header {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .step-card-icon {
          font-size: 22px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
        }
        .step-card-number {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: #64748b;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 999px;
          padding: 4px 8px;
          line-height: 1;
          white-space: nowrap;
        }
        .step-card-title {
          flex: 1 1 100%;
          font-size: 15px;
          font-weight: 800;
          color: #0f172a;
          margin: 0;
          line-height: 1.3;
          text-align: center;
        }
        .step-card-body {
          font-size: 13px;
          color: #475569;
          margin: 0;
          line-height: 1.6;
          text-align: center;
          flex: 1;
        }
        @media (max-width: 768px) {
          .steps-grid {
            grid-template-columns: 1fr;
            gap: 14px;
          }
          .step-card {
            padding: 18px 16px;
          }
        }

        .footer-link {
          color: #475569;
          font-size: 13px;
          background: none;
          border: none;
          cursor: pointer;
          transition: color 0.2s;
          padding: 4px 8px;
        }
        .footer-link:hover {
          color: #2563eb;
          text-decoration: underline;
        }

        .modal-body-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .modal-body-scroll::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 4px;
        }
      `}</style>

      {/* 1. ヘッダー */}
      <header style={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${COLORS.border}`, padding: '16px 24px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🏠</span>
            <span style={{ fontSize: '20px', fontWeight: '800', background: 'linear-gradient(to right, #2563eb, #4f46e5)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              物件セカンドオピニオン AI
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={planBadgeStyle}>
              {isProUser
                ? '月額Pro会員'
                : isCurrentPropertyPurchased
                  ? '単発Pro購入済み（この物件）'
                  : '無料プラン（基本分析・無制限）'}
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: COLORS.textMuted,
                backgroundColor: COLORS.cardAlt,
                padding: '6px 10px',
                borderRadius: '8px',
                border: `1px solid ${COLORS.border}`,
              }}
              title={`userId=${user.userId}`}
            >
              {planStatusLabel}
            </span>
            {user.isLoggedIn ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = '/mypage';
                  }}
                  style={{ fontSize: '11px', fontWeight: 'bold', color: COLORS.textMuted, backgroundColor: COLORS.cardAlt, padding: '6px 12px', borderRadius: '20px', border: `1px solid ${COLORS.border}`, letterSpacing: '0.5px', cursor: 'pointer' }}
                >
                  👤 マイページ
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  style={{ fontSize: '11px', fontWeight: 'bold', color: '#b91c1c', backgroundColor: '#fef2f2', padding: '6px 12px', borderRadius: '20px', border: '1px solid #fecaca', letterSpacing: '0.5px', cursor: 'pointer' }}
                >
                  🚪 ログアウト
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => openAuthModal('login')}
                style={{ fontSize: '11px', fontWeight: 'bold', color: '#1d4ed8', backgroundColor: '#eff6ff', padding: '6px 12px', borderRadius: '20px', border: '1px solid #93c5fd', letterSpacing: '0.5px', cursor: 'pointer' }}
              >
                ログイン / 新規登録
              </button>
            )}
            <button
              type="button"
              onClick={() => openPaywall()}
              style={{ fontSize: '11px', fontWeight: 'bold', color: '#4f46e5', backgroundColor: 'rgba(79, 70, 229, 0.08)', padding: '6px 12px', borderRadius: '20px', border: '1px solid rgba(79, 70, 229, 0.25)', letterSpacing: '0.5px', cursor: 'pointer' }}
            >
              PRO VERSION
            </button>
          </div>
        </div>
      </header>

      {IS_DEV && (
        <div
          style={{
            maxWidth: '1000px',
            margin: '0 auto',
            padding: '12px 20px 0',
          }}
        >
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '12px',
              border: '1px dashed #635bff',
              background: 'linear-gradient(90deg, #f5f3ff 0%, #eff6ff 100%)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#4f46e5' }}>
              [DEV] Stripe決済テスト（ログイン不要）
            </span>
            <button
              type="button"
              disabled={!!stripeTestLoading}
              onClick={() => void startStripeCheckoutTest('SINGLE')}
              style={{
                fontSize: '12px',
                fontWeight: 800,
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #a5b4fc',
                background: stripeTestLoading === 'SINGLE' ? '#c7d2fe' : '#ffffff',
                color: '#3730a3',
                cursor: stripeTestLoading ? 'not-allowed' : 'pointer',
              }}
            >
              {stripeTestLoading === 'SINGLE' ? 'リダイレクト中...' : `💳 単発${formatYen(PRICE_SINGLE_YEN)} Checkout を開く`}
            </button>
            <button
              type="button"
              disabled={!!stripeTestLoading}
              onClick={() => void startStripeCheckoutTest('MONTHLY')}
              style={{
                fontSize: '12px',
                fontWeight: 800,
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #86efac',
                background: stripeTestLoading === 'MONTHLY' ? '#bbf7d0' : '#ffffff',
                color: '#166534',
                cursor: stripeTestLoading ? 'not-allowed' : 'pointer',
              }}
            >
              {stripeTestLoading === 'MONTHLY' ? 'リダイレクト中...' : `🔁 月額${formatYen(PRICE_MONTHLY_YEN)}（初月${formatYen(PRICE_MONTHLY_FIRST_YEN)}）Checkout を開く`}
            </button>
            <span style={{ fontSize: '11px', color: COLORS.textDim }}>
              → checkout.stripe.com へ遷移（テストカード: 4242…）
            </span>
            {stripeTestError && (
              <div style={{ width: '100%', fontSize: '12px', color: '#b91c1c', fontWeight: 700 }}>
                ⚠️ {stripeTestError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. ヒーローセクション */}
      <section style={{ textAlign: 'center', padding: '60px 20px 40px', background: 'radial-gradient(circle at top, rgba(37, 99, 235, 0.08) 0%, rgba(248, 250, 252, 0) 70%)' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <span style={{ color: COLORS.accent, fontSize: '13px', fontWeight: 'bold', letterSpacing: '2px', textTransform: 'uppercase', display: 'block', marginBottom: '12px' }}>
            不動産屋の営業トークに惑わされない
          </span>
          <h1 style={{ fontSize: '32px', fontWeight: '900', color: COLORS.text, lineHeight: '1.3', marginBottom: '16px' }}>
            AI不動産プロ査定で<br />
            <span style={{ background: 'linear-gradient(to right, #2563eb, #4f46e5)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              「隠されたリスク」
            </span>
            を即時に完全見抜く
          </h1>
          <p style={{ color: COLORS.textMuted, fontSize: '15px', lineHeight: '1.6', maxWidth: '600px', margin: '0 auto' }}>
            SUUMOやHOME&apos;Sのテキスト、間取り図画像を貼り付けるだけ。不動産鑑定士並みのロジックで適正相場・潜むデメリット・内見チェックポイントをAIが自動診断します。
          </p>
        </div>
      </section>

      {/* 3. ステップ表示 */}
      <section style={{ maxWidth: '1000px', margin: '0 auto 40px', padding: '0 20px' }}>
        <h2 style={{ textAlign: 'center', fontSize: '14px', color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '24px' }}>
          HOW IT WORKS — 簡単 3 ステップ
        </h2>
        <div className="steps-grid">
          {[
            { n: '01', icon: '📋', title: '情報をコピー', body: 'ポータルサイトの「物件概要」テキスト（家賃、広さ、築年数、駅徒歩など）をコピーします。' },
            { n: '02', icon: '📸', title: '画像添付（任意）', body: '間取り図や外観の写真画像があればアップロード。AIが図面から採光や動線も読解します。' },
            { n: '03', icon: '⚡', title: 'AI即時セカンドオピニオン', body: '数秒で100点満点のスコア、妥当性評価、プロ視点の注意点リストを分析出力します。' },
          ].map((step) => (
            <div key={step.n} className="step-card">
              <div className="step-card-header">
                <span className="step-card-icon" aria-hidden="true">{step.icon}</span>
                <span className="step-card-number">Step {step.n}</span>
                <h3 className="step-card-title">{step.title}</h3>
              </div>
              <p className="step-card-body">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 4. メイン入力フォーム */}
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '0 20px' }}>
        <section style={{ backgroundColor: COLORS.card, padding: '28px', borderRadius: '20px', border: '1px solid #bfdbfe', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 0 0 1px rgba(37, 99, 235, 0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '8px', height: '8px', backgroundColor: COLORS.accent, borderRadius: '50%', display: 'inline-block' }}></span>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: COLORS.text, margin: 0 }}>
                物件診断フォーム
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={planBadgeStyle}>基本分析は無料・回数無制限</span>
              {(inputText || imagePreviews.length > 0 || result) && (
                <button
                  onClick={handleReset}
                  disabled={loading}
                  style={{ backgroundColor: 'transparent', color: COLORS.textDim, border: 'none', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  入力内容をクリア
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: COLORS.textMuted, marginBottom: '8px' }}>
                物件タイプ
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" disabled={loading} onClick={() => setPropertyType('rental')} style={optionChipStyle(propertyType === 'rental')}>
                  賃貸
                </button>
                <button type="button" disabled={loading} onClick={() => setPropertyType('purchase')} style={optionChipStyle(propertyType === 'purchase')}>
                  分譲（購入）
                </button>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: COLORS.textMuted, marginBottom: '8px' }}>
                世帯タイプ
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" disabled={loading} onClick={() => setHouseholdType('single')} style={optionChipStyle(householdType === 'single')}>
                  一人暮らし
                </button>
                <button type="button" disabled={loading} onClick={() => setHouseholdType('family')} style={optionChipStyle(householdType === 'family')}>
                  ファミリー（同居あり）
                </button>
              </div>
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            <textarea
              disabled={loading}
              maxLength={INPUT_TEXT_MAX_LENGTH}
              style={{
                width: '100%',
                height: '160px',
                padding: '16px',
                paddingBottom: '36px',
                borderRadius: '12px',
                backgroundColor: COLORS.cardAlt,
                border: `1px solid ${
                  inputText.length >= INPUT_TEXT_MAX_LENGTH
                    ? '#fca5a5'
                    : inputText.length >= INPUT_TEXT_WARN_LENGTH
                      ? '#fdba74'
                      : COLORS.border
                }`,
                color: COLORS.text,
                fontSize: '14px',
                boxSizing: 'border-box',
                outline: 'none',
                resize: 'vertical',
                lineHeight: '1.6',
              }}
              placeholder={
                propertyType === 'rental'
                  ? `ここに物件のテキスト情報（家賃、共益費、所在地、築年数、構造、駅徒歩、設備、気になっている点など）をそのまま貼り付けてください...\n\n${FORM_INPUT_HINT}\n（最大3,000文字まで）`
                  : `ここに物件のテキスト情報（価格、管理費、修繕積立、所在地、築年数、構造、駅徒歩、設備、気になっている点など）をそのまま貼り付けてください...\n\n${FORM_INPUT_HINT}\n（最大3,000文字まで）`
              }
              value={inputText}
              onChange={(e) => setInputText(e.target.value.slice(0, INPUT_TEXT_MAX_LENGTH))}
            />
            <span
              aria-live="polite"
              style={{
                position: 'absolute',
                right: '12px',
                bottom: '10px',
                fontSize: '12px',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                pointerEvents: 'none',
                color:
                  inputText.length >= INPUT_TEXT_MAX_LENGTH
                    ? '#dc2626'
                    : inputText.length >= INPUT_TEXT_WARN_LENGTH
                      ? '#ea580c'
                      : COLORS.textDim,
              }}
            >
              {inputText.length.toLocaleString('ja-JP')} / {INPUT_TEXT_MAX_LENGTH.toLocaleString('ja-JP')}
            </span>
          </div>

          <div style={{ marginTop: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: COLORS.textMuted, marginBottom: '10px' }}>
              📷 間取り図・外観・内装画像を追加（マルチモーダルAI解析）
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={loading}
              onChange={handleImageUpload}
              style={{ fontSize: '13px', color: COLORS.textMuted }}
            />

            {imagePreviews.length > 0 && (
              <div style={{ display: 'flex', gap: '12px', marginTop: '14px', overflowX: 'auto', paddingBottom: '6px' }}>
                {imagePreviews.map((src, idx) => (
                  <div key={idx} style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
                    <img
                      src={src}
                      alt={`Preview ${idx}`}
                      style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '10px', border: '2px solid #2563eb' }}
                    />
                    <button
                      onClick={() => handleRemoveImage(idx)}
                      disabled={loading}
                      style={{ position: 'absolute', top: '-6px', right: '-6px', backgroundColor: '#ef4444', color: '#ffffff', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}
                      title="画像を削除"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            errorRetryable ? (
              <ApiErrorPanel
                message={error}
                onRetry={handleAnalyze}
                onContact={() => {
                  setContactSubmitted(false);
                  setContactError(null);
                  setActiveModal('contact');
                }}
                retryDisabled={loading}
              />
            ) : (
              <div style={{ marginTop: '20px', padding: '14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '14px', borderRadius: '10px' }}>
                ⚠️ {error}
              </div>
            )
          )}

          <div style={{ marginTop: '16px', padding: '12px 14px', backgroundColor: '#eef2ff', border: '1px solid #c7d2fe', color: '#3730a3', fontSize: '13px', borderRadius: '10px' }}>
            基本診断（スコア・メリット・リスク・詳細分析）は無料・回数無制限です。Pro限定4機能（AIチャット・内見チェック・履歴トラッキング・将来予測）は、単発{formatYen(PRICE_SINGLE_YEN)}または月額（初月{formatYen(PRICE_MONTHLY_FIRST_YEN)}）で解放できます。
          </div>

          <button
            onClick={handleAnalyze}
            disabled={loading}
            style={{ width: '100%', marginTop: '24px', backgroundColor: loading ? '#94a3b8' : '#2563eb', color: '#ffffff', fontWeight: '800', padding: '16px', borderRadius: '12px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '16px', boxShadow: loading ? 'none' : '0 4px 14px rgba(37, 99, 235, 0.3)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
          >
            {loading ? <span>⏳ 査定を実行中...</span> : '🔍 この物件をプロAI査定する'}
          </button>

          {loading && (
            <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: `1px solid ${COLORS.border}`, textAlign: 'center' }}>
              <div style={{ position: 'relative', width: '60px', height: '60px', margin: '0 auto 16px' }}>
                <div className="pulse-container" style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: 'rgba(37, 99, 235, 0.12)', border: '1px solid rgba(37, 99, 235, 0.35)' }}></div>
                <div className="loading-ring" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '4px solid transparent', borderTopColor: '#2563eb', borderRightColor: '#4f46e5' }}></div>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🏠</div>
              </div>

              <p
                key={loadingStepIndex}
                className="loading-step-text"
                style={{ color: COLORS.accent, fontSize: '14px', fontWeight: '700', margin: '0 0 16px 0', minHeight: '22px' }}
              >
                {LOADING_STEPS[loadingStepIndex]}
              </p>

              <div style={{ maxWidth: '420px', margin: '0 auto' }}>
                <div
                  style={{
                    width: '100%',
                    height: '10px',
                    backgroundColor: COLORS.elevated,
                    borderRadius: '999px',
                    overflow: 'hidden',
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <div
                    className="progress-bar-fill"
                    style={{
                      height: '100%',
                      width: `${progressPercent}%`,
                      borderRadius: '999px',
                      transition: 'width 0.15s linear',
                    }}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleCancelAnalyze}
                style={{
                  marginTop: '18px',
                  backgroundColor: '#ffffff',
                  color: '#b91c1c',
                  border: '1px solid #fecaca',
                  borderRadius: '10px',
                  padding: '10px 18px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                解析をキャンセル
              </button>
            </div>
          )}
        </section>

        {/* 5. 査定結果 */}
        {result && !loading && (
          <div style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleCopyResult}
                style={{ backgroundColor: copied ? '#22c55e' : '#64748b', color: '#ffffff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {copied ? '✓ コピーしました！' : '📋 診断結果をテキストコピー'}
              </button>
            </div>

            <section style={{ backgroundColor: COLORS.card, padding: '28px', borderRadius: '20px', border: `1px solid ${COLORS.border}`, boxShadow: COLORS.cardShadow }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: `1px solid ${COLORS.border}`, paddingBottom: '20px', gap: '16px', flexWrap: 'wrap' }}>
                <div>
                  <span style={{ color: COLORS.accent, fontSize: '12px', fontWeight: 'bold', letterSpacing: '1px' }}>AI OVERALL EVALUATION</span>
              <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: COLORS.text, margin: '4px 0 0 0' }}>
                総合診断スコア
                <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 700, color: '#15803d', backgroundColor: '#f0fdf4', padding: '3px 8px', borderRadius: '999px', border: '1px solid #bbf7d0', verticalAlign: 'middle' }}>無料・無制限</span>
              </h3>
                </div>
                <div style={{ backgroundColor: COLORS.scoreBg, border: '2px solid #2563eb', color: COLORS.text, padding: '10px 28px', borderRadius: '24px', textAlign: 'center', boxShadow: '0 4px 14px rgba(37, 99, 235, 0.15)' }}>
                  <span style={{ fontSize: '40px', fontWeight: '900', letterSpacing: '-1px', color: '#2563eb' }}>{result.score}</span>
                  <span style={{ fontSize: '14px', color: COLORS.textMuted, marginLeft: '4px', fontWeight: 700 }}>/ 100</span>
                </div>
              </div>
              <p style={{ fontSize: '15px', lineHeight: '1.8', color: COLORS.textMuted, margin: 0 }}>{result.summary}</p>
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              <section style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', padding: '24px', borderRadius: '20px', boxShadow: COLORS.cardShadow }}>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#15803d', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>👍</span> プロが評価するアドバンテージ
                </h3>
                <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '14px', color: '#166534', lineHeight: '1.7' }}>
                  {result.pros.map((pro, i) => (
                    <li key={i} style={{ marginBottom: '8px' }}>{pro}</li>
                  ))}
                </ul>
              </section>

              <section style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', padding: '24px', borderRadius: '20px', boxShadow: COLORS.cardShadow }}>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: '#b91c1c', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>⚠️</span> 潜むリスク・注意すべき欠点
                </h3>
                <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '14px', color: '#991b1b', lineHeight: '1.7' }}>
                  {result.cons.map((con, i) => (
                    <li key={i} style={{ marginBottom: '8px' }}>{con}</li>
                  ))}
                </ul>
              </section>
            </div>

            <section style={{ backgroundColor: COLORS.card, padding: '28px', borderRadius: '20px', border: `1px solid ${COLORS.border}`, boxShadow: COLORS.cardShadow }}>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: COLORS.text, margin: '0 0 20px 0', borderBottom: `1px solid ${COLORS.border}`, paddingBottom: '12px' }}>
                分野別ディープアナリシス
                <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 700, color: '#15803d', backgroundColor: '#f0fdf4', padding: '3px 8px', borderRadius: '999px', border: '1px solid #bbf7d0' }}>無料・無制限</span>
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ backgroundColor: COLORS.cardAlt, padding: '16px', borderRadius: '12px', border: `1px solid ${COLORS.border}` }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 'bold', color: COLORS.accent, margin: '0 0 6px 0' }}>💰 価格・費用感の妥当性</h4>
                  <p style={{ fontSize: '14px', color: COLORS.textMuted, margin: 0, lineHeight: '1.6' }}>{result.details.priceEvaluation}</p>
                </div>
                <div style={{ backgroundColor: COLORS.cardAlt, padding: '16px', borderRadius: '12px', border: `1px solid ${COLORS.border}` }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 'bold', color: COLORS.accent, margin: '0 0 6px 0' }}>📍 立地・生活利便性・環境</h4>
                  <p style={{ fontSize: '14px', color: COLORS.textMuted, margin: 0, lineHeight: '1.6' }}>{result.details.locationEvaluation}</p>
                </div>
                <div style={{ backgroundColor: COLORS.cardAlt, padding: '16px', borderRadius: '12px', border: `1px solid ${COLORS.border}` }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 'bold', color: COLORS.accent, margin: '0 0 6px 0' }}>📐 間取り・居住性・設備構造</h4>
                  <p style={{ fontSize: '14px', color: COLORS.textMuted, margin: 0, lineHeight: '1.6' }}>{result.details.layoutEvaluation}</p>
                </div>
              </div>
            </section>

            {/* PRO限定コンテンツ（①〜④） */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: COLORS.text }}>
                PRO限定コンテンツ（4機能）
              </h3>
              <span style={planBadgeStyle}>基本分析は無料・回数無制限</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
            {/* PRO① チャット */}
            <section
              style={{
                position: 'relative',
                backgroundColor: COLORS.card,
                border: `1px solid ${COLORS.border}`,
                borderRadius: '16px',
                padding: '24px',
                overflow: 'hidden',
                boxShadow: COLORS.cardShadow,
                height: '100%',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {!isProContentLocked && (
                <div style={{ marginBottom: '12px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: COLORS.accent, backgroundColor: 'rgba(37, 99, 235, 0.08)', padding: '4px 10px', borderRadius: '999px', border: '1px solid rgba(37, 99, 235, 0.2)' }}>
                    PRO限定①
                  </span>
                </div>
              )}
              <div style={{ filter: isProContentLocked ? 'blur(6px)' : 'none', pointerEvents: isProContentLocked ? 'none' : 'auto', userSelect: isProContentLocked ? 'none' : 'auto', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: COLORS.text, margin: '0 0 8px 0' }}>
                  💬 【PRO機能①】専属AIアドバイザーと本音チャット相談
                </h3>
                <p style={{ fontSize: '13px', color: COLORS.textMuted, margin: '0 0 16px 0' }}>
                  結論→根拠→具体アドバイスまで、フランクな本音で答えます。
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: '180px', maxHeight: '260px', overflowY: 'auto', marginBottom: '14px', padding: '12px', backgroundColor: COLORS.cardAlt, borderRadius: '12px', border: `1px solid ${COLORS.border}` }}>
                  {chatMessages.length === 0 && (
                    <p style={{ margin: 0, fontSize: '13px', color: COLORS.textDim }}>
                      例：「この家賃は交渉できそう？」「ファミリー向けの懸念点は？」
                    </p>
                  )}
                  {chatMessages.map((msg, idx) => (
                    <div
                      key={`${msg.role}-${idx}`}
                      style={{
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '85%',
                        padding: '10px 12px',
                        borderRadius: '12px',
                        backgroundColor: msg.role === 'user' ? '#2563eb' : '#ffffff',
                        color: msg.role === 'user' ? '#ffffff' : COLORS.text,
                        border: msg.role === 'user' ? 'none' : `1px solid ${COLORS.border}`,
                        fontSize: '13px',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {msg.text}
                    </div>
                  ))}
                </div>
                {chatError && (
                  chatErrorRetryable ? (
                    <ApiErrorPanel
                      message={chatError}
                      onRetry={handleChatRetry}
                      onContact={() => {
                        setContactSubmitted(false);
                        setContactError(null);
                        setActiveModal('contact');
                      }}
                      retryDisabled={chatLoading}
                    />
                  ) : (
                    <div style={{ marginBottom: '10px', padding: '10px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '8px', fontSize: '13px' }}>
                      ⚠️ {chatError}
                    </div>
                  )
                )}
                {chatLoading && (
                  <div
                    style={{
                      marginBottom: '10px',
                      padding: '10px 12px',
                      backgroundColor: 'rgba(37, 99, 235, 0.06)',
                      border: '1px solid rgba(37, 99, 235, 0.2)',
                      borderRadius: '8px',
                      color: COLORS.accent,
                      fontSize: '13px',
                      fontWeight: 700,
                    }}
                  >
                    ⏳ 詳細を分析して回答を作成中...
                  </div>
                )}
                <form onSubmit={handleChatSubmit} style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    disabled={chatLoading || isProContentLocked}
                    placeholder="この物件について本音で質問する..."
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    type="submit"
                    disabled={chatLoading || !chatInput.trim() || isProContentLocked}
                    style={{
                      backgroundColor: chatLoading ? '#94a3b8' : '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '0 16px',
                      fontWeight: 700,
                      cursor: chatLoading || !chatInput.trim() ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    送信
                  </button>
                </form>
              </div>
              {isProContentLocked && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(180deg, rgba(248,250,252,0.55) 0%, rgba(241,245,249,0.92) 100%)',
                    gap: '12px',
                    padding: '20px',
                    textAlign: 'center',
                  }}
                >
                  <span style={{ fontSize: '28px' }}>🔒</span>
                  <p style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: COLORS.text }}>Pro機能で表示</p>
                  <button
                    type="button"
                    onClick={() => openPaywall()}
                    style={{
                      background: 'linear-gradient(to right, #4f46e5, #2563eb)',
                      color: '#ffffff',
                      fontWeight: 800,
                      padding: '10px 22px',
                      borderRadius: '999px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    単発{formatYen(PRICE_SINGLE_YEN)} / 月額で解放
                  </button>
                </div>
              )}
            </section>

            {/* PRO② 内見チェックリスト */}
            {isProContentLocked ? (
              <ProFeatureBlock
                locked
                title="📋 【PRO機能②】現地内見の絶対確認チェックリスト"
                previewLines={
                  result.viewingChecklist.length > 0
                    ? result.viewingChecklist
                    : ['内見チェック項目1', '内見チェック項目2', '内見チェック項目3']
                }
              />
            ) : (
              <section style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', padding: '28px', borderRadius: '20px', boxShadow: COLORS.cardShadow, height: '100%', boxSizing: 'border-box', overflow: 'auto' }}>
                <div style={{ marginBottom: '12px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: COLORS.accent, backgroundColor: 'rgba(37, 99, 235, 0.08)', padding: '4px 10px', borderRadius: '999px', border: '1px solid rgba(37, 99, 235, 0.2)' }}>
                    PRO限定②
                  </span>
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#b45309', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📋</span> 【PRO機能②】現地内見の絶対確認チェックリスト
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {result.viewingChecklist.map((item, i) => (
                    <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', fontSize: '14px', color: '#92400e', cursor: 'pointer', backgroundColor: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                      <input type="checkbox" style={{ width: '18px', height: '18px', accentColor: '#f59e0b', marginTop: '2px', flexShrink: 0 }} />
                      <span>{item}</span>
                    </label>
                  ))}
                </div>
              </section>
            )}

            {/* PRO③ 履歴トラッキング */}
            <ProFeatureBlock
              locked={isProContentLocked}
              title={`📊 ${PRO_FEATURE3_BY_TYPE[propertyType].title}`}
              previewLines={priceHistoryLines}
            />

            {/* PRO④ 将来予測 */}
            <ProFeatureBlock
              locked={isProContentLocked}
              title={`🔮 ${PRO_FEATURE4_BY_TYPE[propertyType].title}`}
              previewLines={futureForecastLines}
            />
            </div>

            <DisclaimerNotice />
          </div>
        )}

        {/* 6. PROプラン訴求 */}
        <section style={{ marginTop: '60px', backgroundColor: COLORS.card, padding: '36px 28px', borderRadius: '24px', border: '1px solid #c7d2fe', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 0 24px rgba(79, 70, 229, 0.08)', textAlign: 'center' }}>
          <span style={{ color: '#4338ca', fontSize: '12px', fontWeight: 'bold', letterSpacing: '1px', backgroundColor: '#eef2ff', padding: '6px 14px', borderRadius: '20px', border: '1px solid #c7d2fe' }}>
            基本診断は無料・回数無制限 / Pro詳細は単発{formatYen(PRICE_SINGLE_YEN)}〜
          </span>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: COLORS.text, margin: '16px 0 12px 0' }}>
            「絶対に損したくない」あなたのためのPRO限定4機能
          </h2>
          <p style={{ fontSize: '14px', color: COLORS.textMuted, lineHeight: '1.7', maxWidth: '650px', margin: '0 auto 32px' }}>
            現在の選択：{propertyType === 'rental' ? '賃貸' : '分譲（購入）'} × {householdType === 'single' ? '一人暮らし' : 'ファミリー'}向けに、機能③④の内容を最適化して表示しています。
          </p>

          <div className="pro-features-grid" style={{ textAlign: 'left' }}>
            {proFeatures.map((item) => (
              <div key={item.title} style={{ backgroundColor: COLORS.cardAlt, padding: '24px', borderRadius: '16px', border: `1px solid ${COLORS.border}`, boxShadow: COLORS.cardShadow, height: '100%', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '22px', lineHeight: 1, flexShrink: 0 }}>{item.icon}</span>
                  <h3 style={{ color: COLORS.accentStrong, fontWeight: 'bold', fontSize: '15px', margin: 0, lineHeight: 1.4 }}>{item.title}</h3>
                </div>
                <p style={{ fontSize: '13px', color: COLORS.textMuted, lineHeight: '1.6', margin: 0 }}>{item.body}</p>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => openPaywall()}
            style={{ marginTop: '32px', background: 'linear-gradient(to right, #4f46e5, #2563eb)', color: '#ffffff', fontWeight: '800', padding: '14px 32px', borderRadius: '30px', border: 'none', cursor: 'pointer', fontSize: '15px', boxShadow: '0 4px 18px rgba(37, 99, 235, 0.3)' }}
          >
            ✨ Proプランを確認する
          </button>
        </section>
      </main>

      {/* 7. フッター */}
      <footer style={{ marginTop: '60px', textAlign: 'center', borderTop: `1px solid ${COLORS.border}`, paddingTop: '30px', paddingBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <button className="footer-link" onClick={() => setActiveModal('terms')}>
            免責事項
          </button>
          <span style={{ color: COLORS.elevated }}>|</span>
          <button className="footer-link" onClick={() => setActiveModal('agreement')}>
            利用規約
          </button>
          <span style={{ color: COLORS.elevated }}>|</span>
          <button className="footer-link" onClick={() => setActiveModal('tokushoho')}>
            特定商取引法に基づく表記
          </button>
          <span style={{ color: COLORS.elevated }}>|</span>
          <button className="footer-link" onClick={() => setActiveModal('privacy')}>
            プライバシーポリシー
          </button>
          <span style={{ color: COLORS.elevated }}>|</span>
          <button
            className="footer-link"
            onClick={() => {
              setContactSubmitted(false);
              setContactError(null);
              setActiveModal('contact');
            }}
          >
            お問い合わせ
          </button>
        </div>
        <div style={{ maxWidth: '720px', margin: '0 auto 16px', padding: '0 20px' }}>
          <DisclaimerNotice compact />
        </div>
        <p style={{ color: COLORS.textDim, fontSize: '13px', margin: 0 }}>
          © 物件セカンドオピニオン AI Pro All Rights Reserved.
        </p>

        {IS_DEV && (
          <div
            style={{
              marginTop: '24px',
              maxWidth: '900px',
              marginLeft: 'auto',
              marginRight: 'auto',
              padding: '16px',
              borderRadius: '12px',
              border: '1px dashed #f59e0b',
              backgroundColor: '#fffbeb',
              textAlign: 'left',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#b45309', marginBottom: '10px' }}>
              [DEV] ID紐づけテスト（production非表示） — userId={user.userId} / {planStatusLabel}
              {currentPropertyId ? ` / currentPropertyId=${currentPropertyId}` : ''}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button
                type="button"
                onClick={() => applyDevPlan('MONTHLY')}
                style={{ fontSize: '12px', fontWeight: 700, padding: '8px 12px', borderRadius: '8px', border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer' }}
              >
                💳 月額PRO会員にする（user.plan=MONTHLY）
              </button>
              <button
                type="button"
                onClick={purchaseCurrentPropertyForDev}
                style={{ fontSize: '12px', fontWeight: 700, padding: '8px 12px', borderRadius: '8px', border: '1px solid #86efac', background: '#f0fdf4', color: '#166534', cursor: 'pointer' }}
              >
                📄 現在の物件を購入済みにする（purchasedPropertiesへ追加）
              </button>
              <button
                type="button"
                onClick={() => applyDevPlan('FREE')}
                style={{ fontSize: '12px', fontWeight: 700, padding: '8px 12px', borderRadius: '8px', border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer' }}
              >
                🚫 解約する / 無料会員に戻す（user.plan=FREE）
              </button>
              <button
                type="button"
                onClick={() => applyDevLoginState(true)}
                style={{ fontSize: '12px', fontWeight: 700, padding: '8px 12px', borderRadius: '8px', border: '1px solid #c4b5fd', background: '#f5f3ff', color: '#5b21b6', cursor: 'pointer' }}
              >
                🔐 ログイン状態にする（isLoggedIn=true）
              </button>
              <button
                type="button"
                onClick={() => applyDevLoginState(false)}
                style={{ fontSize: '12px', fontWeight: 700, padding: '8px 12px', borderRadius: '8px', border: '1px solid #fdba74', background: '#fff7ed', color: '#c2410c', cursor: 'pointer' }}
              >
                🔓 ログアウト状態にする（isLoggedIn=false）
              </button>
            </div>
            <div style={{ marginTop: '8px', fontSize: '11px', color: '#92400e' }}>
              isLoggedIn={String(user.isLoggedIn)} / email={user.email || '—'} / authProvider={user.authProvider || '—'}
            </div>
          </div>
        )}
      </footer>

      {/* 8. モーダル */}
      {activeModal && (
        <div
          onClick={() => {
            setActiveModal(null);
            setPaywallMessage(null);
          }}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="modal-animate"
            style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: '24px', width: '100%', maxWidth: activeModal === 'paywall' || activeModal === 'auth' ? '560px' : '640px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.2)' }}
          >
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: COLORS.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
                {activeModal === 'terms' && '📜 免責事項'}
                {activeModal === 'agreement' && '📄 利用規約'}
                {activeModal === 'tokushoho' && '📄 特定商取引法に基づく表記'}
                {activeModal === 'privacy' && '🔒 プライバシーポリシー'}
                {activeModal === 'contact' && '✉️ お問い合わせ'}
                {activeModal === 'auth' && '🔐 アカウント登録 / ログイン'}
                {activeModal === 'paywall' && '💎 PROプラン登録'}
              </h3>
              <button
                onClick={() => {
                  setActiveModal(null);
                  setPaywallMessage(null);
                }}
                style={{ backgroundColor: COLORS.elevated, color: COLORS.textMuted, border: 'none', borderRadius: '50%', width: '32px', height: '32px', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body-scroll" style={{ padding: '24px', overflowY: 'auto', fontSize: '14px', lineHeight: '1.7', color: COLORS.textMuted }}>

              {activeModal === 'terms' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <p style={{ margin: 0, color: COLORS.textMuted }}>
                    「物件セカンドオピニオン AI」（以下、「当サービス」）のご利用にあたり、以下の免責事項をよくお読みください。当サービスを利用された場合、本内容に同意したものとみなします。
                  </p>
                  {[
                    { t: '1. サービスの目的と情報の正確性', b: '当サービスはAIを活用して物件情報を整理・分析するものであり、宅地建物取引業に基づく正式な査定や法的アドバイスではありません。分析結果の完全性・正確性を保証するものではありません。' },
                    { t: '2. 投資・契約判断に関する責任', b: 'スコアやリスク分析は参考情報です。実際の不動産購入・賃貸契約等の意思決定は必ずご自身の責任で行い、必要に応じて専門家へご相談ください。損害について運営者は一切責任を負いません。' },
                    { t: '3. 入力データの取り扱い', b: '入力されたテキストおよび画像は、AIによる解析処理および品質向上のために使用されます。個人を特定できる情報（氏名・電話番号等）の入力はお控えください。' },
                  ].map((item) => (
                    <div key={item.t} style={{ backgroundColor: COLORS.cardAlt, padding: '16px', borderRadius: '12px', border: `1px solid ${COLORS.border}` }}>
                      <h4 style={{ color: COLORS.accentStrong, margin: '0 0 6px 0', fontSize: '14px' }}>{item.t}</h4>
                      <p style={{ margin: 0, fontSize: '13px', color: COLORS.textDim }}>{item.b}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeModal === 'agreement' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <p style={{ margin: 0, lineHeight: 1.7 }}>
                    本利用規約は、物件セカンドオピニオン AI Pro（以下「本サービス」）の利用条件を定めるものです。
                  </p>
                  {[
                    {
                      t: '1. サービスの内容と免責事項',
                      b: '本サービスはAI（人工知能）による物件情報の自動分析・アドバイス提供を目的とするものであり、宅地建物取引業に基づく媒介行為、正式な不動産鑑定、または投資の勧誘を行うものではありません。AIによる分析結果の正確性・完全性・最新性について保証するものではなく、本サービスの利用結果に基づいて生じた損害や損失について、運営者は一切の責任を負いません。不動産の売買や投資の最終決定は、利用者ご自身の責任において行ってください。',
                    },
                    {
                      t: '2. 有料プラン・購入および支払い',
                      b: '（1）本サービスの利用料金（単発分析、PRO月額プラン等）は、サイト上に表示される価格とします。\n（2）お支払い方法は、Stripe Payments Japan合同会社が提供する決済システムを通じたクレジットカード決済等によるものとします。\n（3）デジタルコンテンツおよびサービスの性質上、購入・決済完了後の返金・返品・キャンセルには理由を問わず一切応じられません。',
                    },
                    {
                      t: '3. 月額プランの自動更新と解約',
                      b: 'PRO月額プランは、解約手続きが行われない限り自動的に更新され、月額料金が課金されます。解約はマイページよりいつでも手続きが可能です。解約手続きを行った場合でも、すでに支払われた利用料金の返金（日割り計算含む）は行われません。',
                    },
                    {
                      t: '4. 禁止事項',
                      b: '以下の行為を禁止します。\n・不正アクセス、またはサーバーに過度な負荷をかける行為\n・本サービスの分析結果を営利目的で第三者に再販売・転載する行為\n・法令、公序良俗に反する利用行為',
                    },
                    {
                      t: '5. 規約の変更',
                      b: '運営者は、必要に応じて本規約を改定することができるものとします。重要な変更を行う場合は、サイト上での掲載その他適切な方法により事前に告知します。',
                    },
                  ].map((item) => (
                    <div key={item.t} style={{ backgroundColor: COLORS.cardAlt, padding: '16px', borderRadius: '12px', border: `1px solid ${COLORS.border}` }}>
                      <h4 style={{ color: COLORS.accentStrong, margin: '0 0 6px 0', fontSize: '14px' }}>{item.t}</h4>
                      <p style={{ margin: 0, fontSize: '13px', color: COLORS.textDim, whiteSpace: 'pre-line', lineHeight: 1.7 }}>{item.b}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeModal === 'tokushoho' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <p style={{ margin: 0, lineHeight: 1.7 }}>特定商取引法に基づく表記</p>
                  {[
                    { t: '■ 販売事業者名', b: '物件セカンドオピニオン AI Pro 運営事務局' },
                    { t: '■ 運営責任者', b: 'Hiroki Matsushita' },
                    {
                      t: '■ 所在地・電話番号',
                      b: 'お問い合わせ先メールアドレスまたはお問い合わせフォームにてご請求いただければ、遅滞なく開示いたします。',
                    },
                    {
                      t: '■ お問い合わせ先',
                      b: 'サイト内「お問い合わせ」フォームよりご連絡ください。\n（メールアドレス等の詳細情報は、ご請求いただければ遅滞なく開示いたします）',
                    },
                    {
                      t: '■ 販売価格',
                      b: `・無料プラン：0円（基本AI分析・回数無制限）\n・単発Pro機能：${formatYen(PRICE_SINGLE_YEN)}（税込）\n・月額Proプラン：初月${formatYen(PRICE_MONTHLY_FIRST_YEN)}（税込）、2ヶ月目以降 ${formatYen(PRICE_MONTHLY_YEN)}/月（税込）`,
                    },
                    {
                      t: '■ 商品代金以外の必要料金',
                      b: 'インターネット接続料金および通信手数料（お客様のご負担となります）。',
                    },
                    { t: '■ 支払方法', b: 'クレジットカード決済（Stripe）' },
                    {
                      t: '■ 支払時期',
                      b: '・単発プラン：ご注文時（即時決済）\n・PRO月額プラン：初回購入時、および翌月以降の自動更新日に即時決済',
                    },
                    {
                      t: '■ 役務の提供時期',
                      b: '決済完了後、直ちに対象のPRO機能・分析機能をご利用いただけます。',
                    },
                    {
                      t: '■ 返品・返金・キャンセルについて',
                      b: 'デジタル役務の性質上、決済完了後の返金・返品・途中解約による日割り返金には原則として応じられません。\n月額プランの解約は、次回更新日までにマイページより手続きを行っていただくことで、次回以降の課金を停止できます。',
                    },
                  ].map((item) => (
                    <div key={item.t} style={{ backgroundColor: COLORS.cardAlt, padding: '16px', borderRadius: '12px', border: `1px solid ${COLORS.border}` }}>
                      <h4 style={{ color: COLORS.accentStrong, margin: '0 0 6px 0', fontSize: '14px' }}>{item.t}</h4>
                      <p style={{ margin: 0, fontSize: '13px', color: COLORS.textDim, whiteSpace: 'pre-line', lineHeight: 1.7 }}>{item.b}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeModal === 'privacy' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <p style={{ margin: 0, lineHeight: 1.7 }}>
                    当サービス（物件セカンドオピニオン AI Pro）は、ユーザーのプライバシーを尊重し、個人情報の保護に努めます。
                  </p>
                  {[
                    {
                      t: '1. 取得する情報および利用目的',
                      b: '当サービスでは、以下の情報を取得・利用します。\n・AI解析および回答生成のため：入力された物件概要テキスト、画像データ\n・決済処理のため：メールアドレス、決済識別情報\n・サービス改善・不正防止のため：アクセスログ、IPアドレス、クッキー（Cookie）情報',
                    },
                    {
                      t: '2. 外部APIへのデータ送信について',
                      b: '物件の高度な解析を行うため、Google LLC等の提供する外部AIサービス（API）を利用しています。送信されるデータは解析に必要な物件情報等であり、お客様の氏名やクレジットカード情報等の個人を特定する情報は含まれません。',
                    },
                    {
                      t: '3. 決済処理における第三者提供（Stripe社への提供）',
                      b: '当サービスでは、クレジットカード決済処理のために決済代行会社「Stripe Payments Japan合同会社」およびその関連会社（米国等）の決済システムを利用しています。\n決済手続きの際、お客様のクレジットカード情報・メールアドレス等はStripe社のサーバーに直接送信・保護され、当サービスのサーバーにはクレジットカード情報は一切保持されません。',
                    },
                    {
                      t: '4. 第三者提供の制限',
                      b: '前項の決済代行業者への委託および法令に基づく場合を除き、取得した個人情報をユーザーの同意なく第三者に提供・開示することはありません。',
                    },
                    {
                      t: '5. お問い合わせ窓口',
                      b: '個人情報の取り扱いに関するお問い合わせは、サイト内のお問い合わせフォームよりご連絡ください。',
                    },
                  ].map((item) => (
                    <div key={item.t} style={{ backgroundColor: COLORS.cardAlt, padding: '16px', borderRadius: '12px', border: `1px solid ${COLORS.border}` }}>
                      <h4 style={{ color: COLORS.accentStrong, margin: '0 0 6px 0', fontSize: '14px' }}>{item.t}</h4>
                      <p style={{ margin: 0, fontSize: '13px', color: COLORS.textDim, whiteSpace: 'pre-line', lineHeight: 1.7 }}>{item.b}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeModal === 'contact' && (
                <div>
                  {contactSubmitted ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                      <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
                      <h4 style={{ fontSize: '18px', color: COLORS.accentStrong, margin: '0 0 8px 0' }}>送信が完了しました</h4>
                      <p style={{ color: COLORS.textDim, fontSize: '14px', margin: 0 }}>
                        お問い合わせいただきありがとうございます。<br />担当者より1〜3営業日以内にご返信いたします。
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleContactSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: COLORS.textDim, marginBottom: '6px', fontWeight: 'bold' }}>お名前（任意）</label>
                        <input type="text" name="name" disabled={contactSubmitting} placeholder="山田 太郎" style={inputStyle} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: COLORS.textDim, marginBottom: '6px', fontWeight: 'bold' }}>
                          メールアドレス <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <input type="email" name="email" required disabled={contactSubmitting} placeholder="your-email@example.com" style={inputStyle} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: COLORS.textDim, marginBottom: '6px', fontWeight: 'bold' }}>
                          お問い合わせ種別 <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <select name="type" required disabled={contactSubmitting} style={inputStyle}>
                          <option value="サービスの利用方法について">サービスの利用方法について</option>
                          <option value="PROプラン（有料会員）について">PROプラン（有料会員）について</option>
                          <option value="不具合・エラーの報告">不具合・エラーの報告</option>
                          <option value="その他・ご意見ご要望">その他・ご意見ご要望</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: COLORS.textDim, marginBottom: '6px', fontWeight: 'bold' }}>
                          お問い合わせ内容 <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <textarea name="message" required rows={4} disabled={contactSubmitting} placeholder="ご自由にご記入ください..." style={{ ...inputStyle, resize: 'vertical' }} />
                      </div>
                      {contactError && (
                        <div style={{ padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '13px', borderRadius: '8px' }}>
                          ⚠️ {contactError}
                        </div>
                      )}
                      <button
                        type="submit"
                        disabled={contactSubmitting}
                        style={{ marginTop: '8px', backgroundColor: contactSubmitting ? '#94a3b8' : '#2563eb', color: '#ffffff', fontWeight: 'bold', padding: '12px', borderRadius: '8px', border: 'none', cursor: contactSubmitting ? 'not-allowed' : 'pointer', fontSize: '14px' }}
                      >
                        {contactSubmitting ? '送信中...' : '送信する'}
                      </button>
                    </form>
                  )}
                </div>
              )}

              {activeModal === 'auth' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <p style={{ margin: 0, fontSize: '14px', color: COLORS.textMuted, lineHeight: 1.7 }}>
                    {authIntent === 'paywall'
                      ? '決済の前にアカウント登録（またはログイン）が必要です。完了後、顧客ID（userId）が発行され、決済画面へ進みます。'
                      : 'アカウント登録またはログインで、マイページ・購入履歴・プラン管理をご利用いただけます。'}
                  </p>
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      background: COLORS.cardAlt,
                      border: `1px solid ${COLORS.border}`,
                      fontSize: '12px',
                      color: COLORS.textDim,
                    }}
                  >
                    {authIntent === 'paywall' && (
                      <>
                        選択中プラン: {pendingPayPlan === 'ticket' || selectedPlan === 'ticket' ? `単発${formatYen(PRICE_SINGLE_YEN)}` : `PRO月額（初月${formatYen(PRICE_MONTHLY_FIRST_YEN)}）`}
                        <br />
                      </>
                    )}
                    現在のID: {user.userId}
                  </div>

                  <button
                    type="button"
                    disabled={authSubmitting}
                    onClick={handleAuthGoogle}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '10px',
                      border: `1px solid ${COLORS.border}`,
                      background: '#ffffff',
                      fontWeight: 800,
                      fontSize: '14px',
                      cursor: authSubmitting ? 'not-allowed' : 'pointer',
                      color: COLORS.text,
                    }}
                  >
                    {authSubmitting ? '処理中...' : '🔵 Googleで続ける'}
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: COLORS.textDim, fontSize: '12px' }}>
                    <div style={{ flex: 1, height: 1, background: COLORS.border }} />
                    またはメールアドレス
                    <div style={{ flex: 1, height: 1, background: COLORS.border }} />
                  </div>

                  <form onSubmit={handleAuthEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <input
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      disabled={authSubmitting}
                      placeholder="your-email@example.com"
                      style={inputStyle}
                      autoComplete="email"
                    />
                    <button
                      type="submit"
                      disabled={authSubmitting}
                      style={{
                        background: authSubmitting ? '#94a3b8' : 'linear-gradient(to right, #4f46e5, #2563eb)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '12px',
                        fontWeight: 800,
                        cursor: authSubmitting ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      {authSubmitting
                        ? '認証中...'
                        : authIntent === 'paywall'
                          ? 'メールで登録して決済へ進む'
                          : 'メールでログイン / 新規登録'}
                    </button>
                  </form>
                  <p style={{ margin: 0, fontSize: '11px', color: COLORS.textDim, textAlign: 'center' }}>
                    ログイン後に決済・契約管理をご利用いただけます。
                  </p>
                </div>
              )}

              {activeModal === 'paywall' && (
                <div>
                  {paywallMessage ? (
                    <div style={{ textAlign: 'center', padding: '28px 12px' }}>
                      <div style={{ fontSize: '40px', marginBottom: '12px' }}>💳</div>
                      <h4 style={{ fontSize: '17px', color: COLORS.accentStrong, margin: '0 0 10px 0' }}>
                        {selectedPlan === 'ticket' ? '単発プランの処理が完了しました' : '決済処理へ進みます'}
                      </h4>
                      <p style={{ color: COLORS.textMuted, fontSize: '14px', margin: 0, whiteSpace: 'pre-line' }}>{paywallMessage}</p>
                      {isProUser && (
                        <p style={{ margin: '12px 0 0 0', fontSize: '12px', color: COLORS.textDim }}>
                          解約・契約管理はマイページまたは下のボタンから行えます。
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setActiveModal(null);
                          setPaywallMessage(null);
                        }}
                        style={{ marginTop: '20px', backgroundColor: '#2563eb', color: '#ffffff', fontWeight: 'bold', padding: '10px 24px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '14px' }}
                      >
                        閉じる
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handlePaywallSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                      <p style={{ margin: 0, fontSize: '13px', color: COLORS.textDim }}>
                        基本AI分析は無料・回数無制限です。Pro詳細分析（周辺相場・リスク深掘り等）は単発または月額でご利用ください。
                      </p>
                      {isProUser && (
                        <div style={{ padding: '12px 14px', borderRadius: '10px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: '13px', lineHeight: 1.6 }}>
                          現在は月額Pro会員です。解約・お支払い方法の変更は、アンケート回答後の Stripe 契約管理ページから行えます。
                          <div style={{ marginTop: '10px' }}>
                            <SubscriptionManageButton
                              mode="manage"
                              variant="compact"
                              userId={user.userId}
                              stripeCustomerId={user.stripeCustomerId}
                              email={user.email}
                              note={null}
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: COLORS.textDim, marginBottom: '8px', fontWeight: 'bold' }}>
                          プラン選択 <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                          <div style={freePlanCardStyle}>
                            <div style={{ fontSize: '12px', color: COLORS.textDim, marginBottom: '4px' }}>【無料プラン】</div>
                            <div style={{ fontWeight: 800, fontSize: '15px' }}>0円 / 回数無制限</div>
                            <div style={{ marginTop: '6px', fontSize: '12px', color: COLORS.textMuted, lineHeight: 1.5 }}>
                              基本的なAI分析・アドバイスをすべて利用可能（ログイン不要）
                            </div>
                          </div>
                          <button type="button" onClick={() => setSelectedPlan('ticket')} style={planCardStyle(selectedPlan === 'ticket')}>
                            <div style={{ fontSize: '12px', color: COLORS.textDim, marginBottom: '4px' }}>【単発 Pro機能】</div>
                            <div style={{ fontWeight: 800, fontSize: '15px' }}>{formatYen(PRICE_SINGLE_YEN)} / 1回</div>
                            <div style={{ marginTop: '6px', fontSize: '12px', color: COLORS.textMuted, lineHeight: 1.5 }}>
                              周辺相場・リスク深掘りなどPro詳細分析を1物件分解放（買い切り）
                            </div>
                          </button>
                          <button type="button" onClick={() => setSelectedPlan('pro')} style={planCardStyle(selectedPlan === 'pro')}>
                            <div style={{ fontSize: '12px', color: COLORS.textDim, marginBottom: '4px' }}>【月額 Proプラン】</div>
                            <div style={{ fontWeight: 800, fontSize: '15px', color: COLORS.accentStrong }}>
                              初月{formatYen(PRICE_MONTHLY_FIRST_YEN)}
                            </div>
                            <div style={{ marginTop: '6px', fontSize: '12px', color: COLORS.textMuted, lineHeight: 1.5 }}>
                              2ヶ月目以降 {formatYen(PRICE_MONTHLY_YEN)}/月・全物件のPro詳細が使い放題・いつでも解約可
                            </div>
                          </button>
                        </div>
                        {selectedPlan === 'pro' && (
                          <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: COLORS.accentStrong, fontWeight: 700 }}>
                            ご請求：初月{formatYen(PRICE_MONTHLY_FIRST_YEN)} → 翌月以降{formatYen(PRICE_MONTHLY_YEN)}/月（クレジットカード / Stripe Checkout）
                          </p>
                        )}
                        {selectedPlan === 'ticket' && (
                          <p style={{ margin: '10px 0 0 0', fontSize: '12px', color: COLORS.textMuted }}>
                            物件テキスト未入力でも購入できます
                            {currentPropertyId || inputText.trim()
                              ? `（物件キー: ${currentPropertyId || buildPropertyId(inputText)}）`
                              : '（購入時に仮キーを発行）'}
                          </p>
                        )}
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: COLORS.textDim, marginBottom: '6px', fontWeight: 'bold' }}>
                          お支払い方法
                        </label>
                        <div style={{ padding: '12px 14px', borderRadius: '10px', border: `1px solid ${COLORS.border}`, backgroundColor: COLORS.cardAlt, fontSize: '13px', fontWeight: 700, color: COLORS.text }}>
                          💳 クレジットカード（Visa / Master / JCB等）・Stripe Checkoutへ遷移します
                        </div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: COLORS.textDim, marginBottom: '6px', fontWeight: 'bold' }}>
                          メールアドレス <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <input
                          type="email"
                          required
                          value={paywallEmail}
                          onChange={(e) => setPaywallEmail(e.target.value)}
                          disabled={paywallSubmitting}
                          placeholder="billing@example.com"
                          style={inputStyle}
                          autoComplete="email"
                        />
                      </div>

                      <div style={{ padding: '12px 14px', borderRadius: '10px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', fontSize: '12px', color: '#1e40af', lineHeight: 1.6 }}>
                        「今すぐ購入 / 登録」を押すと Stripe の安全な決済ページへ移動します。カード情報の入力は Stripe 上で行います。
                      </div>

                      <button
                        type="submit"
                        disabled={paywallSubmitting}
                        style={{
                          marginTop: '4px',
                          background: paywallSubmitting ? '#94a3b8' : 'linear-gradient(to right, #4f46e5, #2563eb)',
                          color: '#ffffff',
                          fontWeight: 800,
                          padding: '14px',
                          borderRadius: '10px',
                          border: 'none',
                          cursor: paywallSubmitting ? 'not-allowed' : 'pointer',
                          fontSize: '15px',
                        }}
                      >
                        {paywallSubmitting
                          ? 'Stripeへ移動中...'
                          : selectedPlan === 'ticket'
                            ? `今すぐ単発Pro（${formatYen(PRICE_SINGLE_YEN)}）を購入`
                            : `今すぐ月額Pro（初月${formatYen(PRICE_MONTHLY_FIRST_YEN)}）に登録`}
                      </button>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px', color: COLORS.textDim, lineHeight: 1.65 }}>
                        <p style={{ margin: 0 }}>
                          🔒 いつでもマイページから解約・契約管理が可能です（解約前アンケートのあと Stripe カスタマーポータルへ進みます）
                        </p>
                        <p style={{ margin: 0 }}>
                          🛡️ クレジットカード情報はStripe（世界標準の決済システム）により安全に保護されます
                        </p>
                        <p style={{ margin: 0, textAlign: 'center' }}>
                          📄{' '}
                          <button type="button" className="footer-link" onClick={() => setActiveModal('agreement')} style={{ padding: 0, fontSize: '11px', color: COLORS.accent, textDecoration: 'underline' }}>
                            利用規約
                          </button>
                          {'　／　'}
                          <button type="button" className="footer-link" onClick={() => setActiveModal('tokushoho')} style={{ padding: 0, fontSize: '11px', color: COLORS.accent, textDecoration: 'underline' }}>
                            特定商取引法に基づく表記
                          </button>
                        </p>
                        <p style={{ margin: '4px 0 0 0', textAlign: 'center' }}>
                          決済は Stripe Checkout 上で完了します。カード情報は当サービスでは保持しません。
                        </p>
                      </div>
                    </form>
                  )}
                </div>
              )}

            </div>

            {activeModal !== 'paywall' && activeModal !== 'auth' && (
              <div style={{ padding: '16px 24px', borderTop: `1px solid ${COLORS.border}`, textAlign: 'right' }}>
                <button
                  onClick={() => setActiveModal(null)}
                  style={{ backgroundColor: COLORS.elevated, color: '#ffffff', border: 'none', padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  閉じる
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import type {
  AnalysisSnapshot,
  HouseholdType,
  PropertyType,
  UserPlan,
} from '@/lib/plan';

/** 単発プラン: 分析履歴の保持上限 */
export const ANALYSIS_HISTORY_LIMIT_SINGLE = 1;
/** 月額 Pro: 分析履歴の保持上限 */
export const ANALYSIS_HISTORY_LIMIT_MONTHLY = 5;

export type AnalysisHistorySourcePlan = 'SINGLE' | 'MONTHLY';

export type AnalysisHistoryRecord = {
  propertyId: string;
  title: string;
  locationOrUrl: string;
  analyzedAt: string;
  householdType: HouseholdType;
  propertyType: PropertyType;
  sourceText?: string;
  cachedResult?: AnalysisSnapshot | null;
  /** 保存時点のプラン区分（単発 or 月額） */
  sourcePlan: AnalysisHistorySourcePlan;
};

export function historyLimitForPlan(plan: UserPlan | AnalysisHistorySourcePlan): number {
  if (plan === 'MONTHLY') return ANALYSIS_HISTORY_LIMIT_MONTHLY;
  return ANALYSIS_HISTORY_LIMIT_SINGLE;
}

/** 同一 propertyId は上書きし、analyzedAt 昇順で古いものから truncate（FIFO） */
export function upsertAnalysisHistoryRecord(
  list: AnalysisHistoryRecord[],
  record: AnalysisHistoryRecord,
  maxItems: number
): AnalysisHistoryRecord[] {
  if (!record.propertyId || record.propertyId === 'prop_empty') return list;
  if (maxItems <= 0) return [];

  const without = list.filter((item) => item.propertyId !== record.propertyId);
  const next = [...without, record].sort(
    (a, b) => +new Date(a.analyzedAt) - +new Date(b.analyzedAt)
  );

  if (next.length <= maxItems) return next;
  return next.slice(next.length - maxItems);
}

export function normalizeAnalysisHistoryList(raw: unknown): AnalysisHistoryRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): AnalysisHistoryRecord | null => {
      if (!item || typeof item !== 'object') return null;
      const rec = item as Partial<AnalysisHistoryRecord>;
      if (typeof rec.propertyId !== 'string' || !rec.propertyId) return null;
      return {
        propertyId: rec.propertyId,
        title: typeof rec.title === 'string' ? rec.title : '名称未設定の物件',
        locationOrUrl:
          typeof rec.locationOrUrl === 'string' ? rec.locationOrUrl : '住所/URL未設定',
        analyzedAt:
          typeof rec.analyzedAt === 'string' ? rec.analyzedAt : new Date().toISOString(),
        householdType: rec.householdType === 'family' ? 'family' : 'single',
        propertyType: rec.propertyType === 'purchase' ? 'purchase' : 'rental',
        sourceText: typeof rec.sourceText === 'string' ? rec.sourceText : undefined,
        cachedResult: (rec.cachedResult as AnalysisSnapshot | null | undefined) ?? null,
        sourcePlan: rec.sourcePlan === 'MONTHLY' ? 'MONTHLY' : 'SINGLE',
      };
    })
    .filter((x): x is AnalysisHistoryRecord => !!x);
}

export const ANALYSIS_HISTORY_SAVE_NOTE =
  '単発は最新1件、月額Proは最新5件まで保存されます。必要な情報はテキスト等で別途保存してください。';

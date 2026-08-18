import { NextResponse } from 'next/server';
import {
  ANALYSIS_HISTORY_LIMIT_MONTHLY,
  ANALYSIS_HISTORY_LIMIT_SINGLE,
  historyLimitForPlan,
  normalizeAnalysisHistoryList,
  upsertAnalysisHistoryRecord,
  type AnalysisHistoryRecord,
} from '@/lib/analysis-history';
import {
  getServerUser,
  saveAnalysisHistoryToServerUser,
  toClientAnalysisHistory,
} from '@/lib/entitlements';
import { KvNotConfiguredError, isKvConfigured } from '@/lib/kv';
import {
  extractLocationOrUrl,
  extractPropertyTitle,
  type AnalysisSnapshot,
  type HouseholdType,
  type PropertyType,
} from '@/lib/plan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/analysis-history
 * Pro 権限ユーザーの分析結果を履歴保存（単発1件 / 月額5件 FIFO）
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      userId?: string;
      propertyId?: string;
      sourceText?: string;
      householdType?: HouseholdType;
      propertyType?: PropertyType;
      cachedResult?: AnalysisSnapshot | null;
      /** クライアント側のプランヒント（サーバー権威は entitlements） */
      clientPlan?: string;
      hasSinglePurchase?: boolean;
    };

    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const propertyId = typeof body.propertyId === 'string' ? body.propertyId.trim() : '';
    if (!userId) {
      return NextResponse.json({ error: 'userId が必要です。' }, { status: 400 });
    }
    if (!propertyId || propertyId === 'prop_empty') {
      return NextResponse.json({ error: 'propertyId が必要です。' }, { status: 400 });
    }
    if (!body.cachedResult || typeof body.cachedResult.score !== 'number') {
      return NextResponse.json({ error: 'cachedResult が必要です。' }, { status: 400 });
    }

    const sourceText = typeof body.sourceText === 'string' ? body.sourceText : '';
    const record: AnalysisHistoryRecord = {
      propertyId,
      title: extractPropertyTitle(sourceText || propertyId),
      locationOrUrl: extractLocationOrUrl(sourceText || propertyId),
      analyzedAt: new Date().toISOString(),
      householdType: body.householdType === 'family' ? 'family' : 'single',
      propertyType: body.propertyType === 'purchase' ? 'purchase' : 'rental',
      sourceText: sourceText || undefined,
      cachedResult: body.cachedResult,
      sourcePlan: 'SINGLE',
    };

    // KV がある場合はサーバー保存（プラン判定もサーバー側）
    if (isKvConfigured()) {
      const existing = await getServerUser(userId);
      const isMonthly = existing?.plan === 'MONTHLY';
      const hasPurchase =
        !!existing?.purchasedProperties?.some(
          (p) => p.propertyId === propertyId && !String(p.propertyId).startsWith('pending:')
        ) || !!body.hasSinglePurchase;

      if (!isMonthly && !hasPurchase) {
        return NextResponse.json(
          { error: 'Pro権限がないため分析履歴を保存できません。', saved: false },
          { status: 403 }
        );
      }

      const saved = await saveAnalysisHistoryToServerUser(userId, record);
      return NextResponse.json({
        saved: true,
        plan: saved.plan,
        userId: saved.userId,
        limit:
          saved.plan === 'MONTHLY'
            ? ANALYSIS_HISTORY_LIMIT_MONTHLY
            : ANALYSIS_HISTORY_LIMIT_SINGLE,
        analysisHistory: toClientAnalysisHistory(saved.analysisHistory),
      }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
        },
      });
    }

    // KV 未設定時: クライアントにローカル保存用の正規化結果を返す
    const clientPlan = body.clientPlan === 'MONTHLY' ? 'MONTHLY' : 'FREE';
    if (clientPlan !== 'MONTHLY' && !body.hasSinglePurchase) {
      return NextResponse.json(
        { error: 'Pro権限がないため分析履歴を保存できません。', saved: false },
        { status: 403 }
      );
    }
    const limit = historyLimitForPlan(clientPlan);
    const analysisHistory = upsertAnalysisHistoryRecord(
      [],
      { ...record, sourcePlan: clientPlan === 'MONTHLY' ? 'MONTHLY' : 'SINGLE' },
      limit
    );

    return NextResponse.json({
      saved: true,
      persisted: 'client_only',
      userId,
      plan: clientPlan,
      limit,
      analysisHistory: normalizeAnalysisHistoryList(analysisHistory),
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      },
    });
  } catch (error: unknown) {
    console.error('[analysis-history] POST error:', error);
    if (error instanceof KvNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : '履歴の保存に失敗しました。';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

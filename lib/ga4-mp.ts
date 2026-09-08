import type { NextRequest } from 'next/server';

const GA4_MEASUREMENT_ID = 'G-WVXB09MGP7';
const GA4_COLLECT_URL = 'https://www.google-analytics.com/mp/collect';

function fallbackClientId(): string {
  return `server.${Date.now()}.${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Cookie の `_ga` から GA4 client_id を取る。
 * 無ければ `server.<timestamp>.<random>` を返す。
 */
function resolveClientId(req: NextRequest): string {
  const raw = req.cookies.get('_ga')?.value;
  if (!raw) return fallbackClientId();

  const parts = raw.split('.');
  if (parts.length >= 4 && parts[parts.length - 2] && parts[parts.length - 1]) {
    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  }
  return raw.trim() || fallbackClientId();
}

/**
 * ブラウザの gtag.js が遮断されても、分析成功イベントを GA4 に記録する。
 * 失敗しても分析レスポンスは止めない。
 */
export async function sendAnalyzeExecutedToGa4(
  req: NextRequest,
  params?: { propertyType?: string; householdType?: string }
): Promise<void> {
  const apiSecret = process.env.GA4_API_SECRET;
  if (!apiSecret) {
    console.warn('[ga4-mp] GA4_API_SECRET is not set; skipped analyze_executed');
    return;
  }

  const clientId =
    req.cookies.get('_ga')?.value ||
    `server.${Date.now()}.${Math.random().toString(36).substring(2, 9)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(
      `${GA4_COLLECT_URL}?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${encodeURIComponent(apiSecret)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: resolveClientId(req) || clientId,
          events: [
            {
              name: 'analyze_executed',
              params: {
                event_category: 'analysis',
                engagement_time_msec: '100',
                ...(params?.propertyType ? { property_type: params.propertyType } : {}),
                ...(params?.householdType ? { household_type: params.householdType } : {}),
              },
            },
          ],
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      console.warn('[ga4-mp] collect failed', res.status);
    }
  } catch (err) {
    console.warn('[ga4-mp] collect error', err);
  } finally {
    clearTimeout(timeout);
  }
}

import type { NextRequest } from 'next/server';

const GA4_MEASUREMENT_ID = 'G-WVXB09MGP7';

function fallbackClientId(): string {
  return `server.${Date.now()}.${Math.random().toString(36).substring(2, 9)}`;
}

/** Cookie の `_ga` から GA4 client_id を取る。無ければサーバー生成 ID。 */
export function clientIdFromRequest(req: NextRequest): string {
  const raw = req.cookies.get('_ga')?.value;
  if (!raw) return fallbackClientId();

  const parts = raw.split('.');
  if (parts.length >= 4 && parts[parts.length - 2] && parts[parts.length - 1]) {
    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  }
  return raw.trim() || fallbackClientId();
}

function asClientId(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallbackClientId();
}

export async function sendGA4Event(
  eventName: string,
  params: Record<string, unknown> = {}
): Promise<void> {
  console.log('[GA4 MP Start] Executing GA4 event sending...');

  const apiSecret = process.env.GA4_API_SECRET;
  const measurementId = GA4_MEASUREMENT_ID;

  if (!apiSecret) {
    console.warn('[GA4 MP] GA4_API_SECRET is missing. Skipping event.');
    return;
  }

  const clientId = asClientId(params.clientId);
  if (typeof clientId !== 'string' || !clientId) {
    console.error('[GA4 MP] client_id is not a string. Skipping event.', { clientId });
    return;
  }

  const { clientId: _omitClientId, ...eventParams } = params;
  const payload = {
    client_id: clientId,
    events: [
      {
        name: eventName,
        params: {
          event_category: 'analysis',
          ...eventParams,
          engagement_time_msec: 100,
        },
      },
    ],
  };

  console.log('[GA4 MP] client_id type:', typeof payload.client_id, 'value:', payload.client_id);

  // 1. Debug endpoint (ログでエラーを確認するため)
  try {
    const debugRes = await fetch(
      `https://www.google-analytics.com/debug/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    const debugData = await debugRes.json();
    console.log('[GA4 MP Debug Result]:', JSON.stringify(debugData));
  } catch (err) {
    console.error('[GA4 MP Debug Error]:', err);
  }

  // 2. 本番送信
  try {
    const res = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    console.log('[GA4 MP Sent Status]:', res.status);
  } catch (err) {
    console.error('[GA4 MP Send Error]:', err);
  }
}

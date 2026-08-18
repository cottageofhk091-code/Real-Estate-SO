/**
 * 運用イベント発火の共通入口。
 * - 常に構造化サーバーログを出す
 * - OPS_NOTIFY_WEBHOOK_URL があれば Discord 等へ通知（将来 LINE 等も追加可能）
 * - 呼び出し元をブロックしない（失敗しても握りつぶす）
 */

export type OpsSeverity = 'info' | 'warn' | 'error' | 'critical';

export type OpsEventInput = {
  /** 例: GEMINI_MODEL_FALLBACK / GEMINI_ALL_MODELS_FAILED / CONFIG_MISSING_GEMINI_API_KEY */
  code: string;
  message: string;
  severity?: OpsSeverity;
  /** 例: /api/analyze */
  route?: string;
  /** 追加コンテキスト（機密を入れない） */
  details?: Record<string, unknown>;
  /**
   * true: Webhook 通知を試行
   * false: ログのみ
   * 省略時: severity が error/critical なら通知
   */
  notify?: boolean;
};

export type OpsEvent = OpsEventInput & {
  id: string;
  at: string;
  severity: OpsSeverity;
};

function createEventId(): string {
  return `ops_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function shouldNotify(event: OpsEvent): boolean {
  if (typeof event.notify === 'boolean') return event.notify;
  return event.severity === 'error' || event.severity === 'critical';
}

function getNotifyWebhookUrl(): string | null {
  const candidates = [
    process.env.OPS_NOTIFY_WEBHOOK_URL,
    process.env.ERROR_NOTIFY_DISCORD_WEBHOOK_URL,
    // 未設定時は連絡用 Webhook にフォールバックしない（問い合わせと混線防止）
  ];
  for (const raw of candidates) {
    const url = raw?.trim();
    if (url) return url;
  }
  return null;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function severityColor(severity: OpsSeverity): number {
  switch (severity) {
    case 'info':
      return 0x3b82f6;
    case 'warn':
      return 0xf59e0b;
    case 'error':
      return 0xef4444;
    case 'critical':
      return 0x7f1d1d;
    default:
      return 0x64748b;
  }
}

/** Discord Incoming Webhook 向けペイロード（他チャネルも同形 JSON を流用可） */
function buildDiscordPayload(event: OpsEvent) {
  const detailLines = event.details
    ? Object.entries(event.details)
        .slice(0, 12)
        .map(([k, v]) => {
          const rendered =
            typeof v === 'string' ? v : (() => {
              try {
                return JSON.stringify(v);
              } catch {
                return String(v);
              }
            })();
          return `**${k}**: ${truncate(String(rendered), 180)}`;
        })
        .join('\n')
    : '';

  return {
    username: '物件セカンドオピニオン 監視',
    embeds: [
      {
        title: `[${event.severity.toUpperCase()}] ${event.code}`,
        description: truncate(event.message, 1800),
        color: severityColor(event.severity),
        fields: [
          { name: '発生日時', value: event.at, inline: false },
          { name: 'イベントID', value: event.id, inline: true },
          ...(event.route
            ? [{ name: 'ルート', value: event.route, inline: true }]
            : []),
          ...(detailLines
            ? [{ name: '詳細', value: truncate(detailLines, 1000), inline: false }]
            : []),
        ],
        timestamp: event.at,
      },
    ],
  };
}

/**
 * 将来 LINE / Slack 等を足すときの拡張ポイント。
 * 現状は Discord Incoming Webhook 互換 JSON を POST する。
 */
async function dispatchWebhook(event: OpsEvent): Promise<void> {
  const url = getNotifyWebhookUrl();
  if (!url) {
    console.info('[ops-events] notify skipped (OPS_NOTIFY_WEBHOOK_URL unset)', {
      id: event.id,
      code: event.code,
    });
    return;
  }

  const payload = buildDiscordPayload(event);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[ops-events] webhook notify failed', {
      id: event.id,
      status: res.status,
      body: body.slice(0, 500),
    });
  }
}

/**
 * 運用イベントを発火する。
 * await しても Webhook 失敗で throw しない。
 */
export async function emitOpsEvent(input: OpsEventInput): Promise<OpsEvent> {
  const event: OpsEvent = {
    ...input,
    id: createEventId(),
    at: new Date().toISOString(),
    severity: input.severity ?? 'error',
  };

  // 構造化ログ（監視・検索用）
  const logLine = {
    type: 'ops_event',
    id: event.id,
    at: event.at,
    severity: event.severity,
    code: event.code,
    message: event.message,
    route: event.route,
    details: event.details ?? null,
  };

  if (event.severity === 'info') {
    console.info('[ops-event]', JSON.stringify(logLine));
  } else if (event.severity === 'warn') {
    console.warn('[ops-event]', JSON.stringify(logLine));
  } else {
    console.error('[ops-event]', JSON.stringify(logLine));
  }

  if (shouldNotify(event)) {
    try {
      await dispatchWebhook(event);
    } catch (err) {
      console.error('[ops-events] webhook dispatch error', {
        id: event.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return event;
}

/** リクエストをブロックしたくないとき用 */
export function emitOpsEventFireAndForget(input: OpsEventInput): void {
  void emitOpsEvent(input).catch((err) => {
    console.error('[ops-events] unexpected emit failure', err);
  });
}

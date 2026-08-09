import type { ErrorEvent, EventHint } from "@sentry/nextjs";

const REDACTED = "[Filtered]";

/** メール・電話・トークン等の機密パターンをマスクする */
const SENSITIVE_PATTERNS: RegExp[] = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  /(?:\+?81|0)\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{3,4}/g,
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]+/g,
  /\bBearer\s+[A-Za-z0-9._\-]+/gi,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization)\s*[:=]\s*["']?[^\s"',}]+/gi,
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
];

const SENSITIVE_KEY =
  /^(password|passwd|secret|token|api[_-]?key|authorization|cookie|set-cookie|email|phone|tel|address|住所|氏名|名前|電話|メール)$/i;

function scrubString(value: string): string {
  let result = value;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }
  return result;
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") {
    return scrubString(value);
  }
  if (Array.isArray(value)) {
    return value.map(scrubValue);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? REDACTED : scrubValue(child);
    }
    return out;
  }
  return value;
}

/** Sentry イベント送信前に個人情報・機密データをマスクする */
export function scrubSentryEvent(
  event: ErrorEvent,
  _hint?: EventHint,
): ErrorEvent | null {
  if (event.message) {
    event.message = scrubString(event.message);
  }

  if (event.exception?.values) {
    for (const exception of event.exception.values) {
      if (exception.value) {
        exception.value = scrubString(exception.value);
      }
    }
  }

  if (event.request) {
    if (event.request.headers) {
      event.request.headers = scrubValue(event.request.headers) as Record<
        string,
        string
      >;
    }
    if (event.request.data) {
      event.request.data = scrubValue(event.request.data);
    }
    if (event.request.query_string) {
      if (typeof event.request.query_string === "string") {
        event.request.query_string = scrubString(event.request.query_string);
      } else {
        event.request.query_string = scrubValue(
          event.request.query_string,
        ) as typeof event.request.query_string;
      }
    }
    if (event.request.cookies) {
      event.request.cookies = scrubValue(event.request.cookies) as Record<
        string,
        string
      >;
    }
  }

  if (event.user) {
    event.user = {
      ...event.user,
      email: event.user.email ? REDACTED : undefined,
      ip_address: event.user.ip_address ? REDACTED : undefined,
      username: event.user.username ? REDACTED : undefined,
    };
  }

  if (event.extra) {
    event.extra = scrubValue(event.extra) as typeof event.extra;
  }

  if (event.contexts) {
    event.contexts = scrubValue(event.contexts) as typeof event.contexts;
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
      ...crumb,
      message: crumb.message ? scrubString(crumb.message) : crumb.message,
      data: crumb.data
        ? (scrubValue(crumb.data) as typeof crumb.data)
        : crumb.data,
    }));
  }

  return event;
}

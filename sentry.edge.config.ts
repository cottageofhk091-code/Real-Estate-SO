import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./lib/sentry-scrub";

Sentry.init({
  dsn:
    process.env.NEXT_PUBLIC_SENTRY_DSN ??
    "https://50c780a5801c2dcbc82f40b7a4733fc4@o4511880740274176.ingest.us.sentry.io/4511880774483968",

  sendDefaultPii: false,

  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  beforeSend(event, hint) {
    return scrubSentryEvent(event, hint);
  },
});

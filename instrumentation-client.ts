// Turbopack / Next.js 16 ではクライアント初期化は本ファイル経由。
// 設定本体は sentry.client.config.ts に集約。
import * as Sentry from "@sentry/nextjs";
import "./sentry.client.config";

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

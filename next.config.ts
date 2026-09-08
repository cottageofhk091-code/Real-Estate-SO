import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Vercel 上で誤って data/ をトレース・同梱しない
  outputFileTracingExcludes: {
    "*": ["./data/**", "data/**"],
  },
};

export default withSentryConfig(nextConfig, {
  // ソースマップアップロード用（未設定時はスキップ）
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  silent: !process.env.CI,

  // 認証トークンが無い環境ではソースマップアップロードを無効化（ビルド失敗を防ぐ）
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },

  // クライアント向けファイルのアップロード範囲を拡大（トークンがある場合のみ有効）
  widenClientFileUpload: Boolean(process.env.SENTRY_AUTH_TOKEN),

  // 広告ブロッカー回避（任意）
  tunnelRoute: "/monitoring",

  // ロガー文をツリーシェイクしてバンドルを削減
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});

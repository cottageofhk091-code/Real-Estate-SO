import * as Sentry from "@sentry/nextjs";

export async function register() {
  // Node.js ランタイムの API（analyze / chat 等）起動時に fs ガードを有効化
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    const { installVercelFsGuard } = await import("./lib/vercel-fs-guard");
    installVercelFsGuard();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;

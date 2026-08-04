export async function register() {
  // Node.js ランタイムの API（analyze / chat 等）起動時に fs ガードを有効化
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { installVercelFsGuard } = await import('./lib/vercel-fs-guard');
    installVercelFsGuard();
  }
}

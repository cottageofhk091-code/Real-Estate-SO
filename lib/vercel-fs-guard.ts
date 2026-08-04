import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Vercel / Lambda では /var/task が読み取り専用。
 * 依存ライブラリが process.cwd()/data へ mkdir しても /tmp へ逃がす。
 */
let patched = false;

function isServerless(): boolean {
  return !!(
    process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.AWS_LAMBDA_FUNCTION_NAME
  );
}

function remapPath(input: fs.PathLike): string {
  const raw = typeof input === 'string' ? input : input.toString();
  const normalized = raw.replace(/\\/g, '/');
  const safeRoot = path.join(os.tmpdir(), 'bukken-ai');

  // 典型: /var/task/data , ./data , data
  if (
    normalized === 'data' ||
    normalized === './data' ||
    normalized.endsWith('/data') ||
    normalized.includes('/var/task/data') ||
    /(^|\/)data(\/|$)/.test(normalized)
  ) {
    return path.join(safeRoot, 'data');
  }

  // /var/task 配下への書き込み全般を /tmp へ
  if (normalized.startsWith('/var/task/')) {
    return path.join(safeRoot, normalized.slice('/var/task/'.length));
  }

  return raw;
}

export function installVercelFsGuard(): void {
  if (patched || !isServerless()) return;
  patched = true;

  const origMkdir = fsp.mkdir.bind(fsp);
  (fsp as { mkdir: typeof fsp.mkdir }).mkdir = ((
    p: fs.PathLike,
    options?: Parameters<typeof fsp.mkdir>[1]
  ) => {
    const target = remapPath(p);
    return origMkdir(target, options as never).catch(async (err: unknown) => {
      // 最終手段: /tmp 直下へ
      const fallback = path.join(os.tmpdir(), 'bukken-ai-fallback');
      console.warn('[vercel-fs-guard] mkdir failed, fallback to', fallback, err);
      return origMkdir(fallback, { recursive: true } as never);
    });
  }) as typeof fsp.mkdir;

  const origMkdirSync = fs.mkdirSync.bind(fs);
  fs.mkdirSync = ((p: fs.PathLike, options?: fs.MakeDirectoryOptions) => {
    try {
      return origMkdirSync(remapPath(p), options);
    } catch (err) {
      const fallback = path.join(os.tmpdir(), 'bukken-ai-fallback');
      console.warn('[vercel-fs-guard] mkdirSync failed, fallback to', fallback, err);
      return origMkdirSync(fallback, { recursive: true });
    }
  }) as typeof fs.mkdirSync;

  const origWriteFile = fsp.writeFile.bind(fsp);
  (fsp as { writeFile: typeof fsp.writeFile }).writeFile = ((
    p: fs.PathLike,
    data: Parameters<typeof fsp.writeFile>[1],
    options?: Parameters<typeof fsp.writeFile>[2]
  ) => origWriteFile(remapPath(p), data, options as never)) as typeof fsp.writeFile;

  const origWriteFileSync = fs.writeFileSync.bind(fs);
  fs.writeFileSync = ((
    p: fs.PathLike,
    data: Parameters<typeof fs.writeFileSync>[1],
    options?: Parameters<typeof fs.writeFileSync>[2]
  ) => origWriteFileSync(remapPath(p), data, options)) as typeof fs.writeFileSync;

  console.log('[vercel-fs-guard] installed (remap /var/task/data -> /tmp)');
}

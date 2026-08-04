import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Vercel / Lambda では /var/task が読み取り専用。
 * 依存ライブラリの mkdir/writeFile が ./data や /var/task/data を触っても
 * 例外を投げずスキップ（または /tmp）し、分析本体を止めない。
 */
let patched = false;

function shouldGuard(): boolean {
  if (process.env.VERCEL || process.env.VERCEL_ENV) return true;
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return true;
  if (process.env.NODE_ENV === 'production') return true;
  try {
    const cwd = process.cwd().replace(/\\/g, '/');
    if (cwd.startsWith('/var/task') || cwd.startsWith('/vercel')) return true;
  } catch {
    return true;
  }
  return false;
}

function isFsSkipPath(input: fs.PathLike): boolean {
  const raw = typeof input === 'string' ? input : input.toString();
  const n = raw.replace(/\\/g, '/');
  return (
    n === 'data' ||
    n === './data' ||
    n.endsWith('/data') ||
    n.includes('/var/task/data') ||
    n.includes('/var/task/') ||
    /(^|\/)data(\/|$)/.test(n)
  );
}

function tmpDataPath(): string {
  return path.join(os.tmpdir(), 'bukken-ai', 'data');
}

export function installVercelFsGuard(): void {
  if (patched) return;
  // 本番/サーバーレス以外でも危険パスはスキップできるよう、ガード自体は常時インストール
  patched = true;

  const skipOnlyDangerous = !shouldGuard();

  const origMkdir = fsp.mkdir.bind(fsp);
  (fsp as { mkdir: typeof fsp.mkdir }).mkdir = (async (
    p: fs.PathLike,
    options?: Parameters<typeof fsp.mkdir>[1]
  ) => {
    if (isFsSkipPath(p)) {
      console.warn('[vercel-fs-guard] FS mkdir skipped:', String(p));
      try {
        return (await origMkdir(tmpDataPath(), { recursive: true } as never)) as never;
      } catch (e) {
        console.warn('FS write skipped', e);
        return tmpDataPath() as never;
      }
    }
    if (skipOnlyDangerous) {
      return origMkdir(p, options as never);
    }
    try {
      return await origMkdir(p, options as never);
    } catch (e) {
      console.warn('FS write skipped', e);
      try {
        return (await origMkdir(tmpDataPath(), { recursive: true } as never)) as never;
      } catch (e2) {
        console.warn('FS write skipped', e2);
        return tmpDataPath() as never;
      }
    }
  }) as typeof fsp.mkdir;

  const origMkdirSync = fs.mkdirSync.bind(fs);
  fs.mkdirSync = ((p: fs.PathLike, options?: fs.MakeDirectoryOptions) => {
    if (isFsSkipPath(p)) {
      console.warn('[vercel-fs-guard] FS mkdirSync skipped:', String(p));
      try {
        return origMkdirSync(tmpDataPath(), { recursive: true });
      } catch (e) {
        console.warn('FS write skipped', e);
        return tmpDataPath();
      }
    }
    try {
      return origMkdirSync(p, options);
    } catch (e) {
      if (skipOnlyDangerous) throw e;
      console.warn('FS write skipped', e);
      try {
        return origMkdirSync(tmpDataPath(), { recursive: true });
      } catch (e2) {
        console.warn('FS write skipped', e2);
        return tmpDataPath();
      }
    }
  }) as typeof fs.mkdirSync;

  // callback-style fs.mkdir
  const origMkdirCb = fs.mkdir.bind(fs);
  (fs as { mkdir: typeof fs.mkdir }).mkdir = ((
    p: fs.PathLike,
    optionsOrCb?: fs.MakeDirectoryOptions | ((err: NodeJS.ErrnoException | null, path?: string) => void),
    cb?: (err: NodeJS.ErrnoException | null, path?: string) => void
  ) => {
    const callback = typeof optionsOrCb === 'function' ? optionsOrCb : cb;
    const options = typeof optionsOrCb === 'function' ? undefined : optionsOrCb;
    if (isFsSkipPath(p)) {
      console.warn('[vercel-fs-guard] FS mkdir(cb) skipped:', String(p));
      if (callback) {
        try {
          const created = origMkdirSync(tmpDataPath(), { recursive: true });
          callback(null, typeof created === 'string' ? created : tmpDataPath());
        } catch (e) {
          console.warn('FS write skipped', e);
          callback(null, tmpDataPath());
        }
        return;
      }
      return;
    }
    return origMkdirCb(p, options as never, callback as never);
  }) as typeof fs.mkdir;

  const origWriteFile = fsp.writeFile.bind(fsp);
  (fsp as { writeFile: typeof fsp.writeFile }).writeFile = (async (
    p: fs.PathLike,
    data: Parameters<typeof fsp.writeFile>[1],
    options?: Parameters<typeof fsp.writeFile>[2]
  ) => {
    if (isFsSkipPath(p) || shouldGuard()) {
      if (isFsSkipPath(p)) {
        console.warn('[vercel-fs-guard] FS writeFile skipped:', String(p));
        try {
          await origMkdir(tmpDataPath(), { recursive: true } as never);
          return await origWriteFile(
            path.join(tmpDataPath(), path.basename(String(p)) || 'cache.bin'),
            data,
            options as never
          );
        } catch (e) {
          console.warn('FS write skipped', e);
          return;
        }
      }
    }
    try {
      return await origWriteFile(p, data, options as never);
    } catch (e) {
      if (skipOnlyDangerous) throw e;
      console.warn('FS write skipped', e);
    }
  }) as typeof fsp.writeFile;

  const origWriteFileSync = fs.writeFileSync.bind(fs);
  fs.writeFileSync = ((
    p: fs.PathLike,
    data: Parameters<typeof fs.writeFileSync>[1],
    options?: Parameters<typeof fs.writeFileSync>[2]
  ) => {
    if (isFsSkipPath(p)) {
      console.warn('[vercel-fs-guard] FS writeFileSync skipped:', String(p));
      try {
        origMkdirSync(tmpDataPath(), { recursive: true });
        return origWriteFileSync(
          path.join(tmpDataPath(), path.basename(String(p)) || 'cache.bin'),
          data,
          options
        );
      } catch (e) {
        console.warn('FS write skipped', e);
        return;
      }
    }
    try {
      return origWriteFileSync(p, data, options);
    } catch (e) {
      if (skipOnlyDangerous) throw e;
      console.warn('FS write skipped', e);
    }
  }) as typeof fs.writeFileSync;

  console.log('[vercel-fs-guard] installed');
}

/** 分析API等から明示的に呼ぶ用（失敗しても throw しない） */
export function safeSkipFsWrite(label: string, fn: () => void | Promise<void>): void {
  try {
    const result = fn();
    if (result && typeof (result as Promise<void>).then === 'function') {
      void (result as Promise<void>).catch((e) => console.warn(`FS write skipped (${label})`, e));
    }
  } catch (e) {
    console.warn(`FS write skipped (${label})`, e);
  }
}

export function isFilesystemError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  return (
    code === 'ENOENT' ||
    code === 'EACCES' ||
    code === 'EROFS' ||
    /ENOENT|EACCES|EROFS|mkdir|writeFile|\/var\/task\/data|\.\/data/i.test(message)
  );
}

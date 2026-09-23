export const PENDING_SIGNUP_KEY = 'bukken_ai_pending_signup';
export const PENDING_RECOVERY_KEY = 'bukken_ai_pending_recovery';
export const AUTH_PING_KEY = 'bukken_ai_auth_ping';
export const AUTH_RECOVERY_PING_KEY = 'bukken_ai_auth_recovery_ping';
export const AUTH_CHANNEL = 'bukken_ai_auth';
export const SIGNUP_WELCOME_MESSAGE =
  '新規登録ありがとうございます！1回無料のPro分析をお試しいただけます。';

export function markPendingSignup(email: string): void {
  try {
    sessionStorage.setItem(PENDING_SIGNUP_KEY, email.trim().toLowerCase());
  } catch {
    // ignore
  }
}

export function clearPendingSignup(): void {
  try {
    sessionStorage.removeItem(PENDING_SIGNUP_KEY);
  } catch {
    // ignore
  }
}

export function hasPendingSignup(): boolean {
  try {
    return Boolean(sessionStorage.getItem(PENDING_SIGNUP_KEY));
  } catch {
    return false;
  }
}

export function markPendingRecovery(email: string): void {
  try {
    sessionStorage.setItem(PENDING_RECOVERY_KEY, email.trim().toLowerCase());
  } catch {
    // ignore
  }
}

export function clearPendingRecovery(): void {
  try {
    sessionStorage.removeItem(PENDING_RECOVERY_KEY);
  } catch {
    // ignore
  }
}

export function hasPendingRecovery(): boolean {
  try {
    return Boolean(sessionStorage.getItem(PENDING_RECOVERY_KEY));
  } catch {
    return false;
  }
}

export function notifySignupConfirmed(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUTH_PING_KEY, JSON.stringify({ at: Date.now() }));
  } catch {
    // ignore
  }
  try {
    const channel = new BroadcastChannel(AUTH_CHANNEL);
    channel.postMessage({ type: 'signup-confirmed' });
    channel.close();
  } catch {
    // ignore
  }
}

export function notifyPasswordRecovery(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUTH_RECOVERY_PING_KEY, JSON.stringify({ at: Date.now() }));
  } catch {
    // ignore
  }
  try {
    const channel = new BroadcastChannel(AUTH_CHANNEL);
    channel.postMessage({ type: 'password-recovery' });
    channel.close();
  } catch {
    // ignore
  }
}

export function isAuthHelperPath(pathname: string): boolean {
  return (
    pathname.startsWith('/auth/confirmed') ||
    pathname.startsWith('/auth/password-reset-notice') ||
    pathname.startsWith('/auth/reset-password')
  );
}

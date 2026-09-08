export const GA_MEASUREMENT_ID = 'G-WVXB09MGP7';

type GtagFn = (...args: unknown[]) => void;

type GaWindow = Window & {
  dataLayer?: unknown[];
  gtag?: GtagFn;
  __ga4Configured?: boolean;
};

function getGaWindow(): GaWindow | null {
  if (typeof window === 'undefined') return null;
  return window as GaWindow;
}

/** gtag が未定義でも dataLayer へ積めるようにする */
export function ensureGtag(): GtagFn | null {
  const w = getGaWindow();
  if (!w) return null;
  w.dataLayer = w.dataLayer || [];
  if (typeof w.gtag !== 'function') {
    w.gtag = function gtag() {
      w.dataLayer!.push(arguments);
    };
  }
  return w.gtag;
}

export function configureGa4(): void {
  const w = getGaWindow();
  if (!w || w.__ga4Configured) return;
  const gtag = ensureGtag();
  if (!gtag) return;
  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID, { send_page_view: true });
  w.__ga4Configured = true;
}

export function trackAnalyzeExecuted(): void {
  const gtag = ensureGtag();
  if (!gtag) return;
  gtag('event', 'analyze_executed', { event_category: 'analysis' });
}

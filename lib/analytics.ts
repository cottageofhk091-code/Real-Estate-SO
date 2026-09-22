import { createBrowserSupabase } from '@/lib/supabase-browser';

/** users_profiles / app_logs と同じアプリ識別子（lib/supabase.ts の APP_NAME_REALESTATE） */
const APP_NAME = 'realestate' as const;
const TRACKED_KEY = 'has_tracked_visit';

function categorizeSource(utmSource: string | null, referrer: string): string {
  if (utmSource) {
    const src = utmSource.toLowerCase();
    if (src.includes('x') || src.includes('twitter')) return 'X';
    if (src.includes('note')) return 'note';
    if (src.includes('google')) return 'Google';
    if (src.includes('yahoo')) return 'Yahoo';
    return utmSource;
  }

  if (referrer) {
    const ref = referrer.toLowerCase();
    if (ref.includes('t.co') || ref.includes('x.com') || ref.includes('twitter.com')) {
      return 'X';
    }
    if (ref.includes('note.com')) return 'note';
    if (ref.includes('google.')) return 'Google';
    if (ref.includes('yahoo.')) return 'Yahoo';
    if (ref.includes('instagram.com')) return 'Instagram';
    return 'Other Referral';
  }

  return 'Direct';
}

/**
 * セッション中1度だけ、流入元（UTM / referrer）を analytics_visits に記録する。
 */
export async function trackVisit(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    if (sessionStorage.getItem(TRACKED_KEY)) return;
  } catch {
    // sessionStorage 利用不可時は計測をスキップ（プライベートモード等）
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const utmSource = urlParams.get('utm_source');
  const referrer = document.referrer || '';
  const sourceCategory = categorizeSource(utmSource, referrer);

  const supabase = createBrowserSupabase();
  if (!supabase) {
    console.warn('[analytics] Supabase client unavailable; skip visit tracking');
    return;
  }

  try {
    const { error } = await supabase.from('analytics_visits').insert({
      app_name: APP_NAME,
      source_category: sourceCategory,
      utm_source: utmSource || null,
      referrer: referrer || null,
    });

    if (error) {
      console.error('Visit tracking failed:', error.message);
      return;
    }

    sessionStorage.setItem(TRACKED_KEY, 'true');
  } catch (err) {
    console.error('Visit tracking failed:', err);
  }
}

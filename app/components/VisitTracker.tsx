'use client';

import { useEffect } from 'react';
import { trackVisit } from '@/lib/analytics';

/** 初回マウント時に流入元を1セッション1回だけ記録する */
export default function VisitTracker() {
  useEffect(() => {
    void trackVisit();
  }, []);

  return null;
}

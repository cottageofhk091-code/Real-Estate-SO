/** 表示・Checkout 共通の料金定数（税込・円） */

/** 単発 Pro（1物件・1回） */
export const PRICE_SINGLE_YEN = 300;
/** 月額 Pro 通常価格（2ヶ月目以降） */
export const PRICE_MONTHLY_YEN = 980;
/** 月額 Pro 初月請求額 */
export const PRICE_MONTHLY_FIRST_YEN = 500;
/** 初月値引き額（通常 − 初月）※ Stripe once クーポン用 */
export const PRICE_MONTHLY_FIRST_DISCOUNT_YEN =
  PRICE_MONTHLY_YEN - PRICE_MONTHLY_FIRST_YEN;

/** 無料プラン（基本分析） */
export const PRICE_FREE_YEN = 0;

export function formatYen(amount: number): string {
  return `${amount.toLocaleString('ja-JP')}円`;
}

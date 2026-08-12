/** 表示・Checkout 共通の料金定数（税込・円） */

/** 単発 */
export const PRICE_SINGLE_YEN = 500;
/** 月額通常価格 */
export const PRICE_MONTHLY_YEN = 980;
/** 初月請求額 */
export const PRICE_MONTHLY_FIRST_YEN = 500;
/** 初月値引き額（通常 − 初月） */
export const PRICE_MONTHLY_FIRST_DISCOUNT_YEN =
  PRICE_MONTHLY_YEN - PRICE_MONTHLY_FIRST_YEN;

export function formatYen(amount: number): string {
  return `${amount.toLocaleString('ja-JP')}円`;
}

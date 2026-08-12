/**
 * 互換レイヤー: 旧 import 経路を新 entitlements ストアへ委譲。
 * fs / mkdir / data ディレクトリ操作は含まない。
 */
export {
  addPurchasedPropertyToServerUser,
  applySubscriptionStatus,
  findServerUserByCustomerId,
  getServerUser,
  isKvConfigured,
  markPaymentFailedByCustomerId,
  setFreePlanByCustomerId,
  setFreePlanByUserId,
  setMonthlyPlan,
  toClientPurchasedRecords,
  upsertServerUser,
  type ServerPurchasedProperty,
  type ServerUserRecord,
} from '@/lib/entitlements';

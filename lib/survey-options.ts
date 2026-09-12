/** アンケート用・年代（氏名等の個人情報は含めない） */
export const AGE_GROUP_OPTIONS = [
  '20代',
  '30代',
  '40代',
  '50代',
  '60代以上',
  '未回答',
] as const;

export type AgeGroup = (typeof AGE_GROUP_OPTIONS)[number];

/** 都道府県（詳細住所は取得しない） */
export const PREFECTURE_OPTIONS = [
  '北海道',
  '青森県',
  '岩手県',
  '宮城県',
  '秋田県',
  '山形県',
  '福島県',
  '茨城県',
  '栃木県',
  '群馬県',
  '埼玉県',
  '千葉県',
  '東京都',
  '神奈川県',
  '新潟県',
  '富山県',
  '石川県',
  '福井県',
  '山梨県',
  '長野県',
  '岐阜県',
  '静岡県',
  '愛知県',
  '三重県',
  '滋賀県',
  '京都府',
  '大阪府',
  '兵庫県',
  '奈良県',
  '和歌山県',
  '鳥取県',
  '島根県',
  '岡山県',
  '広島県',
  '山口県',
  '徳島県',
  '香川県',
  '愛媛県',
  '高知県',
  '福岡県',
  '佐賀県',
  '長崎県',
  '熊本県',
  '大分県',
  '宮崎県',
  '鹿児島県',
  '沖縄県',
  '海外・その他',
  '未回答',
] as const;

export type Prefecture = (typeof PREFECTURE_OPTIONS)[number];

export function isAgeGroup(value: string): value is AgeGroup {
  return (AGE_GROUP_OPTIONS as readonly string[]).includes(value);
}

export function isPrefecture(value: string): value is Prefecture {
  return (PREFECTURE_OPTIONS as readonly string[]).includes(value);
}

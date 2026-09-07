import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'プライバシーポリシー | 物件セカンドオピニオン AI',
  description: '物件セカンドオピニオン AI Pro のプライバシーポリシー',
};

const SECTIONS = [
  {
    t: '1. 取得する情報および利用目的',
    b: '当サービスでは、以下の情報を取得・利用します。\n・AI解析および回答生成のため：入力された物件概要テキスト、画像データ\n・決済処理のため：メールアドレス、決済識別情報\n・サービス改善・不正防止・利用状況の把握のため：アクセスログ、IPアドレス、Cookie（クッキー）情報、分析ツールにより収集される利用データ',
  },
  {
    t: '2. Google アナリティクス（GA4）の利用について',
    b: '当サービスでは、利用状況の把握およびサービス改善のため、Google LLC が提供する Google アナリティクス 4（測定ID: G-WVXB09MGP7）を利用しています。\nGoogle アナリティクスは Cookie 等を用いて、ページ閲覧数や分析実行などの利用イベントを収集します。収集データは個人を特定しない形で統計的に処理されます。\nGoogle によるデータの取り扱いの詳細は、Google のプライバシーポリシーおよび「Google のサービスを使用するサイトやアプリから収集した情報の Google による使用」をご確認ください。\nブラウザの設定により Cookie を無効にすることもできますが、その場合サービスの一部機能が正しく動作しないことがあります。',
  },
  {
    t: '3. 外部APIへのデータ送信について',
    b: '物件の高度な解析を行うため、Google LLC等の提供する外部AIサービス（API）を利用しています。送信されるデータは解析に必要な物件情報等であり、お客様の氏名やクレジットカード情報等の個人を特定する情報は含まれません。',
  },
  {
    t: '4. 決済処理における第三者提供（Stripe社への提供）',
    b: '当サービスでは、クレジットカード決済処理のために決済代行会社「Stripe Payments Japan合同会社」およびその関連会社（米国等）の決済システムを利用しています。\n決済手続きの際、お客様のクレジットカード情報・メールアドレス等はStripe社のサーバーに直接送信・保護され、当サービスのサーバーにはクレジットカード情報は一切保持されません。',
  },
  {
    t: '5. 第三者提供の制限',
    b: '前項の決済代行業者への委託、分析ツール提供者への統計データの提供、および法令に基づく場合を除き、取得した個人情報をユーザーの同意なく第三者に提供・開示することはありません。',
  },
  {
    t: '6. お問い合わせ窓口',
    b: '個人情報の取り扱いに関するお問い合わせは、サイト内のお問い合わせフォーム、または support@cloudflowriver.com よりご連絡ください。',
  },
] as const;

export default function PrivacyPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
        color: '#0f172a',
        padding: '40px 20px 64px',
      }}
    >
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            marginBottom: '24px',
            color: '#2563eb',
            fontSize: '14px',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          ← トップへ戻る
        </Link>

        <h1 style={{ fontSize: '28px', fontWeight: 800, margin: '0 0 12px' }}>
          プライバシーポリシー
        </h1>
        <p style={{ margin: '0 0 28px', lineHeight: 1.7, color: '#475569', fontSize: '15px' }}>
          当サービス（物件セカンドオピニオン AI Pro）は、ユーザーのプライバシーを尊重し、個人情報の保護に努めます。
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {SECTIONS.map((item) => (
            <section
              key={item.t}
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '16px 18px',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
              }}
            >
              <h2
                style={{
                  margin: '0 0 8px',
                  fontSize: '15px',
                  fontWeight: 700,
                  color: '#4f46e5',
                }}
              >
                {item.t}
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: '14px',
                  color: '#64748b',
                  whiteSpace: 'pre-line',
                  lineHeight: 1.7,
                }}
              >
                {item.b}
              </p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

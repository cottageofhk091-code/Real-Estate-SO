import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteTitle =
  "AI物件アナライザー | プロ視点の不動産リスク・掘り出し度判定ツール";
const siteDescription =
  "物件テキストを貼るだけ！不動産屋が教えない裏側のメリット・デメリット・注意点をAIが即座にプロ目線で解析します。";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: siteTitle,
    template: "%s | AI物件アナライザー",
  },
  description: siteDescription,
  keywords: [
    "物件査定",
    "賃貸",
    "SUUMO",
    "不動産リスク",
    "内見チェックリスト",
    "AI物件解析",
    "掘り出し物件",
  ],
  authors: [{ name: "AI物件アナライザー" }],
  creator: "AI物件アナライザー",
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: "/",
    siteName: "AI物件アナライザー",
    title: siteTitle,
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${notoSansJp.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans text-slate-900">
        {children}
      </body>
    </html>
  );
}

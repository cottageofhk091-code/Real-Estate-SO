// app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  title: '不動産AIセカンドオピニオン',
  description: 'プロの建築士・コンサルタント視点で物件をAI査定',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/app-x-logo.png?v=999', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/app-x-logo.png?v=999',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-WVXB09MGP7"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag('js', new Date());
            gtag('config', 'G-WVXB09MGP7');
          `}
        </Script>
        {children}
        <Analytics />
      </body>
    </html>
  );
}

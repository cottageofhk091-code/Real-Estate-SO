// app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  title: '不動産AIセカンドオピニオン',
  description: 'プロの建築士・コンサルタント視点で物件をAI査定',
  icons: {
    icon: [
      { url: '/app-x-logo.png?v=999', type: 'image/png' },
    ],
    shortcut: '/app-x-logo.png?v=999',
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
        {children}
        <Analytics />
      </body>
    </html>
  );
}
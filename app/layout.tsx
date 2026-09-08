import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PWAProvider } from '@/components/pwa-provider';
import { ThemeProvider } from '@/context/theme-context';

export const viewport: Viewport = {
  themeColor: '#101217',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'Remix Hamed Trading Lab',
  description: 'سامانه شخصی تحلیل و معامله آزمایشی cTrader برای ویندوز و اندروید',
  applicationName: 'TradingLab',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'TradingLab',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'Remix Hamed Trading Lab',
    description: 'سامانه شخصی تحلیل و معامله آزمایشی cTrader برای ویندوز و اندروید',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Remix Hamed Trading Lab',
    description: 'سامانه شخصی تحلیل و معامله آزمایشی cTrader برای ویندوز و اندروید',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning className="dark">
      <body suppressHydrationWarning className="bg-[var(--bg-canvas)] text-[var(--text-primary)] antialiased min-h-screen selection:bg-cyan-600 selection:text-white">
        <ThemeProvider>
          <PWAProvider>
            {children}
          </PWAProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

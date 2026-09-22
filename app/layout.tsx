import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import MotionProvider from '@/components/MotionProvider';
import TickerBar from '@/components/TickerBar';

export const metadata: Metadata = {
  title: {
    default: 'Assay — The Independent Standard for Robinhood Chain Launchpads',
    template: '%s — Assay',
  },
  description:
    'Assay rigorously evaluates every launchpad on Robinhood Chain using objective on-chain telemetry and an open editorial methodology. Zero sponsored slots. Re-assessed continuously.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

// Runs before paint so the saved theme (or system preference) applies
// immediately — otherwise a dark-mode visitor briefly sees the light
// theme flash before React hydrates.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var saved = localStorage.getItem("assay_theme");
    var theme = saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col bg-paper text-ink">
        <MotionProvider>
          <TickerBar />
          <Nav />
          <main className="flex-1">{children}</main>
          <Footer />
        </MotionProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from 'next';
import { Manrope, Space_Grotesk } from 'next/font/google';
import { RouteLoadingOverlay } from '../components/RouteLoadingOverlay';
import './globals.css';

const manrope = Manrope({
  variable: '--font-body',
  subsets: ['latin'],
});

const spaceGrotesk = Space_Grotesk({
  variable: '--font-display',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'TMS Platform',
  description: 'Employee, project, task, MIS, and WhatsApp operations dashboard.',
};

// Without this, mobile browsers use a desktop-width layout viewport and the
// responsive Tailwind breakpoints never apply at their intended phone sizes.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${manrope.variable} ${spaceGrotesk.variable}`}>
      <body>
        {children}
        <RouteLoadingOverlay />
      </body>
    </html>
  );
}

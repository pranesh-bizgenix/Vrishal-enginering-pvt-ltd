import type { Metadata } from 'next';
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

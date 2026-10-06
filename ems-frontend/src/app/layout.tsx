import type { Metadata, Viewport } from 'next';
import { RouteLoadingOverlay } from '../components/RouteLoadingOverlay';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vrishal Engineering TMS',
  description: 'Vrishal Engineering Pvt Ltd employee, project, task, MIS, and operations dashboard.',
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
    <html lang="en">
      <body>
        {children}
        <RouteLoadingOverlay />
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GTA V Completion Tracker',
  description: 'Track GTA V 100% completion and achievements.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

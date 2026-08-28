import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NIXGOFOOD',
  description: 'Menús digitales para restaurantes.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen flex flex-col antialiased">
        {children}
      </body>
    </html>
  );
}

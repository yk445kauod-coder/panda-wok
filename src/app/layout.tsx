import type { Metadata } from 'next';
import './globals.css';
import { AIAssistantWidget } from '@/components/AIAssistantWidget';

export const metadata: Metadata = {
  title: 'Panda Wok | Authentic Asian Cloud Kitchen Alexandria',
  description: 'Handcrafted Asian, Japanese & Chinese Asian cuisine delivered fresh in Alexandria, Egypt. Wok, Ramen, Sushi & Izakaya specialties.',
  metadataBase: new URL('https://pandawok.eg'),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-brand-dark text-brand-paper selection:bg-brand-accent selection:text-white flex flex-col relative">
        {children}
        <AIAssistantWidget />
      </body>
    </html>
  );
}

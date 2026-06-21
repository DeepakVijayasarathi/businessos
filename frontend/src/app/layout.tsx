import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { Toaster } from 'react-hot-toast';
import { QueryProvider } from '@/components/layout/QueryProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: { default: 'BusinessOS AI', template: '%s | BusinessOS AI' },
  description: 'All-in-one AI-powered business platform — CRM, HR, Projects, Finance, and more',
  keywords: ['CRM', 'HR Management', 'Project Management', 'Business Automation', 'AI'],
  openGraph: {
    type: 'website',
    title: 'BusinessOS AI',
    description: 'All-in-one AI-powered business platform',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <QueryProvider>
            {children}
            <Toaster
              position="top-right"
              containerStyle={{ top: 80 }}
              toastOptions={{
                duration: 4000,
                style: {
                  background: 'var(--background)',
                  color: 'var(--foreground)',
                  border: '1px solid var(--border)',
                  borderRadius: '0.75rem',
                  fontSize: '14px',
                },
              }}
            />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

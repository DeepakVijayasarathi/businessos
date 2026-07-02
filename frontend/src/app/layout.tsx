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
                // Note: --background etc. hold raw HSL tuples — must wrap in hsl()
                style: {
                  background: 'hsl(var(--card))',
                  color: 'hsl(var(--card-foreground))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '12px',
                  fontSize: '13.5px',
                  fontWeight: 500,
                  padding: '12px 16px',
                  maxWidth: '400px',
                  boxShadow: '0 10px 40px -10px rgba(0,0,0,0.25)',
                },
                success: {
                  iconTheme: { primary: '#10b981', secondary: '#ffffff' },
                  style: { borderLeft: '3px solid #10b981' },
                },
                error: {
                  duration: 5000,
                  iconTheme: { primary: '#ef4444', secondary: '#ffffff' },
                  style: { borderLeft: '3px solid #ef4444' },
                },
              }}
            />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

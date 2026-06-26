'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { AIAgent } from '@/components/AIAgent';
import { CompanySettingsProvider } from '@/providers/CompanySettingsProvider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, fetchMe } = useAuthStore();
  const router = useRouter();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  // Guard against hydration mismatch: zustand-persist restores isAuthenticated=true
  // from localStorage on the client, but SSR always sees false → different trees crash.
  // Render the spinner until after first client paint (safe neutral state both sides).
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchMe()
      .then(() => {
        const { isAuthenticated, user } = useAuthStore.getState();
        if (!isAuthenticated) {
          router.push('/login');
        } else if (user?.isSuperAdmin && !user?.companyId) {
          // Super admins with no company context belong in the admin panel
          router.push('/admin');
        }
      })
      .catch(() => {
        router.push('/login');
      });

    // Auto-logout when any request fails to refresh the token
    const handleForceLogout = () => {
      useAuthStore.setState({ user: null, isAuthenticated: false });
    };
    window.addEventListener('bos:logout', handleForceLogout);
    return () => window.removeEventListener('bos:logout', handleForceLogout);
  }, [fetchMe, router]);

  if (!mounted || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <CompanySettingsProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
        <Sidebar isMobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header onMenuClick={() => setMobileSidebarOpen(true)} />
          <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-indigo-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg">
            Skip to content
          </a>
          <main id="main-content" className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
        <AIAgent />
      </div>
    </CompanySettingsProvider>
  );
}

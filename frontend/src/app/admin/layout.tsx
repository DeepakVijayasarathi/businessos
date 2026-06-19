'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, fetchMe } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    fetchMe().then(() => {
      const state = useAuthStore.getState();
      if (!state.isAuthenticated) {
        router.push('/login');
      } else if (!state.user?.isSuperAdmin) {
        router.push('/dashboard');
      }
    });
  }, [fetchMe, router]);

  if (!isAuthenticated || !user?.isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

'use client';
import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Dashboard error]', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="glass-card rounded-2xl p-10 max-w-md w-full flex flex-col items-center gap-4 text-center">
        <AlertTriangle className="w-10 h-10 text-orange-400" />
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white text-lg">Something went wrong</h2>
          <p className="text-sm text-gray-500 mt-1">
            {error?.message || 'An unexpected error occurred on this page.'}
          </p>
        </div>
        <button
          onClick={reset}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700"
        >
          <RefreshCw className="w-4 h-4" /> Try again
        </button>
      </div>
    </div>
  );
}

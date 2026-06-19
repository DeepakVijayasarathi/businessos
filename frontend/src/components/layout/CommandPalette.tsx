'use client';
import { Search, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading } = useQuery({
    queryKey: ['global-search', debouncedQuery],
    queryFn: async () => {
      if (debouncedQuery.length < 2) return { results: [] };
      const { data } = await api.get(`/search?q=${encodeURIComponent(debouncedQuery)}`);
      return data.data;
    },
    enabled: debouncedQuery.length >= 2,
  });

  const results = data?.results || [];

  const iconMap: Record<string, string> = {
    lead: '🎯', contact: '👤', deal: '💼', ticket: '🎫', invoice: '📄', employee: '👔', project: '📁',
  };
  const typeLabel: Record<string, string> = {
    lead: 'Lead', contact: 'Contact', deal: 'Deal', ticket: 'Ticket', invoice: 'Invoice', employee: 'Employee', project: 'Project',
  };

  const navigate = (href: string) => { router.push(href); onClose(); };

  const quickLinks = [
    { label: 'Dashboard', href: '/dashboard', icon: '🏠' },
    { label: 'CRM Leads', href: '/dashboard/crm/leads', icon: '🎯' },
    { label: 'Helpdesk', href: '/dashboard/helpdesk', icon: '🎫' },
    { label: 'Finance Invoices', href: '/dashboard/finance/invoices', icon: '📄' },
    { label: 'AI Assistant', href: '/dashboard/ai', icon: '🤖' },
    { label: 'Settings', href: '/dashboard/settings', icon: '⚙️' },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-start justify-center pt-24 px-4" onClick={onClose}>
      <div className="w-full max-w-xl glass-card rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Search input */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search leads, contacts, deals, tickets..."
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none"
          />
          {isLoading && <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />}
          <kbd className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">ESC</kbd>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {debouncedQuery.length < 2 ? (
            <>
              <p className="text-xs text-gray-400 uppercase tracking-wider px-3 py-2">Quick Navigation</p>
              {quickLinks.map(link => (
                <button key={link.href} onClick={() => navigate(link.href)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left">
                  <span className="text-base">{link.icon}</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{link.label}</span>
                  <ExternalLink className="w-3 h-3 text-gray-400 ml-auto" />
                </button>
              ))}
            </>
          ) : results.length === 0 && !isLoading ? (
            <div className="p-8 text-center text-gray-400 text-sm">No results for &quot;{query}&quot;</div>
          ) : (
            <>
              <p className="text-xs text-gray-400 uppercase tracking-wider px-3 py-2">{results.length} results</p>
              {results.map((r: any, i: number) => (
                <button key={i} onClick={() => navigate(r.href)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors text-left group">
                  <span className="text-base w-6 text-center">{iconMap[r.type] || '📌'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{r.label}</p>
                    {r.sub && <p className="text-xs text-gray-500 truncate">{r.sub}</p>}
                  </div>
                  <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full flex-shrink-0 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900">
                    {typeLabel[r.type]}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center gap-4 text-xs text-gray-400">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>ESC close</span>
        </div>
      </div>
    </div>
  );
}

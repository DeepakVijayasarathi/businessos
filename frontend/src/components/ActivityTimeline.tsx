'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import { Plus, Pencil, Trash2, History, ChevronDown, ChevronUp } from 'lucide-react';

const ACTION_META: Record<string, { label: string; icon: any; dot: string }> = {
  POST: { label: 'created', icon: Plus, dot: 'bg-green-500' },
  PUT: { label: 'updated', icon: Pencil, dot: 'bg-blue-500' },
  PATCH: { label: 'updated', icon: Pencil, dot: 'bg-blue-500' },
  DELETE: { label: 'deleted', icon: Trash2, dot: 'bg-red-500' },
};

const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'companyId']);

function diffFields(before: any, after: any) {
  if (!before || !after) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: { field: string; from: any; to: any }[] = [];
  keys.forEach((key) => {
    if (SYSTEM_FIELDS.has(key)) return;
    const from = before[key];
    const to = after[key];
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes.push({ field: key, from, to });
    }
  });
  return changes;
}

function formatValue(v: any) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

interface ActivityTimelineProps {
  module: string;
  resourceId: string;
  title?: string;
}

export default function ActivityTimeline({ module, resourceId, title = 'Record History' }: ActivityTimelineProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['activity', module, resourceId],
    queryFn: async () => {
      const { data } = await api.get(`/activity?module=${module}&resourceId=${resourceId}&limit=20`);
      return data;
    },
    enabled: !!resourceId,
  });

  const logs = data?.data || [];

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
        <History className="w-4 h-4 text-gray-400" />
        <h2 className="font-semibold text-gray-900 dark:text-white text-sm">{title}</h2>
      </div>

      {isLoading ? (
        <div className="p-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />)}
        </div>
      ) : isError ? (
        <div className="p-8 text-center text-gray-400 text-sm">Failed to load history</div>
      ) : logs.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm">No changes recorded yet</div>
      ) : (
        <div className="p-5">
          <div className="relative">
            <div className="absolute left-3.5 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
            <div className="space-y-4">
              {logs.map((log: any) => {
                const meta = ACTION_META[log.action] || { label: log.action.toLowerCase(), icon: Pencil, dot: 'bg-gray-400' };
                const Icon = meta.icon;
                const userName = log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System';
                const changes = diffFields(log.before, log.after);
                const isOpen = expanded === log.id;
                return (
                  <div key={log.id} className="relative flex gap-3 pl-9">
                    <div className={`absolute left-1 w-5 h-5 rounded-full ${meta.dot} flex items-center justify-center`}>
                      <Icon className="w-2.5 h-2.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          <span className="font-medium text-gray-900 dark:text-white">{userName}</span> {meta.label} this record
                        </p>
                        <span className="text-xs text-gray-400 flex-shrink-0">{formatRelativeTime(log.createdAt)}</span>
                      </div>
                      {changes.length > 0 && (
                        <button
                          onClick={() => setExpanded(isOpen ? null : log.id)}
                          className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-1"
                        >
                          {changes.length} field{changes.length > 1 ? 's' : ''} changed
                          {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}
                      {isOpen && changes.length > 0 && (
                        <div className="mt-2 space-y-1.5 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                          {changes.map((c) => (
                            <div key={c.field} className="text-xs">
                              <span className="font-medium text-gray-600 dark:text-gray-400 capitalize">{c.field.replace(/([A-Z])/g, ' $1')}: </span>
                              <span className="text-red-500 line-through">{formatValue(c.from)}</span>
                              {' → '}
                              <span className="text-green-600">{formatValue(c.to)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

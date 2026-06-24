'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp, Users, Target, DollarSign, MessageSquare, Headphones, Percent, CalendarDays } from 'lucide-react';

const RevenueChart = dynamic(() => import('./RevenueChart'), { ssr: false });

const COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

const DATE_RANGES = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '1y', days: 365 },
];

export default function AnalyticsPage() {
  const [rangeDays, setRangeDays] = useState(30);

  const { data: revenue } = useQuery({
    queryKey: ['analytics-revenue', rangeDays],
    queryFn: async () => { const { data } = await api.get(`/analytics/revenue?days=${rangeDays}`); return data.data; },
  });

  const { data: leadFunnel } = useQuery({
    queryKey: ['lead-funnel', rangeDays],
    queryFn: async () => { const { data } = await api.get(`/analytics/leads/funnel?days=${rangeDays}`); return data.data; },
  });

  const { data: support } = useQuery({
    queryKey: ['analytics-support', rangeDays],
    queryFn: async () => { const { data } = await api.get(`/analytics/support?days=${rangeDays}`); return data.data; },
  });

  const { data: aiUsage } = useQuery({
    queryKey: ['analytics-ai', rangeDays],
    queryFn: async () => { const { data } = await api.get(`/analytics/ai/usage?days=${rangeDays}`); return data.data; },
  });

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => { const { data } = await api.get('/analytics/dashboard'); return data.data; },
  });

  const totalLeads = leadFunnel?.reduce((s: number, f: any) => s + (f._count || 0), 0) || 0;
  const wonLeads = leadFunnel?.find((f: any) => f.status === 'won')?._count || 0;
  const conversionRate = totalLeads > 0 ? ((wonLeads / totalLeads) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-8 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Analytics</h1>
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          <CalendarDays className="w-4 h-4 text-gray-400 ml-2" />
          {DATE_RANGES.map(r => (
            <button
              key={r.days}
              onClick={() => setRangeDays(r.days)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${rangeDays === r.days ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {[
          { label: 'Total Revenue', value: formatCurrency(stats?.revenue?.total || 0), icon: DollarSign, color: 'bg-emerald-500' },
          { label: 'Total Leads', value: stats?.leads?.total || 0, icon: Target, color: 'bg-indigo-500' },
          { label: 'Won Deals', value: stats?.deals?.wonCount || 0, icon: TrendingUp, color: 'bg-purple-500' },
          { label: 'Active Employees', value: stats?.employees?.active || 0, icon: Users, color: 'bg-blue-500' },
          { label: 'Open Tickets', value: stats?.tickets?.open || 0, icon: Headphones, color: 'bg-orange-500' },
          { label: 'AI Conversations', value: stats?.ai?.conversationsThisMonth || 0, icon: MessageSquare, color: 'bg-pink-500' },
          { label: 'Conversion Rate', value: `${conversionRate}%`, icon: Percent, color: 'bg-teal-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="glass-card rounded-2xl p-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Revenue Trend */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-6">Monthly Revenue</h2>
          <RevenueChart revenue={revenue} />
        </div>

        {/* Lead Funnel */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-6">Lead Funnel</h2>
          {leadFunnel?.length > 0 ? (
            <div className="space-y-3">
              {leadFunnel.map((s: any, i: number) => {
                const max = Math.max(...leadFunnel.map((l: any) => l._count));
                const pct = max > 0 ? (s._count / max) * 100 : 0;
                return (
                  <div key={s.status}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="capitalize text-gray-600 dark:text-gray-400">{s.status}</span>
                      <span className="font-medium text-gray-900 dark:text-white">{s._count}</span>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-gray-400 text-sm text-center py-12">No data yet</p>}
        </div>

        {/* Support Analytics */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-6">Support Overview</h2>
          {support?.byStatus?.length > 0 ? (
            <div className="space-y-3">
              {support.byStatus.map((s: any, i: number) => (
                <div key={s.status} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-sm text-gray-600 dark:text-gray-400 capitalize">{s.status.replace('_', ' ')}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{s._count}</span>
                </div>
              ))}
              {support.avgResolutionHours > 0 && (
                <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-500">Avg. Resolution Time: <span className="font-medium text-gray-900 dark:text-white">{support.avgResolutionHours}h</span></p>
                </div>
              )}
            </div>
          ) : <p className="text-gray-400 text-sm text-center py-8">No ticket data</p>}
        </div>

        {/* AI Usage */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-6">AI Usage (Last 30 Days)</h2>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl text-center">
              <p className="text-2xl font-bold text-indigo-600">{aiUsage?.conversations || 0}</p>
              <p className="text-xs text-gray-500 mt-1">Conversations</p>
            </div>
            <div className="p-4 bg-purple-50 dark:bg-purple-950/30 rounded-xl text-center">
              <p className="text-2xl font-bold text-purple-600">{aiUsage?.messages || 0}</p>
              <p className="text-xs text-gray-500 mt-1">Messages</p>
            </div>
          </div>
          {aiUsage?.byType?.length > 0 && (
            <div className="space-y-2">
              {aiUsage.byType.map((t: any, i: number) => (
                <div key={t.type} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-gray-600 dark:text-gray-400 capitalize">{t.type}</span>
                  </div>
                  <span className="font-medium text-gray-900 dark:text-white">{t._count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

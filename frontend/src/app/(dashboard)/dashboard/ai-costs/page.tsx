'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  DollarSign, Zap, BarChart3, Activity, TrendingUp,
  RefreshCw, Brain, MessageSquare, FileText, BookOpen,
  Target, Users, Layers, AlertCircle, CheckCircle, Settings,
  Cpu, Bot,
} from 'lucide-react';

interface UsageStats {
  period: number;
  migrationRequired?: boolean;
  totals: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
  };
  byModel: {
    model: string;
    provider: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }[];
  byModule: {
    module: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }[];
  daily: {
    date: string;
    cost: number;
    inputTokens: number;
    outputTokens: number;
    requests: number;
  }[];
}

interface AiConfig {
  provider: string;
  model: string;
  hasKey: boolean;
  companyProvider?: string;
  companyModel?: string;
}

const MODULE_LABELS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  'brain-chat':      { label: 'Business Intelligence', icon: Brain },
  'chat':            { label: 'AI Chat',               icon: MessageSquare },
  'contract-review': { label: 'Contract Review',       icon: FileText },
  'project-ai':      { label: 'Project AI',            icon: Target },
  'knowledge-base':  { label: 'Knowledge Base',        icon: BookOpen },
  'okr':             { label: 'OKR Suggestions',       icon: TrendingUp },
  'crm':             { label: 'CRM AI',                icon: Users },
  'hr':              { label: 'HR Insights',           icon: Users },
  'social':          { label: 'Social Studio',         icon: Layers },
  'ai':              { label: 'General AI',            icon: Brain },
};

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

function fmtCost(n: number) {
  if (n === 0) return '$0.00';
  if (n < 0.01) return '<$0.01';
  return '$' + n.toFixed(4);
}

function fmtCostBig(n: number) {
  return '$' + n.toFixed(4);
}

const PERIODS = [
  { label: '7 days',  value: '7' },
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
];

const PROVIDER_INFO: Record<string, { name: string; color: string; bg: string; darkBg: string }> = {
  openai: { name: 'OpenAI',          color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50', darkBg: 'dark:bg-emerald-950/30' },
  claude: { name: 'Anthropic Claude', color: 'text-violet-700 dark:text-violet-300',  bg: 'bg-violet-50',  darkBg: 'dark:bg-violet-950/30' },
};

export default function AICostsPage() {
  const [period, setPeriod] = useState('30');

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<UsageStats>({
    queryKey: ['ai-usage-stats', period],
    queryFn: async () => {
      const { data } = await api.get(`/ai/usage-stats?period=${period}`);
      return data.data;
    },
    staleTime: 60_000,
    retry: 1,
  });

  const { data: settingsData } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => { const { data } = await api.get('/settings/company'); return data.data; },
    staleTime: 5 * 60 * 1000,
  });

  const activeProvider: string = settingsData?.aiProvider || 'claude';
  const activeModel = activeProvider === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-6';
  const hasKey = activeProvider === 'openai'
    ? !!settingsData?.openaiConfigured
    : !!settingsData?.anthropicConfigured;
  const providerMeta = PROVIDER_INFO[activeProvider] || PROVIDER_INFO.claude;

  const totalCost = data?.totals.costUsd || 0;
  const totalRequests = data?.totals.requests || 0;
  const totalTokens = data?.totals.totalTokens || 0;
  const avgCostPerRequest = totalRequests > 0 ? totalCost / totalRequests : 0;

  const dailyData = (data?.daily || []).slice(-14);
  const maxCost = Math.max(...dailyData.map(d => d.cost), 0.001);

  const errMsg = (error as any)?.response?.data?.message || '';
  const needsMigration = data?.migrationRequired || (isError && (errMsg.includes('does not exist') || errMsg.includes('relation') || errMsg.includes('P2021')));

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">AI Cost Analysis</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Token usage and spend across all AI features</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-1 gap-1">
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  period === p.value
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Active AI Config banner */}
      <div className={`rounded-2xl border p-4 flex items-center gap-4 ${providerMeta.bg} ${providerMeta.darkBg} border-gray-200 dark:border-gray-700/60`}>
        <div className="w-10 h-10 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center shadow-sm flex-shrink-0">
          {activeProvider === 'openai' ? (
            <Bot className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Brain className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold ${providerMeta.color}`}>{providerMeta.name}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">is the active AI provider</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[11px] font-mono text-gray-700 dark:text-gray-300">
              {activeModel}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            All AI calls in this workspace use this provider and model. Change in{' '}
            <a href="/dashboard/settings" className="underline hover:no-underline">Settings → AI Config</a>.
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <CheckCircle className="w-4 h-4 text-green-500" />
          <span className="text-xs text-green-600 dark:text-green-400 font-medium">Configured</span>
        </div>
      </div>

      {/* Migration notice */}
      {needsMigration && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/20 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">Database migration required</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
                The AI usage log table does not exist yet. Run this command on your server to create it, then cost tracking will start automatically:
              </p>
              <code className="block bg-amber-100 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800/60 rounded-xl px-4 py-3 text-xs font-mono text-amber-900 dark:text-amber-200">
                docker exec -it businessos-backend-app npx prisma db push
              </code>
            </div>
          </div>
        </div>
      )}

      {/* Generic error */}
      {isError && !needsMigration && (
        <div className="rounded-2xl border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/20 p-5 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">Failed to load usage data</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{errMsg || 'Unknown error — check server logs.'}</p>
          </div>
          <button onClick={() => refetch()} className="ml-auto text-xs text-red-600 dark:text-red-400 underline hover:no-underline">Retry</button>
        </div>
      )}

      {isLoading && !isError && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-28 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      )}

      {data && !needsMigration && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700/60 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">Total Cost</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmtCostBig(totalCost)}</p>
              <p className="text-xs text-gray-400 mt-1">last {period} days</p>
            </div>

            <div className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700/60 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                  <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">Requests</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalRequests.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">AI calls made</p>
            </div>

            <div className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700/60 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">Total Tokens</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmt(totalTokens)}</p>
              <p className="text-xs text-gray-400 mt-1">
                {fmt(data.totals.inputTokens)} in · {fmt(data.totals.outputTokens)} out
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700/60 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">Avg / Request</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmtCost(avgCostPerRequest)}</p>
              <p className="text-xs text-gray-400 mt-1">cost per AI call</p>
            </div>
          </div>

          {/* Daily cost chart */}
          {dailyData.length > 0 && (
            <div className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700/60 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4">Daily Spend</h2>
              <div className="flex items-end gap-1 h-32">
                {dailyData.map((d, i) => {
                  const pct = maxCost > 0 ? (d.cost / maxCost) * 100 : 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div className="absolute bottom-full mb-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-[10px] rounded-lg px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 left-1/2 -translate-x-1/2">
                        {d.date}<br />{fmtCostBig(d.cost)}<br />{d.requests} req
                      </div>
                      <div className="w-full rounded-t-sm bg-indigo-500 dark:bg-indigo-400 transition-all min-h-[2px]" style={{ height: `${Math.max(pct, 2)}%` }} />
                      <span className="text-[9px] text-gray-400 hidden sm:block">{d.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* By model */}
            <div className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700/60 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4">By Model</h2>
              {data.byModel.length > 0 ? (
                <div className="space-y-3">
                  {data.byModel.map((m, i) => {
                    const pct = totalCost > 0 ? (m.costUsd / totalCost) * 100 : 0;
                    const bar = m.provider === 'openai' ? 'bg-emerald-500' : 'bg-violet-500';
                    const dot = m.provider === 'openai' ? 'bg-emerald-500' : 'bg-violet-500';
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                            <span className="text-xs text-gray-700 dark:text-gray-300 font-medium truncate max-w-[130px]">{m.model}</span>
                            <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-md ${
                              m.provider === 'openai'
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                                : 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400'
                            }`}>{m.provider === 'openai' ? 'OpenAI' : 'Claude'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-gray-400">{m.requests} req</span>
                            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{fmtCost(m.costUsd)}</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className={`h-full ${bar} rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">No data yet</p>
              )}
            </div>

            {/* By feature */}
            <div className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700/60 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-4">By Feature</h2>
              {data.byModule.length > 0 ? (
                <div className="space-y-3">
                  {data.byModule.map((m, i) => {
                    const pct = totalCost > 0 ? (m.costUsd / totalCost) * 100 : 0;
                    const meta = MODULE_LABELS[m.module] || { label: m.module, icon: Brain };
                    const Icon = meta.icon;
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <Icon className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                            <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">{meta.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-gray-400">{fmt(m.inputTokens + m.outputTokens)} tok</span>
                            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{fmtCost(m.costUsd)}</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">No data yet</p>
              )}
            </div>
          </div>

          {/* Full table */}
          {data.byModel.length > 0 && (
            <div className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700/60 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700/60">
                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Token &amp; Cost Breakdown</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700/60 text-left">
                      {['Model', 'Provider', 'Requests', 'Input tokens', 'Output tokens', 'Cost (USD)'].map(h => (
                        <th key={h} className="px-4 py-3 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700/40">
                    {data.byModel.map((m, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors">
                        <td className="px-4 py-3 text-xs font-medium text-gray-800 dark:text-gray-200 max-w-[160px] truncate">{m.model}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            m.provider === 'openai'
                              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                              : 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400'
                          }`}>
                            {m.provider === 'openai' ? 'OpenAI' : 'Claude'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{m.requests.toLocaleString()}</td>
                        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{fmt(m.inputTokens)}</td>
                        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{fmt(m.outputTokens)}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-gray-800 dark:text-gray-200">{fmtCostBig(m.costUsd)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 dark:bg-gray-700/20 font-semibold">
                      <td className="px-4 py-3 text-xs text-gray-800 dark:text-gray-200" colSpan={2}>Total</td>
                      <td className="px-4 py-3 text-xs text-gray-800 dark:text-gray-200">{totalRequests.toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs text-gray-800 dark:text-gray-200">{fmt(data.totals.inputTokens)}</td>
                      <td className="px-4 py-3 text-xs text-gray-800 dark:text-gray-200">{fmt(data.totals.outputTokens)}</td>
                      <td className="px-4 py-3 text-xs text-gray-800 dark:text-gray-200">{fmtCostBig(totalCost)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {totalRequests === 0 && (
            <div className="text-center py-14">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/30 dark:to-indigo-900/30 flex items-center justify-center mx-auto mb-4">
                <Brain className="w-7 h-7 text-indigo-500" />
              </div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">No AI usage yet for this period</h3>
              <p className="text-xs text-gray-400 max-w-xs mx-auto">
                Cost data appears after your first AI call. Try Business Intelligence or any AI feature to start tracking.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

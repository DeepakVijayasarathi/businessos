'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Brain, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Target, Users, DollarSign, Headphones, RefreshCw, Zap, BarChart3 } from 'lucide-react';
import { useState, useMemo } from 'react';
import toast from 'react-hot-toast';

export default function IntelligencePage() {
  const qc = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: intel, isLoading, isError: intelError } = useQuery({
    queryKey: ['ai-intelligence'],
    queryFn: async () => {
      const { data } = await api.get('/ai/intelligence');
      return data.data;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: forecast, isError: forecastError } = useQuery({
    queryKey: ['revenue-forecast'],
    queryFn: async () => {
      const { data } = await api.get('/analytics/forecast');
      return data.data;
    },
    retry: 1,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await qc.invalidateQueries({ queryKey: ['ai-intelligence'] });
      toast.success('Intelligence updated');
    } catch {
      toast.error('Failed to refresh — try again');
    } finally {
      setIsRefreshing(false);
    }
  };

  const healthColor = (score: number) => score >= 75 ? 'text-green-600' : score >= 50 ? 'text-yellow-500' : score >= 30 ? 'text-orange-500' : 'text-red-500';
  const healthBg = (score: number) => score >= 75 ? 'from-green-500 to-emerald-400' : score >= 50 ? 'from-yellow-400 to-orange-400' : score >= 30 ? 'from-orange-500 to-red-400' : 'from-red-600 to-red-400';
  const healthLabel = (score: number) => score >= 75 ? 'Excellent' : score >= 50 ? 'Good' : score >= 30 ? 'Needs Attention' : 'Critical';
  const trendIcon = (v: number) => v > 0 ? <TrendingUp className="w-4 h-4 text-green-500" /> : <TrendingDown className="w-4 h-4 text-red-500" />;

  const scoreKeys = [
    { key: 'revenue', label: 'Revenue', icon: DollarSign },
    { key: 'pipeline', label: 'Pipeline', icon: Target },
    { key: 'leads', label: 'Leads', icon: Users },
    { key: 'support', label: 'Support', icon: Headphones },
    { key: 'invoicing', label: 'Invoicing', icon: BarChart3 },
  ];

  const forecastMonths: any[] = forecast?.months ?? [];
  const maxForecast = useMemo(
    () => forecastMonths.length > 0 ? Math.max(...forecastMonths.map((m: any) => Number(m.revenue) || 0), 1) : 1,
    [forecastMonths]
  );

  const healthScore = intel?.healthScore ?? 0;
  const insights: string[] = Array.isArray(intel?.insights) ? intel.insights : [];
  const metrics = intel?.metrics ?? {};
  const scores = intel?.scores ?? {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Brain className="w-5 h-5 text-indigo-600" /> AI Business Intelligence
          </h1>
          <p className="text-sm text-gray-500 mt-1">Real-time AI analysis of your business performance</p>
        </div>
        <button onClick={handleRefresh} disabled={isRefreshing} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} /> Refresh Analysis
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => <div key={i} className="glass-card rounded-2xl p-6 h-32 animate-pulse bg-gray-100 dark:bg-gray-800" />)}
        </div>
      ) : intelError ? (
        <div className="glass-card rounded-2xl p-10 flex flex-col items-center gap-4 text-center">
          <AlertTriangle className="w-10 h-10 text-orange-400" />
          <div>
            <p className="font-semibold text-gray-800 dark:text-gray-200">Could not load intelligence data</p>
            <p className="text-sm text-gray-500 mt-1">Check that your AI keys are configured in Settings, then try refreshing.</p>
          </div>
          <button onClick={handleRefresh} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
            Try Again
          </button>
        </div>
      ) : (
        <>
          {/* Health Score Hero */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className={`col-span-1 rounded-2xl p-6 bg-gradient-to-br ${healthBg(healthScore)} text-white relative overflow-hidden`}>
              <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-8 translate-x-8" />
              <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full bg-white/10 translate-y-8 -translate-x-8" />
              <p className="text-sm font-medium opacity-80">Business Health Score</p>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-6xl font-black">{healthScore}</span>
                <span className="text-xl opacity-80 mb-2">/100</span>
              </div>
              <p className="text-sm font-semibold opacity-90 mt-1">{healthLabel(healthScore)}</p>
              <div className="mt-4 h-2 bg-white/30 rounded-full">
                <div className="h-2 bg-white rounded-full transition-all duration-1000" style={{ width: `${healthScore}%` }} />
              </div>
            </div>

            {/* Dimension Scores */}
            <div className="col-span-2 glass-card rounded-2xl p-6">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Performance by Dimension</p>
              <div className="space-y-3">
                {scoreKeys.map(({ key, label, icon: Icon }) => {
                  const val = Number(scores[key]) || 0;
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-xs text-gray-600 dark:text-gray-400 w-20">{label}</span>
                      <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full">
                        <div className={`h-2 rounded-full transition-all duration-700 ${val >= 70 ? 'bg-green-500' : val >= 40 ? 'bg-yellow-400' : 'bg-red-500'}`} style={{ width: `${val}%` }} />
                      </div>
                      <span className={`text-xs font-semibold w-8 text-right ${val >= 70 ? 'text-green-600' : val >= 40 ? 'text-yellow-600' : 'text-red-500'}`}>{val}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* AI Insights */}
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-indigo-600" />
              <h2 className="font-semibold text-gray-900 dark:text-white">AI Insights</h2>
            </div>
            {insights.length === 0 ? (
              <p className="text-sm text-gray-400">No insights available — configure AI keys in Settings to enable AI-powered analysis.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {insights.map((insight: string, i: number) => (
                  <div key={i} className={`flex items-start gap-3 p-4 rounded-xl ${i === 0 ? 'bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-800' : 'bg-gray-50 dark:bg-gray-800/50'}`}>
                    {intel?.trend === 'excellent' || intel?.trend === 'good'
                      ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      : <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />}
                    <p className="text-sm text-gray-700 dark:text-gray-300">{String(insight)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Revenue (30d)', value: `$${Number(metrics.revenue30 || 0).toLocaleString()}`, change: metrics.revenueGrowth, icon: DollarSign, colorClass: 'text-indigo-500' },
              { label: 'New Leads', value: Number(metrics.newLeads || 0), change: metrics.leadGrowth, icon: Target, colorClass: 'text-green-500' },
              { label: 'Pipeline Value', value: `$${Number(metrics.pipelineValue || 0).toLocaleString()}`, icon: TrendingUp, colorClass: 'text-blue-500' },
              { label: 'Open Tickets', value: Number(metrics.openTickets || 0), sub: `${Number(metrics.urgentTickets || 0)} urgent`, icon: Headphones, colorClass: 'text-red-500' },
            ].map(m => (
              <div key={m.label} className="glass-card rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-gray-500">{m.label}</p>
                  <m.icon className={`w-4 h-4 ${m.colorClass}`} />
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{m.value}</p>
                {m.change != null && !Number.isNaN(m.change) && (
                  <div className="flex items-center gap-1 mt-1">
                    {trendIcon(m.change)}
                    <span className={`text-xs ${m.change > 0 ? 'text-green-600' : 'text-red-500'}`}>{Math.abs(m.change).toFixed(1)}% vs last 30d</span>
                  </div>
                )}
                {m.sub && <p className="text-xs text-gray-400 mt-1">{m.sub}</p>}
              </div>
            ))}
          </div>

          {/* Revenue Forecast Chart */}
          {!forecastError && forecastMonths.length > 0 && (
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-white">Revenue Forecast</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Historical + 3-month AI projection · Pipeline: ${Number(forecast?.pipelineValue || 0).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-indigo-500 rounded inline-block" />Actual</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-indigo-300 rounded inline-block border border-dashed border-indigo-400" />Forecast</span>
                </div>
              </div>
              <div className="flex items-end gap-2 h-40">
                {forecastMonths.map((m: any, i: number) => {
                  const revenue = Number(m.revenue) || 0;
                  const pct = maxForecast > 0 ? (revenue / maxForecast) * 100 : 0;
                  const barHeight = Math.max(4, pct * 1.4);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                      <div className="relative w-full flex justify-center">
                        <div
                          className={`w-full rounded-t-lg transition-all duration-500 ${m.type === 'actual' ? 'bg-indigo-500' : 'bg-indigo-200 dark:bg-indigo-800 border-2 border-dashed border-indigo-400'}`}
                          style={{ height: `${barHeight}px` }}
                        />
                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                          ${revenue.toLocaleString()}
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 rotate-45 origin-left mt-2">{String(m.month ?? '').slice(5)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp, TrendingDown, DollarSign, Sparkles, Loader2, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ExportButton } from '@/components/ui/ExportButton';
import toast from 'react-hot-toast';

const RevenueBarChart = dynamic(() => import('./RevenueBarChart'), { ssr: false });

const HEALTH_COLORS: Record<string, string> = {
  healthy: 'text-green-600 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
  caution: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800',
  critical: 'text-red-600 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
};

export default function ReportsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastResult, setForecastResult] = useState<any>(null);

  async function runForecast() {
    setForecastLoading(true);
    try {
      const { data } = await api.post('/ai/cashflow-forecast', {});
      setForecastResult(data.data);
    } catch {
      toast.error('Forecast failed. Check AI settings.');
    } finally {
      setForecastLoading(false);
    }
  }

  const { data: pl, isLoading } = useQuery({
    queryKey: ['pl-report', year],
    queryFn: async () => { const { data } = await api.get(`/finance/reports/profit-loss?year=${year}`); return data.data; },
  });

  const { data: revenue } = useQuery({
    queryKey: ['revenue-chart', year],
    queryFn: async () => { const { data } = await api.get(`/analytics/revenue?year=${year}`); return data.data; },
  });

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const chartData = MONTHS.map((month, i) => {
    const revenueMonth = revenue?.find((r: any) => r.month === i + 1);
    return {
      month,
      revenue: revenueMonth?.total || 0,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Financial Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Profit & Loss for {year}</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none">
            {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={runForecast} disabled={forecastLoading} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 text-sm font-medium hover:bg-indigo-50 dark:hover:bg-indigo-950/30 disabled:opacity-50 transition-colors">
            {forecastLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {forecastLoading ? 'Forecasting…' : 'AI Forecast'}
          </button>
          <ExportButton endpoint="/finance/reports/profit-loss/export" filename={`profit-loss-${year}.csv`} params={{ year: String(year) }} />
        </div>
      </div>

      {/* AI Cash Flow Forecast Panel */}
      {forecastResult && (
        <div className={`rounded-2xl border p-5 ${HEALTH_COLORS[forecastResult.currentCashHealth] || ''}`}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="font-bold text-sm">AI Cash Flow Forecast</p>
                <p className="text-xs opacity-75 mt-0.5">{forecastResult.summary}</p>
              </div>
            </div>
            <button onClick={() => setForecastResult(null)} className="opacity-60 hover:opacity-100 ml-3"><X className="w-4 h-4" /></button>
          </div>
          {/* Forecast table */}
          {forecastResult.forecast?.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl overflow-hidden mb-3">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-gray-100 dark:border-gray-800">
                  {['Month', 'Revenue', 'Expenses', 'Net Cash Flow', 'Confidence'].map(h => <th key={h} className="px-4 py-2 text-left font-semibold text-gray-500">{h}</th>)}
                </tr></thead>
                <tbody>{forecastResult.forecast.map((f: any, i: number) => (
                  <tr key={i} className="border-b border-gray-50 dark:border-gray-800 last:border-0">
                    <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{f.month}</td>
                    <td className="px-4 py-2 text-green-600">{formatCurrency(f.projectedRevenue)}</td>
                    <td className="px-4 py-2 text-red-500">{formatCurrency(f.projectedExpenses)}</td>
                    <td className={`px-4 py-2 font-semibold ${f.netCashFlow >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>{formatCurrency(f.netCashFlow)}</td>
                    <td className="px-4 py-2 capitalize text-gray-500">{f.confidence}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            {forecastResult.risks?.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-1.5 opacity-75">Risks</p>
                {forecastResult.risks.map((r: string, i: number) => <div key={i} className="flex gap-1.5 text-xs mb-1"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{r}</div>)}
              </div>
            )}
            {forecastResult.recommendations?.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-1.5 opacity-75">Recommendations</p>
                {forecastResult.recommendations.map((r: string, i: number) => <div key={i} className="flex gap-1.5 text-xs mb-1"><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{r}</div>)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* P&L Summary */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 glass-card rounded-2xl animate-pulse" />)}
        </div>
      ) : !pl ? (
        <div className="glass-card rounded-2xl p-12 text-center text-gray-400">
          <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No financial data available for {year}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Revenue</p>
            </div>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(pl.totalRevenue)}</p>
            <p className="text-xs text-gray-400 mt-1">From {pl.invoiceCount} invoices</p>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-red-500" />
              </div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Expenses</p>
            </div>
            <p className="text-2xl font-bold text-red-500">{formatCurrency(pl.totalExpenses)}</p>
            <p className="text-xs text-gray-400 mt-1">From {pl.expenseCount} records</p>
          </div>
          <div className={`glass-card rounded-2xl p-5 ${pl.grossProfit >= 0 ? 'border-green-200 dark:border-green-800' : 'border-red-200 dark:border-red-800'} border`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 ${pl.grossProfit >= 0 ? 'bg-indigo-100 dark:bg-indigo-900/30' : 'bg-red-100 dark:bg-red-900/30'} rounded-xl flex items-center justify-center`}>
                <DollarSign className={`w-5 h-5 ${pl.grossProfit >= 0 ? 'text-indigo-600' : 'text-red-500'}`} />
              </div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Net Profit</p>
            </div>
            <p className={`text-2xl font-bold ${pl.grossProfit >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>{formatCurrency(pl.grossProfit)}</p>
            <p className="text-xs text-gray-400 mt-1">Margin: {pl.profitMargin?.toFixed(1)}%</p>
          </div>
        </div>
      )}

      {/* Monthly Revenue Chart */}
      <div className="glass-card rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-6">Monthly Revenue — {year}</h2>
        <RevenueBarChart chartData={chartData} />
      </div>

      {/* Monthly Breakdown Table */}
      {pl?.months && (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Monthly Breakdown</h2>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-100 dark:border-gray-800">
              <tr>
                {['Month', 'Revenue', 'Expenses', 'Net', 'Margin'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {pl.months.map((m: any, i: number) => {
                const net = (m.revenue || 0) - (m.expenses || 0);
                const margin = m.revenue ? ((net / m.revenue) * 100).toFixed(1) : '0.0';
                return (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{MONTHS[m.month - 1]}</td>
                    <td className="px-4 py-3 text-sm text-green-600 font-medium">{formatCurrency(m.revenue || 0)}</td>
                    <td className="px-4 py-3 text-sm text-red-500 font-medium">{formatCurrency(m.expenses || 0)}</td>
                    <td className={`px-4 py-3 text-sm font-bold ${net >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>{formatCurrency(net)}</td>
                    <td className={`px-4 py-3 text-xs font-medium ${parseFloat(margin) >= 0 ? 'text-green-600' : 'text-red-500'}`}>{margin}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

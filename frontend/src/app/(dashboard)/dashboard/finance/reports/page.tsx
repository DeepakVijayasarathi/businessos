'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

const RevenueBarChart = dynamic(() => import('./RevenueBarChart'), { ssr: false });

export default function ReportsPage() {
  const [year, setYear] = useState(new Date().getFullYear());

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
        <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none">
          {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

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
      )}
    </div>
  );
}

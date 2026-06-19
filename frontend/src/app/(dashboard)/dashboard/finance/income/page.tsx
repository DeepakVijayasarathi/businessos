'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Plus, TrendingUp, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';

const CATEGORIES = ['sales', 'services', 'consulting', 'rental', 'investment', 'other'];

export default function IncomePage() {
  const [showModal, setShowModal] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['income'],
    queryFn: async () => { const { data } = await api.get('/finance/income'); return data; },
  });

  const total = data?.data?.reduce((s: number, i: any) => s + (i.amount || 0), 0) || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Income</h1>
          <p className="text-sm text-gray-500 mt-0.5">{formatCurrency(total)} total recorded</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700">
          <Plus className="w-4 h-4" /> Add Income
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Income', value: formatCurrency(total), color: 'text-green-600' },
          { label: 'This Month', value: formatCurrency(data?.data?.filter((i: any) => new Date(i.date).getMonth() === new Date().getMonth()).reduce((s: number, i: any) => s + (i.amount || 0), 0) || 0), color: 'text-indigo-600' },
          { label: 'Records', value: data?.data?.length || 0, color: 'text-gray-700' },
        ].map(s => (
          <div key={s.label} className="glass-card rounded-2xl p-4">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-gray-100 dark:border-gray-800">
            <tr>
              {['Description', 'Category', 'Amount', 'Date', 'Source'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={5} className="px-4 py-3"><div className="h-5 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" /></td></tr>
              ))
            ) : data?.data?.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center">
                <TrendingUp className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-gray-400 text-sm">No income records yet</p>
              </td></tr>
            ) : data?.data?.map((inc: any) => (
              <tr key={inc.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
                      <TrendingUp className="w-4 h-4 text-green-500" />
                    </div>
                    <span className="text-sm text-gray-900 dark:text-white font-medium">{inc.description}</span>
                  </div>
                </td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs capitalize text-gray-600 dark:text-gray-300">{inc.category || 'other'}</span></td>
                <td className="px-4 py-3 text-sm font-semibold text-green-600">{formatCurrency(inc.amount)}</td>
                <td className="px-4 py-3 text-xs text-gray-400">{formatDate(inc.date)}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{inc.source || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && <IncomeModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

function IncomeModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ description: '', amount: '', category: 'sales', date: new Date().toISOString().split('T')[0], source: '' });
  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/finance/income', { ...data, amount: parseFloat(data.amount) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['income'] }); toast.success('Income recorded!'); onClose(); },
    onError: () => toast.error('Failed to record income'),
  });
  const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-green-500";
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Record Income</h3>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="p-6 space-y-4">
          <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description*</label><input required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Amount*</label><input required type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" className={inputCls} /></div>
            <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={inputCls} /></div>
          </div>
          <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={inputCls}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Source</label><input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} placeholder="Customer name, invoice #, etc." className={inputCls} /></div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Recording...' : 'Record'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

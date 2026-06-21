'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDate, formatCurrency, statusColor } from '@/lib/utils';
import { Plus, TrendingDown, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { TextField, SelectField, TextAreaField } from '@/components/ui/FormField';

const CATEGORIES = ['travel', 'office', 'software', 'marketing', 'utilities', 'salaries', 'equipment', 'other'];

export default function ExpensesPage() {
  const [status, setStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', status],
    queryFn: async () => {
      const params = status ? `?status=${status}` : '';
      const { data } = await api.get(`/finance/expenses${params}`);
      return data;
    },
  });

  const total = data?.data?.reduce((s: number, e: any) => s + (e.amount || 0), 0) || 0;
  const pending = data?.data?.filter((e: any) => e.status === 'pending').length || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Expenses</h1>
          <p className="text-sm text-gray-500 mt-0.5">{formatCurrency(total)} total</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700">
          <Plus className="w-4 h-4" /> Add Expense
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Expenses', value: formatCurrency(total), color: 'text-red-600' },
          { label: 'Pending Approval', value: pending, color: 'text-yellow-600' },
          { label: 'This Month', value: formatCurrency(data?.data?.filter((e: any) => new Date(e.date).getMonth() === new Date().getMonth()).reduce((s: number, e: any) => s + (e.amount || 0), 0) || 0), color: 'text-indigo-600' },
        ].map(s => (
          <div key={s.label} className="glass-card rounded-2xl p-4">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {['', 'pending', 'approved', 'rejected'].map(s => (
          <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 rounded-full text-xs font-medium border capitalize transition-all ${status === s ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>{s || 'All'}</button>
        ))}
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-gray-100 dark:border-gray-800">
            <tr>
              {['Description', 'Category', 'Amount', 'Date', 'Status'].map(h => (
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
                <Receipt className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-gray-400 text-sm">No expenses</p>
              </td></tr>
            ) : data?.data?.map((exp: any) => (
              <tr key={exp.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-center justify-center">
                      <TrendingDown className="w-4 h-4 text-red-500" />
                    </div>
                    <span className="text-sm text-gray-900 dark:text-white font-medium">{exp.description}</span>
                  </div>
                </td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs capitalize text-gray-600 dark:text-gray-300">{exp.category}</span></td>
                <td className="px-4 py-3 text-sm font-semibold text-red-600">{formatCurrency(exp.amount)}</td>
                <td className="px-4 py-3 text-xs text-gray-400">{formatDate(exp.date)}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColor(exp.status)}`}>{exp.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {showModal && <ExpenseModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

function ExpenseModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ description: '', amount: '', category: 'office', date: new Date().toISOString().split('T')[0], notes: '' });
  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/finance/expenses', { ...data, amount: parseFloat(data.amount) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); toast.success('Expense added'); onClose(); },
    onError: () => toast.error('Failed to add expense'),
  });
  return (
    <Modal onClose={onClose} title="Add Expense" subtitle="Log a new business expense" icon={TrendingDown} iconColor="red">
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }}>
        <div className="p-6 space-y-4">
          <TextField id="expense-description" label="Description" required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <TextField id="expense-amount" label="Amount" required type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
            <TextField id="expense-date" label="Date" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </div>
          <SelectField id="expense-category" label="Category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </SelectField>
          <TextAreaField id="expense-notes" label="Notes" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Adding...' : 'Add Expense'}</button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

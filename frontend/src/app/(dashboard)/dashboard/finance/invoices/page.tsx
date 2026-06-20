'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatCurrency, formatDate, statusColor } from '@/lib/utils';
import { Plus, Send, CheckCircle2, FileText, DollarSign, Clock, AlertCircle, FileDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { useModalA11y } from '@/hooks/useModalA11y';

export default function InvoicesPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const qc = useQueryClient();

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoices', statusFilter],
    queryFn: async () => {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const { data } = await api.get(`/finance/invoices${params}`);
      return data;
    },
  });

  const { data: summary } = useQuery({
    queryKey: ['invoice-summary'],
    queryFn: async () => { const { data } = await api.get('/finance/invoices/summary'); return data.data; },
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => api.post(`/finance/invoices/${id}/send`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); toast.success('Invoice sent'); },
  });

  const markPaidMutation = useMutation({
    mutationFn: (id: string) => api.post(`/finance/invoices/${id}/mark-paid`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); toast.success('Invoice marked as paid'); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Invoices</h1>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> New Invoice
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Paid', value: formatCurrency(Number(summary?.paid?._sum?.total || 0)), count: summary?.paid?._count, icon: CheckCircle2, color: 'text-green-500 bg-green-50 dark:bg-green-950/30' },
          { label: 'Pending', value: formatCurrency(Number(summary?.pending?._sum?.total || 0)), count: summary?.pending?._count, icon: Clock, color: 'text-yellow-500 bg-yellow-50 dark:bg-yellow-950/30' },
          { label: 'Overdue', value: formatCurrency(Number(summary?.overdue?._sum?.total || 0)), count: summary?.overdue?._count, icon: AlertCircle, color: 'text-red-500 bg-red-50 dark:bg-red-950/30' },
          { label: 'Draft', value: formatCurrency(Number(summary?.draft?._sum?.total || 0)), count: summary?.draft?._count, icon: FileText, color: 'text-gray-500 bg-gray-100 dark:bg-gray-800' },
        ].map(({ label, value, count, icon: Icon, color }) => (
          <div key={label} className="glass-card rounded-2xl p-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{count || 0} {label} invoices</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {['', 'draft', 'sent', 'paid', 'overdue', 'cancelled'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              {['Invoice #', 'Client', 'Issue Date', 'Due Date', 'Amount', 'Status', 'Actions'].map(h => (
                <th key={h} className="text-left text-xs font-medium text-gray-500 px-4 py-3 first:pl-6 last:pr-6">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 7 }).map((_, j) => <td key={j} className="px-4 py-4 first:pl-6"><div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" /></td>)}</tr>
              ))
            ) : invoices?.data?.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400"><FileText className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>No invoices found</p></td></tr>
            ) : invoices?.data?.map((inv: any) => (
              <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-6 py-4 text-sm font-mono font-medium text-indigo-600 dark:text-indigo-400">{inv.invoiceNo}</td>
                <td className="px-4 py-4">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{inv.clientName}</p>
                  <p className="text-xs text-gray-500">{inv.clientEmail}</p>
                </td>
                <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">{formatDate(inv.issueDate)}</td>
                <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">{inv.dueDate ? formatDate(inv.dueDate) : '—'}</td>
                <td className="px-4 py-4 text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(Number(inv.total))}</td>
                <td className="px-4 py-4">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${statusColor(inv.status)}`}>{inv.status}</span>
                </td>
                <td className="px-4 py-4 pr-6">
                  <div className="flex items-center gap-1">
                    {inv.status === 'draft' && (
                      <button onClick={() => sendMutation.mutate(inv.id)} className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 text-blue-500 transition-colors" title="Send">
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {(inv.status === 'sent' || inv.status === 'overdue') && (
                      <button onClick={() => markPaidMutation.mutate(inv.id)} className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-950/30 text-green-500 transition-colors" title="Mark Paid">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        api.get(`/finance/invoices/${inv.id}/pdf`, { responseType: 'blob' }).then(res => {
                          const url = URL.createObjectURL(res.data);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${inv.invoiceNo}.pdf`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }).catch(() => toast.error('Failed to download invoice'));
                      }}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
                      title="Download PDF"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {showModal && <InvoiceModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

function InvoiceModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const modalRef = useModalA11y(onClose);
  const [form, setForm] = useState({ clientName: '', clientEmail: '', dueDate: '', items: [{ description: '', qty: 1, rate: 0, amount: 0 }], notes: '' });

  const subtotal = form.items.reduce((s, i) => s + (i.qty * i.rate), 0);
  const total = subtotal;

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/finance/invoices', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); toast.success('Invoice created'); onClose(); },
    onError: () => toast.error('Failed to create invoice'),
  });

  const handleItemChange = (i: number, k: string, v: any) => {
    const items = [...form.items];
    items[i] = { ...items[i], [k]: v, amount: k === 'qty' || k === 'rate' ? (k === 'qty' ? v : items[i].qty) * (k === 'rate' ? v : items[i].rate) : items[i].amount };
    setForm({ ...form, items });
  };

  return (
    <div ref={modalRef} tabIndex={-1} className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 outline-none animate-in fade-in duration-200">
      <div className="glass-card rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">New Invoice</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form
          onSubmit={e => {
            e.preventDefault();
            const validItems = form.items.filter(it => it.description.trim() && it.rate > 0);
            if (!validItems.length) { toast.error('Add at least one item with a description and rate'); return; }
            mutation.mutate({ ...form, subtotal: total, total, items: validItems });
          }}
          className="p-6 space-y-5"
        >
          <div className="grid grid-cols-2 gap-4">
            <div><label htmlFor="invoice-clientName" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Client Name*</label><input id="invoice-clientName" required value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" /></div>
            <div><label htmlFor="invoice-clientEmail" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Client Email</label><input id="invoice-clientEmail" type="email" value={form.clientEmail} onChange={e => setForm({ ...form, clientEmail: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" /></div>
            <div><label htmlFor="invoice-dueDate" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Due Date</label><input id="invoice-dueDate" type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" /></div>
          </div>

          {/* Line items */}
          <div>
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Items</p>
            {form.items.map((item, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 mb-2 items-center">
                <input value={item.description} onChange={e => handleItemChange(i, 'description', e.target.value)} placeholder="Description" className="col-span-5 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none" />
                <input type="number" value={item.qty} onChange={e => handleItemChange(i, 'qty', Number(e.target.value))} placeholder="Qty" className="col-span-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none" />
                <input type="number" value={item.rate} onChange={e => handleItemChange(i, 'rate', Number(e.target.value))} placeholder="Rate" className="col-span-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none" />
                <div className="col-span-2 flex items-center px-2 text-sm font-medium text-gray-700 dark:text-gray-300">{formatCurrency(item.qty * item.rate)}</div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) })}
                  disabled={form.items.length === 1}
                  className="col-span-1 p-1.5 text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Remove line item"
                >
                  ✕
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setForm({ ...form, items: [...form.items, { description: '', qty: 1, rate: 0, amount: 0 }] })} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">+ Add line item</button>
          </div>

          <div className="text-right">
            <p className="text-xl font-bold text-gray-900 dark:text-white">Total: {formatCurrency(total)}</p>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
            <button
              type="submit"
              disabled={!form.clientName || mutation.isPending}
              className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {mutation.isPending ? 'Creating...' : 'Create Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

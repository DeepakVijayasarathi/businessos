'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { ShoppingCart, Plus, Trash2, Edit2, CheckCircle2, Search, Eye, X } from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  received: 'bg-indigo-100 text-indigo-700',
  cancelled: 'bg-red-100 text-red-700',
};

interface POItem { description: string; quantity: string; unitPrice: string; unit: string; }
const emptyItem = (): POItem => ({ description: '', quantity: '1', unitPrice: '', unit: '' });

export default function PurchaseOrdersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [viewPO, setViewPO] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ vendorName: '', vendorEmail: '', vendorPhone: '', vendorAddress: '', issueDate: '', expectedDate: '', notes: '', status: 'draft' });
  const [items, setItems] = useState<POItem[]>([emptyItem()]);

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-orders', search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const { data } = await api.get(`/procurement?${params}`);
      return data.data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: (payload: any) => editing ? api.put(`/procurement/${editing.id}`, payload) : api.post('/procurement', payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); toast.success(editing ? 'PO updated' : 'PO created'); closeModal(); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/procurement/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); toast.success('Deleted'); },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.put(`/procurement/${id}`, { status: 'approved' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); toast.success('PO approved'); },
  });

  function openNew() {
    setEditing(null);
    setForm({ vendorName: '', vendorEmail: '', vendorPhone: '', vendorAddress: '', issueDate: new Date().toISOString().split('T')[0], expectedDate: '', notes: '', status: 'draft' });
    setItems([emptyItem()]);
    setShowModal(true);
  }

  function openEdit(po: any) {
    setEditing(po);
    setForm({ vendorName: po.vendorName, vendorEmail: po.vendorEmail || '', vendorPhone: po.vendorPhone || '', vendorAddress: po.vendorAddress || '', issueDate: po.issueDate?.split('T')[0] || '', expectedDate: po.expectedDate?.split('T')[0] || '', notes: po.notes || '', status: po.status });
    setItems(po.items?.length ? po.items.map((i: any) => ({ description: i.description, quantity: String(i.quantity), unitPrice: String(i.unitPrice), unit: i.unit || '' })) : [emptyItem()]);
    setShowModal(true);
  }

  function closeModal() { setShowModal(false); setEditing(null); }

  function addItem() { setItems(prev => [...prev, emptyItem()]); }
  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)); }
  function updateItem(idx: number, field: keyof POItem, val: string) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  }

  const computedTotal = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);

  function handleSave() {
    if (!form.vendorName) return toast.error('Vendor name required');
    const validItems = items.filter(it => it.description && it.unitPrice);
    saveMutation.mutate({ ...form, items: validItems });
  }

  const orders = data?.orders || [];
  const total = data?.total || 0;
  const draft = orders.filter((o: any) => o.status === 'draft').length;
  const pending = orders.filter((o: any) => ['sent', 'draft'].includes(o.status)).length;
  const totalValue = orders.reduce((s: number, o: any) => s + Number(o.total), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Purchase Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage procurement and vendor orders</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-medium">
          <Plus className="w-4 h-4" /> New PO
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total POs', value: total, color: 'text-indigo-600' },
          { label: 'Pending Approval', value: pending, color: 'text-yellow-600' },
          { label: 'Total Value', value: `$${totalValue.toLocaleString()}`, color: 'text-green-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="glass-card rounded-2xl p-5">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 flex-1 max-w-xs">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search POs..." className="bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 outline-none flex-1" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200">
          <option value="">All Statuses</option>
          {['draft', 'sent', 'approved', 'received', 'cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />)}</div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center">
            <ShoppingCart className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-400">No purchase orders yet</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-gray-100 dark:border-gray-800">
              <tr>
                {['PO #', 'Vendor', 'Issue Date', 'Expected', 'Total', 'Status', ''].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-500 px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {orders.map((po: any) => (
                <tr key={po.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-5 py-3 text-sm font-mono font-semibold text-indigo-600">{po.poNumber}</td>
                  <td className="px-5 py-3">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{po.vendorName}</p>
                    {po.vendorEmail && <p className="text-xs text-gray-400">{po.vendorEmail}</p>}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-300">{formatDate(po.issueDate)}</td>
                  <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-300">{po.expectedDate ? formatDate(po.expectedDate) : '—'}</td>
                  <td className="px-5 py-3 text-sm font-semibold text-gray-900 dark:text-white">${Number(po.total).toLocaleString()}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${STATUS_COLOR[po.status] || ''}`}>{po.status}</span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setViewPO(po)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        <Eye className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                      <button onClick={() => openEdit(po)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                      {po.status === 'sent' && (
                        <button onClick={() => approveMutation.mutate(po.id)} className="p-1.5 hover:bg-green-100 rounded-lg transition-colors" title="Approve">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                        </button>
                      )}
                      <button onClick={() => deleteMutation.mutate(po.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* View PO Modal */}
      {viewPO && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{viewPO.poNumber}</h2>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${STATUS_COLOR[viewPO.status] || ''}`}>{viewPO.status}</span>
              </div>
              <button onClick={() => setViewPO(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-5 text-sm">
              <div><p className="text-xs text-gray-400">Vendor</p><p className="font-medium text-gray-900 dark:text-white">{viewPO.vendorName}</p></div>
              {viewPO.vendorEmail && <div><p className="text-xs text-gray-400">Email</p><p className="text-gray-700 dark:text-gray-300">{viewPO.vendorEmail}</p></div>}
              <div><p className="text-xs text-gray-400">Issue Date</p><p className="text-gray-700 dark:text-gray-300">{formatDate(viewPO.issueDate)}</p></div>
              {viewPO.expectedDate && <div><p className="text-xs text-gray-400">Expected</p><p className="text-gray-700 dark:text-gray-300">{formatDate(viewPO.expectedDate)}</p></div>}
            </div>
            <table className="w-full mb-5">
              <thead className="border-b border-gray-100 dark:border-gray-800">
                <tr>
                  {['Description', 'Qty', 'Unit Price', 'Total'].map(h => <th key={h} className="text-left text-xs font-medium text-gray-500 py-2">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {(viewPO.items || []).map((it: any, i: number) => (
                  <tr key={i}>
                    <td className="py-2 text-sm text-gray-800 dark:text-gray-200">{it.description}</td>
                    <td className="py-2 text-sm text-gray-600">{Number(it.quantity)} {it.unit}</td>
                    <td className="py-2 text-sm text-gray-600">${Number(it.unitPrice).toLocaleString()}</td>
                    <td className="py-2 text-sm font-semibold text-gray-900 dark:text-white">${Number(it.total).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right border-t border-gray-100 dark:border-gray-800 pt-3">
              <p className="text-lg font-bold text-gray-900 dark:text-white">Total: ${Number(viewPO.total).toLocaleString()}</p>
            </div>
            {viewPO.notes && <div className="mt-4"><p className="text-xs text-gray-400 mb-1">Notes</p><p className="text-sm text-gray-600 dark:text-gray-300">{viewPO.notes}</p></div>}
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-5">{editing ? 'Edit PO' : 'Create Purchase Order'}</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Vendor Name *</label>
                  <input value={form.vendorName} onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Vendor Email</label>
                  <input type="email" value={form.vendorEmail} onChange={e => setForm(f => ({ ...f, vendorEmail: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Issue Date</label>
                  <input type="date" value={form.issueDate} onChange={e => setForm(f => ({ ...f, issueDate: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Expected Delivery</label>
                  <input type="date" value={form.expectedDate} onChange={e => setForm(f => ({ ...f, expectedDate: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
              </div>
              {editing && (
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                    {['draft', 'sent', 'approved', 'received', 'cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-500">Line Items</label>
                  <button onClick={addItem} className="text-xs text-indigo-600 hover:text-indigo-700">+ Add Item</button>
                </div>
                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5">
                        <input value={it.description} onChange={e => updateItem(idx, 'description', e.target.value)} placeholder="Description" className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                      </div>
                      <div className="col-span-2">
                        <input type="number" value={it.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} placeholder="Qty" className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                      </div>
                      <div className="col-span-2">
                        <input type="number" value={it.unitPrice} onChange={e => updateItem(idx, 'unitPrice', e.target.value)} placeholder="Price" className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs font-medium text-right text-gray-700 dark:text-gray-300">${((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)).toLocaleString()}</p>
                      </div>
                      <button onClick={() => removeItem(idx)} className="col-span-1 p-1 hover:bg-red-50 rounded-lg">
                        <X className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="text-right mt-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
                  Total: ${computedTotal.toLocaleString()}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={closeModal} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saveMutation.isPending} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {saveMutation.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Create PO'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

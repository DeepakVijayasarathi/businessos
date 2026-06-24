'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { FileSignature, Plus, Trash2, Edit2, Search, AlertCircle, CheckCircle2, Clock, X } from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  signed: 'bg-green-100 text-green-700',
  active: 'bg-indigo-100 text-indigo-700',
  expired: 'bg-red-100 text-red-700',
  terminated: 'bg-orange-100 text-orange-700',
};

const CONTRACT_TYPES = ['client', 'vendor', 'employment', 'nda', 'partnership'];
const CONTRACT_STATUSES = ['draft', 'sent', 'signed', 'active', 'expired', 'terminated'];

export default function ContractsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    title: '', type: 'client', partyName: '', partyEmail: '',
    value: '', currency: 'USD', startDate: '', endDate: '',
    status: 'draft', autoRenew: false, renewalNotice: '',
    description: '', tags: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['contracts', search, statusFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);
      const { data } = await api.get(`/contracts?${params}`);
      return data.data;
    },
  });

  const { data: expiring } = useQuery({
    queryKey: ['contracts-expiring'],
    queryFn: async () => { const { data } = await api.get('/contracts/expiring?days=30'); return data.data; },
  });

  const saveMutation = useMutation({
    mutationFn: (payload: any) => editing ? api.put(`/contracts/${editing.id}`, payload) : api.post('/contracts', payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contracts'] }); qc.invalidateQueries({ queryKey: ['contracts-expiring'] }); toast.success(editing ? 'Contract updated' : 'Contract created'); closeModal(); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/contracts/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contracts'] }); toast.success('Deleted'); },
  });

  function openNew() {
    setEditing(null);
    setForm({ title: '', type: 'client', partyName: '', partyEmail: '', value: '', currency: 'USD', startDate: '', endDate: '', status: 'draft', autoRenew: false, renewalNotice: '', description: '', tags: '' });
    setShowModal(true);
  }

  function openEdit(c: any) {
    setEditing(c);
    setForm({ title: c.title, type: c.type, partyName: c.partyName, partyEmail: c.partyEmail || '', value: c.value || '', currency: c.currency || 'USD', startDate: c.startDate?.split('T')[0] || '', endDate: c.endDate?.split('T')[0] || '', status: c.status, autoRenew: c.autoRenew || false, renewalNotice: c.renewalNotice ? String(c.renewalNotice) : '', description: c.description || '', tags: (c.tags || []).join(', ') });
    setShowModal(true);
  }

  function closeModal() { setShowModal(false); setEditing(null); }

  function handleSave() {
    if (!form.title || !form.partyName) return toast.error('Title and party name required');
    saveMutation.mutate({
      ...form,
      value: form.value ? Number(form.value) : undefined,
      renewalNotice: form.renewalNotice ? Number(form.renewalNotice) : undefined,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
    });
  }

  const contracts = data?.contracts || [];
  const expiringList: any[] = expiring || [];
  const active = contracts.filter((c: any) => c.status === 'active').length;
  const totalValue = contracts.filter((c: any) => c.value).reduce((s: number, c: any) => s + Number(c.value), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Contracts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage client, vendor, and employment contracts</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-medium">
          <Plus className="w-4 h-4" /> New Contract
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Contracts', value: data?.total || 0, color: 'text-indigo-600' },
          { label: 'Active', value: active, color: 'text-green-600' },
          { label: 'Total Value', value: `$${totalValue.toLocaleString()}`, color: 'text-blue-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="glass-card rounded-2xl p-5">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Expiring alert */}
      {expiringList.length > 0 && (
        <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-orange-500" />
            <p className="text-sm font-medium text-orange-700 dark:text-orange-400">{expiringList.length} contract{expiringList.length > 1 ? 's' : ''} expiring in the next 30 days</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {expiringList.map(c => (
              <span key={c.id} className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-2.5 py-1 rounded-full">
                {c.title} — expires {formatDate(c.endDate)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 flex-1 max-w-xs">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contracts..." className="bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 outline-none flex-1" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200">
          <option value="">All Statuses</option>
          {CONTRACT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200">
          <option value="">All Types</option>
          {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />)}</div>
      ) : contracts.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <FileSignature className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-400">No contracts yet. Create your first!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {contracts.map((c: any) => (
            <div key={c.id} className="glass-card rounded-2xl px-5 py-4 flex items-center gap-4 group">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center flex-shrink-0">
                <FileSignature className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-semibold text-gray-900 dark:text-white truncate">{c.title}</p>
                  <span className="text-xs text-gray-400 font-mono">{c.contractNo}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>{c.partyName}</span>
                  <span className="capitalize text-gray-300 dark:text-gray-600">• {c.type}</span>
                  {c.value && <span className="text-green-600 font-medium">• ${Number(c.value).toLocaleString()}</span>}
                  {c.endDate && <span>• Ends {formatDate(c.endDate)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${STATUS_COLOR[c.status] || ''}`}>{c.status}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(c)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                    <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                  <button onClick={() => deleteMutation.mutate(c.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-5">{editing ? 'Edit Contract' : 'New Contract'}</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Contract Title *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Annual SaaS License Agreement" className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Type</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                    {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                    {CONTRACT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Party Name *</label>
                  <input value={form.partyName} onChange={e => setForm(f => ({ ...f, partyName: e.target.value }))} placeholder="Company or individual name" className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Party Email</label>
                  <input type="email" value={form.partyEmail} onChange={e => setForm(f => ({ ...f, partyEmail: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Contract Value</label>
                  <input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0.00" className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Currency</label>
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                    {['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Start Date</label>
                  <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">End Date</label>
                  <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.autoRenew} onChange={e => setForm(f => ({ ...f, autoRenew: e.target.checked }))} className="w-4 h-4 accent-indigo-600" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Auto-renew</span>
                </label>
                {form.autoRenew && (
                  <div className="flex items-center gap-2 flex-1">
                    <input type="number" value={form.renewalNotice} onChange={e => setForm(f => ({ ...f, renewalNotice: e.target.value }))} placeholder="30" className="w-20 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                    <span className="text-xs text-gray-400">days notice before expiry</span>
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Tags (comma separated)</label>
                <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="saas, annual, enterprise" className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={closeModal} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saveMutation.isPending} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {saveMutation.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Create Contract'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

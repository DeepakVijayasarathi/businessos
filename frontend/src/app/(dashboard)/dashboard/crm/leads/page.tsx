'use client';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatRelativeTime, statusColor } from '@/lib/utils';
import { Plus, Search, Filter, Mail, Phone, Building2, Star, Trash2, Edit2, UserPlus, Download, Upload, Zap, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { TextField, SelectField, TextAreaField } from '@/components/ui/FormField';
import { CustomFieldsEditor } from '@/components/ui/CustomFieldsEditor';

const STATUSES = ['new', 'contacted', 'qualified', 'lost', 'converted'];
const SOURCES = ['website', 'whatsapp', 'email', 'referral', 'social', 'manual'];

export default function LeadsPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [showModal, setShowModal] = useState(false);
  const [editLead, setEditLead] = useState<any>(null);
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportCSV = () => {
    api.get('/crm/leads/export', { responseType: 'blob' }).then(res => {
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'leads.csv';
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post('/crm/leads/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Leads imported successfully');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Import failed');
    }
    e.target.value = '';
  };

  const { data, isLoading } = useQuery({
    queryKey: ['leads', debouncedSearch, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (statusFilter) params.append('status', statusFilter);
      const { data } = await api.get(`/crm/leads?${params}`);
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/crm/leads/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); toast.success('Lead deleted'); },
  });

  const convertMutation = useMutation({
    mutationFn: (id: string) => api.post(`/crm/leads/${id}/convert`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); toast.success('Lead converted to contact'); },
  });

  const scoreMutation = useMutation({
    mutationFn: (id: string) => api.post(`/crm/leads/${id}/score`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); toast.success('Lead scored'); },
    onError: () => toast.error('Failed to score lead'),
  });

  const scoreAllMutation = useMutation({
    mutationFn: () => api.post('/crm/leads/score-all'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); toast.success('All leads scored'); },
    onError: () => toast.error('Failed to score leads'),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Leads</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.meta?.total || 0} total leads</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <Upload className="w-4 h-4" /> Import CSV
          </button>
          <button
            onClick={() => scoreAllMutation.mutate()}
            disabled={scoreAllMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <Zap className="w-4 h-4 text-yellow-500" /> {scoreAllMutation.isPending ? 'Scoring...' : 'Score All'}
          </button>
          <button
            onClick={() => { setEditLead(null); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Lead
          </button>
        </div>
        <input type="file" ref={fileInputRef} accept=".csv" onChange={handleImport} style={{ display: 'none' }} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 flex-1 min-w-48">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search leads..."
            className="bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 outline-none flex-1"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 outline-none"
        >
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>

        {/* Status pills */}
        <div className="flex items-center gap-2">
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s === statusFilter ? '' : s); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            >
              {s}
            </button>
          ))}
        </div>

        {(search || statusFilter) && (
          <button
            onClick={() => { setSearch(''); setStatusFilter(''); setPage(1); }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
          >
            <X className="w-3.5 h-3.5" /> Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              {['Name', 'Company', 'Contact', 'Source', 'Status', 'Score', 'Added', 'Actions'].map(h => (
                <th key={h} className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 px-4 py-3 first:pl-6 last:pr-6">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-4 first:pl-6">
                      <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data?.data?.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-gray-400">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <UserPlus className="w-6 h-6" />
                    </div>
                    <p className="text-sm">No leads found. Add your first lead!</p>
                  </div>
                </td>
              </tr>
            ) : data?.data?.map((lead: any) => (
              <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-4 pl-6">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {lead.firstName[0]}{lead.lastName?.[0] || ''}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{lead.firstName} {lead.lastName}</p>
                      <p className="text-xs text-gray-500">{lead.jobTitle}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                    <Building2 className="w-3.5 h-3.5" />
                    {lead.company || '—'}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="space-y-0.5">
                    {lead.email && <div className="flex items-center gap-1 text-xs text-gray-500"><Mail className="w-3 h-3" />{lead.email}</div>}
                    {lead.phone && <div className="flex items-center gap-1 text-xs text-gray-500"><Phone className="w-3 h-3" />{lead.phone}</div>}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className="text-xs text-gray-500 capitalize">{lead.source || '—'}</span>
                </td>
                <td className="px-4 py-4">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${statusColor(lead.status)}`}>
                    {lead.status}
                  </span>
                </td>
                <td className="px-4 py-4">
                  {lead.score != null ? (
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-semibold ${lead.score >= 70 ? 'bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400' : lead.score >= 40 ? 'bg-yellow-100 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-400' : 'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400'}`}>
                      <Star className="w-3 h-3" />{lead.score}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-4">
                  <span className="text-xs text-gray-500">{formatRelativeTime(lead.createdAt)}</span>
                </td>
                <td className="px-4 py-4 pr-6">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={e => { e.stopPropagation(); scoreMutation.mutate(lead.id); }}
                      disabled={scoreMutation.isPending}
                      className="p-1.5 rounded-lg hover:bg-yellow-50 dark:hover:bg-yellow-950/30 text-yellow-500 transition-colors disabled:opacity-40"
                      title="AI Score this lead"
                      aria-label="AI score this lead"
                    >
                      <Zap className="w-3.5 h-3.5" />
                    </button>
                    {lead.status !== 'converted' && (
                      <button
                        onClick={() => convertMutation.mutate(lead.id)}
                        className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-indigo-500 transition-colors"
                        title="Convert to contact"
                        aria-label="Convert lead to contact"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => { setEditLead(lead); setShowModal(true); }}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
                      aria-label="Edit lead"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { if (confirm('Delete this lead?')) deleteMutation.mutate(lead.id); }}
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500 transition-colors"
                      aria-label="Delete lead"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {/* Pagination */}
        {data?.meta && data.meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500">
              Showing {(data.meta.page - 1) * data.meta.limit + 1}–{Math.min(data.meta.page * data.meta.limit, data.meta.total)} of {data.meta.total}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={!data.meta.hasPrevPage} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800">Prev</button>
              <span className="text-xs text-gray-500">{data.meta.page} / {data.meta.totalPages}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={!data.meta.hasNextPage} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Lead Modal */}
      {showModal && <LeadModal lead={editLead} onClose={() => setShowModal(false)} />}
    </div>
  );
}

function LeadModal({ lead, onClose }: { lead: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    firstName: lead?.firstName || '',
    lastName: lead?.lastName || '',
    email: lead?.email || '',
    phone: lead?.phone || '',
    company: lead?.company || '',
    jobTitle: lead?.jobTitle || '',
    source: lead?.source || 'website',
    status: lead?.status || 'new',
    notes: lead?.notes || '',
    customFields: lead?.customFields || {},
  });

  const mutation = useMutation({
    mutationFn: (data: any) => lead ? api.put(`/crm/leads/${lead.id}`, data) : api.post('/crm/leads', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast.success(lead ? 'Lead updated' : 'Lead created');
      onClose();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed'),
  });

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); mutation.mutate(form); };

  return (
    <Modal onClose={onClose} title={lead ? 'Edit Lead' : 'Add New Lead'} subtitle={lead ? 'Update lead details' : 'Add a new lead to your pipeline'} icon={UserPlus} iconColor="indigo">
      <form onSubmit={handleSubmit}>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <TextField id="lead-firstName" label="First Name" required value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
            <TextField id="lead-lastName" label="Last Name" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
            <TextField id="lead-email" label="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <TextField id="lead-phone" label="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            <TextField id="lead-company" label="Company" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
            <TextField id="lead-jobTitle" label="Job Title" value={form.jobTitle} onChange={e => setForm({ ...form, jobTitle: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <SelectField id="lead-source" label="Source" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </SelectField>
            <SelectField id="lead-status" label="Status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </SelectField>
          </div>
          <TextAreaField id="lead-notes" label="Notes" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <CustomFieldsEditor value={form.customFields} onChange={customFields => setForm({ ...form, customFields })} />
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {mutation.isPending ? 'Saving...' : lead ? 'Update Lead' : 'Add Lead'}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

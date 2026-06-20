'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Plus, Building2, Search, Globe, Trash2, Edit, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useModalA11y } from '@/hooks/useModalA11y';

export default function CrmCompaniesPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editCompany, setEditCompany] = useState<any>(null);
  const qc = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['crm-companies', debouncedSearch],
    queryFn: async () => {
      const params = debouncedSearch ? `?search=${debouncedSearch}` : '';
      const { data } = await api.get(`/crm/companies${params}`);
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/crm/companies/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm-companies'] }); toast.success('Company deleted'); },
    onError: () => toast.error('Failed to delete company'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Companies</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.meta?.total || data?.data?.length || 0} companies</p>
        </div>
        <button onClick={() => { setEditCompany(null); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> Add Company
        </button>
      </div>

      <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 max-w-sm">
        <Search className="w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies..." className="bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 outline-none flex-1" />
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-36 glass-card rounded-2xl animate-pulse" />)
        ) : data?.data?.length === 0 ? (
          <div className="col-span-3 glass-card rounded-2xl p-12 text-center text-gray-400">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No companies yet</p>
          </div>
        ) : data?.data?.map((company: any) => (
          <div key={company.id} className="glass-card rounded-2xl p-5 hover:shadow-md transition-all group relative">
            <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => { setEditCompany(company); setShowModal(true); }} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"><Edit className="w-3.5 h-3.5" /></button>
              <button onClick={() => { if (confirm('Delete this company?')) deleteMutation.mutate(company.id); }} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{company.name}</p>
                {company.industry && <p className="text-xs text-gray-400 capitalize">{company.industry}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              {company.website && (
                <a href={company.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-indigo-600 hover:underline">
                  <Globe className="w-3 h-3" /><span className="truncate">{company.website}</span>
                </a>
              )}
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Users className="w-3 h-3" />
                {company._count?.contacts || 0} contacts
              </div>
              <p className="text-xs text-gray-400">Added {formatDate(company.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>

      {showModal && <CompanyModal company={editCompany} onClose={() => setShowModal(false)} />}
    </div>
  );
}

function CompanyModal({ company, onClose }: { company: any; onClose: () => void }) {
  const modalRef = useModalA11y(onClose);
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: company?.name || '',
    industry: company?.industry || '',
    website: company?.website || '',
    phone: company?.phone || '',
    email: company?.email || '',
    address: company?.address || '',
    employees: company?.employees || '',
    annualRevenue: company?.annualRevenue || '',
    description: company?.description || '',
  });
  const mutation = useMutation({
    mutationFn: (data: any) => company ? api.put(`/crm/companies/${company.id}`, data) : api.post('/crm/companies', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm-companies'] }); toast.success(company ? 'Company updated' : 'Company created'); onClose(); },
    onError: () => toast.error('Failed to save company'),
  });
  const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500";
  const f = (k: string) => ({ value: (form as any)[k], onChange: (e: any) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <div ref={modalRef} tabIndex={-1} className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 outline-none animate-in fade-in duration-200">
      <div className="glass-card rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">{company ? 'Edit' : 'New'} Company</h3>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div><label htmlFor="company-name" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Company Name*</label><input id="company-name" required {...f('name')} className={inputCls} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label htmlFor="company-industry" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Industry</label><input id="company-industry" {...f('industry')} placeholder="Technology, Finance..." className={inputCls} /></div>
              <div><label htmlFor="company-employees" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Employees</label><input id="company-employees" type="number" {...f('employees')} className={inputCls} /></div>
              <div><label htmlFor="company-email" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label><input id="company-email" type="email" {...f('email')} className={inputCls} /></div>
              <div><label htmlFor="company-phone" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label><input id="company-phone" {...f('phone')} className={inputCls} /></div>
            </div>
            <div><label htmlFor="company-website" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Website</label><input id="company-website" type="url" {...f('website')} placeholder="https://" className={inputCls} /></div>
            <div><label htmlFor="company-address" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label><input id="company-address" {...f('address')} className={inputCls} /></div>
            <div><label htmlFor="company-description" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label><textarea id="company-description" rows={3} {...f('description')} className={inputCls + ' resize-none'} /></div>
          </div>
          <div className="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

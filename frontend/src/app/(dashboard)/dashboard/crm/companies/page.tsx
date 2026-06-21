'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Plus, Building2, Search, Globe, Trash2, Edit, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { TextField, TextAreaField } from '@/components/ui/FormField';

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
  const f = (k: string) => ({ value: (form as any)[k], onChange: (e: any) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <Modal onClose={onClose} title={company ? 'Edit Company' : 'New Company'} subtitle={company ? 'Update company details' : 'Add a new company to your CRM'} icon={Building2} iconColor="purple">
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }}>
        <div className="p-6 space-y-4">
          <TextField id="company-name" label="Company Name" required {...f('name')} />
          <div className="grid grid-cols-2 gap-4">
            <TextField id="company-industry" label="Industry" {...f('industry')} placeholder="Technology, Finance..." />
            <TextField id="company-employees" label="Employees" type="number" {...f('employees')} />
            <TextField id="company-email" label="Email" type="email" {...f('email')} />
            <TextField id="company-phone" label="Phone" {...f('phone')} />
          </div>
          <TextField id="company-website" label="Website" type="url" {...f('website')} placeholder="https://" />
          <TextField id="company-address" label="Address" {...f('address')} />
          <TextAreaField id="company-description" label="Description" rows={3} {...f('description')} />
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Saving...' : 'Save'}</button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

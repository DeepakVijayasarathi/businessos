'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Plus, Search, Mail, Phone, Building2, User, Trash2, Edit, Upload } from 'lucide-react';
import { useRef } from 'react';
import toast from 'react-hot-toast';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { TextField, TextAreaField } from '@/components/ui/FormField';

export default function ContactsPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editContact, setEditContact] = useState<any>(null);
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    e.target.value = '';
    try {
      const { data } = await api.post('/crm/contacts/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      toast.success(`${data.data?.created || 0} contacts imported`);
    } catch {
      toast.error('Import failed — check CSV format');
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', debouncedSearch, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (debouncedSearch) params.set('search', debouncedSearch);
      const { data } = await api.get(`/crm/contacts?${params}`);
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/crm/contacts/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contacts'] }); toast.success('Contact deleted'); },
    onError: () => toast.error('Failed to delete contact'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Contacts</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.meta?.total || 0} contacts</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
            <Upload className="w-4 h-4" /> Import CSV
          </button>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} className="hidden" />
          <button onClick={() => { setEditContact(null); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> Add Contact
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 max-w-sm">
        <Search className="w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search contacts..." className="bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 outline-none flex-1" />
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-gray-200 dark:border-gray-700">
            <tr>
              {['Name', 'Email', 'Phone', 'Company', 'Added', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-6 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" /></td></tr>
              ))
            ) : data?.data?.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No contacts yet</td></tr>
            ) : data?.data?.map((c: any) => (
              <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                      {c.firstName?.[0]}{c.lastName?.[0]}
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{c.firstName} {c.lastName}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{c.email || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{c.phone || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{c.crmCompany?.name || '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-400">{formatDate(c.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => { setEditContact(c); setShowModal(true); }} aria-label="Edit contact" className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => { if (confirm('Delete this contact?')) deleteMutation.mutate(c.id); }} aria-label="Delete contact" className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {data?.meta && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-500">Page {data.meta.page} of {data.meta.totalPages}</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800">Prev</button>
              <button disabled={page >= data.meta.totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800">Next</button>
            </div>
          </div>
        )}
      </div>

      {showModal && <ContactModal contact={editContact} onClose={() => setShowModal(false)} />}
    </div>
  );
}

function ContactModal({ contact, onClose }: { contact: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    firstName: contact?.firstName || '',
    lastName: contact?.lastName || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    jobTitle: contact?.jobTitle || '',
    notes: contact?.notes || '',
  });

  const mutation = useMutation({
    mutationFn: (data: any) => contact ? api.put(`/crm/contacts/${contact.id}`, data) : api.post('/crm/contacts', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contacts'] }); toast.success(contact ? 'Contact updated' : 'Contact created'); onClose(); },
    onError: () => toast.error('Failed to save contact'),
  });

  const f = (k: string) => ({ value: (form as any)[k], onChange: (e: any) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <Modal onClose={onClose} title={contact ? 'Edit Contact' : 'New Contact'} subtitle={contact ? 'Update contact details' : 'Add a new contact to your CRM'} icon={User} iconColor="blue">
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }}>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <TextField id="contact-firstName" label="First Name" required {...f('firstName')} />
            <TextField id="contact-lastName" label="Last Name" {...f('lastName')} />
            <TextField id="contact-email" label="Email" type="email" {...f('email')} />
            <TextField id="contact-phone" label="Phone" {...f('phone')} />
          </div>
          <TextField id="contact-jobTitle" label="Job Title" {...f('jobTitle')} />
          <TextAreaField id="contact-notes" label="Notes" rows={3} {...f('notes')} />
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Saving...' : 'Save'}</button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

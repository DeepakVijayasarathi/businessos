'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/utils';
import { Plus, Globe, FormInput, Eye, MousePointer, Trash2, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';

export default function MarketingPage() {
  const [tab, setTab] = useState<'pages' | 'forms'>('pages');
  const [showPageModal, setShowPageModal] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [selectedForm, setSelectedForm] = useState<any>(null);
  const qc = useQueryClient();

  const { data: pages, isLoading: pagesLoading } = useQuery({
    queryKey: ['landing-pages'],
    enabled: tab === 'pages',
    queryFn: async () => { const { data } = await api.get('/marketing/pages'); return data; },
  });

  const { data: forms, isLoading: formsLoading } = useQuery({
    queryKey: ['marketing-forms'],
    enabled: tab === 'forms',
    queryFn: async () => { const { data } = await api.get('/marketing/forms'); return data; },
  });

  const { data: submissions } = useQuery({
    queryKey: ['form-submissions', selectedForm?.id],
    enabled: !!selectedForm,
    queryFn: async () => { const { data } = await api.get(`/marketing/forms/${selectedForm.id}/submissions`); return data.data; },
  });

  const deletePageMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/marketing/pages/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['landing-pages'] }); toast.success('Page deleted'); },
  });

  const deleteFormMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/marketing/forms/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['marketing-forms'] }); toast.success('Form deleted'); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Marketing</h1>
          <p className="text-sm text-gray-500 mt-0.5">Landing pages & lead capture forms</p>
        </div>
        <button
          onClick={() => tab === 'pages' ? setShowPageModal(true) : setShowFormModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" /> {tab === 'pages' ? 'New Page' : 'New Form'}
        </button>
      </div>

      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
        {(['pages', 'forms'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${tab === t ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500'}`}>{t}</button>
        ))}
      </div>

      {tab === 'pages' && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pagesLoading ? (
            Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 glass-card rounded-2xl animate-pulse" />)
          ) : pages?.data?.length === 0 ? (
            <div className="col-span-3 glass-card rounded-2xl p-12 text-center text-gray-400">
              <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No landing pages yet</p>
            </div>
          ) : pages?.data?.map((page: any) => (
            <div key={page.id} className="glass-card rounded-2xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center">
                  <Globe className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex gap-1">
                  <a href={`/p/${page.slug}`} target="_blank" rel="noopener noreferrer" className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"><ExternalLink className="w-3.5 h-3.5" /></a>
                  <button onClick={() => { if (confirm('Delete this landing page?')) deletePageMutation.mutate(page.id); }} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{page.name}</h3>
              <p className="text-xs text-gray-400 mb-3">/p/{page.slug}</p>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{page.visits} visits</span>
                <span className={`px-2 py-0.5 rounded-full font-medium ${page.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{page.isPublished ? 'Live' : 'Draft'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'forms' && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-3">
            {formsLoading ? (
              Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 glass-card rounded-2xl animate-pulse" />)
            ) : forms?.data?.length === 0 ? (
              <div className="glass-card rounded-2xl p-8 text-center text-gray-400">
                <FormInput className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No forms yet</p>
              </div>
            ) : forms?.data?.map((form: any) => (
              <div key={form.id} className={`glass-card rounded-2xl p-4 cursor-pointer transition-all ${selectedForm?.id === form.id ? 'ring-2 ring-indigo-500' : 'hover:shadow-md'}`} onClick={() => setSelectedForm(form)}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{form.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{form._count?.submissions || 0} submissions</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); if (confirm('Delete this form?')) deleteFormMutation.mutate(form.id); }} className="p-1 text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-2">
            {selectedForm ? (
              <div className="glass-card rounded-2xl">
                <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{selectedForm.name} — Submissions</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{submissions?.length || 0} responses</p>
                </div>
                {submissions?.length === 0 ? (
                  <div className="p-12 text-center text-gray-400 text-sm">No submissions yet</div>
                ) : (
                  <div className="divide-y divide-gray-50 dark:divide-gray-800">
                    {submissions?.map((sub: any) => (
                      <div key={sub.id} className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-medium text-indigo-600">{sub.data?.email || sub.data?.name || 'Anonymous'}</p>
                          <p className="text-xs text-gray-400">{formatDateTime(sub.createdAt)}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(sub.data || {}).map(([k, v]: any) => (
                            <div key={k} className="text-xs">
                              <span className="text-gray-400 capitalize">{k}: </span>
                              <span className="text-gray-700 dark:text-gray-300">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="glass-card rounded-2xl h-full flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <MousePointer className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Select a form to view submissions</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showPageModal && <PageModal onClose={() => setShowPageModal(false)} />}
      {showFormModal && <FormModal onClose={() => setShowFormModal(false)} />}
    </div>
  );
}

function PageModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', slug: '', content: '', isPublished: false });
  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/marketing/pages', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['landing-pages'] }); toast.success('Page created!'); onClose(); },
    onError: () => toast.error('Failed to create page'),
  });
  const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500";
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">New Landing Page</h3>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="p-6 space-y-4">
          <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Name*</label><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') })} className={inputCls} /></div>
          <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">URL Slug*</label><input required value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} className={inputCls} placeholder="my-landing-page" /></div>
          <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Content (HTML/Markdown)</label><textarea rows={6} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} className={inputCls + ' resize-none font-mono text-xs'} /></div>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.isPublished} onChange={e => setForm({ ...form, isPublished: e.target.checked })} className="rounded" /><span className="text-sm text-gray-700 dark:text-gray-300">Publish immediately</span></label>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Creating...' : 'Create Page'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', description: '', fields: [{ name: 'email', label: 'Email', type: 'email', required: true }] });
  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/marketing/forms', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['marketing-forms'] }); toast.success('Form created!'); onClose(); },
    onError: () => toast.error('Failed to create form'),
  });
  const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500";
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">New Form</h3>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="p-6 space-y-4">
          <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Form Name*</label><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} /></div>
          <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label><textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputCls + ' resize-none'} /></div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Fields</label>
              <button type="button" onClick={() => setForm({ ...form, fields: [...form.fields, { name: '', label: '', type: 'text', required: false }] })} className="text-xs text-indigo-600 font-medium">+ Add</button>
            </div>
            {form.fields.map((field, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input value={field.label} onChange={e => { const f = [...form.fields]; f[i].label = e.target.value; f[i].name = e.target.value.toLowerCase().replace(/\s+/g, '_'); setForm({ ...form, fields: f }); }} placeholder="Label" className={inputCls + ' flex-1'} />
                <select value={field.type} onChange={e => { const f = [...form.fields]; f[i].type = e.target.value; setForm({ ...form, fields: f }); }} className="px-2 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs outline-none">
                  {['text', 'email', 'tel', 'textarea', 'select'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button type="button" onClick={() => setForm({ ...form, fields: form.fields.filter((_, j) => j !== i) })} className="text-gray-400 hover:text-red-500 text-lg leading-none">✕</button>
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Creating...' : 'Create Form'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

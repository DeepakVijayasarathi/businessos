'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDate, formatDateTime, formatRelativeTime } from '@/lib/utils';
import { Plus, Globe, FormInput, Eye, MousePointer, Trash2, ExternalLink, Image as ImageIcon, Activity as ActivityIcon, Megaphone, Share2, Mail, Calendar, MoreHorizontal } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { TextField, SelectField, TextAreaField } from '@/components/ui/FormField';
import { POSTER_TEMPLATES, PosterPreview, type PosterData } from '@/components/marketing/PosterTemplates';

const ACTIVITY_TYPES: Record<string, { label: string; icon: any; color: string }> = {
  poster_created: { label: 'Poster Created', icon: ImageIcon, color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' },
  campaign_launched: { label: 'Campaign Launched', icon: Megaphone, color: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' },
  social_post: { label: 'Social Post', icon: Share2, color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  email_sent: { label: 'Email Sent', icon: Mail, color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' },
  event: { label: 'Event', icon: Calendar, color: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' },
  other: { label: 'Other', icon: MoreHorizontal, color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
};

export default function MarketingPage() {
  const [tab, setTab] = useState<'pages' | 'forms' | 'posters' | 'activity'>('pages');
  const [showPageModal, setShowPageModal] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
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

  const { data: posters, isLoading: postersLoading } = useQuery({
    queryKey: ['posters'],
    enabled: tab === 'posters',
    queryFn: async () => { const { data } = await api.get('/marketing/posters'); return data; },
  });

  const { data: activities, isLoading: activitiesLoading } = useQuery({
    queryKey: ['marketing-activities'],
    enabled: tab === 'activity',
    queryFn: async () => { const { data } = await api.get('/marketing/activities'); return data.data; },
  });

  const deletePageMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/marketing/pages/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['landing-pages'] }); toast.success('Page deleted'); },
  });

  const deleteFormMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/marketing/forms/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['marketing-forms'] }); toast.success('Form deleted'); },
  });

  const deletePosterMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/marketing/posters/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['posters'] }); toast.success('Poster deleted'); },
  });

  const deleteActivityMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/marketing/activities/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['marketing-activities'] }); toast.success('Activity deleted'); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Marketing</h1>
          <p className="text-sm text-gray-500 mt-0.5">Landing pages, forms, posters & activity</p>
        </div>
        {tab !== 'posters' && (
          <button
            onClick={() => {
              if (tab === 'pages') setShowPageModal(true);
              else if (tab === 'forms') setShowFormModal(true);
              else setShowActivityModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" /> {tab === 'pages' ? 'New Page' : tab === 'forms' ? 'New Form' : 'Log Activity'}
          </button>
        )}
      </div>

      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
        {(['pages', 'forms', 'posters', 'activity'] as const).map(t => (
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
              <div
                key={form.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedForm(form)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedForm(form); } }}
                className={`glass-card rounded-2xl p-4 cursor-pointer transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${selectedForm?.id === form.id ? 'ring-2 ring-indigo-500' : 'hover:shadow-md'}`}
              >
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

      {tab === 'posters' && (
        <PosterGallery posters={posters?.data || []} isLoading={postersLoading} onDelete={(id: string) => { if (confirm('Delete this poster?')) deletePosterMutation.mutate(id); }} />
      )}

      {tab === 'activity' && (
        <div className="glass-card rounded-2xl overflow-hidden">
          {activitiesLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />)}
            </div>
          ) : !activities?.length ? (
            <div className="p-12 text-center text-gray-400">
              <ActivityIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No marketing activity logged yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-800">
              {activities.map((a: any) => {
                const meta = ACTIVITY_TYPES[a.type] || ACTIVITY_TYPES.other;
                const Icon = meta.icon;
                return (
                  <div key={a.id} className="p-4 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{a.title}</p>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">{meta.label}</span>
                      </div>
                      {a.notes && <p className="text-xs text-gray-500 mt-0.5">{a.notes}</p>}
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                        {a.user && <span>{a.user.firstName} {a.user.lastName}</span>}
                        <span>{formatRelativeTime(a.createdAt)}</span>
                      </div>
                    </div>
                    <button onClick={() => { if (confirm('Delete this activity?')) deleteActivityMutation.mutate(a.id); }} className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showPageModal && <PageModal onClose={() => setShowPageModal(false)} />}
      {showFormModal && <FormModal onClose={() => setShowFormModal(false)} />}
      {showActivityModal && <ActivityModal onClose={() => setShowActivityModal(false)} />}
    </div>
  );
}

function PageModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', slug: '', content: '', isPublished: false });
  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/marketing/pages', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['landing-pages'] }); toast.success('Page created'); onClose(); },
    onError: () => toast.error('Failed to create page'),
  });
  return (
    <Modal onClose={onClose} title="New Landing Page" subtitle="Publish a page to capture leads" icon={Globe} iconColor="purple">
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="flex flex-col">
        <div className="p-6 space-y-4">
          <TextField id="landing-name" label="Name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') })} />
          <TextField id="landing-slug" label="URL Slug" required value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="my-landing-page" />
          <TextAreaField id="landing-content" label="Content (HTML/Markdown)" rows={6} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} className="font-mono text-xs" />
          <label htmlFor="landing-published" className="flex items-center gap-2 cursor-pointer"><input id="landing-published" type="checkbox" checked={form.isPublished} onChange={e => setForm({ ...form, isPublished: e.target.checked })} className="rounded" /><span className="text-sm text-gray-700 dark:text-gray-300">Publish immediately</span></label>
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Creating...' : 'Create Page'}</button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function FormModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', description: '', fields: [{ name: 'email', label: 'Email', type: 'email', required: true }] });
  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/marketing/forms', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['marketing-forms'] }); toast.success('Form created'); onClose(); },
    onError: () => toast.error('Failed to create form'),
  });
  const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500";
  return (
    <Modal onClose={onClose} title="New Form" subtitle="Build a lead-capture form for your site" icon={FormInput} iconColor="pink">
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="flex flex-col">
        <div className="p-6 space-y-4">
          <TextField id="form-name" label="Form Name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <TextAreaField id="form-description" label="Description" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
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
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Creating...' : 'Create Form'}</button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function ActivityModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ type: 'campaign_launched', title: '', notes: '' });
  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/marketing/activities', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['marketing-activities'] }); toast.success('Activity logged'); onClose(); },
    onError: () => toast.error('Failed to log activity'),
  });
  return (
    <Modal onClose={onClose} title="Log Marketing Activity" subtitle="Record a campaign, post, or other marketing action" icon={ActivityIcon} iconColor="indigo">
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }}>
        <div className="p-6 space-y-4">
          <SelectField id="activity-type" label="Type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            {Object.entries(ACTIVITY_TYPES).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
          </SelectField>
          <TextField id="activity-title" label="Title" required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Launched summer sale campaign" />
          <TextAreaField id="activity-notes" label="Notes" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Logging...' : 'Log Activity'}</button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function PosterGallery({ posters, isLoading, onDelete }: { posters: any[]; isLoading: boolean; onDelete: (id: string) => void }) {
  const [showDesigner, setShowDesigner] = useState(false);

  return (
    <div>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => setShowDesigner(true)}
          className="h-48 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500 flex flex-col items-center justify-center text-gray-400 hover:text-indigo-500 transition-colors"
        >
          <Plus className="w-8 h-8 mb-2" />
          <span className="text-sm font-medium">Create Poster</span>
        </button>
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-48 glass-card rounded-2xl animate-pulse" />)
        ) : (
          posters.map((poster: any) => (
            <div key={poster.id} className="glass-card rounded-2xl p-4 group relative">
              <button onClick={() => onDelete(poster.id)} className="absolute top-2 right-2 z-10 p-1.5 bg-white/90 dark:bg-gray-900/90 rounded-lg text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <div className="h-32 rounded-xl overflow-hidden flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div style={{ transform: 'scale(0.4)', transformOrigin: 'center' }}>
                  <PosterPreview template={poster.templateKey} data={{ title: poster.title, subtitle: poster.subtitle || '', primaryColor: poster.primaryColor, secondaryColor: poster.secondaryColor, imageUrl: poster.imageUrl }} />
                </div>
              </div>
              <p className="text-sm font-medium text-gray-900 dark:text-white mt-2 truncate">{poster.title}</p>
              <p className="text-xs text-gray-400">{formatDate(poster.createdAt)}</p>
            </div>
          ))
        )}
      </div>
      {!isLoading && posters.length === 0 && (
        <p className="text-center text-sm text-gray-400 mt-4">No posters yet — create your first one above</p>
      )}
      {showDesigner && <PosterDesigner onClose={() => setShowDesigner(false)} />}
    </div>
  );
}

function PosterDesigner({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<'gallery' | 'customize'>('gallery');
  const [templateKey, setTemplateKey] = useState(POSTER_TEMPLATES[0].key);
  const [data, setData] = useState<PosterData>({ title: '', subtitle: '', primaryColor: '#6366f1', secondaryColor: '#8b5cf6', imageUrl: null });
  const [uploading, setUploading] = useState(false);

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { data: res } = await api.post('/marketing/posters/upload-image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
      setData(d => ({ ...d, imageUrl: `${base}${res.data.url}` }));
    } catch {
      toast.error('Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: () => api.post('/marketing/posters', { title: data.title, subtitle: data.subtitle, templateKey, primaryColor: data.primaryColor, secondaryColor: data.secondaryColor, imageUrl: data.imageUrl }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['posters'] }); toast.success('Poster saved'); onClose(); },
    onError: () => toast.error('Failed to save poster'),
  });

  const handleDownload = async () => {
    const node = document.getElementById('poster-canvas');
    if (!node) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: null });
      const link = document.createElement('a');
      link.download = `${(data.title || 'poster').replace(/\s+/g, '-').toLowerCase()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      toast.error('Failed to generate image. Try saving instead.');
    }
  };

  if (step === 'gallery') {
    return (
      <Modal onClose={onClose} title="Choose a Template" subtitle="Pick a layout to start designing your poster" icon={ImageIcon} iconColor="purple" size="2xl">
        <div className="p-6 grid grid-cols-2 md:grid-cols-3 gap-4">
          {POSTER_TEMPLATES.map(t => (
            <button
              key={t.key}
              onClick={() => { setTemplateKey(t.key); setStep('customize'); }}
              className="rounded-xl border border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500 p-3 text-left transition-colors"
            >
              <div className="h-24 rounded-lg overflow-hidden flex items-center justify-center bg-gray-50 dark:bg-gray-900 mb-2">
                <div style={{ transform: 'scale(0.27)', transformOrigin: 'center' }}>
                  <PosterPreview template={t.key} data={{ title: 'Sample Title', subtitle: 'A short subtitle goes here', primaryColor: '#6366f1', secondaryColor: '#8b5cf6', imageUrl: null }} />
                </div>
              </div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">{t.name}</p>
              <p className="text-xs text-gray-400">{t.description}</p>
            </button>
          ))}
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title="Customize Poster" subtitle="Adjust text, colors, and image, then save or download" icon={ImageIcon} iconColor="purple" size="2xl">
      <div className="p-6 grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <TextField id="poster-title" label="Title" required value={data.title} onChange={e => setData({ ...data, title: e.target.value })} placeholder="Big Summer Sale" />
          <TextField id="poster-subtitle" label="Subtitle" value={data.subtitle} onChange={e => setData({ ...data, subtitle: e.target.value })} placeholder="Up to 50% off this weekend" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="poster-primary" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Primary Color</label>
              <input id="poster-primary" type="color" value={data.primaryColor} onChange={e => setData({ ...data, primaryColor: e.target.value })} className="w-full h-10 rounded-lg cursor-pointer border border-gray-200 dark:border-gray-700" />
            </div>
            <div>
              <label htmlFor="poster-secondary" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Secondary Color</label>
              <input id="poster-secondary" type="color" value={data.secondaryColor} onChange={e => setData({ ...data, secondaryColor: e.target.value })} className="w-full h-10 rounded-lg cursor-pointer border border-gray-200 dark:border-gray-700" />
            </div>
          </div>
          <div>
            <label htmlFor="poster-image" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Background Image (optional)</label>
            <input id="poster-image" type="file" accept="image/*" onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0])} className="text-xs text-gray-500 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-600 dark:file:bg-indigo-950/30 dark:file:text-indigo-400 file:text-xs file:font-medium" />
            {uploading && <p className="text-xs text-indigo-500 mt-1">Uploading...</p>}
          </div>
          <button type="button" onClick={() => setStep('gallery')} className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline">← Choose a different template</button>
        </div>
        <div className="flex items-center justify-center">
          <div id="poster-canvas" className="shadow-2xl rounded-lg overflow-hidden">
            <PosterPreview template={templateKey} data={data} />
          </div>
        </div>
      </div>
      <ModalFooter>
        <button type="button" onClick={handleDownload} className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Download PNG</button>
        <div className="flex-1" />
        <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Cancel</button>
        <button type="button" disabled={!data.title || saveMutation.isPending} onClick={() => saveMutation.mutate()} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {saveMutation.isPending ? 'Saving...' : 'Save Poster'}
        </button>
      </ModalFooter>
    </Modal>
  );
}

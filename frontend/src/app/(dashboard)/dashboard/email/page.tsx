'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Plus, Mail, Send, Trash2, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { TextField, SelectField, TextAreaField } from '@/components/ui/FormField';

export default function EmailPage() {
  const [tab, setTab] = useState<'campaigns' | 'templates' | 'send'>('campaigns');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const qc = useQueryClient();

  const { data: campaigns } = useQuery({
    queryKey: ['email-campaigns'],
    enabled: tab === 'campaigns',
    queryFn: async () => { const { data } = await api.get('/email/campaigns'); return data; },
  });

  const { data: templates } = useQuery({
    queryKey: ['email-templates'],
    enabled: tab === 'templates' || tab === 'campaigns',
    queryFn: async () => { const { data } = await api.get('/email/templates'); return data.data; },
  });

  const sendCampaignMutation = useMutation({
    mutationFn: (id: string) => api.post(`/email/campaigns/${id}/send`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['email-campaigns'] }); toast.success('Campaign sent'); },
    onError: () => toast.error('Failed to send campaign'),
  });

  const [quickForm, setQuickForm] = useState({ to: '', subject: '', body: '' });
  const sendDirectMutation = useMutation({
    mutationFn: (data: any) => api.post('/email/send', data),
    onSuccess: () => { toast.success('Email sent'); setQuickForm({ to: '', subject: '', body: '' }); },
    onError: () => toast.error('Failed to send email'),
  });

  const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Email</h1>
          <p className="text-sm text-gray-500 mt-0.5">Campaigns, templates & direct email</p>
        </div>
        <div className="flex gap-2">
          {tab === 'templates' && <button onClick={() => setShowTemplateModal(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700"><Plus className="w-4 h-4" /> Template</button>}
          {tab === 'campaigns' && <button onClick={() => setShowCampaignModal(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700"><Plus className="w-4 h-4" /> Campaign</button>}
        </div>
      </div>

      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
        {(['campaigns', 'templates', 'send'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${tab === t ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500'}`}>{t === 'send' ? 'Quick Send' : t}</button>
        ))}
      </div>

      {tab === 'campaigns' && (
        <div className="space-y-4">
          {campaigns?.data?.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center text-gray-400">
              <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No campaigns yet</p>
            </div>
          ) : campaigns?.data?.map((c: any) => (
            <div key={c.id} className="glass-card rounded-2xl p-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{c.name}</p>
                <p className="text-xs text-gray-500 mb-1">Subject: {c.subject}</p>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>{c.recipients?.length || 0} recipients</span>
                  <span className={`px-2 py-0.5 rounded-full font-medium capitalize ${c.status === 'sent' ? 'bg-green-100 text-green-700' : c.status === 'scheduled' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{c.status}</span>
                  {c.sentAt && <span>Sent {formatDate(c.sentAt)}</span>}
                </div>
              </div>
              {c.status === 'draft' && (
                <button onClick={() => sendCampaignMutation.mutate(c.id)} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700">
                  <Send className="w-3 h-3" /> Send
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'templates' && (
        <div className="grid md:grid-cols-2 gap-4">
          {templates?.length === 0 ? (
            <div className="col-span-2 glass-card rounded-2xl p-12 text-center text-gray-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No templates yet</p>
            </div>
          ) : templates?.map((t: any) => (
            <div key={t.id} className="glass-card rounded-2xl p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{t.name}</p>
                <span className="text-xs text-gray-400 capitalize">{t.type}</span>
              </div>
              <p className="text-xs text-indigo-600 mb-2 font-medium">{t.subject}</p>
              <p className="text-xs text-gray-500 line-clamp-3">{t.body}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'send' && (
        <div className="max-w-xl">
          <form onSubmit={e => { e.preventDefault(); sendDirectMutation.mutate(quickForm); }} className="glass-card rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Send Email</h2>
            <div><label htmlFor="email-quick-to" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">To*</label><input id="email-quick-to" required type="email" value={quickForm.to} onChange={e => setQuickForm({ ...quickForm, to: e.target.value })} placeholder="recipient@example.com" className={inputCls} /></div>
            <div><label htmlFor="email-quick-subject" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Subject*</label><input id="email-quick-subject" required value={quickForm.subject} onChange={e => setQuickForm({ ...quickForm, subject: e.target.value })} className={inputCls} /></div>
            <div><label htmlFor="email-quick-body" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Message*</label><textarea id="email-quick-body" required rows={8} value={quickForm.body} onChange={e => setQuickForm({ ...quickForm, body: e.target.value })} className={inputCls + ' resize-none'} /></div>
            <button type="submit" disabled={sendDirectMutation.isPending} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              <Send className="w-4 h-4" /> {sendDirectMutation.isPending ? 'Sending...' : 'Send Email'}
            </button>
          </form>
        </div>
      )}

      {showTemplateModal && <TemplateModal templates={[]} onClose={() => setShowTemplateModal(false)} />}
      {showCampaignModal && <CampaignModal templates={templates || []} onClose={() => setShowCampaignModal(false)} />}
    </div>
  );
}

function TemplateModal({ onClose }: { templates: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', subject: '', body: '', type: 'custom' });
  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/email/templates', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['email-templates'] }); toast.success('Template created'); onClose(); },
    onError: () => toast.error('Failed to create template'),
  });
  return (
    <Modal onClose={onClose} title="New Email Template" subtitle="Create a reusable email template" icon={FileText} iconColor="blue">
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="flex flex-col">
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <TextField id="template-name" label="Name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <SelectField id="template-type" label="Type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              {['custom', 'welcome', 'invoice', 'appointment', 'ticket', 'campaign'].map(t => <option key={t} value={t}>{t}</option>)}
            </SelectField>
          </div>
          <TextField id="template-subject" label="Subject" required value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Use {{variable}} for placeholders" />
          <TextAreaField id="template-body" label="Body" required rows={8} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Creating...' : 'Create'}</button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function CampaignModal({ templates, onClose }: { templates: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', subject: '', body: '', templateId: '', recipients: '' });
  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/email/campaigns', { ...data, recipients: data.recipients.split('\n').filter(Boolean) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['email-campaigns'] }); toast.success('Campaign created'); onClose(); },
    onError: () => toast.error('Failed to create campaign'),
  });
  return (
    <Modal onClose={onClose} title="New Email Campaign" subtitle="Send a bulk email to a list of recipients" icon={Mail} iconColor="blue">
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="flex flex-col">
        <div className="p-6 space-y-4">
          <TextField id="campaign-name" label="Campaign Name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          {templates.length > 0 && (
            <SelectField id="campaign-template" label="Use Template" value={form.templateId} onChange={e => { const t = templates.find(t => t.id === e.target.value); if (t) setForm({ ...form, templateId: e.target.value, subject: t.subject, body: t.body }); else setForm({ ...form, templateId: '' }); }}>
              <option value="">Custom content</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </SelectField>
          )}
          <TextField id="campaign-subject" label="Subject" required value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
          <TextAreaField id="campaign-body" label="Body" required rows={5} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
          <TextAreaField id="campaign-recipients" label="Recipients (one email per line)" rows={4} value={form.recipients} onChange={e => setForm({ ...form, recipients: e.target.value })} placeholder="user@example.com&#10;another@example.com" className="font-mono text-xs" />
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Creating...' : 'Create Campaign'}</button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

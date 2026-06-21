'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { Plus, Send, MessageSquare, Users, Search, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { TextField, SelectField, TextAreaField } from '@/components/ui/FormField';

export default function WhatsAppPage() {
  const [tab, setTab] = useState<'messages' | 'campaigns' | 'templates'>('messages');
  const [contactPhone, setContactPhone] = useState('');
  const [selectedPhone, setSelectedPhone] = useState('');
  const [message, setMessage] = useState('');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const qc = useQueryClient();

  const { data: messages } = useQuery({
    queryKey: ['wa-messages', selectedPhone],
    enabled: !!selectedPhone,
    queryFn: async () => { const { data } = await api.get(`/whatsapp/messages?phone=${selectedPhone}`); return data.data; },
  });

  const { data: campaigns } = useQuery({
    queryKey: ['wa-campaigns'],
    enabled: tab === 'campaigns',
    queryFn: async () => { const { data } = await api.get('/whatsapp/campaigns'); return data; },
  });

  const { data: templates } = useQuery({
    queryKey: ['wa-templates'],
    enabled: tab === 'templates' || tab === 'campaigns',
    queryFn: async () => { const { data } = await api.get('/whatsapp/templates'); return data.data; },
  });

  const sendMutation = useMutation({
    mutationFn: ({ to, message }: any) => api.post('/whatsapp/send', { to, message }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wa-messages', selectedPhone] }); setMessage(''); toast.success('Message sent'); },
    onError: () => toast.error('Failed to send message'),
  });

  const sendCampaign = useMutation({
    mutationFn: (id: string) => api.post(`/whatsapp/campaigns/${id}/send`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wa-campaigns'] }); toast.success('Campaign sent'); },
    onError: () => toast.error('Failed to send campaign'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">WhatsApp</h1>
          <p className="text-sm text-gray-500 mt-0.5">Messaging & Campaigns</p>
        </div>
        <div className="flex gap-2">
          {tab === 'templates' && <button onClick={() => setShowTemplateModal(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700"><Plus className="w-4 h-4" /> Template</button>}
          {tab === 'campaigns' && <button onClick={() => setShowCampaignModal(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700"><Plus className="w-4 h-4" /> Campaign</button>}
        </div>
      </div>

      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
        {(['messages', 'campaigns', 'templates'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${tab === t ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500'}`}>{t}</button>
        ))}
      </div>

      {tab === 'messages' && (
        <div className="grid md:grid-cols-3 gap-4 h-[calc(100vh-280px)] min-h-96">
          {/* Contact search / list */}
          <div className="glass-card rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700">
              <Search className="w-4 h-4 text-gray-400" />
              <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="Enter phone number..." className="bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 outline-none flex-1" />
              {contactPhone && (
                <button onClick={() => setSelectedPhone(contactPhone)} className="text-xs text-green-600 font-medium">Open</button>
              )}
            </div>
            <p className="text-xs text-gray-400 text-center mt-2">Enter a phone number to start a conversation</p>
          </div>

          {/* Chat area */}
          <div className="md:col-span-2 glass-card rounded-2xl flex flex-col">
            {!selectedPhone ? (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Select a contact to start messaging</p>
                </div>
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{selectedPhone}</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages?.map((msg: any) => (
                    <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-xs px-3 py-2 rounded-2xl text-sm ${msg.direction === 'outbound' ? 'bg-green-500 text-white rounded-br-sm' : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-sm'}`}>
                        <p>{msg.content}</p>
                        <p className={`text-xs mt-1 ${msg.direction === 'outbound' ? 'text-green-100' : 'text-gray-400'}`}>{formatDateTime(msg.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                  {messages?.length === 0 && <p className="text-center text-xs text-gray-400">No messages yet</p>}
                </div>
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
                  <input value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && message.trim()) { e.preventDefault(); sendMutation.mutate({ to: selectedPhone, message }); } }} placeholder="Type a message..." className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-green-500" />
                  <button onClick={() => message.trim() && sendMutation.mutate({ to: selectedPhone, message })} disabled={!message.trim() || sendMutation.isPending} className="w-10 h-10 flex items-center justify-center bg-green-500 text-white rounded-xl disabled:opacity-50 hover:bg-green-600">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'campaigns' && (
        <div className="space-y-4">
          {campaigns?.data?.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center text-gray-400">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No campaigns yet</p>
            </div>
          ) : campaigns?.data?.map((c: any) => (
            <div key={c.id} className="glass-card rounded-2xl p-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{c.name}</p>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>{c._count?.messages || 0} messages</span>
                  <span className={`px-2 py-0.5 rounded-full font-medium capitalize ${c.status === 'sent' ? 'bg-green-100 text-green-700' : c.status === 'scheduled' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{c.status}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {c.status === 'draft' && (
                  <button onClick={() => sendCampaign.mutate(c.id)} className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-medium hover:bg-green-600 flex items-center gap-1"><Send className="w-3 h-3" /> Send</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'templates' && (
        <div className="grid md:grid-cols-2 gap-4">
          {templates?.length === 0 ? (
            <div className="col-span-2 glass-card rounded-2xl p-12 text-center text-gray-400">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No templates yet</p>
            </div>
          ) : templates?.map((t: any) => (
            <div key={t.id} className="glass-card rounded-2xl p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{t.name}</p>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${t.status === 'approved' ? 'bg-green-100 text-green-700' : t.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>{t.status}</span>
              </div>
              <p className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 font-mono whitespace-pre-wrap">{t.content}</p>
              <p className="text-xs text-gray-400 mt-2 capitalize">{t.category}</p>
            </div>
          ))}
        </div>
      )}

      {showTemplateModal && <TemplateModal onClose={() => setShowTemplateModal(false)} />}
      {showCampaignModal && <CampaignModal templates={templates || []} onClose={() => setShowCampaignModal(false)} />}
    </div>
  );
}

function TemplateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', content: '', category: 'marketing', language: 'en' });
  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/whatsapp/templates', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wa-templates'] }); toast.success('Template created'); onClose(); },
    onError: () => toast.error('Failed to create template'),
  });
  return (
    <Modal onClose={onClose} title="New Template" subtitle="Create a reusable WhatsApp message template" icon={MessageSquare} iconColor="green">
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="flex flex-col">
        <div className="p-6 space-y-4">
          <TextField id="whatsapp-template-name" label="Template Name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <SelectField id="whatsapp-template-category" label="Category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
            {['marketing', 'utility', 'authentication'].map(c => <option key={c} value={c}>{c}</option>)}
          </SelectField>
          <TextAreaField id="whatsapp-template-content" label={`Content (use {{1}} for variables)`} required rows={5} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} className="font-mono text-xs" />
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Creating...' : 'Create'}</button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function CampaignModal({ templates, onClose }: { templates: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', templateId: templates[0]?.id || '', recipients: '' });
  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/whatsapp/campaigns', { ...data, recipients: data.recipients.split('\n').filter(Boolean) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wa-campaigns'] }); toast.success('Campaign created'); onClose(); },
    onError: () => toast.error('Failed to create campaign'),
  });
  return (
    <Modal onClose={onClose} title="New Campaign" subtitle="Send a WhatsApp campaign to a list of recipients" icon={Users} iconColor="green">
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="flex flex-col">
        <div className="p-6 space-y-4">
          <TextField id="whatsapp-campaign-name" label="Campaign Name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <SelectField id="whatsapp-campaign-template" label="Template" value={form.templateId} onChange={e => setForm({ ...form, templateId: e.target.value })}>
            <option value="">No template</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </SelectField>
          <TextAreaField id="whatsapp-campaign-recipients" label="Recipients (one phone per line)" rows={5} value={form.recipients} onChange={e => setForm({ ...form, recipients: e.target.value })} placeholder="+1234567890&#10;+0987654321" className="font-mono text-xs" />
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Creating...' : 'Create'}</button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

'use client';
import { useState, useEffect, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Building2, Bell, Key, Shield, Mail, MessageSquare, Palette, Bot, Zap, CheckCircle, XCircle, Clock } from 'lucide-react';

export default function SettingsPage() {
  const [tab, setTab] = useState('company');
  const qc = useQueryClient();

  const { data: company } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => { const { data } = await api.get('/settings/company'); return data.data; },
  });

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => { const { data } = await api.get('/settings/roles'); return data.data; },
  });

  const { data: apiKeys } = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => { const { data } = await api.get('/settings/api-keys'); return data.data; },
  });

  const [companyForm, setCompanyForm] = useState<any>(null);
  useEffect(() => {
    if (company && !companyForm) setCompanyForm(company);
  }, [company, companyForm]);

  const saveMutation = useMutation({
    mutationFn: (data: any) => api.put('/settings/company', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['company-settings'] }); toast.success('Settings saved'); },
    onError: () => toast.error('Failed to save settings'),
  });

  const createKeyMutation = useMutation({
    mutationFn: (data: any) => api.post('/settings/api-keys', data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success(`API Key: ${res.data.data.key} — Save it now!`, { duration: 10000 });
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/api-keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  const { data: aiStatus } = useQuery({
    queryKey: ['ai-status'],
    queryFn: async () => { const { data } = await api.get('/ai/status'); return data.data; },
  });

  const tabs = [
    { id: 'company', label: 'Company', icon: Building2 },
    { id: 'ai', label: 'AI Config', icon: Bot },
    { id: 'smtp', label: 'Email (SMTP)', icon: Mail },
    { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
    { id: 'roles', label: 'Roles', icon: Shield },
    { id: 'api-keys', label: 'API Keys', icon: Key },
    { id: 'audit', label: 'Audit Log', icon: Clock },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>

      <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl flex-wrap">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'company' && companyForm && (
        <div className="glass-card rounded-2xl p-6 space-y-6">
          <h2 className="font-semibold text-gray-900 dark:text-white">Company Information</h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              { k: 'name', l: 'Company Name' }, { k: 'email', l: 'Email' },
              { k: 'phone', l: 'Phone' }, { k: 'website', l: 'Website' },
              { k: 'industry', l: 'Industry' }, { k: 'taxId', l: 'Tax ID' },
              { k: 'gstNumber', l: 'GST Number' }, { k: 'currency', l: 'Currency' },
              { k: 'timezone', l: 'Timezone' }, { k: 'language', l: 'Language' },
            ].map(({ k, l }) => (
              <div key={k}>
                <label htmlFor={`company-${k}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{l}</label>
                <input
                  id={`company-${k}`}
                  value={companyForm[k] || ''}
                  onChange={e => setCompanyForm({ ...companyForm, [k]: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="company-primaryColor" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Primary Color</label>
              <div className="flex items-center gap-3">
                <input id="company-primaryColor" type="color" value={companyForm.primaryColor || '#6366f1'} onChange={e => setCompanyForm({ ...companyForm, primaryColor: e.target.value })} className="w-10 h-10 rounded-lg cursor-pointer border border-gray-200" />
                <input value={companyForm.primaryColor || '#6366f1'} onChange={e => setCompanyForm({ ...companyForm, primaryColor: e.target.value })} className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
          </div>
          <button onClick={() => saveMutation.mutate(companyForm)} disabled={saveMutation.isPending} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      )}

      {tab === 'ai' && companyForm && (
        <div className="space-y-6">
          {/* Active status */}
          <div className="glass-card rounded-2xl p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${aiStatus?.activeKeyConfigured ? 'bg-green-100 dark:bg-green-950/30' : 'bg-red-100 dark:bg-red-950/30'}`}>
              {aiStatus?.activeKeyConfigured ? <CheckCircle className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-red-500" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {aiStatus?.activeKeyConfigured ? `AI Active — ${aiStatus.provider === 'openai' ? 'ChatGPT' : 'Claude'} (${aiStatus.model})` : 'No API key configured'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {aiStatus?.source === 'company' ? 'Using company-level override' : 'Using global server configuration'}
              </p>
            </div>
            <span className={`text-xs px-3 py-1 rounded-full font-medium capitalize ${aiStatus?.activeKeyConfigured ? 'bg-green-50 dark:bg-green-950/30 text-green-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
              {aiStatus?.provider || 'not set'}
            </span>
          </div>

          {/* Provider selector */}
          <div className="glass-card rounded-2xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Bot className="w-4 h-4" /> AI Provider</h2>
            <p className="text-xs text-gray-500">Select which AI model powers your assistant, lead qualification, and email drafting.</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'claude', label: 'Claude (Anthropic)', desc: 'claude-sonnet-4-6 · Best for business tasks', color: 'from-orange-400 to-red-500' },
                { value: 'openai', label: 'ChatGPT (OpenAI)', desc: 'gpt-4o · Broad capability', color: 'from-green-400 to-teal-500' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setCompanyForm({ ...companyForm, aiProvider: opt.value })}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    (companyForm.aiProvider || '') === opt.value
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${opt.color} mb-2 flex items-center justify-center`}>
                    <Zap className="w-4 h-4 text-white" />
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{opt.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400">Leave unset to use the server-level <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">AI_PROVIDER</code> env variable.</p>
            <button onClick={() => setCompanyForm({ ...companyForm, aiProvider: null })} className="text-xs text-red-500 hover:underline">Reset to server default</button>
          </div>

          {/* Claude key */}
          <div className="glass-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-white">Claude (Anthropic) Key</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full ${aiStatus?.claudeEnabled ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                {aiStatus?.claudeEnabled ? '✓ Configured' : 'Not set'}
              </span>
            </div>
            <p className="text-xs text-gray-500">Get your key at <strong>console.anthropic.com</strong> → API Keys</p>
            <input type="password" value={companyForm.anthropicKey || ''} onChange={e => setCompanyForm({ ...companyForm, anthropicKey: e.target.value })} placeholder="sk-ant-api03-..." className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
            <p className="text-xs text-gray-400">This overrides the server <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">ANTHROPIC_API_KEY</code> for your company.</p>
          </div>

          {/* OpenAI key */}
          <div className="glass-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-white">ChatGPT (OpenAI) Key</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full ${aiStatus?.openaiEnabled ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                {aiStatus?.openaiEnabled ? '✓ Configured' : 'Not set'}
              </span>
            </div>
            <p className="text-xs text-gray-500">Get your key at <strong>platform.openai.com</strong> → API Keys</p>
            <input type="password" value={companyForm.openaiKey || ''} onChange={e => setCompanyForm({ ...companyForm, openaiKey: e.target.value })} placeholder="sk-proj-..." className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
            <p className="text-xs text-gray-400">This overrides the server <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">OPENAI_API_KEY</code> for your company.</p>
          </div>

          <button onClick={() => saveMutation.mutate(companyForm)} disabled={saveMutation.isPending} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saveMutation.isPending ? 'Saving...' : 'Save AI Settings'}
          </button>
        </div>
      )}

      {tab === 'smtp' && companyForm && (
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-white">Email Configuration</h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              { k: 'smtpHost', l: 'SMTP Host', ph: 'smtp.gmail.com' },
              { k: 'smtpPort', l: 'SMTP Port', ph: '587' },
              { k: 'smtpUser', l: 'SMTP Username', ph: 'you@gmail.com' },
              { k: 'smtpFrom', l: 'From Address', ph: 'noreply@yourdomain.com' },
            ].map(({ k, l, ph }) => (
              <div key={k}>
                <label htmlFor={`smtp-${k}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{l}</label>
                <input id={`smtp-${k}`} value={companyForm[k] || ''} onChange={e => setCompanyForm({ ...companyForm, [k]: e.target.value })} placeholder={ph} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            ))}
            <div className="col-span-2">
              <label htmlFor="smtp-smtpPass" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">SMTP Password</label>
              <input id="smtp-smtpPass" type="password" value={companyForm.smtpPass || ''} onChange={e => setCompanyForm({ ...companyForm, smtpPass: e.target.value })} placeholder="App password..." className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <button onClick={() => saveMutation.mutate(companyForm)} disabled={saveMutation.isPending} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saveMutation.isPending ? 'Saving...' : 'Save SMTP Settings'}
          </button>
        </div>
      )}

      {tab === 'whatsapp' && companyForm && (
        <div className="space-y-6">
          {/* Provider selector */}
          <div className="glass-card rounded-2xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><MessageSquare className="w-4 h-4 text-green-500" /> WhatsApp Provider</h2>
            <p className="text-xs text-gray-500">Choose which WhatsApp Business API provider sends your messages and campaigns.</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'meta', label: 'Meta Cloud API', desc: 'Official WhatsApp Business Platform', color: 'from-blue-400 to-indigo-500' },
                { value: 'msg91', label: 'MSG91', desc: 'Third-party WhatsApp Business Solution', color: 'from-green-400 to-teal-500' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setCompanyForm({ ...companyForm, whatsappProvider: opt.value })}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    (companyForm.whatsappProvider || 'meta') === opt.value
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${opt.color} mb-2 flex items-center justify-center`}>
                    <MessageSquare className="w-4 h-4 text-white" />
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{opt.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="glass-card rounded-2xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">
              {(companyForm.whatsappProvider || 'meta') === 'msg91' ? 'MSG91 Credentials' : 'Meta WhatsApp Cloud API'}
            </h2>
            <p className="text-xs text-gray-500">
              {(companyForm.whatsappProvider || 'meta') === 'msg91'
                ? 'Connect your MSG91 WhatsApp account to send campaigns and messages.'
                : 'Connect your Meta WhatsApp Business account to send campaigns and reply to messages.'}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="settings-whatsapp-phone" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {(companyForm.whatsappProvider || 'meta') === 'msg91' ? 'Integrated Number' : 'Phone Number ID'}
                </label>
                <input id="settings-whatsapp-phone" value={companyForm.whatsappPhone || ''} onChange={e => setCompanyForm({ ...companyForm, whatsappPhone: e.target.value })} placeholder={(companyForm.whatsappProvider || 'meta') === 'msg91' ? '919999999999' : '+1234567890'} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="col-span-2">
                <label htmlFor="settings-whatsapp-apikey" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {(companyForm.whatsappProvider || 'meta') === 'msg91' ? 'MSG91 Authkey' : 'API Key (Permanent Token)'}
                </label>
                <input id="settings-whatsapp-apikey" type="password" value={companyForm.whatsappApiKey || ''} onChange={e => setCompanyForm({ ...companyForm, whatsappApiKey: e.target.value })} placeholder={(companyForm.whatsappProvider || 'meta') === 'msg91' ? 'authkey...' : 'EAAxxxxxx...'} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                <p className="text-xs text-gray-400 mt-1">
                  {(companyForm.whatsappProvider || 'meta') === 'msg91'
                    ? 'Find your authkey in the MSG91 dashboard → Settings → API Keys.'
                    : 'Generate a Permanent Token from Meta Business Manager → System Users.'}
                </p>
              </div>
            </div>
            {(companyForm.whatsappProvider || 'meta') === 'meta' && (
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-xs text-blue-700 dark:text-blue-300 space-y-1">
                <p className="font-medium">Webhook setup</p>
                <p>Callback URL: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">{process.env.NEXT_PUBLIC_API_URL}/api/v1/whatsapp/webhook</code></p>
                <p>Verify Token: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">businessos-verify-2026</code></p>
              </div>
            )}
            {(companyForm.whatsappProvider || 'meta') === 'msg91' && (
              <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 text-xs text-yellow-700 dark:text-yellow-300 space-y-1">
                <p className="font-medium">Webhook setup</p>
                <p>Callback URL: <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">{process.env.NEXT_PUBLIC_API_URL}/api/v1/whatsapp/webhook/msg91</code></p>
                <p className="mt-2">Add this URL in your MSG91 dashboard under WhatsApp → Webhook settings so replies show up automatically. This integration is built from MSG91&apos;s published docs and hasn&apos;t been verified against a live account yet — if messages don&apos;t appear after sending a test reply, check the backend logs for an &quot;Unrecognized MSG91 webhook payload shape&quot; entry and let your developer know the logged format.</p>
              </div>
            )}
            <button onClick={() => saveMutation.mutate(companyForm)} disabled={saveMutation.isPending} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {saveMutation.isPending ? 'Saving...' : 'Save WhatsApp Settings'}
            </button>
          </div>
        </div>
      )}

      {tab === 'roles' && (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white">Roles & Permissions</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left text-xs font-medium text-gray-500 px-6 py-3">Role</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Users</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Type</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Permissions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {roles?.map((role: any) => (
                <tr key={role.id}>
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{role.name}</p>
                    <p className="text-xs text-gray-500">{role.slug}</p>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">{role._count?.userRoles || 0}</td>
                  <td className="px-4 py-4">
                    {role.isSystem && <span className="text-xs bg-blue-50 dark:bg-blue-950/30 text-blue-600 px-2 py-0.5 rounded-full">System</span>}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1">
                      {(Array.isArray(role.permissions) ? role.permissions : []).slice(0, 3).map((p: string) => (
                        <span key={p} className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{p}</span>
                      ))}
                      {(role.permissions?.length || 0) > 3 && <span className="text-xs text-gray-400">+{role.permissions.length - 3}</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'api-keys' && (
        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">API Keys</h2>
            <button
              onClick={() => {
                const name = prompt('API Key name:');
                if (name) createKeyMutation.mutate({ name, permissions: [] });
              }}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 mb-4"
            >
              <Key className="w-4 h-4" /> Generate New Key
            </button>
            <div className="space-y-3">
              {apiKeys?.map((key: any) => (
                <div key={key.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{key.name}</p>
                    <p className="text-xs font-mono text-gray-500 mt-0.5">{key.key}</p>
                    {key.lastUsedAt && <p className="text-xs text-gray-400 mt-0.5">Last used: {new Date(key.lastUsedAt).toLocaleDateString()}</p>}
                  </div>
                  <button
                    onClick={() => { if (confirm('Delete this API key?')) deleteKeyMutation.mutate(key.id); }}
                    className="text-xs text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30"
                  >
                    Delete
                  </button>
                </div>
              ))}
              {apiKeys?.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No API keys yet</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">Audit Log</h2>
            <p className="text-xs text-gray-500 mt-1">All create, update, and delete actions across your account</p>
          </div>
          <AuditLogTable />
        </div>
      )}
    </div>
  );
}

const AUDIT_MODULES = [
  'crm.leads', 'crm.contacts', 'crm.companies', 'crm.deals',
  'projects', 'projects.tasks', 'hr.employees', 'finance.invoices', 'helpdesk.tickets',
];

const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'companyId']);

function diffFields(before: any, after: any) {
  if (!before || !after) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: { field: string; from: any; to: any }[] = [];
  keys.forEach((key) => {
    if (SYSTEM_FIELDS.has(key)) return;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes.push({ field: key, from: before[key], to: after[key] });
    }
  });
  return changes;
}

function formatValue(v: any) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function AuditLogTable() {
  const [page, setPage] = useState(1);
  const [moduleFilter, setModuleFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-log', page, moduleFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (moduleFilter) params.set('module', moduleFilter);
      const { data } = await api.get(`/settings/audit?${params}`);
      return data;
    },
  });

  const logs = data?.data || [];
  const meta = data?.meta || {};

  const actionColor: Record<string, string> = {
    POST: 'text-green-600 bg-green-50 dark:bg-green-950/30',
    PUT: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30',
    PATCH: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30',
    DELETE: 'text-red-600 bg-red-50 dark:bg-red-950/30',
  };
  const actionLabel: Record<string, string> = { POST: 'CREATE', PUT: 'UPDATE', PATCH: 'UPDATE', DELETE: 'DELETE' };

  return (
    <div>
      <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800">
        <select
          value={moduleFilter}
          onChange={e => { setModuleFilter(e.target.value); setPage(1); }}
          className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-200 outline-none"
        >
          <option value="">All modules</option>
          {AUDIT_MODULES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="p-6 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />)}
        </div>
      ) : logs.length === 0 ? (
        <div className="p-12 text-center text-gray-400 text-sm">No audit logs yet</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left text-xs font-medium text-gray-500 px-6 py-3">User</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Action</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Module</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Resource</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">IP</th>
                <th className="text-right text-xs font-medium text-gray-500 px-6 py-3">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {logs.map((log: any) => {
                const changes = diffFields(log.before, log.after);
                const isOpen = expanded === log.id;
                return (
                  <Fragment key={log.id}>
                    <tr
                      onClick={() => changes.length > 0 && setExpanded(isOpen ? null : log.id)}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-800/30 ${changes.length > 0 ? 'cursor-pointer' : ''}`}
                    >
                      <td className="px-6 py-3">
                        <p className="font-medium text-gray-900 dark:text-white text-xs">{log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System'}</p>
                        <p className="text-gray-400 text-xs">{log.user?.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${actionColor[log.action] || 'text-gray-600 bg-gray-100'}`}>
                          {actionLabel[log.action] || log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{log.module}</td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-500">
                        {log.resourceId ? log.resourceId.slice(0, 8) + '...' : '—'}
                        {changes.length > 0 && <span className="ml-2 text-indigo-600 dark:text-indigo-400">({changes.length} field{changes.length > 1 ? 's' : ''})</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{log.ipAddress || '—'}</td>
                      <td className="px-6 py-3 text-right text-xs text-gray-400">{new Date(log.createdAt).toLocaleString()}</td>
                    </tr>
                    {isOpen && changes.length > 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-3 bg-gray-50 dark:bg-gray-800/50">
                          <div className="space-y-1.5">
                            {changes.map(c => (
                              <div key={c.field} className="text-xs">
                                <span className="font-medium text-gray-600 dark:text-gray-400 capitalize">{c.field.replace(/([A-Z])/g, ' $1')}: </span>
                                <span className="text-red-500 line-through">{formatValue(c.from)}</span>
                                {' → '}
                                <span className="text-green-600">{formatValue(c.to)}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {meta.totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500">Page {meta.page} of {meta.totalPages} · {meta.total} total</p>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40">Previous</button>
                <button disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

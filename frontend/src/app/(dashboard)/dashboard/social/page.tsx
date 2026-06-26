'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  Instagram, Twitter, Linkedin, Facebook, Youtube, Sparkles, Send, Loader2,
  Trash2, CheckCircle2, AlertCircle, Globe, Zap, Copy,
  Settings2, Calendar, BarChart3, X, RefreshCw,
  Link2, MessageSquare, Heart,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Types ─────────────────────────────────────────────────────────────────────

type PlatformIcon = React.ComponentType<{ className?: string }>;

interface Platform {
  id: string;
  label: string;
  icon: PlatformIcon;
  gradient: string;
  iconColor: string;
  limit: number;
  guide: string;
  tokenLabel: string;
  secretLabel: string;
  helpUrl: string;
}

// ── TikTok icon (accepts className) ──────────────────────────────────────────

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.67a8.16 8.16 0 004.77 1.52V6.72a4.85 4.85 0 01-1-.03z" />
    </svg>
  );
}

// ── Platform config ───────────────────────────────────────────────────────────

const PLATFORMS: Platform[] = [
  {
    id: 'twitter', label: 'X (Twitter)', icon: Twitter,
    gradient: 'from-black to-gray-800', iconColor: 'text-white', limit: 280,
    guide: 'Max 280 characters. Short, punchy, conversational.',
    tokenLabel: 'Bearer Token', secretLabel: 'OAuth 1.0a Token Secret',
    helpUrl: 'https://developer.twitter.com/en/portal/dashboard',
  },
  {
    id: 'linkedin', label: 'LinkedIn', icon: Linkedin,
    gradient: 'from-blue-700 to-blue-600', iconColor: 'text-white', limit: 3000,
    guide: 'Professional tone. 150–300 words performs best.',
    tokenLabel: 'OAuth 2.0 Access Token', secretLabel: 'Organization ID (for company pages)',
    helpUrl: 'https://www.linkedin.com/developers/apps',
  },
  {
    id: 'facebook', label: 'Facebook', icon: Facebook,
    gradient: 'from-blue-600 to-blue-500', iconColor: 'text-white', limit: 63206,
    guide: 'Conversational, ask a question at the end.',
    tokenLabel: 'Page Access Token', secretLabel: 'Page ID',
    helpUrl: 'https://developers.facebook.com',
  },
  {
    id: 'instagram', label: 'Instagram', icon: Instagram,
    gradient: 'from-pink-500 via-rose-500 to-orange-400', iconColor: 'text-white', limit: 2200,
    guide: 'Visual storytelling. Use emojis & 5–10 hashtags.',
    tokenLabel: 'Graph API Access Token', secretLabel: 'Instagram Business User ID',
    helpUrl: 'https://developers.facebook.com/docs/instagram-api',
  },
  {
    id: 'tiktok', label: 'TikTok', icon: TikTokIcon,
    gradient: 'from-gray-900 to-gray-800', iconColor: 'text-white', limit: 2200,
    guide: 'Script for a 30–60s video. Strong hook in first 3 seconds.',
    tokenLabel: 'Access Token', secretLabel: 'Open ID',
    helpUrl: 'https://developers.tiktok.com',
  },
  {
    id: 'youtube', label: 'YouTube', icon: Youtube,
    gradient: 'from-red-600 to-red-500', iconColor: 'text-white', limit: 5000,
    guide: 'Video description with timestamps and CTA to subscribe.',
    tokenLabel: 'OAuth 2.0 Access Token', secretLabel: 'Channel ID',
    helpUrl: 'https://console.developers.google.com',
  },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function PlatformCard({ platform, connected, onConnect, onDisconnect }: any) {
  const Icon = platform.icon;
  return (
    <div className={`relative rounded-2xl p-4 border transition-all ${connected ? 'border-green-200 dark:border-green-800/40 bg-green-50/50 dark:bg-green-950/10' : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800/50'}`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${platform.gradient} flex items-center justify-center shadow-sm flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${platform.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{platform.label}</p>
          {connected ? (
            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mt-0.5">
              <CheckCircle2 className="w-3 h-3" /> Connected
            </p>
          ) : (
            <p className="text-xs text-gray-400">Not connected</p>
          )}
        </div>
        {connected ? (
          <button onClick={() => onDisconnect(platform.id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
            Disconnect
          </button>
        ) : (
          <button onClick={() => onConnect(platform)} className="text-xs text-indigo-600 font-medium px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 transition-colors flex items-center gap-1">
            <Link2 className="w-3 h-3" /> Connect
          </button>
        )}
      </div>
    </div>
  );
}

function ConnectModal({ platform, onClose, onSave }: any) {
  const [form, setForm] = useState({ accountName: '', accountId: '', accessToken: '', accessSecret: '', pageId: '' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.accountName || !form.accessToken) { toast.error('Account name and access token are required'); return; }
    setSaving(true);
    try { await onSave({ platform: platform.id, ...form }); onClose(); }
    catch { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${platform.gradient} flex items-center justify-center`}>
              <platform.icon className={`w-5 h-5 ${platform.iconColor}`} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">Connect {platform.label}</h3>
              <a href={platform.helpUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-500 hover:underline flex items-center gap-0.5">
                Get credentials <Link2 className="w-3 h-3" />
              </a>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4 text-gray-400" /></button>
        </div>

        <div className="space-y-3">
          {[
            { key: 'accountName', label: 'Account / Page Name *', placeholder: '@yourhandle or Page Name' },
            { key: 'accountId', label: 'Account ID / Username', placeholder: 'numeric ID or username' },
            { key: 'accessToken', label: `${platform.tokenLabel} *`, placeholder: 'Paste token here', secret: true },
            { key: 'pageId', label: platform.secretLabel, placeholder: 'optional' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs font-medium text-gray-500 mb-1 block">{f.label}</label>
              <input
                type={f.secret ? 'password' : 'text'}
                value={(form as any)[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
          ))}
        </div>

        <div className="mt-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Connect
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SocialStudioPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'compose' | 'posts' | 'accounts'>('compose');

  // Compose state
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('professional');
  const [goal, setGoal] = useState('engagement');
  const [extraContext, setExtraContext] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['linkedin', 'twitter', 'instagram', 'facebook']);
  const [generated, setGenerated] = useState<Record<string, { content: string; hashtags: string[]; tips: string }>>({});
  const [editedContent, setEditedContent] = useState<Record<string, string>>({});
  const [bestTime, setBestTime] = useState('');
  const [engagementTip, setEngagementTip] = useState('');
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [connectModal, setConnectModal] = useState<any>(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ['social-accounts'],
    queryFn: async () => { const { data } = await api.get('/social/accounts'); return data.data || []; },
  });

  const { data: posts = [] } = useQuery({
    queryKey: ['social-posts'],
    queryFn: async () => { const { data } = await api.get('/social/posts?limit=50'); return data.data || []; },
    enabled: tab === 'posts',
  });

  const connectedIds = new Set((accounts as any[]).map((a: any) => a.platform));

  const togglePlatform = (id: string) => {
    setSelectedPlatforms(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const generatePosts = async () => {
    if (!topic.trim()) { toast.error('Enter a topic first'); return; }
    if (!selectedPlatforms.length) { toast.error('Select at least one platform'); return; }
    setGenerating(true);
    try {
      const { data } = await api.post('/social/generate', { topic, tone, goal, platforms: selectedPlatforms, extraContext });
      const result = data.data;
      setGenerated(result.posts || {});
      setEditedContent(Object.fromEntries(Object.entries(result.posts || {}).map(([k, v]: any) => [k, v.content])));
      setBestTime(result.bestTime || '');
      setEngagementTip(result.engagementTip || '');
      toast.success('Posts generated!');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'AI generation failed — check API key in Settings');
    } finally {
      setGenerating(false);
    }
  };

  const publishPosts = async () => {
    const platforms = Object.keys(editedContent).filter(p => selectedPlatforms.includes(p) && editedContent[p]);
    if (!platforms.length) { toast.error('Generate posts first'); return; }
    setPublishing(true);
    try {
      const posts: Record<string, string> = {};
      platforms.forEach(p => { posts[p] = editedContent[p]; });
      const { data } = await api.post('/social/publish', { platforms, posts, scheduledAt: scheduledAt || null });
      const results: any[] = data.data?.results || [];
      const published = results.filter(r => r.status === 'published').length;
      const scheduled = results.filter(r => r.status === 'scheduled').length;
      const failed = results.filter(r => r.status === 'failed').length;
      if (published > 0) toast.success(`Published to ${published} platform${published > 1 ? 's' : ''}!`);
      if (scheduled > 0) toast.success(`Scheduled to ${scheduled} platform${scheduled > 1 ? 's' : ''}!`);
      if (failed > 0) toast.error(`Failed on ${failed} platform${failed > 1 ? 's' : ''} — check connections`);
      qc.invalidateQueries({ queryKey: ['social-posts'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const connectAccount = async (form: any) => {
    await api.post('/social/accounts', form);
    toast.success(`${form.platform} connected!`);
    qc.invalidateQueries({ queryKey: ['social-accounts'] });
  };

  const disconnectAccount = async (platform: string) => {
    await api.delete(`/social/accounts/${platform}`);
    toast.success('Disconnected');
    qc.invalidateQueries({ queryKey: ['social-accounts'] });
  };

  const deletePost = async (id: string) => {
    await api.delete(`/social/posts/${id}`);
    toast.success('Deleted');
    qc.invalidateQueries({ queryKey: ['social-posts'] });
  };

  const statusColor: Record<string, string> = {
    published: 'text-green-600 bg-green-50 dark:bg-green-950/30',
    scheduled:  'text-blue-600 bg-blue-50 dark:bg-blue-950/30',
    draft:      'text-gray-600 bg-gray-100 dark:bg-gray-700',
    failed:     'text-red-600 bg-red-50 dark:bg-red-950/30',
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500 via-rose-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-pink-200/40 dark:shadow-pink-900/30">
            <Globe className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Social Media Studio</h1>
            <p className="text-xs text-gray-500">AI-powered cross-platform publishing</p>
          </div>
        </div>
        {/* Connected badges */}
        <div className="flex items-center gap-1.5">
          {PLATFORMS.map(p => {
            const Icon = p.icon;
            const connected = connectedIds.has(p.id);
            return (
              <div key={p.id} title={`${p.label}: ${connected ? 'connected' : 'not connected'}`}
                className={`w-7 h-7 rounded-lg flex items-center justify-center ${connected ? `bg-gradient-to-br ${p.gradient}` : 'bg-gray-100 dark:bg-gray-800'}`}>
                <Icon className={`w-3.5 h-3.5 ${connected ? 'text-white' : 'text-gray-400'}`} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl w-fit">
        {(['compose', 'posts', 'accounts'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all ${tab === t ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {t === 'compose' ? '✍️ Compose' : t === 'posts' ? '📋 Post History' : '🔗 Connections'}
          </button>
        ))}
      </div>

      {/* ── COMPOSE TAB ── */}
      {tab === 'compose' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left: Composer controls */}
          <div className="lg:col-span-1 space-y-4">
            <div className="glass-card rounded-2xl p-5 space-y-4">
              <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 text-sm">
                <Sparkles className="w-4 h-4 text-indigo-500" /> AI Post Generator
              </h2>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Topic / Message *</label>
                <textarea
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  rows={3}
                  placeholder="e.g. We just launched our new pricing plan with 50% off for the first 3 months..."
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">Tone</label>
                  <select value={tone} onChange={e => setTone(e.target.value)} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                    {['professional', 'casual', 'inspirational', 'humorous', 'educational', 'urgent'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">Goal</label>
                  <select value={goal} onChange={e => setGoal(e.target.value)} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                    {['engagement', 'leads', 'brand awareness', 'traffic', 'sales', 'community'].map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">Extra context (optional)</label>
                <input value={extraContext} onChange={e => setExtraContext(e.target.value)} placeholder="Product name, offer details, link..." className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>

              {/* Platform selector */}
              <div>
                <label className="text-xs font-medium text-gray-500 mb-2 block">Platforms</label>
                <div className="grid grid-cols-3 gap-2">
                  {PLATFORMS.map(p => {
                    const Icon = p.icon;
                    const sel = selectedPlatforms.includes(p.id);
                    return (
                      <button key={p.id} onClick={() => togglePlatform(p.id)}
                        className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all ${sel ? 'border-indigo-300 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-950/30' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${sel ? `bg-gradient-to-br ${p.gradient}` : 'bg-gray-100 dark:bg-gray-700'}`}>
                          <Icon className={`w-3.5 h-3.5 ${sel ? 'text-white' : 'text-gray-400'}`} />
                        </div>
                        <span className={`text-xs font-medium leading-none ${sel ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500'}`}>{p.label.split(' ')[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button onClick={generatePosts} disabled={generating || !topic.trim()}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-semibold hover:from-indigo-600 hover:to-violet-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-md shadow-indigo-200/40">
                {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</> : <><Sparkles className="w-4 h-4" /> Generate Posts</>}
              </button>
            </div>

            {/* AI Tips */}
            {(bestTime || engagementTip) && (
              <div className="glass-card rounded-2xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-amber-500" /> AI Recommendations</p>
                {bestTime && <p className="text-xs text-gray-600 dark:text-gray-400"><span className="font-medium text-gray-800 dark:text-gray-200">Best time to post:</span> {bestTime}</p>}
                {engagementTip && <p className="text-xs text-gray-600 dark:text-gray-400"><span className="font-medium text-gray-800 dark:text-gray-200">Tip:</span> {engagementTip}</p>}
              </div>
            )}

            {/* Publish controls */}
            {Object.keys(editedContent).length > 0 && (
              <div className="glass-card rounded-2xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Publish</p>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Schedule for (optional)</label>
                  <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
                <button onClick={publishPosts} disabled={publishing}
                  className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                  {publishing ? <><Loader2 className="w-4 h-4 animate-spin" /> Publishing…</> : scheduledAt ? <><Calendar className="w-4 h-4" /> Schedule Posts</> : <><Send className="w-4 h-4" /> Publish Now</>}
                </button>
              </div>
            )}
          </div>

          {/* Right: Generated posts preview */}
          <div className="lg:col-span-2 space-y-4">
            {Object.keys(generated).length === 0 ? (
              <div className="glass-card rounded-2xl p-12 flex flex-col items-center justify-center text-center gap-4 min-h-[400px]">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500 via-rose-500 to-indigo-500 flex items-center justify-center shadow-xl shadow-pink-200/40">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">AI will craft platform-optimized posts</h3>
                  <p className="text-sm text-gray-500 mt-1">Enter your topic and hit Generate — the AI writes separate content tailored to each platform's style and character limit.</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 mt-2">
                  {PLATFORMS.slice(0, 4).map(p => {
                    const Icon = p.icon;
                    return (
                      <div key={p.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-br ${p.gradient} text-white text-xs font-medium`}>
                        <Icon className="w-3.5 h-3.5" /> {p.label}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              selectedPlatforms.filter(pid => generated[pid]).map(pid => {
                const platform = PLATFORMS.find(p => p.id === pid)!;
                const Icon = platform.icon;
                const post = generated[pid];
                const content = editedContent[pid] || post.content;
                const isOver = content.length > platform.limit;
                const connected = connectedIds.has(pid);

                return (
                  <div key={pid} className="glass-card rounded-2xl overflow-hidden">
                    {/* Platform header */}
                    <div className={`flex items-center justify-between px-4 py-3 bg-gradient-to-r ${platform.gradient}`}>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-white" />
                        <span className="text-sm font-semibold text-white">{platform.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {connected
                          ? <span className="text-xs text-white/80 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Connected</span>
                          : <span className="text-xs text-white/60 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Not connected</span>}
                        <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${isOver ? 'bg-red-500 text-white' : 'bg-white/20 text-white'}`}>
                          {content.length}/{platform.limit}
                        </span>
                      </div>
                    </div>

                    {/* Editable content */}
                    <div className="p-4 space-y-3">
                      <textarea
                        value={content}
                        onChange={e => setEditedContent(prev => ({ ...prev, [pid]: e.target.value }))}
                        rows={pid === 'linkedin' ? 7 : 5}
                        className="w-full text-sm text-gray-800 dark:text-gray-200 bg-transparent resize-none outline-none leading-relaxed"
                      />

                      {/* Hashtags */}
                      {post.hashtags?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {post.hashtags.map((tag: string) => (
                            <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400">
                              #{tag.replace(/^#/, '')}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Platform tip */}
                      {post.tips && (
                        <p className="text-xs text-gray-400 italic flex items-start gap-1.5">
                          <Zap className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" /> {post.tips}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-700">
                        <button onClick={() => { navigator.clipboard.writeText(content); toast.success('Copied!'); }}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                          <Copy className="w-3.5 h-3.5" /> Copy
                        </button>
                        {!connected && (
                          <button onClick={() => setConnectModal(platform)}
                            className="text-xs text-indigo-600 font-medium flex items-center gap-1">
                            <Link2 className="w-3 h-3" /> Connect {platform.label} to publish
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── POST HISTORY TAB ── */}
      {tab === 'posts' && (
        <div className="glass-card rounded-2xl overflow-hidden">
          {(posts as any[]).length === 0 ? (
            <div className="p-12 text-center">
              <BarChart3 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No posts yet — compose and publish your first post.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {(posts as any[]).map((post: any) => {
                const platform = PLATFORMS.find(p => p.id === post.platform);
                const Icon = platform?.icon || Globe;
                return (
                  <div key={post.id} className="flex items-start gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${platform ? `bg-gradient-to-br ${platform.gradient}` : 'bg-gray-200'}`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2">{post.content}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[post.status] || statusColor.draft}`}>{post.status}</span>
                        <span className="text-xs text-gray-400">{new Date(post.createdAt).toLocaleDateString()}</span>
                        {post.likes > 0 && <span className="text-xs text-gray-400 flex items-center gap-1"><Heart className="w-3 h-3" /> {post.likes}</span>}
                        {post.shares > 0 && <span className="text-xs text-gray-400 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> {post.shares}</span>}
                        {post.comments > 0 && <span className="text-xs text-gray-400 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {post.comments}</span>}
                      </div>
                    </div>
                    <button onClick={() => deletePost(post.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── CONNECTIONS TAB ── */}
      {tab === 'accounts' && (
        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-5">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1 text-sm">Connect Your Platforms</h2>
            <p className="text-xs text-gray-500 mb-4">Add your API credentials to enable direct publishing from BusinessOS. Tokens are encrypted and stored securely.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {PLATFORMS.map(p => (
                <PlatformCard key={p.id} platform={p} connected={connectedIds.has(p.id)} onConnect={setConnectModal} onDisconnect={disconnectAccount} />
              ))}
            </div>
          </div>

          <div className="glass-card rounded-2xl p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm flex items-center gap-2"><Settings2 className="w-4 h-4 text-indigo-500" /> How to get your tokens</h3>
            <div className="space-y-3">
              {PLATFORMS.map(p => (
                <div key={p.id} className="flex items-start gap-3 text-xs text-gray-600 dark:text-gray-400">
                  <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${p.gradient} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                    <p.icon className="w-3 h-3 text-white" />
                  </div>
                  <div>
                    <span className="font-medium text-gray-800 dark:text-gray-200">{p.label}:</span> Create an app at <a href={p.helpUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-500 underline">{p.helpUrl.replace('https://', '')}</a>. {p.guide}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Connect modal */}
      {connectModal && (
        <ConnectModal platform={connectModal} onClose={() => setConnectModal(null)} onSave={connectAccount} />
      )}
    </div>
  );
}

'use client';
import { useState, useEffect, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { formatDate, formatDateTime, formatRelativeTime } from '@/lib/utils';
import {
  Plus, Globe, FormInput, Eye, MousePointer, Trash2, ExternalLink,
  Image as ImageIcon, Activity as ActivityIcon, Megaphone, Share2,
  Mail, Calendar, MoreHorizontal, Sparkles, Target, TrendingUp,
  TrendingDown, DollarSign, MousePointer2, Users, CheckCircle2,
  Instagram, Twitter, Linkedin, Facebook, Youtube, Edit2, Pause,
  Play, ChevronDown, Search, BarChart3, Building, Link, Tag,
  ArrowUp, ArrowDown, Minus, Star, AlertTriangle, Loader2, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { TextField, SelectField, TextAreaField } from '@/components/ui/FormField';
import { POSTER_TEMPLATES, PosterPreview, type PosterData } from '@/components/marketing/PosterTemplates';

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = ['campaigns', 'social', 'competitors', 'keywords', 'pages', 'forms', 'posters', 'activity'] as const;
type Tab = typeof TABS[number];

const CAMPAIGN_TYPES = [
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'meta_ads', label: 'Meta Ads (FB/IG)' },
  { value: 'seo', label: 'SEO' },
  { value: 'content', label: 'Content Marketing' },
  { value: 'email', label: 'Email Marketing' },
  { value: 'influencer', label: 'Influencer' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'event', label: 'Event' },
  { value: 'other', label: 'Other' },
];

const CAMPAIGN_STATUSES = [
  { value: 'draft', label: 'Draft', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  { value: 'active', label: 'Active', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'paused', label: 'Paused', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  { value: 'completed', label: 'Completed', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
];

const PLATFORMS = [
  { value: 'instagram', label: 'Instagram', icon: Instagram, color: 'text-pink-500' },
  { value: 'facebook', label: 'Facebook', icon: Facebook, color: 'text-blue-600' },
  { value: 'twitter', label: 'Twitter / X', icon: Twitter, color: 'text-sky-500' },
  { value: 'linkedin', label: 'LinkedIn', icon: Linkedin, color: 'text-blue-700' },
  { value: 'youtube', label: 'YouTube', icon: Youtube, color: 'text-red-500' },
  { value: 'tiktok', label: 'TikTok', icon: Share2, color: 'text-gray-900 dark:text-white' },
];

const POST_STATUSES = [
  { value: 'draft', label: 'Draft', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  { value: 'scheduled', label: 'Scheduled', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  { value: 'published', label: 'Published', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'failed', label: 'Failed', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
];

const ACTIVITY_TYPES: Record<string, { label: string; icon: any; color: string }> = {
  poster_created: { label: 'Poster Created', icon: ImageIcon, color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' },
  campaign_launched: { label: 'Campaign Launched', icon: Megaphone, color: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' },
  social_post: { label: 'Social Post', icon: Share2, color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  email_sent: { label: 'Email Sent', icon: Mail, color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' },
  event: { label: 'Event', icon: Calendar, color: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' },
  other: { label: 'Other', icon: MoreHorizontal, color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(statuses: { value: string; label: string; color: string }[], value: string) {
  const s = statuses.find(x => x.value === value) ?? statuses[0];
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>{s.label}</span>;
}

function platformMeta(platform: string) {
  return PLATFORMS.find(p => p.value === platform) ?? PLATFORMS[0];
}

function roi(revenue: number, spent: number) {
  if (!spent) return null;
  return ((revenue - spent) / spent * 100).toFixed(0);
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function MarketingPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams.get('tab') as Tab) ?? 'campaigns';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [showPageModal, setShowPageModal] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showCompetitorModal, setShowCompetitorModal] = useState(false);
  const [showKeywordModal, setShowKeywordModal] = useState(false);
  const [showBulkKeywordModal, setShowBulkKeywordModal] = useState(false);
  const [editCompetitor, setEditCompetitor] = useState<any>(null);
  const [editKeyword, setEditKeyword] = useState<any>(null);
  const [editCampaign, setEditCampaign] = useState<any>(null);
  const [editPost, setEditPost] = useState<any>(null);
  const [selectedForm, setSelectedForm] = useState<any>(null);
  const qc = useQueryClient();

  const switchTab = (t: Tab) => {
    setTab(t);
    router.replace(`/dashboard/marketing?tab=${t}`, { scroll: false });
  };

  const { data: campaigns, isLoading: campaignsLoading } = useQuery({
    queryKey: ['campaigns'],
    enabled: tab === 'campaigns',
    queryFn: async () => { const { data } = await api.get('/marketing/campaigns'); return data.data as any[]; },
  });

  const { data: posts, isLoading: postsLoading } = useQuery({
    queryKey: ['social-posts'],
    enabled: tab === 'social',
    queryFn: async () => { const { data } = await api.get('/marketing/social-posts'); return data.data as any[]; },
  });

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

  const { data: competitors, isLoading: competitorsLoading } = useQuery({
    queryKey: ['competitors'],
    enabled: tab === 'competitors',
    queryFn: async () => { const { data } = await api.get('/marketing/competitors'); return data.data as any[]; },
  });

  const { data: keywords, isLoading: keywordsLoading } = useQuery({
    queryKey: ['keywords'],
    enabled: tab === 'keywords',
    queryFn: async () => { const { data } = await api.get('/marketing/keywords'); return data.data as any[]; },
  });

  const deleteCompetitor = useMutation({
    mutationFn: (id: string) => api.delete(`/marketing/competitors/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['competitors'] }); toast.success('Competitor removed'); },
  });

  const deleteKeyword = useMutation({
    mutationFn: (id: string) => api.delete(`/marketing/keywords/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['keywords'] }); toast.success('Keyword removed'); },
  });

  const deleteCampaign = useMutation({
    mutationFn: (id: string) => api.delete(`/marketing/campaigns/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campaign deleted'); },
  });

  const updateCampaignStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.put(`/marketing/campaigns/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); },
  });

  const deletePost = useMutation({
    mutationFn: (id: string) => api.delete(`/marketing/social-posts/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['social-posts'] }); toast.success('Post deleted'); },
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

  // Summary KPIs for campaigns tab
  const totalBudget = (campaigns ?? []).reduce((s: number, c: any) => s + Number(c.budget || 0), 0);
  const totalSpent = (campaigns ?? []).reduce((s: number, c: any) => s + Number(c.spent || 0), 0);
  const totalRevenue = (campaigns ?? []).reduce((s: number, c: any) => s + Number(c.revenue || 0), 0);
  const totalLeads = (campaigns ?? []).reduce((s: number, c: any) => s + Number(c.leads || 0), 0);
  const activeCampaigns = (campaigns ?? []).filter((c: any) => c.status === 'active').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Marketing</h1>
          <p className="text-sm text-gray-500 mt-0.5">Campaigns, social posts, landing pages & more</p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'keywords' && (
            <button onClick={() => setShowBulkKeywordModal(true)} className="flex items-center gap-2 px-4 py-2 border border-indigo-200 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 rounded-xl text-sm font-medium hover:bg-indigo-50 dark:hover:bg-indigo-900/20">
              <Sparkles className="w-4 h-4" /> AI Suggest
            </button>
          )}
          <button
            onClick={() => {
              if (tab === 'campaigns') setShowCampaignModal(true);
              else if (tab === 'social') setShowPostModal(true);
              else if (tab === 'pages') setShowPageModal(true);
              else if (tab === 'forms') setShowFormModal(true);
              else if (tab === 'activity') setShowActivityModal(true);
              else if (tab === 'competitors') { setEditCompetitor(null); setShowCompetitorModal(true); }
              else if (tab === 'keywords') { setEditKeyword(null); setShowKeywordModal(true); }
            }}
            className={`flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 ${tab === 'posters' ? 'hidden' : ''}`}
          >
            <Plus className="w-4 h-4" />
            {tab === 'campaigns' ? 'New Campaign' : tab === 'social' ? 'New Post' : tab === 'pages' ? 'New Page' : tab === 'forms' ? 'New Form' : tab === 'competitors' ? 'Add Competitor' : tab === 'keywords' ? 'Add Keyword' : 'Log Activity'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit gap-0.5 flex-wrap">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${tab === t ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >
            {t === 'social' ? 'Social Posts' : t === 'activity' ? 'Activity' : t === 'competitors' ? 'Competitors' : t === 'keywords' ? 'Keywords' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Campaigns ─────────────────────────────────────────── */}
      {tab === 'campaigns' && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'Active', value: activeCampaigns, icon: Play, color: 'text-green-500' },
              { label: 'Total Budget', value: `$${totalBudget.toLocaleString()}`, icon: DollarSign, color: 'text-indigo-500' },
              { label: 'Spent', value: `$${totalSpent.toLocaleString()}`, icon: TrendingUp, color: 'text-orange-500' },
              { label: 'Revenue', value: `$${totalRevenue.toLocaleString()}`, icon: TrendingUp, color: 'text-green-600' },
              { label: 'Leads', value: totalLeads, icon: Users, color: 'text-blue-500' },
            ].map(k => (
              <div key={k.label} className="glass-card rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-500">{k.label}</p>
                  <k.icon className={`w-4 h-4 ${k.color}`} />
                </div>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{k.value}</p>
              </div>
            ))}
          </div>

          {campaignsLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-52 glass-card rounded-2xl animate-pulse" />)}
            </div>
          ) : !campaigns?.length ? (
            <div className="glass-card rounded-2xl p-14 text-center text-gray-400">
              <Megaphone className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium mb-1">No campaigns yet</p>
              <p className="text-xs">Create your first campaign to start tracking performance</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {campaigns.map((c: any) => {
                const type = CAMPAIGN_TYPES.find(t => t.value === c.type);
                const roiVal = roi(Number(c.revenue), Number(c.spent));
                return (
                  <div key={c.id} className="glass-card rounded-2xl p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{c.name}</h3>
                        <p className="text-xs text-gray-400 mt-0.5">{type?.label ?? c.type}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        {statusBadge(CAMPAIGN_STATUSES, c.status)}
                      </div>
                    </div>

                    {/* Metrics row */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Impressions', value: Number(c.impressions).toLocaleString(), icon: Eye },
                        { label: 'Clicks', value: Number(c.clicks).toLocaleString(), icon: MousePointer2 },
                        { label: 'Leads', value: Number(c.leads), icon: Users },
                      ].map(m => (
                        <div key={m.label} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-2 text-center">
                          <m.icon className="w-3 h-3 text-gray-400 mx-auto mb-1" />
                          <p className="text-xs font-semibold text-gray-900 dark:text-white">{m.value}</p>
                          <p className="text-[10px] text-gray-400">{m.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Budget bar */}
                    {c.budget > 0 && (
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Spent: ${Number(c.spent).toLocaleString()}</span>
                          <span>Budget: ${Number(c.budget).toLocaleString()}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full">
                          <div
                            className={`h-1.5 rounded-full ${Number(c.spent) / c.budget > 0.9 ? 'bg-red-500' : 'bg-indigo-500'}`}
                            style={{ width: `${Math.min(100, (Number(c.spent) / c.budget) * 100)}%` }}
                          />
                        </div>
                        {roiVal !== null && (
                          <p className={`text-xs mt-1 font-medium ${Number(roiVal) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            ROI: {Number(roiVal) >= 0 ? '+' : ''}{roiVal}%
                          </p>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1 border-t border-gray-100 dark:border-gray-800">
                      <button
                        onClick={() => setEditCampaign(c)}
                        className="flex-1 text-xs text-indigo-600 hover:underline text-center"
                      >
                        Edit / Metrics
                      </button>
                      {c.status === 'active' ? (
                        <button onClick={() => updateCampaignStatus.mutate({ id: c.id, status: 'paused' })} className="p-1.5 text-gray-400 hover:text-yellow-500 rounded-lg hover:bg-yellow-50 dark:hover:bg-yellow-900/20" title="Pause"><Pause className="w-3.5 h-3.5" /></button>
                      ) : c.status === 'paused' ? (
                        <button onClick={() => updateCampaignStatus.mutate({ id: c.id, status: 'active' })} className="p-1.5 text-gray-400 hover:text-green-500 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20" title="Resume"><Play className="w-3.5 h-3.5" /></button>
                      ) : null}
                      <button onClick={() => { if (confirm('Delete campaign?')) deleteCampaign.mutate(c.id); }} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Social Posts ──────────────────────────────────────── */}
      {tab === 'social' && (
        <div className="space-y-4">
          {/* Platform filter pills */}
          <div className="glass-card rounded-2xl overflow-hidden">
            {postsLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />)}
              </div>
            ) : !posts?.length ? (
              <div className="p-14 text-center text-gray-400">
                <Share2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium mb-1">No social posts yet</p>
                <p className="text-xs">Schedule posts for Instagram, LinkedIn, Twitter and more</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-gray-800">
                {posts.map((p: any) => {
                  const pm = platformMeta(p.platform);
                  const PIcon = pm.icon;
                  return (
                    <div key={p.id} className="p-4 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <div className={`w-9 h-9 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 ${pm.color}`}>
                        <PIcon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 capitalize">{pm.label}</span>
                          {statusBadge(POST_STATUSES, p.status)}
                          {p.campaign && <span className="text-xs text-indigo-500">{p.campaign.name}</span>}
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">{p.content}</p>
                        {p.hashtags && <p className="text-xs text-indigo-400 mt-1">{p.hashtags}</p>}
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 flex-wrap">
                          {p.scheduledAt && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDateTime(p.scheduledAt)}</span>}
                          {p.status === 'published' && (
                            <>
                              <span>❤️ {p.likes}</span>
                              <span>🔁 {p.shares}</span>
                              <span>💬 {p.comments}</span>
                              {p.reach > 0 && <span>👁 {p.reach.toLocaleString()}</span>}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => setEditPost(p)} className="p-1.5 text-gray-400 hover:text-indigo-500 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => { if (confirm('Delete post?')) deletePost.mutate(p.id); }} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Competitors ───────────────────────────────────────── */}
      {tab === 'competitors' && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Tracked', value: competitors?.length || 0, icon: Building, color: 'text-indigo-500' },
              { label: 'Active', value: competitors?.filter((c: any) => c.status === 'active').length || 0, icon: CheckCircle2, color: 'text-green-500' },
              { label: 'Avg DA', value: competitors?.length ? Math.round((competitors as any[]).reduce((s: number, c: any) => s + (c.domainAuthority || 0), 0) / competitors.length) : '—', icon: Star, color: 'text-yellow-500' },
              { label: 'Avg Traffic', value: competitors?.length ? Math.round((competitors as any[]).reduce((s: number, c: any) => s + (c.monthlyTraffic || 0), 0) / competitors.length).toLocaleString() : '—', icon: Users, color: 'text-blue-500' },
            ].map(k => (
              <div key={k.label} className="glass-card rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-500">{k.label}</p>
                  <k.icon className={`w-4 h-4 ${k.color}`} />
                </div>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{k.value}</p>
              </div>
            ))}
          </div>

          {competitorsLoading ? (
            <div className="grid md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-52 glass-card rounded-2xl animate-pulse" />)}
            </div>
          ) : !competitors?.length ? (
            <div className="glass-card rounded-2xl p-14 text-center text-gray-400">
              <Building className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium mb-1">No competitors tracked yet</p>
              <p className="text-xs">Add competitors to monitor their traffic, keywords, and social presence</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {(competitors as any[]).map((c: any) => (
                <div key={c.id} className="glass-card rounded-2xl p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{c.name}</h3>
                      {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-500 hover:underline flex items-center gap-0.5 mt-0.5"><Link className="w-3 h-3" />{c.website.replace(/https?:\/\//, '')}</a>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditCompetitor(c); setShowCompetitorModal(true); }} className="p-1.5 text-gray-400 hover:text-indigo-500 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => { if (confirm('Remove competitor?')) deleteCompetitor.mutate(c.id); }} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-2">
                      <p className="text-xs text-gray-400">Traffic/mo</p>
                      <p className="font-semibold text-sm text-gray-900 dark:text-white">{c.monthlyTraffic ? c.monthlyTraffic.toLocaleString() : '—'}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-2">
                      <p className="text-xs text-gray-400">Domain Auth</p>
                      <p className="font-semibold text-sm text-gray-900 dark:text-white">{c.domainAuthority ?? '—'}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-2">
                      <p className="text-xs text-gray-400">Industry</p>
                      <p className="font-semibold text-xs text-gray-900 dark:text-white truncate">{c.industry || '—'}</p>
                    </div>
                  </div>

                  {c.topKeywords?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {c.topKeywords.slice(0, 5).map((kw: string) => (
                        <span key={kw} className="text-xs px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-full">{kw}</span>
                      ))}
                    </div>
                  )}

                  {c.strengths && <p className="text-xs text-green-600 dark:text-green-400"><span className="font-medium">Strengths:</span> {c.strengths}</p>}
                  {c.weaknesses && <p className="text-xs text-red-500"><span className="font-medium">Weaknesses:</span> {c.weaknesses}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Keyword Research ───────────────────────────────────── */}
      {tab === 'keywords' && (
        <div className="space-y-4">
          {/* KPI summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Keywords', value: keywords?.length || 0, icon: Search, color: 'text-indigo-500' },
              { label: 'Ranking', value: keywords?.filter((k: any) => k.status === 'ranking').length || 0, icon: ArrowUp, color: 'text-green-500' },
              { label: 'Optimizing', value: keywords?.filter((k: any) => k.status === 'optimizing').length || 0, icon: TrendingUp, color: 'text-yellow-500' },
              { label: 'Not Ranking', value: keywords?.filter((k: any) => k.status === 'not_ranking').length || 0, icon: ArrowDown, color: 'text-red-500' },
            ].map(k => (
              <div key={k.label} className="glass-card rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-500">{k.label}</p>
                  <k.icon className={`w-4 h-4 ${k.color}`} />
                </div>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{k.value}</p>
              </div>
            ))}
          </div>

          {keywordsLoading ? (
            <div className="glass-card rounded-2xl p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />)}
            </div>
          ) : !keywords?.length ? (
            <div className="glass-card rounded-2xl p-14 text-center text-gray-400">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium mb-1">No keywords tracked yet</p>
              <p className="text-xs">Add keywords to track rankings, search volume, and SEO difficulty</p>
            </div>
          ) : (
            <div className="glass-card rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <tr>
                      {['Keyword', 'Volume', 'Difficulty', 'CPC', 'Rank', 'Intent', 'Status', ''].map(h => (
                        <th key={h} className="text-left text-xs font-medium text-gray-500 px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {(keywords as any[]).map((kw: any) => (
                      <tr key={kw.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 dark:text-white">{kw.keyword}</p>
                          {kw.targetUrl && <a href={kw.targetUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-400 hover:underline truncate block max-w-[180px]">{kw.targetUrl}</a>}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{kw.searchVolume ? kw.searchVolume.toLocaleString() : '—'}</td>
                        <td className="px-4 py-3">
                          {kw.difficulty != null ? (
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${kw.difficulty >= 70 ? 'bg-red-500' : kw.difficulty >= 40 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${kw.difficulty}%` }} />
                              </div>
                              <span className="text-xs">{kw.difficulty}</span>
                            </div>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{kw.cpc ? `$${Number(kw.cpc).toFixed(2)}` : '—'}</td>
                        <td className="px-4 py-3">
                          {kw.currentRank ? (
                            <div className="flex items-center gap-1">
                              <span className={`font-semibold ${kw.currentRank <= 10 ? 'text-green-600' : kw.currentRank <= 30 ? 'text-yellow-600' : 'text-red-500'}`}>#{kw.currentRank}</span>
                              {kw.targetRank && <span className="text-xs text-gray-400">→ #{kw.targetRank}</span>}
                            </div>
                          ) : <span className="text-gray-400 text-xs">Not ranked</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${kw.intent === 'transactional' ? 'bg-green-100 text-green-700' : kw.intent === 'commercial' ? 'bg-blue-100 text-blue-700' : kw.intent === 'navigational' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>{kw.intent}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${kw.status === 'ranking' ? 'bg-green-100 text-green-700' : kw.status === 'optimizing' ? 'bg-yellow-100 text-yellow-700' : kw.status === 'not_ranking' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>{kw.status?.replace('_', ' ')}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => { setEditKeyword(kw); setShowKeywordModal(true); }} className="p-1.5 text-gray-400 hover:text-indigo-500 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"><Edit2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => { if (confirm('Remove keyword?')) deleteKeyword.mutate(kw.id); }} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Landing Pages ─────────────────────────────────────── */}
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

      {/* ── Forms ─────────────────────────────────────────────── */}
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

      {/* ── Posters ───────────────────────────────────────────── */}
      {tab === 'posters' && (
        <PosterGallery posters={posters?.data || []} isLoading={postersLoading} onDelete={(id: string) => { if (confirm('Delete this poster?')) deletePosterMutation.mutate(id); }} />
      )}

      {/* ── Activity ──────────────────────────────────────────── */}
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
                  <div key={a.id} className="p-4 flex items-start gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/30">
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
                    <button onClick={() => { if (confirm('Delete?')) deleteActivityMutation.mutate(a.id); }} className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showCampaignModal && <CampaignModal onClose={() => setShowCampaignModal(false)} />}
      {editCampaign && <CampaignModal campaign={editCampaign} onClose={() => setEditCampaign(null)} />}
      {showPostModal && <SocialPostModal campaigns={campaigns ?? []} onClose={() => setShowPostModal(false)} />}
      {editPost && <SocialPostModal post={editPost} campaigns={campaigns ?? []} onClose={() => setEditPost(null)} />}
      {showPageModal && <PageModal onClose={() => setShowPageModal(false)} />}
      {showFormModal && <FormModal onClose={() => setShowFormModal(false)} />}
      {showActivityModal && <ActivityModal onClose={() => setShowActivityModal(false)} />}
      {(showCompetitorModal || editCompetitor) && <CompetitorModal competitor={editCompetitor} onClose={() => { setShowCompetitorModal(false); setEditCompetitor(null); }} />}
      {(showKeywordModal || editKeyword) && <KeywordModal keyword={editKeyword} onClose={() => { setShowKeywordModal(false); setEditKeyword(null); }} />}
      {showBulkKeywordModal && <KeywordBulkModal onClose={() => setShowBulkKeywordModal(false)} />}
    </div>
  );
}

export default function MarketingPage() {
  return (
    <Suspense fallback={<div className="h-8 w-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mt-20" />}>
      <MarketingPageInner />
    </Suspense>
  );
}

// ── AI Assist Widget ──────────────────────────────────────────────────────────

function AIAssist({ placeholder, onGenerate, loading }: { placeholder: string; onGenerate: (text: string) => void; loading: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  if (!open) return (
    <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:text-indigo-700 dark:hover:text-indigo-300">
      <Sparkles className="w-3.5 h-3.5" /> Generate with AI
    </button>
  );
  return (
    <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
        <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Generate with AI</span>
        <button type="button" onClick={() => setOpen(false)} className="ml-auto text-indigo-400 hover:text-indigo-600"><X className="w-3.5 h-3.5" /></button>
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 text-xs outline-none focus:ring-1 focus:ring-indigo-400 resize-none" />
      <button type="button" disabled={!text.trim() || loading} onClick={() => onGenerate(text)}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium disabled:opacity-50">
        {loading ? <><Loader2 className="w-3 h-3 animate-spin" /> Generating…</> : <><Sparkles className="w-3 h-3" /> Generate</>}
      </button>
    </div>
  );
}

// ── Campaign Modal ────────────────────────────────────────────────────────────

function CampaignModal({ campaign, onClose }: { campaign?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!campaign;
  const [form, setForm] = useState({
    name: campaign?.name ?? '',
    type: campaign?.type ?? 'other',
    status: campaign?.status ?? 'draft',
    channel: campaign?.channel ?? '',
    budget: campaign?.budget ?? '',
    spent: campaign?.spent ?? '',
    startDate: campaign?.startDate ? campaign.startDate.slice(0, 10) : '',
    endDate: campaign?.endDate ? campaign.endDate.slice(0, 10) : '',
    description: campaign?.description ?? '',
    targetUrl: campaign?.targetUrl ?? '',
    impressions: campaign?.impressions ?? '',
    clicks: campaign?.clicks ?? '',
    conversions: campaign?.conversions ?? '',
    leads: campaign?.leads ?? '',
    revenue: campaign?.revenue ?? '',
  });

  const [aiLoading, setAiLoading] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: any) => isEdit ? api.put(`/marketing/campaigns/${campaign.id}`, data) : api.post('/marketing/campaigns', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success(isEdit ? 'Campaign updated' : 'Campaign created');
      onClose();
    },
    onError: () => toast.error(isEdit ? 'Failed to update campaign' : 'Failed to create campaign'),
  });

  const f = (e: any) => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  return (
    <Modal onClose={onClose} title={isEdit ? 'Edit Campaign' : 'New Campaign'} subtitle="Track budget, performance, and ROI" icon={Megaphone} iconColor="indigo" size="xl">
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="flex flex-col">
        <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
          {!isEdit && <AIAssist placeholder="Describe your campaign goal, e.g. 'Drive leads for our new SaaS product via Google Ads in Q3'" loading={aiLoading} onGenerate={async (text) => { setAiLoading(true); try { const { data } = await api.post('/marketing/ai/campaign', { goal: text, type: form.type, channel: form.channel }); const d = data.data; setForm(prev => ({ ...prev, name: d.name||prev.name, description: d.description||prev.description, budget: d.budget?String(d.budget):prev.budget, startDate: d.startDate||prev.startDate, endDate: d.endDate||prev.endDate })); toast.success('Campaign plan generated!'); } catch { toast.error('AI generation failed'); } finally { setAiLoading(false); } }} />}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <TextField id="c-name" label="Campaign Name" required name="name" value={form.name} onChange={f} placeholder="Summer Sale 2026" />
            </div>
            <SelectField id="c-type" label="Type" name="type" value={form.type} onChange={f}>
              {CAMPAIGN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </SelectField>
            <SelectField id="c-status" label="Status" name="status" value={form.status} onChange={f}>
              {CAMPAIGN_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </SelectField>
            <TextField id="c-channel" label="Channel / Platform" name="channel" value={form.channel} onChange={f} placeholder="Google, Facebook, Email…" />
            <TextField id="c-target" label="Target URL" name="targetUrl" value={form.targetUrl} onChange={f} placeholder="https://…" />
            <TextField id="c-budget" label="Budget ($)" name="budget" type="number" value={form.budget} onChange={f} placeholder="5000" />
            <TextField id="c-spent" label="Spent ($)" name="spent" type="number" value={form.spent} onChange={f} placeholder="0" />
            <TextField id="c-start" label="Start Date" name="startDate" type="date" value={form.startDate} onChange={f} />
            <TextField id="c-end" label="End Date" name="endDate" type="date" value={form.endDate} onChange={f} />
          </div>

          <TextAreaField id="c-desc" label="Description" name="description" rows={2} value={form.description} onChange={f} placeholder="Campaign goals and strategy…" />

          <div>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3">Performance Metrics</p>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
              {[
                { key: 'impressions', label: 'Impressions' },
                { key: 'clicks', label: 'Clicks' },
                { key: 'conversions', label: 'Conversions' },
                { key: 'leads', label: 'Leads' },
                { key: 'revenue', label: 'Revenue ($)' },
              ].map(m => (
                <div key={m.key}>
                  <label className="block text-xs text-gray-500 mb-1">{m.label}</label>
                  <input
                    type="number"
                    name={m.key}
                    value={(form as any)[m.key]}
                    onChange={f}
                    min={0}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Campaign'}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// ── Social Post Modal ─────────────────────────────────────────────────────────

function SocialPostModal({ post, campaigns, onClose }: { post?: any; campaigns: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!post;
  const [form, setForm] = useState({
    platform: post?.platform ?? 'instagram',
    status: post?.status ?? 'draft',
    content: post?.content ?? '',
    hashtags: post?.hashtags ?? '',
    campaignId: post?.campaignId ?? '',
    scheduledAt: post?.scheduledAt ? post.scheduledAt.slice(0, 16) : '',
    likes: post?.likes ?? '',
    shares: post?.shares ?? '',
    comments: post?.comments ?? '',
    reach: post?.reach ?? '',
  });

  const [aiLoading, setAiLoading] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: any) => isEdit ? api.put(`/marketing/social-posts/${post.id}`, data) : api.post('/marketing/social-posts', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-posts'] });
      toast.success(isEdit ? 'Post updated' : 'Post created');
      onClose();
    },
    onError: () => toast.error('Failed to save post'),
  });

  const f = (e: any) => setForm(p => ({ ...p, [e.target.name]: e.target.value }));
  const pm = platformMeta(form.platform);
  const PIcon = pm.icon;

  return (
    <Modal onClose={onClose} title={isEdit ? 'Edit Post' : 'New Social Post'} subtitle="Schedule content for your social channels" icon={Share2} iconColor="blue" size="xl">
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="flex flex-col">
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <SelectField id="sp-platform" label="Platform" name="platform" value={form.platform} onChange={f}>
              {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </SelectField>
            <SelectField id="sp-status" label="Status" name="status" value={form.status} onChange={f}>
              {POST_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </SelectField>
          </div>

          {!isEdit && <AIAssist placeholder="What's this post about? e.g. 'Announcing our new AI analytics dashboard — faster insights for small teams'" loading={aiLoading} onGenerate={async (text) => { setAiLoading(true); try { const { data } = await api.post('/marketing/ai/social-post', { topic: text, platform: form.platform }); const d = data.data; setForm(prev => ({ ...prev, content: d.content||prev.content, hashtags: d.hashtags||prev.hashtags })); toast.success('Post content generated!'); } catch { toast.error('AI generation failed'); } finally { setAiLoading(false); } }} />}

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Content <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className={`absolute left-3 top-3 ${pm.color}`}><PIcon className="w-4 h-4" /></div>
              <textarea
                required
                name="content"
                value={form.content}
                onChange={f}
                rows={4}
                placeholder="Write your post content here…"
                className="w-full pl-9 pr-3 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">{form.content.length} characters</p>
          </div>

          <TextField id="sp-hashtags" label="Hashtags" name="hashtags" value={form.hashtags} onChange={f} placeholder="#marketing #digital #brand" />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Campaign (optional)</label>
              <select name="campaignId" value={form.campaignId} onChange={f} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">No campaign</option>
                {campaigns.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <TextField id="sp-scheduled" label="Scheduled At" name="scheduledAt" type="datetime-local" value={form.scheduledAt} onChange={f} />
          </div>

          {(isEdit && form.status === 'published') && (
            <div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3">Engagement Metrics</p>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { key: 'likes', label: '❤️ Likes' },
                  { key: 'shares', label: '🔁 Shares' },
                  { key: 'comments', label: '💬 Comments' },
                  { key: 'reach', label: '👁 Reach' },
                ].map(m => (
                  <div key={m.key}>
                    <label className="block text-xs text-gray-500 mb-1">{m.label}</label>
                    <input type="number" name={m.key} value={(form as any)[m.key]} onChange={f} min={0}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Post'}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// ── Page / Form / Activity Modals (unchanged) ─────────────────────────────────

function PageModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', slug: '', content: '', isPublished: false });
  const [aiLoading, setAiLoading] = useState(false);
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
          <AIAssist placeholder="Describe your offer, e.g. 'SaaS CRM for small businesses — free 14-day trial, no credit card required'" loading={aiLoading} onGenerate={async (text) => { setAiLoading(true); try { const { data } = await api.post('/marketing/ai/page-copy', { description: text }); const d = data.data; setForm(prev => ({ ...prev, content: d.content||prev.content })); toast.success('Landing page copy generated!'); } catch { toast.error('AI generation failed'); } finally { setAiLoading(false); } }} />
          <TextAreaField id="landing-content" label="Content (HTML/Markdown)" rows={6} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} className="font-mono text-xs" />
          <label htmlFor="landing-published" className="flex items-center gap-2 cursor-pointer"><input id="landing-published" type="checkbox" checked={form.isPublished} onChange={e => setForm({ ...form, isPublished: e.target.checked })} className="rounded" /><span className="text-sm text-gray-700 dark:text-gray-300">Publish immediately</span></label>
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Creating…' : 'Create Page'}</button>
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
    <Modal onClose={onClose} title="New Form" subtitle="Build a lead-capture form" icon={FormInput} iconColor="pink">
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="flex flex-col">
        <div className="p-6 space-y-4">
          <TextField id="form-name" label="Form Name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <TextAreaField id="form-desc" label="Description" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
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
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Creating…' : 'Create Form'}</button>
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
    <Modal onClose={onClose} title="Log Marketing Activity" subtitle="Record a campaign, post, or other action" icon={ActivityIcon} iconColor="indigo">
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }}>
        <div className="p-6 space-y-4">
          <SelectField id="act-type" label="Type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            {Object.entries(ACTIVITY_TYPES).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
          </SelectField>
          <TextField id="act-title" label="Title" required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Launched summer campaign" />
          <TextAreaField id="act-notes" label="Notes" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Logging…' : 'Log Activity'}</button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// ── Poster Gallery (unchanged) ────────────────────────────────────────────────

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
              <button onClick={() => onDelete(poster.id)} className="absolute top-2 right-2 z-10 p-1.5 bg-white/90 dark:bg-gray-900/90 rounded-lg text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
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
      {!isLoading && posters.length === 0 && <p className="text-center text-sm text-gray-400 mt-4">No posters yet — create your first one above</p>}
      {showDesigner && <PosterDesigner onClose={() => setShowDesigner(false)} />}
    </div>
  );
}

function PosterDesigner({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<'choice' | 'gallery' | 'ai' | 'customize'>('choice');
  const [templateKey, setTemplateKey] = useState(POSTER_TEMPLATES[0].key);
  const [data, setData] = useState<PosterData>({ title: '', subtitle: '', primaryColor: '#6366f1', secondaryColor: '#8b5cf6', imageUrl: null });
  const [uploading, setUploading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [aiTitle, setAiTitle] = useState('');
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { data: res } = await api.post('/marketing/posters/upload-image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setData(d => ({ ...d, imageUrl: `${base}${res.data.url}` }));
    } catch { toast.error('Image upload failed'); } finally { setUploading(false); }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error('Describe the poster you want'); return; }
    setGenerating(true);
    try {
      const { data: res } = await api.post('/marketing/posters/generate-image', { prompt: prompt.trim() });
      setData(d => ({ ...d, imageUrl: `${base}${res.data.url}` }));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Image generation failed');
    } finally { setGenerating(false); }
  };

  const saveMutation = useMutation({
    mutationFn: () => api.post('/marketing/posters', {
      title: step === 'ai' ? (aiTitle || prompt.slice(0, 60)) : data.title,
      subtitle: step === 'ai' ? null : data.subtitle,
      templateKey: step === 'ai' ? 'ai-generated' : templateKey,
      primaryColor: data.primaryColor,
      secondaryColor: data.secondaryColor,
      imageUrl: data.imageUrl,
    }),
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
      link.download = `${(data.title || aiTitle || 'poster').replace(/\s+/g, '-').toLowerCase()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch { toast.error('Failed to generate image. Try saving instead.'); }
  };

  if (step === 'choice') return (
    <Modal onClose={onClose} title="Create a Poster" subtitle="Generate with AI or build from a template" icon={ImageIcon} iconColor="purple">
      <div className="p-6 grid grid-cols-2 gap-4">
        <button onClick={() => setStep('ai')} className="rounded-xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20 hover:border-indigo-400 p-5 text-left flex flex-col items-center text-center gap-2">
          <Sparkles className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
          <p className="text-sm font-semibold text-gray-900 dark:text-white">AI Generate</p>
          <p className="text-xs text-gray-500">Describe it, AI creates the poster image</p>
        </button>
        <button onClick={() => setStep('gallery')} className="rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-indigo-400 p-5 text-left flex flex-col items-center text-center gap-2">
          <ImageIcon className="w-8 h-8 text-gray-500" />
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Use a Template</p>
          <p className="text-xs text-gray-500">Pick a layout and customize</p>
        </button>
      </div>
    </Modal>
  );

  if (step === 'ai') return (
    <Modal onClose={onClose} title="AI Generate Poster" subtitle="Describe the poster and let AI create it" icon={Sparkles} iconColor="indigo" size="xl">
      <div className="p-6 grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <TextAreaField id="ai-prompt" label="Describe your poster" required rows={5} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="A vibrant summer sale poster with palm trees, 'SUMMER SALE 50% OFF'" hint="Be specific: mood, colors, objects, text." />
          <TextField id="ai-title" label="Poster Name" value={aiTitle} onChange={e => setAiTitle(e.target.value)} placeholder="Library identifier" />
          <button type="button" onClick={handleGenerate} disabled={generating || !prompt.trim()} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            <Sparkles className="w-4 h-4" />{generating ? 'Generating…' : data.imageUrl ? 'Regenerate' : 'Generate'}
          </button>
          <button type="button" onClick={() => { setStep('choice'); setData(d => ({ ...d, imageUrl: null })); }} className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline">← Back</button>
        </div>
        <div className="flex items-center justify-center">
          <div id="poster-canvas" className="shadow-2xl rounded-lg overflow-hidden">
            <PosterPreview template="ai-generated" data={data} />
          </div>
        </div>
      </div>
      <ModalFooter>
        <button type="button" onClick={handleDownload} disabled={!data.imageUrl} className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium disabled:opacity-50">Download PNG</button>
        <div className="flex-1" />
        <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium">Cancel</button>
        <button type="button" disabled={!data.imageUrl || saveMutation.isPending} onClick={() => saveMutation.mutate()} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">
          {saveMutation.isPending ? 'Saving…' : 'Save Poster'}
        </button>
      </ModalFooter>
    </Modal>
  );

  if (step === 'gallery') return (
    <Modal onClose={onClose} title="Choose a Template" subtitle="Pick a layout to start designing" icon={ImageIcon} iconColor="purple" size="2xl">
      <div className="p-6 grid grid-cols-2 md:grid-cols-3 gap-4">
        {POSTER_TEMPLATES.map(t => (
          <button key={t.key} onClick={() => { setTemplateKey(t.key); setStep('customize'); }} className="rounded-xl border border-gray-200 dark:border-gray-700 hover:border-indigo-400 p-3 text-left">
            <div className="h-24 rounded-lg overflow-hidden flex items-center justify-center bg-gray-50 dark:bg-gray-900 mb-2">
              <div style={{ transform: 'scale(0.27)', transformOrigin: 'center' }}>
                <PosterPreview template={t.key} data={{ title: 'Sample Title', subtitle: 'A subtitle', primaryColor: '#6366f1', secondaryColor: '#8b5cf6', imageUrl: null }} />
              </div>
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{t.name}</p>
            <p className="text-xs text-gray-400">{t.description}</p>
          </button>
        ))}
      </div>
    </Modal>
  );

  return (
    <Modal onClose={onClose} title="Customize Poster" subtitle="Adjust text, colors, and image" icon={ImageIcon} iconColor="purple" size="2xl">
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
            {uploading && <p className="text-xs text-indigo-500 mt-1">Uploading…</p>}
          </div>
          <button type="button" onClick={() => setStep('gallery')} className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline">← Choose different template</button>
        </div>
        <div className="flex items-center justify-center">
          <div id="poster-canvas" className="shadow-2xl rounded-lg overflow-hidden">
            <PosterPreview template={templateKey} data={data} />
          </div>
        </div>
      </div>
      <ModalFooter>
        <button type="button" onClick={handleDownload} className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium">Download PNG</button>
        <div className="flex-1" />
        <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium">Cancel</button>
        <button type="button" disabled={!data.title || saveMutation.isPending} onClick={() => saveMutation.mutate()} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">
          {saveMutation.isPending ? 'Saving…' : 'Save Poster'}
        </button>
      </ModalFooter>
    </Modal>
  );
}

// ── CompetitorModal ───────────────────────────────────────────────────────────

function CompetitorModal({ competitor, onClose }: { competitor?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: competitor?.name || '',
    website: competitor?.website || '',
    industry: competitor?.industry || '',
    description: competitor?.description || '',
    monthlyTraffic: competitor?.monthlyTraffic || '',
    domainAuthority: competitor?.domainAuthority || '',
    topKeywords: competitor?.topKeywords?.join(', ') || '',
    adPlatforms: competitor?.adPlatforms?.join(', ') || '',
    strengths: competitor?.strengths || '',
    weaknesses: competitor?.weaknesses || '',
    notes: competitor?.notes || '',
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFields, setAiFields] = useState<Set<string>>(new Set());

  const mutation = useMutation({
    mutationFn: (data: any) => competitor
      ? api.put(`/marketing/competitors/${competitor.id}`, data)
      : api.post('/marketing/competitors', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['competitors'] }); toast.success(competitor ? 'Competitor updated' : 'Competitor added'); onClose(); },
    onError: () => toast.error('Failed to save competitor'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      ...form,
      monthlyTraffic: form.monthlyTraffic ? parseInt(String(form.monthlyTraffic)) : null,
      domainAuthority: form.domainAuthority ? parseInt(String(form.domainAuthority)) : null,
      topKeywords: form.topKeywords ? form.topKeywords.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      adPlatforms: form.adPlatforms ? form.adPlatforms.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
    });
  };

  const runAIAnalysis = async () => {
    if (!form.name.trim()) { toast.error('Enter a company name first'); return; }
    setAiLoading(true);
    try {
      const { data } = await api.post('/marketing/ai/competitor', { name: form.name, website: form.website, industry: form.industry });
      const d = data.data;
      const filled = new Set<string>();
      setForm(prev => {
        const next = { ...prev };
        if (d.industry && !prev.industry) { next.industry = d.industry; filled.add('industry'); }
        if (d.description) { next.description = d.description; filled.add('description'); }
        if (d.monthlyTraffic) { next.monthlyTraffic = String(d.monthlyTraffic); filled.add('monthlyTraffic'); }
        if (d.domainAuthority) { next.domainAuthority = String(d.domainAuthority); filled.add('domainAuthority'); }
        if (d.adPlatforms?.length) { next.adPlatforms = d.adPlatforms.join(', '); filled.add('adPlatforms'); }
        if (d.topKeywords?.length) { next.topKeywords = d.topKeywords.join(', '); filled.add('topKeywords'); }
        if (d.strengths) { next.strengths = d.strengths; filled.add('strengths'); }
        if (d.weaknesses) { next.weaknesses = d.weaknesses; filled.add('weaknesses'); }
        if (d.notes) { next.notes = d.notes; filled.add('notes'); }
        return next;
      });
      setAiFields(filled);
      toast.success(`AI filled ${filled.size} fields — review and save`);
    } catch {
      toast.error('AI analysis failed — check your AI API key in Settings');
    } finally {
      setAiLoading(false);
    }
  };

  const f = (k: string) => ({
    value: form[k as keyof typeof form] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm({ ...form, [k]: e.target.value });
      setAiFields(prev => { const n = new Set(prev); n.delete(k); return n; });
    },
    className: aiFields.has(k) ? 'ring-2 ring-indigo-400 dark:ring-indigo-500' : undefined,
  });

  return (
    <Modal onClose={onClose} title={competitor ? 'Edit Competitor' : 'Add Competitor'} subtitle="Track a competitor's online presence and metrics" icon={Building} iconColor="indigo" size="2xl">
      <form onSubmit={handleSubmit}>
        <div className="p-6 space-y-4">
          {/* AI Analysis Banner */}
          <div className={`rounded-xl border p-3 flex items-center gap-3 transition-all ${aiLoading ? 'border-indigo-300 bg-indigo-50 dark:bg-indigo-950/30' : 'border-indigo-200 dark:border-indigo-800 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20'}`}>
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
              {aiLoading ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Sparkles className="w-4 h-4 text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {aiLoading ? 'Analyzing competitor…' : 'AI Competitor Analysis'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {aiLoading ? 'Fetching industry data, traffic estimates, keywords & SWOT…' : 'Auto-fill all fields with AI-powered competitive intelligence'}
              </p>
            </div>
            <button
              type="button"
              disabled={aiLoading}
              onClick={runAIAnalysis}
              className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {aiLoading ? 'Analyzing…' : <><Sparkles className="w-3.5 h-3.5" /> Analyze with AI</>}
            </button>
          </div>

          {aiFields.size > 0 && (
            <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-3 h-3" />
              <span>{aiFields.size} fields auto-filled by AI — highlighted in blue. Edit any field to customize.</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <TextField id="comp-name" label="Company Name" required {...f('name')} />
            <TextField id="comp-website" label="Website URL" placeholder="https://competitor.com" {...f('website')} />
            <TextField id="comp-industry" label="Industry" placeholder="SaaS, E-commerce…" {...f('industry')} />
            <TextField id="comp-traffic" label="Monthly Traffic (est.)" type="number" placeholder="50000" {...f('monthlyTraffic')} />
            <TextField id="comp-da" label="Domain Authority (0-100)" type="number" min="0" max="100" placeholder="45" {...f('domainAuthority')} />
            <TextField id="comp-adplatforms" label="Ad Platforms (comma-separated)" placeholder="google, facebook, tiktok" {...f('adPlatforms')} />
          </div>
          <TextField id="comp-keywords" label="Top Keywords (comma-separated)" placeholder="crm software, sales tool, leads management" {...f('topKeywords')} />
          {form.description && (
            <TextAreaField id="comp-desc" label="Description" rows={2} {...f('description')} />
          )}
          <TextAreaField id="comp-strengths" label="Strengths" rows={2} placeholder="Key competitive advantages…" {...f('strengths')} />
          <TextAreaField id="comp-weaknesses" label="Weaknesses / Gaps" rows={2} placeholder="Where they fall short…" {...f('weaknesses')} />
          <TextAreaField id="comp-notes" label="Strategic Notes" rows={2} placeholder="How to position against them…" {...f('notes')} />
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm">Cancel</button>
          <button type="submit" disabled={!form.name || mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">
            {mutation.isPending ? 'Saving...' : competitor ? 'Update Competitor' : 'Add Competitor'}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// ── KeywordModal ──────────────────────────────────────────────────────────────

function KeywordModal({ keyword, onClose }: { keyword?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    keyword: keyword?.keyword || '',
    searchVolume: keyword?.searchVolume || '',
    difficulty: keyword?.difficulty || '',
    cpc: keyword?.cpc || '',
    currentRank: keyword?.currentRank || '',
    targetRank: keyword?.targetRank || '',
    targetUrl: keyword?.targetUrl || '',
    intent: keyword?.intent || 'informational',
    status: keyword?.status || 'tracking',
    tags: keyword?.tags?.join(', ') || '',
    notes: keyword?.notes || '',
  });

  const mutation = useMutation({
    mutationFn: (data: any) => keyword
      ? api.put(`/marketing/keywords/${keyword.id}`, data)
      : api.post('/marketing/keywords', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['keywords'] }); toast.success(keyword ? 'Keyword updated' : 'Keyword added'); onClose(); },
    onError: () => toast.error('Failed to save keyword'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      ...form,
      searchVolume: form.searchVolume ? parseInt(String(form.searchVolume)) : null,
      difficulty: form.difficulty ? parseInt(String(form.difficulty)) : null,
      cpc: form.cpc ? parseFloat(String(form.cpc)) : null,
      currentRank: form.currentRank ? parseInt(String(form.currentRank)) : null,
      targetRank: form.targetRank ? parseInt(String(form.targetRank)) : null,
      tags: form.tags ? form.tags.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
    });
  };

  const [aiLoading, setAiLoading] = useState(false);
  const f = (k: string) => ({ value: form[k as keyof typeof form] as string, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <Modal onClose={onClose} title={keyword ? 'Edit Keyword' : 'Add Keyword'} subtitle="Track a keyword's ranking and SEO metrics" icon={Search} iconColor="teal" size="xl">
      <form onSubmit={handleSubmit}>
        <div className="p-6 space-y-4">
          <TextField id="kw-keyword" label="Keyword" required placeholder="e.g. crm software for small business" {...f('keyword')} />
          {!keyword && form.keyword && (
            <button type="button" disabled={aiLoading} onClick={async () => { setAiLoading(true); try { const { data } = await api.post('/marketing/ai/keywords', { topic: form.keyword, count: 1 }); const arr = data.data; if (arr?.length) { const d = arr[0]; setForm(prev => ({ ...prev, searchVolume: d.searchVolume?String(d.searchVolume):prev.searchVolume, difficulty: d.difficulty?String(d.difficulty):prev.difficulty, intent: d.intent||prev.intent, cpc: d.cpc?String(d.cpc):prev.cpc })); toast.success('Keyword enriched with AI data!'); } } catch { toast.error('AI enrichment failed'); } finally { setAiLoading(false); } }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-700 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-950/30 disabled:opacity-50">
              {aiLoading ? <><Loader2 className="w-3 h-3 animate-spin" /> Enriching…</> : <><Sparkles className="w-3 h-3" /> AI Enrich</>}
            </button>
          )}
          <div className="grid grid-cols-2 gap-4">
            <TextField id="kw-volume" label="Search Volume / mo" type="number" placeholder="12000" {...f('searchVolume')} />
            <TextField id="kw-difficulty" label="SEO Difficulty (0-100)" type="number" min="0" max="100" placeholder="45" {...f('difficulty')} />
            <TextField id="kw-cpc" label="CPC ($)" type="number" step="0.01" placeholder="2.50" {...f('cpc')} />
            <TextField id="kw-currentRank" label="Current Rank" type="number" placeholder="18" {...f('currentRank')} />
            <TextField id="kw-targetRank" label="Target Rank" type="number" placeholder="3" {...f('targetRank')} />
            <SelectField id="kw-intent" label="Search Intent" {...f('intent')}>
              <option value="informational">Informational</option>
              <option value="navigational">Navigational</option>
              <option value="commercial">Commercial</option>
              <option value="transactional">Transactional</option>
            </SelectField>
            <SelectField id="kw-status" label="Status" {...f('status')}>
              <option value="tracking">Tracking</option>
              <option value="optimizing">Optimizing</option>
              <option value="ranking">Ranking (Top 10)</option>
              <option value="not_ranking">Not Ranking</option>
            </SelectField>
            <TextField id="kw-tags" label="Tags (comma-separated)" placeholder="seo, product, blog" {...f('tags')} />
          </div>
          <TextField id="kw-targetUrl" label="Target URL" placeholder="https://yoursite.com/page" {...f('targetUrl')} />
          <TextAreaField id="kw-notes" label="Notes / Content Ideas" rows={2} {...f('notes')} />
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm">Cancel</button>
          <button type="submit" disabled={!form.keyword || mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">
            {mutation.isPending ? 'Saving...' : keyword ? 'Update' : 'Add Keyword'}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// ── Keyword Bulk AI Modal ─────────────────────────────────────────────────────

function KeywordBulkModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState('10');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const generate = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    try {
      const { data } = await api.post('/marketing/ai/keywords', { topic, count: parseInt(count) || 10 });
      setSuggestions(data.data || []);
      setSelected(new Set((data.data || []).map((_: any, i: number) => i)));
    } catch { toast.error('AI generation failed'); }
    finally { setGenerating(false); }
  };

  const save = async () => {
    const toSave = suggestions.filter((_, i) => selected.has(i));
    if (!toSave.length) return;
    setSaving(true);
    try {
      await Promise.all(toSave.map(kw => api.post('/marketing/keywords', {
        keyword: kw.keyword, searchVolume: kw.searchVolume || null, difficulty: kw.difficulty || null,
        cpc: kw.cpc || null, intent: kw.intent || 'informational', status: 'tracking',
      })));
      qc.invalidateQueries({ queryKey: ['keywords'] });
      toast.success(`${toSave.length} keywords added!`);
      onClose();
    } catch { toast.error('Failed to save keywords'); }
    finally { setSaving(false); }
  };

  const toggleAll = () => {
    if (selected.size === suggestions.length) setSelected(new Set());
    else setSelected(new Set(suggestions.map((_, i) => i)));
  };

  return (
    <Modal onClose={onClose} title="AI Keyword Suggestions" subtitle="Generate a list of SEO keywords from a topic" icon={Sparkles} iconColor="teal" size="xl">
      <div className="p-6 space-y-4">
        <div className="flex gap-3">
          <input value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => e.key === 'Enter' && generate()} placeholder="Topic or niche, e.g. 'project management software for freelancers'" className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
          <select value={count} onChange={e => setCount(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none">
            {['5', '10', '15', '20'].map(n => <option key={n} value={n}>{n} keywords</option>)}
          </select>
          <button type="button" disabled={!topic.trim() || generating} onClick={generate} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium disabled:opacity-50">
            {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</> : <><Sparkles className="w-4 h-4" /> Generate</>}
          </button>
        </div>

        {suggestions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{suggestions.length} suggestions — {selected.size} selected</p>
              <button type="button" onClick={toggleAll} className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">{selected.size === suggestions.length ? 'Deselect all' : 'Select all'}</button>
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
              {suggestions.map((kw, i) => (
                <label key={i} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selected.has(i) ? 'border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/30' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/30'}`}>
                  <input type="checkbox" checked={selected.has(i)} onChange={() => { const s = new Set(selected); s.has(i) ? s.delete(i) : s.add(i); setSelected(s); }} className="rounded" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{kw.keyword}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                      {kw.searchVolume && <span>{kw.searchVolume.toLocaleString()} / mo</span>}
                      {kw.difficulty != null && <span className={`font-medium ${kw.difficulty >= 70 ? 'text-red-500' : kw.difficulty >= 40 ? 'text-yellow-600' : 'text-green-600'}`}>KD {kw.difficulty}</span>}
                      {kw.cpc && <span>${Number(kw.cpc).toFixed(2)} CPC</span>}
                      {kw.intent && <span className="capitalize px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700">{kw.intent}</span>}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
      <ModalFooter>
        <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm">Cancel</button>
        {suggestions.length > 0 && (
          <button type="button" disabled={!selected.size || saving} onClick={save} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">
            {saving ? 'Adding…' : `Add ${selected.size} Keyword${selected.size !== 1 ? 's' : ''}`}
          </button>
        )}
      </ModalFooter>
    </Modal>
  );
}

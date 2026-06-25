'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles, Send, Loader2, User, ChevronDown, ExternalLink,
  CheckCircle2, UserPlus, Briefcase, Receipt, TrendingUp, Mail,
  LifeBuoy, CheckSquare, FolderKanban, CalendarDays, UserCheck,
  Megaphone, Search, FileText, ShoppingCart, Wallet, CalendarPlus,
  LayoutDashboard, Copy, Check, ArrowDown, Users, Layers, RefreshCw,
  Zap, List, DollarSign, AlertCircle, Image as LucideImage,
  Wand2, Brain, Mic, MicOff, FileBarChart2, SendHorizonal,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

// ── types ────────────────────────────────────────────────────────────────────

interface ToolMeta { label: string; url?: string; icon: LucideIcon; cls: string; }
interface Action   { tool: string; result: any; }
interface Msg      { role: 'user' | 'assistant'; content: string; actions?: Action[]; suggestions?: string[]; }

// ── tool metadata (Lucide icons, color-coded by module) ─────────────────────

const TOOL_META: Record<string, ToolMeta> = {
  // CRM
  create_lead:           { label: 'Lead created',        url: '/dashboard/crm/leads',               icon: UserPlus,        cls: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' },
  list_leads:            { label: 'Leads listed',        url: '/dashboard/crm/leads',               icon: List,            cls: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' },
  create_contact:        { label: 'Contact created',     url: '/dashboard/crm/contacts',            icon: Users,           cls: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' },
  list_contacts:         { label: 'Contacts listed',     url: '/dashboard/crm/contacts',            icon: Users,           cls: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' },
  create_deal:           { label: 'Deal created',        url: '/dashboard/crm/pipeline',            icon: Briefcase,       cls: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800' },
  list_deals:            { label: 'Deals listed',        url: '/dashboard/crm/pipeline',            icon: Briefcase,       cls: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800' },
  update_deal:           { label: 'Deal updated',        url: '/dashboard/crm/pipeline',            icon: Briefcase,       cls: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800' },
  convert_lead:          { label: 'Lead converted',      url: '/dashboard/crm/pipeline',            icon: RefreshCw,       cls: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800' },
  get_pipeline_summary:  { label: 'Pipeline summary',    url: '/dashboard/crm/pipeline',            icon: Layers,          cls: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800' },
  add_note:              { label: 'Note added',          url: '/dashboard/crm/leads',               icon: CheckSquare,     cls: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' },
  bulk_update_leads:     { label: 'Leads bulk updated',  url: '/dashboard/crm/leads',               icon: RefreshCw,       cls: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' },
  search:                { label: 'Search done',                                                     icon: Search,          cls: 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700' },
  // Finance
  create_invoice:        { label: 'Invoice created',     url: '/dashboard/finance/invoices',        icon: Receipt,         cls: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' },
  list_invoices:         { label: 'Invoices listed',     url: '/dashboard/finance/invoices',        icon: List,            cls: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' },
  send_invoice:          { label: 'Invoice sent',        url: '/dashboard/finance/invoices',        icon: Mail,            cls: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' },
  send_payment_reminder: { label: 'Reminders sent',      url: '/dashboard/finance/invoices',        icon: Mail,            cls: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800' },
  mark_invoice_paid:     { label: 'Marked paid',         url: '/dashboard/finance/invoices',        icon: CheckCircle2,    cls: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' },
  get_revenue_report:    { label: 'Revenue report',      url: '/dashboard/analytics',               icon: TrendingUp,      cls: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' },
  create_expense:        { label: 'Expense logged',      url: '/dashboard/finance/expenses',        icon: Wallet,          cls: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800' },
  create_purchase_order: { label: 'PO created',          url: '/dashboard/finance/purchase-orders', icon: ShoppingCart,    cls: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800' },
  get_overdue_summary:   { label: 'Overdue summary',                                                 icon: DollarSign,      cls: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800' },
  // Helpdesk
  create_ticket:         { label: 'Ticket created',      url: '/dashboard/helpdesk',                icon: LifeBuoy,        cls: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800' },
  list_tickets:          { label: 'Tickets listed',      url: '/dashboard/helpdesk',                icon: List,            cls: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800' },
  resolve_ticket:        { label: 'Ticket resolved',     url: '/dashboard/helpdesk',                icon: CheckCircle2,    cls: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800' },
  // Projects & Tasks
  create_task:           { label: 'Task created',        url: '/dashboard/projects',                icon: CheckSquare,     cls: 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800' },
  list_tasks:            { label: 'Tasks listed',        url: '/dashboard/projects',                icon: List,            cls: 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800' },
  create_project:        { label: 'Project created',     url: '/dashboard/projects',                icon: FolderKanban,    cls: 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800' },
  list_projects:         { label: 'Projects listed',     url: '/dashboard/projects',                icon: FolderKanban,    cls: 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800' },
  create_followup:       { label: 'Follow-up scheduled', url: '/dashboard/projects',                icon: CalendarDays,    cls: 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800' },
  schedule_appointment:  { label: 'Appointment booked',  url: '/dashboard/appointments',            icon: CalendarPlus,    cls: 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800' },
  // HR
  list_employees:        { label: 'Employees listed',    url: '/dashboard/hr/employees',            icon: Users,           cls: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' },
  list_leaves:           { label: 'Leave requests',      url: '/dashboard/hr/leaves',               icon: CalendarDays,    cls: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' },
  approve_leave:         { label: 'Leave processed',     url: '/dashboard/hr/leaves',               icon: UserCheck,       cls: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' },
  // Contracts
  create_contract:       { label: 'Contract created',    url: '/dashboard/contracts',               icon: FileText,        cls: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800' },
  list_contracts:        { label: 'Contracts listed',    url: '/dashboard/contracts',               icon: FileText,        cls: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800' },
  // Marketing
  create_campaign:       { label: 'Campaign created',    url: '/dashboard/marketing',               icon: Megaphone,       cls: 'text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/30 border-pink-200 dark:border-pink-800' },
  // General
  get_stats:             { label: 'Stats loaded',           url: '/dashboard',        icon: LayoutDashboard, cls: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800' },
  daily_digest:          { label: 'Daily digest',           url: '/dashboard',        icon: LayoutDashboard, cls: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800' },
  generate_image:        { label: 'Image generated',                                  icon: LucideImage,     cls: 'text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/30 border-pink-200 dark:border-pink-800' },
  // AI-powered tools
  draft_email:           { label: 'Email drafted',          url: '/dashboard/crm/leads', icon: Wand2,        cls: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800' },
  score_leads:           { label: 'Leads scored',           url: '/dashboard/crm/leads', icon: Brain,        cls: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800' },
  bulk_qualify_leads:    { label: 'Leads qualified',        url: '/dashboard/crm/leads', icon: Brain,        cls: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800' },
  send_bulk_email:       { label: 'Bulk emails sent',       url: '/dashboard/crm/leads', icon: SendHorizonal,cls: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800' },
  forecast_revenue:      { label: 'Revenue forecast',       url: '/dashboard/analytics', icon: TrendingUp,   cls: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800' },
  analyze_pipeline:      { label: 'Pipeline analyzed',      url: '/dashboard/crm/pipeline', icon: Brain,     cls: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800' },
  create_social_post:    { label: 'Post drafted',           url: '/dashboard/marketing', icon: Wand2,        cls: 'text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/30 border-pink-200 dark:border-pink-800' },
  reply_to_ticket:       { label: 'Reply drafted',          url: '/dashboard/helpdesk',  icon: Wand2,        cls: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800' },
  generate_report:       { label: 'Report generated',                                   icon: FileBarChart2, cls: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800' },
};

// ── category starters ────────────────────────────────────────────────────────

const CATS = [
  { key: 'all',      label: 'Suggested'  },
  { key: 'ai',       label: 'AI Magic'   },
  { key: 'overview', label: 'Overview'   },
  { key: 'crm',      label: 'CRM'        },
  { key: 'finance',  label: 'Finance'    },
  { key: 'hr',       label: 'HR'         },
  { key: 'helpdesk', label: 'Helpdesk'   },
  { key: 'projects', label: 'Projects'   },
];

const STARTERS: { cat: string; text: string }[] = [
  { cat: 'overview',  text: "Give me today's full business digest" },
  { cat: 'overview',  text: 'Show overdue summary across all modules' },
  { cat: 'ai',        text: 'Score and qualify all my new leads with AI' },
  { cat: 'ai',        text: 'Send personalized emails to all qualified leads' },
  { cat: 'ai',        text: 'Analyze my pipeline and identify at-risk deals' },
  { cat: 'ai',        text: 'Forecast next month revenue' },
  { cat: 'ai',        text: 'Generate a monthly business report' },
  { cat: 'ai',        text: 'Draft a LinkedIn post about our services' },
  { cat: 'finance',   text: 'Send payment reminders to all overdue clients' },
  { cat: 'finance',   text: 'Show revenue report for last 6 months' },
  { cat: 'finance',   text: 'Mark all overdue invoices as paid' },
  { cat: 'crm',       text: 'Show pipeline summary and top open deals' },
  { cat: 'crm',       text: 'Bulk mark all new leads as contacted' },
  { cat: 'crm',       text: 'Convert the top lead into a deal' },
  { cat: 'hr',        text: 'Approve all pending leave requests' },
  { cat: 'hr',        text: 'List active employees' },
  { cat: 'helpdesk',  text: 'List all urgent support tickets' },
  { cat: 'helpdesk',  text: 'AI-draft replies to all open urgent tickets' },
  { cat: 'projects',  text: 'List active projects with progress' },
  { cat: 'projects',  text: 'List high-priority tasks due this week' },
];

const WORKFLOWS = [
  { label: 'Morning Briefing', icon: LayoutDashboard, prompt: "Morning briefing: give me today's full digest, then analyze my pipeline for risks and show overdue items" },
  { label: 'Lead Blitz',       icon: Brain,           prompt: 'Lead blitz: bulk qualify all new leads with AI, then send personalized follow-up emails to qualified leads' },
  { label: 'Revenue Boost',    icon: TrendingUp,      prompt: 'Revenue boost: send payment reminders to all overdue clients, then forecast next month revenue and show pipeline quick wins' },
  { label: 'End of Day',       icon: CheckCircle2,    prompt: 'End of day wrap-up: resolve all low-priority tickets, list urgent tasks overdue, and generate a business summary' },
];

const LOADING_PHASES = ['Analyzing request…', 'Running actions…', 'Writing response…'];

// ── markdown renderer ────────────────────────────────────────────────────────

function renderMd(text: string) {
  return (
    <div className="space-y-0.5 text-sm leading-relaxed text-gray-800 dark:text-gray-200">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <p key={i} className="font-semibold text-gray-900 dark:text-white mt-2 mb-0.5">{inlineRender(line.slice(4))}</p>;
        if (line.startsWith('## '))  return <p key={i} className="text-base font-bold text-gray-900 dark:text-white mt-3 mb-0.5">{inlineRender(line.slice(3))}</p>;
        if (line.startsWith('---'))  return <hr key={i} className="border-gray-200 dark:border-gray-700 my-2" />;
        if (/^[-*•] /.test(line))   return (
          <div key={i} className="flex gap-2 pl-1">
            <span className="w-1 h-1 rounded-full bg-indigo-400 flex-shrink-0 mt-[9px]" />
            <span>{inlineRender(line.slice(2))}</span>
          </div>
        );
        if (/^\d+\. /.test(line)) {
          const m = line.match(/^(\d+)\. (.*)/)!;
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-indigo-400 flex-shrink-0 text-xs font-mono mt-0.5 w-4">{m[1]}.</span>
              <span>{inlineRender(m[2])}</span>
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} className="h-1.5" />;
        return <p key={i}>{inlineRender(line)}</p>;
      })}
    </div>
  );
}

function inlineRender(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i} className="font-semibold text-gray-900 dark:text-white">{p.slice(2, -2)}</strong>;
        if (p.startsWith('`') && p.endsWith('`'))   return <code key={i} className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-1.5 py-0.5 rounded text-xs font-mono">{p.slice(1, -1)}</code>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

// ── component ────────────────────────────────────────────────────────────────

export function AIAgent() {
  const router = useRouter();
  const [open, setOpen]               = useState(false);
  const [msgs, setMsgs]               = useState<Msg[]>([]);
  const [input, setInput]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [history, setHistory]         = useState<{ role: string; content: string }[]>([]);
  const [loadPhase, setLoadPhase]     = useState(0);
  const [copiedIdx, setCopiedIdx]     = useState<number | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [activeCat, setActiveCat]     = useState('all');

  const [isRecording, setIsRecording] = useState(false);

  const listRef     = useRef<HTMLDivElement>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLTextAreaElement>(null);
  const recognition = useRef<any>(null);

  // Keyboard shortcut Ctrl/Cmd+K
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setOpen(o => !o); }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open]);

  useEffect(() => { if (!open) return; const t = setTimeout(() => inputRef.current?.focus(), 150); return () => clearTimeout(t); }, [open]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, loading]);

  // 3-phase loading animation
  useEffect(() => {
    if (!loading) { setLoadPhase(0); return; }
    const t1 = setTimeout(() => setLoadPhase(1), 2200);
    const t2 = setTimeout(() => setLoadPhase(2), 5500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [loading]);

  const handleScroll = () => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 120);
  };

  const copyMsg = (idx: number, text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const send = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    setMsgs(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    try {
      const { data } = await api.post('/ai/agent', { message: msg, history });
      const p = data.data;
      setHistory(p.history);
      setMsgs(prev => [...prev, { role: 'assistant', content: p.message, actions: p.actions, suggestions: p.suggestions }]);
    } catch (err: any) {
      const m = err?.response?.data?.message || 'Something went wrong. Check your API key in Settings → AI Config.';
      setMsgs(prev => [...prev, { role: 'assistant', content: m, actions: [] }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, history]);

  const clear = () => { setMsgs([]); setHistory([]); setInput(''); setActiveCat('all'); };

  const toggleVoice = () => {
    if (isRecording) { recognition.current?.stop(); setIsRecording(false); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = false; r.interimResults = false; r.lang = 'en-US';
    r.onresult = (e: any) => { setInput(prev => (prev + ' ' + e.results[0][0].transcript).trim()); setIsRecording(false); };
    r.onerror = () => setIsRecording(false);
    r.onend = () => setIsRecording(false);
    recognition.current = r;
    r.start();
    setIsRecording(true);
  };

  const visibleStarters = activeCat === 'all' ? STARTERS.slice(0, 6) : STARTERS.filter(s => s.cat === activeCat).slice(0, 8);
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 dark:bg-black/50 backdrop-blur-[2px] transition-opacity"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Floating trigger */}
      <button
        onClick={() => setOpen(true)}
        title="AI Agent (Ctrl+K)"
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 pl-4 pr-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-2xl shadow-xl shadow-indigo-500/30 transition-all duration-200 ${open ? 'opacity-0 pointer-events-none scale-90' : 'opacity-100 scale-100'}`}
      >
        <Sparkles className="w-4 h-4" />
        <span className="text-sm font-semibold">AI Agent</span>
        <kbd className="ml-1 hidden sm:inline text-[10px] px-1.5 py-0.5 bg-white/20 rounded font-mono">⌘K</kbd>
      </button>

      {/* Chat panel */}
      <div className={`fixed z-50 bottom-0 right-0 sm:bottom-6 sm:right-6 flex flex-col w-full sm:w-[480px] bg-white dark:bg-gray-950 sm:rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl shadow-black/10 transition-all duration-300 ${open ? 'opacity-100 translate-y-0 h-[min(760px,92vh)]' : 'opacity-0 translate-y-4 pointer-events-none h-0 overflow-hidden'}`}>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 sm:rounded-t-2xl flex-shrink-0">
          <div className="relative">
            <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 border-2 border-indigo-600 rounded-full" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white leading-tight">AI Business Agent</p>
            <p className="text-[10px] text-indigo-200 leading-tight">48 AI tools · CRM · Finance · HR · Helpdesk · Projects · AI Magic</p>
          </div>
          <div className="flex items-center gap-1">
            {msgs.length > 0 && (
              <button onClick={clear} className="text-[10px] text-indigo-200 hover:text-white px-2 py-1 hover:bg-white/20 rounded-lg transition-colors">
                New chat
              </button>
            )}
            <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors text-white">
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Message area */}
        <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto min-h-0">

          {/* Welcome state */}
          {msgs.length === 0 && (
            <div className="p-4 space-y-3">
              <div className="text-center pt-2 pb-1">
                <div className="w-14 h-14 bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-950/60 dark:to-violet-950/60 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
                  <Sparkles className="w-7 h-7 text-indigo-500" />
                </div>
                <p className="font-semibold text-gray-900 dark:text-white text-sm">Your AI Business Autopilot</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Take real actions across every module — no manual effort</p>
              </div>

              {/* Workflow presets */}
              <div className="grid grid-cols-2 gap-1.5">
                {WORKFLOWS.map((w, i) => {
                  const Icon = w.icon;
                  return (
                    <button
                      key={i}
                      onClick={() => send(w.prompt)}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/30 border border-indigo-100 dark:border-indigo-900 hover:from-indigo-100 hover:to-violet-100 dark:hover:from-indigo-950/50 dark:hover:to-violet-950/50 transition-all group"
                    >
                      <div className="w-6 h-6 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Icon className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-[11px] font-medium text-indigo-700 dark:text-indigo-300 leading-tight">{w.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Category tabs */}
              <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {CATS.map(c => (
                  <button
                    key={c.key}
                    onClick={() => setActiveCat(c.key)}
                    className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border transition-all font-medium ${
                      activeCat === c.key
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-gray-900'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              {/* Starter prompts */}
              <div className="space-y-1.5">
                {visibleStarters.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s.text)}
                    className="w-full text-left flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 group transition-all"
                  >
                    <span className="text-xs text-gray-700 dark:text-gray-300 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors leading-snug">{s.text}</span>
                    <Sparkles className="w-3 h-3 text-gray-300 dark:text-gray-600 group-hover:text-indigo-400 flex-shrink-0 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {msgs.length > 0 && (
            <div className="p-4 space-y-5">
              {msgs.map((msg, i) => (
                <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>

                  {/* Assistant avatar */}
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-950/50 dark:to-violet-950/50 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 border border-indigo-100 dark:border-indigo-900">
                      <Zap className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                  )}

                  <div className={`flex flex-col gap-2 max-w-[88%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>

                    {/* Action badges */}
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {msg.actions.map((a, j) => {
                          const meta = TOOL_META[a.tool];
                          const Icon = meta?.icon ?? CheckCircle2;
                          const hasErr = !!a.result?.error;
                          const cls = hasErr
                            ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
                            : (meta?.cls ?? 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700');

                          return meta?.url && !hasErr ? (
                            <button
                              key={j}
                              onClick={() => { router.push(meta.url!); setOpen(false); }}
                              className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border font-medium transition-opacity hover:opacity-75 ${cls}`}
                            >
                              <Icon className="w-2.5 h-2.5" />
                              {meta?.label ?? a.tool}
                              <ExternalLink className="w-2 h-2 opacity-60" />
                            </button>
                          ) : (
                            <span key={j} className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border font-medium ${cls}`}>
                              {hasErr ? <AlertCircle className="w-2.5 h-2.5" /> : <Icon className="w-2.5 h-2.5" />}
                              {hasErr ? `Error: ${a.tool}` : (meta?.label ?? a.tool)}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Generated images */}
                    {msg.actions?.filter(a => a.result?.imageUrl).map((a, j) => (
                      <div key={j} className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 max-w-[300px] shadow-sm">
                        <img src={`${API_BASE}${a.result.imageUrl}`} alt="AI generated" className="w-full object-cover" loading="lazy" />
                        <a
                          href={`${API_BASE}${a.result.imageUrl}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors border-t border-gray-100 dark:border-gray-800"
                        >
                          <ExternalLink className="w-2.5 h-2.5" /> Open full size
                        </a>
                      </div>
                    ))}

                    {/* Message bubble */}
                    {msg.role === 'user' ? (
                      <div className="px-4 py-2.5 bg-indigo-600 text-white text-sm rounded-2xl rounded-tr-sm shadow-sm leading-relaxed">
                        {msg.content}
                      </div>
                    ) : (
                      <div className="group relative bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                        {renderMd(msg.content)}
                        <button
                          onClick={() => copyMsg(i, msg.content)}
                          title="Copy"
                          className="absolute top-2 right-2 p-1 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        >
                          {copiedIdx === i
                            ? <Check className="w-3 h-3 text-emerald-500" />
                            : <Copy className="w-3 h-3 text-gray-400" />}
                        </button>
                      </div>
                    )}

                    {/* Suggestion chips */}
                    {msg.suggestions && msg.suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-0.5">
                        {msg.suggestions.map((s, j) => (
                          <button
                            key={j}
                            onClick={() => send(s)}
                            className="text-[11px] px-3 py-1.5 bg-white dark:bg-gray-900 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors font-medium shadow-sm"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* User avatar */}
                  {msg.role === 'user' && (
                    <div className="w-7 h-7 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 border border-gray-200 dark:border-gray-700">
                      <User className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                    </div>
                  )}
                </div>
              ))}

              {/* Loading indicator */}
              {loading && (
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-950/50 dark:to-violet-950/50 rounded-xl flex items-center justify-center flex-shrink-0 border border-indigo-100 dark:border-indigo-900">
                    <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-2.5">
                      <div className="flex gap-1">
                        {[0, 1, 2].map(d => (
                          <div key={d} className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${d * 150}ms` }} />
                        ))}
                      </div>
                      <span className="text-xs text-gray-400 dark:text-gray-500">{LOADING_PHASES[loadPhase]}</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Scroll-to-bottom button */}
        {showScrollBtn && msgs.length > 0 && (
          <button
            onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="absolute bottom-[80px] right-4 w-8 h-8 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors z-10"
          >
            <ArrowDown className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
          </button>
        )}

        {/* Input */}
        <div className="flex-shrink-0 p-3 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-end gap-2 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 focus-within:border-indigo-400 dark:focus-within:border-indigo-600 transition-colors px-3 py-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Create, analyze, email, report — anything…"
              rows={1}
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 outline-none resize-none max-h-32"
              style={{ minHeight: '22px' }}
            />
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={toggleVoice}
                title={isRecording ? 'Stop recording' : 'Voice input'}
                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${isRecording ? 'bg-red-100 dark:bg-red-950/40 text-red-500 dark:text-red-400 animate-pulse' : 'text-gray-400 hover:text-indigo-500 dark:text-gray-500 dark:hover:text-indigo-400 hover:bg-gray-200 dark:hover:bg-gray-800'}`}
              >
                {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                className="w-8 h-8 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white rounded-lg transition-colors"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-600 text-center mt-1.5">
            Enter to send · Shift+Enter for new line · Esc to close
          </p>
        </div>
      </div>
    </>
  );
}

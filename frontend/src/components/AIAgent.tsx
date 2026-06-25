'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Send, Loader2, User, ChevronDown, ExternalLink, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  actions?: { tool: string; result: any }[];
  suggestions?: string[];
}

const TOOL_LABELS: Record<string, { label: string; url?: string }> = {
  create_lead:           { label: '✓ Lead created',           url: '/dashboard/crm/leads' },
  list_leads:            { label: '📋 Leads fetched',          url: '/dashboard/crm/leads' },
  create_contact:        { label: '✓ Contact created',         url: '/dashboard/crm/contacts' },
  create_deal:           { label: '✓ Deal created',            url: '/dashboard/crm/pipeline' },
  create_task:           { label: '✓ Task created',            url: '/dashboard/projects' },
  create_invoice:        { label: '✓ Invoice created',         url: '/dashboard/finance/invoices' },
  list_invoices:         { label: '📋 Invoices fetched',       url: '/dashboard/finance/invoices' },
  create_ticket:         { label: '✓ Ticket created',          url: '/dashboard/helpdesk' },
  list_tickets:          { label: '📋 Tickets fetched',        url: '/dashboard/helpdesk' },
  get_stats:             { label: '📊 Stats loaded',           url: '/dashboard' },
  create_campaign:       { label: '✓ Campaign created',        url: '/dashboard/marketing' },
  search:                { label: '🔍 Search complete' },
  send_payment_reminder: { label: '📧 Reminders sent',         url: '/dashboard/finance/invoices' },
  send_invoice:          { label: '📧 Invoice sent',           url: '/dashboard/finance/invoices' },
  convert_lead:          { label: '🔄 Lead converted',         url: '/dashboard/crm/pipeline' },
  update_deal:           { label: '✏️ Deal updated',           url: '/dashboard/crm/pipeline' },
  get_revenue_report:    { label: '📈 Revenue report',         url: '/dashboard/analytics' },
  list_employees:        { label: '👥 Employees fetched',      url: '/dashboard/hr/employees' },
  bulk_update_leads:     { label: '⚡ Leads bulk updated',     url: '/dashboard/crm/leads' },
  mark_invoice_paid:     { label: '✓ Invoices marked paid',   url: '/dashboard/finance/invoices' },
  get_overdue_summary:   { label: '⚠️ Overdue summary' },
  get_pipeline_summary:  { label: '📊 Pipeline summary',       url: '/dashboard/crm/pipeline' },
  create_followup:       { label: '📅 Follow-up scheduled',    url: '/dashboard/projects' },
  list_tasks:            { label: '📋 Tasks fetched',          url: '/dashboard/projects' },
  resolve_ticket:        { label: '✓ Ticket resolved',         url: '/dashboard/helpdesk' },
  add_note:              { label: '📝 Note added',             url: '/dashboard/crm/leads' },
  generate_image:        { label: '🖼️ Image generated' },
  create_project:        { label: '✓ Project created',         url: '/dashboard/projects' },
  list_projects:         { label: '📋 Projects fetched',       url: '/dashboard/projects' },
  create_contract:       { label: '✓ Contract created',        url: '/dashboard/contracts' },
  list_contracts:        { label: '📋 Contracts fetched',      url: '/dashboard/contracts' },
  create_purchase_order: { label: '✓ PO created',              url: '/dashboard/finance/purchase-orders' },
  list_leaves:           { label: '📋 Leave requests',         url: '/dashboard/hr/leaves' },
  approve_leave:         { label: '✓ Leave processed',         url: '/dashboard/hr/leaves' },
  create_expense:        { label: '✓ Expense logged',          url: '/dashboard/finance/expenses' },
  schedule_appointment:  { label: '📅 Appointment scheduled',  url: '/dashboard/appointments' },
  daily_digest:          { label: '📊 Daily digest' },
};

const STARTERS = [
  "Give me today's full business digest",
  'Send payment reminders to all overdue clients',
  'Approve all pending leave requests',
  'Show pipeline summary and create follow-ups for top deals',
  'Bulk mark all new leads as contacted',
  'Show overdue invoices and mark any paid ones',
];

function renderMarkdown(text: string) {
  const lines = text.split('\n');
  return (
    <div className="space-y-0.5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith('### ')) return <p key={i} className="font-semibold mt-2 mb-0.5">{inlineRender(line.slice(4))}</p>;
        if (line.startsWith('## ')) return <p key={i} className="font-bold mt-2 mb-0.5">{inlineRender(line.slice(3))}</p>;
        if (/^[-*] /.test(line)) return (
          <div key={i} className="flex gap-1.5 pl-1">
            <span className="text-indigo-400 mt-0.5 flex-shrink-0">•</span>
            <span>{inlineRender(line.slice(2))}</span>
          </div>
        );
        if (/^\d+\. /.test(line)) {
          const m = line.match(/^(\d+)\. (.*)/)!;
          return (
            <div key={i} className="flex gap-1.5 pl-1">
              <span className="text-indigo-400 flex-shrink-0 w-4">{m[1]}.</span>
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
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>;
        if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-xs font-mono">{p.slice(1, -1)}</code>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

export function AIAgent() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<{ role: string; content: string }[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Ctrl+K keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 150);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    try {
      const { data } = await api.post('/ai/agent', { message: msg, history });
      const payload = data.data;
      setHistory(payload.history);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: payload.message,
        actions: payload.actions,
        suggestions: payload.suggestions,
      }]);
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || 'AI agent error. Check your Anthropic key in Settings → AI Config.';
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${errMsg}` }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, history]);

  const clearChat = () => { setMessages([]); setHistory([]); setInput(''); };

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(true)}
        title="AI Agent (Ctrl+K)"
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-2xl transition-all duration-200 ${open ? 'opacity-0 pointer-events-none scale-90' : 'opacity-100 scale-100'}`}
      >
        <Sparkles className="w-4 h-4" />
        <span className="text-sm font-semibold">AI Agent</span>
        <span className="text-[10px] text-indigo-300 hidden sm:inline">Ctrl+K</span>
      </button>

      {/* Chat panel */}
      <div className={`fixed z-50 inset-x-0 bottom-0 sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[440px] flex flex-col bg-white dark:bg-gray-900 sm:rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 transition-all duration-300 ${open ? 'opacity-100 translate-y-0 h-[640px] sm:h-[700px]' : 'opacity-0 translate-y-4 pointer-events-none h-0 overflow-hidden'}`}>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white sm:rounded-t-2xl flex-shrink-0">
          <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
            <Zap className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">AI Business Agent</p>
            <p className="text-[10px] text-indigo-200">Zero manual effort · Ctrl+K to toggle</p>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button onClick={clearChat} className="px-2 py-1 hover:bg-white/20 rounded-lg text-[10px] text-indigo-200 hover:text-white transition-colors">
                New chat
              </button>
            )}
            <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-white/20 rounded-lg">
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {messages.length === 0 && (
            <div className="space-y-5 pt-3">
              <div className="text-center">
                <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Zap className="w-7 h-7 text-indigo-500" />
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Full autopilot — ask anything</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">CRM · Finance · HR · Helpdesk · Projects · Contracts · Marketing</p>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {STARTERS.map((s, i) => (
                  <button key={i} onClick={() => send(s)}
                    className="text-left px-2.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-[11px] text-gray-600 dark:text-gray-400 hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-all flex items-start gap-1.5 leading-snug">
                    <Sparkles className="w-3 h-3 text-indigo-400 flex-shrink-0 mt-0.5" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 bg-indigo-100 dark:bg-indigo-950/50 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Zap className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                </div>
              )}
              <div className={`max-w-[88%] flex flex-col gap-1.5 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>

                {/* Action badges with view links */}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {msg.actions.map((a, j) => {
                      const meta = TOOL_LABELS[a.tool];
                      return meta?.url ? (
                        <button key={j} onClick={() => { router.push(meta.url!); setOpen(false); }}
                          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 rounded-full border border-emerald-200 dark:border-emerald-800 font-medium hover:bg-emerald-100 dark:hover:bg-emerald-950/60 transition-colors">
                          {meta?.label || a.tool}
                          <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      ) : (
                        <span key={j} className="inline-flex items-center text-[10px] px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 rounded-full border border-emerald-200 dark:border-emerald-800 font-medium">
                          {meta?.label || a.tool}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Generated images */}
                {msg.actions?.filter(a => a.result?.imageUrl).map((a, j) => {
                  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
                  return (
                    <div key={j} className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 max-w-[320px]">
                      <img src={`${baseUrl}${a.result.imageUrl}`} alt="AI generated" className="w-full object-cover" />
                      <a href={`${baseUrl}${a.result.imageUrl}`} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors">
                        <ExternalLink className="w-2.5 h-2.5" /> Open full size
                      </a>
                    </div>
                  );
                })}

                {/* Message bubble */}
                <div className={`px-3.5 py-2.5 rounded-2xl ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm text-sm leading-relaxed' : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-sm'}`}>
                  {msg.role === 'user' ? msg.content : renderMarkdown(msg.content)}
                </div>

                {/* Suggested follow-up chips */}
                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {msg.suggestions.map((s, j) => (
                      <button key={j} onClick={() => send(s)}
                        className="text-[10px] px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-full border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 transition-colors font-medium">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-2.5">
              <div className="w-7 h-7 bg-indigo-100 dark:bg-indigo-950/50 rounded-xl flex items-center justify-center flex-shrink-0">
                <Zap className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex items-center gap-1.5">
                  {[0, 150, 300].map(delay => (
                    <div key={delay} className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-end gap-2 bg-gray-50 dark:bg-gray-800/80 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Bulk update leads, send reminders, close deals…"
              rows={1}
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none resize-none max-h-28"
              style={{ minHeight: '22px' }}
            />
            <button onClick={() => send()} disabled={!input.trim() || loading}
              className="w-8 h-8 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 dark:disabled:bg-indigo-900 text-white rounded-lg flex-shrink-0 transition-colors">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-600 text-center mt-1.5">Enter · Shift+Enter for new line · Esc to close</p>
        </div>
      </div>
    </>
  );
}

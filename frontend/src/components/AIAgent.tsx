'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Send, Loader2, User, ChevronDown } from 'lucide-react';
import api from '@/lib/api';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  actions?: { tool: string; result: any }[];
}

const STARTERS = [
  "Show me today's business stats",
  'Create a lead for John Smith at Apple',
  'List my overdue invoices',
  'Create a high-priority ticket: Login is broken',
];

const TOOL_LABELS: Record<string, string> = {
  create_lead: '✓ Lead created',
  list_leads: '📋 Leads fetched',
  create_contact: '✓ Contact created',
  create_deal: '✓ Deal created',
  create_task: '✓ Task created',
  create_invoice: '✓ Invoice created',
  list_invoices: '📋 Invoices fetched',
  create_ticket: '✓ Ticket created',
  list_tickets: '📋 Tickets fetched',
  get_stats: '📊 Stats loaded',
  create_campaign: '✓ Campaign created',
  search: '🔍 Search complete',
};

export function AIAgent() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<{ role: string; content: string }[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
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
      }]);
    } catch (err: any) {
      const msg2 = err?.response?.data?.message || 'AI agent error. Check your Anthropic key in Settings → AI Config.';
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${msg2}` }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, history]);

  const clearChat = () => {
    setMessages([]);
    setHistory([]);
    setInput('');
  };

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-2xl transition-all duration-200 ${open ? 'opacity-0 pointer-events-none scale-90' : 'opacity-100 scale-100'}`}
      >
        <Sparkles className="w-4 h-4" />
        <span className="text-sm font-semibold">AI Agent</span>
      </button>

      {/* Chat panel */}
      <div className={`fixed z-50 inset-x-0 bottom-0 sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[420px] flex flex-col bg-white dark:bg-gray-900 sm:rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 transition-all duration-300 ${open ? 'opacity-100 translate-y-0 h-[620px] sm:h-[680px]' : 'opacity-0 translate-y-4 pointer-events-none h-0 overflow-hidden'}`}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white sm:rounded-t-2xl flex-shrink-0">
          <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">AI Business Agent</p>
            <p className="text-[10px] text-indigo-200">Powered by Claude · Can create & query data</p>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button onClick={clearChat} className="p-1.5 hover:bg-white/20 rounded-lg text-xs text-indigo-200 hover:text-white transition-colors">
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
            <div className="space-y-5 pt-4">
              <div className="text-center">
                <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Sparkles className="w-7 h-7 text-indigo-500" />
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">What can I help you with?</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Create leads, invoices, tickets, tasks, and more using natural language</p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {STARTERS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
                    className="text-left px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-all"
                  >
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
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                </div>
              )}
              <div className={`max-w-[85%] flex flex-col gap-1.5 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                {msg.actions && msg.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {msg.actions.map((a, j) => (
                      <span key={j} className="inline-flex items-center text-[10px] px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 rounded-full border border-emerald-200 dark:border-emerald-800 font-medium">
                        {TOOL_LABELS[a.tool] || a.tool}
                      </span>
                    ))}
                  </div>
                )}
                <div
                  className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-sm'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-sm'
                  }`}
                >
                  {msg.content}
                </div>
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
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
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

        {/* Input area */}
        <div className="p-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-end gap-2 bg-gray-50 dark:bg-gray-800/80 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask me anything… create a lead, check stats, make a ticket…"
              rows={1}
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none resize-none max-h-28"
              style={{ minHeight: '22px' }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="w-8 h-8 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 dark:disabled:bg-indigo-900 text-white rounded-lg flex-shrink-0 transition-colors"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-600 text-center mt-1.5">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </>
  );
}

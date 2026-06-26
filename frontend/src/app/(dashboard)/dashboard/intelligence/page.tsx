'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import {
  Brain, Send, Loader2, Copy, RotateCcw, Mic, MicOff,
  Download, Zap, RefreshCw, TrendingUp, DollarSign,
  Users, AlertTriangle, Target, MessageSquare, BarChart3, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  followUps?: string[];
}

const BRIEF_PROMPT =
  'Give me a concise executive briefing for today. Format exactly like this:\n' +
  'STATUS: one sentence on overall business health\n' +
  'FINANCE: revenue/cash situation with numbers\n' +
  'OPERATIONS: key operational status\n' +
  'TEAM: team and capacity status\n' +
  'ACTIONS:\n1. most urgent action\n2. second priority\n3. third priority\n' +
  'Keep it factual, use actual numbers from the data, under 200 words total.';

const QUICK_PROMPTS = [
  { label: 'Cash flow', text: 'How is cash flow right now? Any payment risks?', icon: DollarSign, color: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60' },
  { label: "What's overdue", text: 'List everything overdue — invoices, tasks, and customer requests.', icon: AlertTriangle, color: 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60' },
  { label: 'Team status', text: 'How is the team doing? Any workload or staffing issues?', icon: Users, color: 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60' },
  { label: 'Growth areas', text: 'Where are the best growth opportunities right now?', icon: TrendingUp, color: 'bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/60' },
  { label: 'Customer requests', text: 'What are customers asking for? Any urgent support issues?', icon: MessageSquare, color: 'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/60' },
  { label: 'Weekly plan', text: 'What should I focus on this week to move the business forward?', icon: Target, color: 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60' },
  { label: 'Top risks', text: 'What are the top 3 business risks I should address this week?', icon: BarChart3, color: 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60' },
  { label: 'Behind schedule', text: "What projects or tasks are behind schedule and need attention?", icon: Clock, color: 'bg-pink-50 dark:bg-pink-950/30 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800/60' },
];

function parseBrief(text: string) {
  const get = (key: string) => {
    const match = text.match(new RegExp(`${key}:\\s*(.+?)(?=\\n[A-Z]+:|$)`, 's'));
    return match ? match[1].trim() : '';
  };
  const actionsBlock = get('ACTIONS');
  const actions = actionsBlock
    .split('\n')
    .map((l: string) => l.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);

  return {
    status: get('STATUS'),
    finance: get('FINANCE'),
    operations: get('OPERATIONS'),
    team: get('TEAM'),
    actions,
    raw: text,
  };
}

function renderContent(text: string) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('- ') || line.startsWith('• '))
      return (
        <p key={i} className="flex gap-2 leading-relaxed">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0 mt-2" />
          <span>{line.slice(2)}</span>
        </p>
      );
    if (/^\d+\./.test(line)) {
      const dot = line.indexOf('.');
      return (
        <p key={i} className="flex gap-2 leading-relaxed">
          <span className="text-indigo-400 font-semibold flex-shrink-0 w-4">{line.slice(0, dot)}.</span>
          <span>{line.slice(dot + 1).trim()}</span>
        </p>
      );
    }
    if (line.startsWith('**') && line.endsWith('**'))
      return <p key={i} className="font-semibold text-gray-900 dark:text-white mt-2 first:mt-0">{line.slice(2, -2)}</p>;
    if (line === '') return <div key={i} className="h-1" />;
    return <p key={i} className="leading-relaxed">{line}</p>;
  });
}

function useVoiceInput(onResult: (t: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const toggle = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error('Voice not supported in this browser'); return; }
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.onresult = (e: any) => { onResult(e.results[0][0].transcript); setListening(false); };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [listening, onResult]);
  return { listening, toggle };
}

export default function AIBrainPage() {
  const [brief, setBrief] = useState<ReturnType<typeof parseBrief> | null>(null);
  const [briefLoading, setBriefLoading] = useState(true);
  const [briefError, setBriefError] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { listening, toggle: toggleVoice } = useVoiceInput((t) => {
    setInput(t);
    setTimeout(() => inputRef.current?.focus(), 50);
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const loadBrief = useCallback(async () => {
    setBriefLoading(true);
    setBriefError(false);
    try {
      const { data } = await api.post('/ai/brain-chat', { message: BRIEF_PROMPT, history: [] });
      const raw = data.data?.message || '';
      setBrief(parseBrief(raw));
    } catch {
      setBriefError(true);
    } finally {
      setBriefLoading(false);
    }
  }, []);

  useEffect(() => { loadBrief(); }, [loadBrief]);

  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || loading) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: t };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const { data } = await api.post('/ai/brain-chat', { message: t, history });
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.data?.message || 'No response.',
        followUps: data.data?.followUps || [],
      }]);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'AI unavailable — configure your API key in Settings.');
      setMessages(prev => prev.filter(m => m.id !== userMsg.id));
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [messages, loading]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const exportChat = () => {
    const lines: string[] = [];
    if (brief?.raw) lines.push('=== Daily Brief ===\n' + brief.raw + '\n');
    messages.forEach(m => lines.push(`${m.role === 'user' ? 'You' : 'AI'}: ${m.content}`));
    const blob = new Blob([lines.join('\n\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'business-brief.txt'; a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-3xl mx-auto w-full">

      {/* Header */}
      <div className="flex items-center justify-between py-3 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md shadow-indigo-200/30 dark:shadow-indigo-900/40">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900 dark:text-white leading-none">Business Intelligence</h1>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              Live data from all modules
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {(brief || messages.length > 0) && (
            <button onClick={exportChat} title="Export" className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <Download className="w-4 h-4" />
            </button>
          )}
          {messages.length > 0 && (
            <button onClick={() => setMessages([])} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <RotateCcw className="w-3.5 h-3.5" /> Clear chat
            </button>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto scroll-smooth space-y-5 pb-4">

        {/* Daily Brief Card */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/60 overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-700/60 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-500" />
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{"Today's Brief"}</span>
            </div>
            <button
              onClick={loadBrief}
              disabled={briefLoading}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${briefLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {briefLoading && (
            <div className="p-5 space-y-3">
              {[80, 60, 70, 55].map((w, i) => (
                <div key={i} className="h-4 rounded-full bg-gray-100 dark:bg-gray-700/60 animate-pulse" style={{ width: `${w}%` }} />
              ))}
            </div>
          )}

          {briefError && !briefLoading && (
            <div className="p-5 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <span>Could not load brief — check your AI key in Settings.</span>
              <button onClick={loadBrief} className="text-indigo-500 hover:underline">Retry</button>
            </div>
          )}

          {brief && !briefLoading && (
            <div className="p-5">
              {brief.status && (
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-4 pb-4 border-b border-gray-100 dark:border-gray-700/60">
                  {brief.status}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                {brief.finance && (
                  <div className="flex gap-2.5">
                    <DollarSign className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">Finance</p>
                      <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{brief.finance}</p>
                    </div>
                  </div>
                )}
                {brief.operations && (
                  <div className="flex gap-2.5">
                    <Target className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">Operations</p>
                      <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{brief.operations}</p>
                    </div>
                  </div>
                )}
                {brief.team && (
                  <div className="flex gap-2.5">
                    <Users className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-0.5">Team</p>
                      <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{brief.team}</p>
                    </div>
                  </div>
                )}
              </div>

              {brief.actions.length > 0 && (
                <div className="border-t border-gray-100 dark:border-gray-700/60 pt-3.5">
                  <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2.5">Action Items</p>
                  <div className="space-y-1.5">
                    {brief.actions.map((action: string, i: number) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{action}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!brief.status && !brief.finance && (
                <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  {renderContent(brief.raw)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick prompts */}
        {messages.length === 0 && !briefLoading && (
          <div>
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2.5">Ask about your business</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {QUICK_PROMPTS.map(p => (
                <button
                  key={p.label}
                  onClick={() => send(p.text)}
                  disabled={loading}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all hover:shadow-sm text-left ${p.color} disabled:opacity-50`}
                >
                  <p.icon className="w-3.5 h-3.5 flex-shrink-0" />
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat messages */}
        {messages.length > 0 && (
          <div className="space-y-4">
            {messages.map(msg => (
              <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm shadow-indigo-200/30 dark:shadow-indigo-900/40">
                    <Brain className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
                <div className={`max-w-[80%] flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  {msg.role === 'user' ? (
                    <div className="bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed shadow-sm">
                      {msg.content}
                    </div>
                  ) : (
                    <>
                      <div className="bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700/60 rounded-2xl rounded-bl-sm px-4 py-3.5 text-sm text-gray-700 dark:text-gray-200 shadow-sm">
                        <div className="space-y-1">{renderContent(msg.content)}</div>
                        <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/40">
                          <button
                            onClick={() => { navigator.clipboard.writeText(msg.content); toast.success('Copied'); }}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          >
                            <Copy className="w-3 h-3" /> Copy
                          </button>
                        </div>
                      </div>
                      {msg.followUps && msg.followUps.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 px-1">
                          {msg.followUps.map((q, i) => (
                            <button
                              key={i}
                              onClick={() => send(q)}
                              disabled={loading}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800/60 text-xs text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-all disabled:opacity-40"
                            >
                              <Zap className="w-2.5 h-2.5" /> {q}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2.5 justify-start">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <Brain className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700/60 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-1">
                    {[0, 1, 2].map(i => (
                      <span key={i} className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 pt-2 pb-1">
        <div className="flex items-end gap-2 bg-white dark:bg-gray-800/80 rounded-2xl px-4 py-3 border border-gray-200 dark:border-gray-700/60 shadow-sm focus-within:border-indigo-400 dark:focus-within:border-indigo-500 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask anything about your business…"
            rows={1}
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-none outline-none leading-relaxed"
            style={{ minHeight: '22px', maxHeight: '100px' }}
            onInput={e => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 100) + 'px';
            }}
          />
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={toggleVoice}
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${listening ? 'bg-red-500 text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              title="Voice input"
            >
              {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-sm"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <Send className="w-3.5 h-3.5 text-white" />}
            </button>
          </div>
        </div>
        <p className="text-[10px] text-center text-gray-400 mt-1.5">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}

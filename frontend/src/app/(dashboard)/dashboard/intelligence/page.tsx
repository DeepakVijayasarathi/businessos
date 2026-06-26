'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  Brain, Send, Sparkles, TrendingUp, TrendingDown, DollarSign, Users,
  Target, Headphones, AlertTriangle, Zap, RefreshCw, X, Copy, ThumbsUp,
  Lightbulb, BarChart3,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

const PROMPTS = [
  { label: 'Business summary', text: 'Give me a complete business summary for today — revenue, pipeline, team, and key risks.', icon: BarChart3, color: 'indigo' },
  { label: 'Top priorities', text: 'Based on current data, what are the top 3 things I should focus on this week?', icon: Target, color: 'purple' },
  { label: 'Sales health', text: 'How healthy is my sales pipeline? Which deals are most likely to close?', icon: TrendingUp, color: 'green' },
  { label: 'Cash flow risks', text: 'Analyze my cash position. Any overdue invoices or financial risks I should act on?', icon: DollarSign, color: 'yellow' },
  { label: 'Support load', text: 'How is my support team doing? Are ticket volumes sustainable?', icon: Headphones, color: 'orange' },
  { label: 'Team status', text: 'Any burnout risk or resourcing issues based on current projects and headcount?', icon: Users, color: 'blue' },
  { label: 'Growth opportunities', text: 'Where are the biggest growth opportunities in my business right now?', icon: Lightbulb, color: 'pink' },
  { label: 'Everything overdue', text: 'List everything overdue across all modules: invoices, tasks, tickets, deals.', icon: AlertTriangle, color: 'red' },
];

const CHIP: Record<string, string> = {
  indigo: 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 border-indigo-100 dark:border-indigo-800',
  purple: 'bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border-purple-100 dark:border-purple-800',
  green: 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800',
  yellow: 'bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-300 border-yellow-100 dark:border-yellow-800',
  orange: 'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 border-orange-100 dark:border-orange-800',
  blue: 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800',
  pink: 'bg-pink-50 dark:bg-pink-950/30 text-pink-700 dark:text-pink-300 border-pink-100 dark:border-pink-800',
  red: 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-100 dark:border-red-800',
};

function Dots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map(i => (
        <span key={i} className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  );
}

function Bubble({ msg, onCopy }: { msg: Message; onCopy: (t: string) => void }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${isUser ? 'bg-indigo-600' : 'bg-gradient-to-br from-violet-500 to-indigo-600'}`}>
        {isUser ? <Users className="w-4 h-4 text-white" /> : <Brain className="w-4 h-4 text-white" />}
      </div>
      <div className={`group max-w-[78%] flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${isUser
          ? 'bg-indigo-600 text-white rounded-tr-sm'
          : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-tl-sm shadow-sm'
        }`}>
          {isUser ? <p>{msg.content}</p> : (
            <div className="space-y-1.5">
              {msg.content.split('\n').map((line, i) => {
                if (line.startsWith('- ') || line.startsWith('• '))
                  return <p key={i} className="flex gap-2"><span className="text-indigo-400 flex-shrink-0">•</span><span>{line.slice(2)}</span></p>;
                if (/^\d+\./.test(line))
                  return <p key={i} className="flex gap-2"><span className="text-indigo-400 font-semibold flex-shrink-0">{line.split('.')[0]}.</span><span>{line.slice(line.indexOf('.') + 1).trim()}</span></p>;
                if (line.startsWith('**') && line.endsWith('**'))
                  return <p key={i} className="font-semibold text-gray-900 dark:text-white mt-2">{line.slice(2, -2)}</p>;
                if (line === '') return <div key={i} className="h-1" />;
                return <p key={i}>{line}</p>;
              })}
            </div>
          )}
        </div>
        {!isUser && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onCopy(msg.content)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600"><Copy className="w-3.5 h-3.5" /></button>
            <button className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-green-500"><ThumbsUp className="w-3.5 h-3.5" /></button>
          </div>
        )}
        <span className="text-xs text-gray-400 px-1">{new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  );
}

export default function AIBrainPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showChips, setShowChips] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: intel, isLoading: statsLoading } = useQuery({
    queryKey: ['ai-intelligence'],
    queryFn: async () => { const { data } = await api.get('/ai/intelligence'); return data.data; },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const healthScore = intel?.healthScore ?? 0;
  const metrics = intel?.metrics ?? {};
  const healthGrad = healthScore >= 75 ? 'from-green-500 to-emerald-400' : healthScore >= 50 ? 'from-yellow-400 to-orange-400' : healthScore >= 30 ? 'from-orange-500 to-red-400' : 'from-red-600 to-red-400';
  const healthLabel = healthScore >= 75 ? 'Excellent' : healthScore >= 50 ? 'Good' : healthScore >= 30 ? 'Needs Attention' : 'Critical';

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || loading) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: t, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setShowChips(false);
    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const { data } = await api.post('/ai/brain-chat', { message: t, history });
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: data.data?.message || 'No response.', ts: Date.now() }]);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'AI Brain unavailable — check Settings → AI.');
      setMessages(prev => prev.filter(m => m.id !== userMsg.id));
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [messages, loading]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const STATS = [
    { label: 'Revenue 30d', value: `$${Number(metrics.revenue30 || 0).toLocaleString()}`, change: metrics.revenueGrowth, icon: DollarSign, color: 'text-indigo-500' },
    { label: 'Pipeline', value: `$${Number(metrics.pipelineValue || 0).toLocaleString()}`, sub: `${Number(metrics.openDeals || 0)} deals`, icon: Target, color: 'text-green-500' },
    { label: 'New Leads', value: Number(metrics.newLeads || 0), change: metrics.leadGrowth, icon: Users, color: 'text-purple-500' },
    { label: 'Open Tickets', value: Number(metrics.openTickets || 0), sub: `${Number(metrics.urgentTickets || 0)} urgent`, icon: Headphones, color: 'text-orange-500' },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-indigo-900/40">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">AI Business Brain</h1>
            <p className="text-xs text-gray-500">Decision-making AI — knows every number, every module, in real time</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button onClick={() => { setMessages([]); setShowChips(true); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-800">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Live</span>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 flex-shrink-0">
        <div className={`rounded-2xl p-4 bg-gradient-to-br ${healthGrad} text-white`}>
          {statsLoading ? <div className="animate-pulse h-12 bg-white/20 rounded-xl" /> : (
            <>
              <p className="text-xs font-medium opacity-80">Health</p>
              <div className="flex items-baseline gap-1 mt-1"><span className="text-3xl font-black">{healthScore}</span><span className="text-sm opacity-70">/100</span></div>
              <p className="text-xs font-semibold opacity-90">{healthLabel}</p>
            </>
          )}
        </div>
        {STATS.map(s => (
          <div key={s.label} className="glass-card rounded-2xl p-4">
            {statsLoading ? <div className="animate-pulse h-12 bg-gray-200 dark:bg-gray-700 rounded-xl" /> : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                </div>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{s.value}</p>
                {s.change != null && (
                  <div className={`flex items-center gap-0.5 mt-0.5 text-xs ${s.change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {s.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {Math.abs(s.change).toFixed(1)}%
                  </div>
                )}
                {s.sub && <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col min-h-0 glass-card rounded-2xl overflow-hidden">
        <div className="flex-1 overflow-y-auto p-5 space-y-5 scroll-smooth">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-5 py-8">
              <div className="relative">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-2xl shadow-indigo-300/40 dark:shadow-indigo-900/40">
                  <Brain className="w-10 h-10 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white dark:border-gray-900 flex items-center justify-center">
                  <Sparkles className="w-2.5 h-2.5 text-white" />
                </div>
              </div>
              <div className="text-center">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Your AI Business Brain</h2>
                <p className="text-sm text-gray-500 mt-1 max-w-sm">Ask me anything — I have live access to your CRM, finance, HR, projects, and support data.</p>
              </div>
            </div>
          )}
          {messages.map(msg => <Bubble key={msg.id} msg={msg} onCopy={t => { navigator.clipboard.writeText(t); toast.success('Copied'); }} />)}
          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                <Dots />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Prompt chips */}
        {showChips && (
          <div className="px-5 pb-3 border-t border-gray-100 dark:border-gray-800 pt-3">
            <p className="text-xs text-gray-400 mb-2.5 font-medium">Ask the brain</p>
            <div className="flex flex-wrap gap-2">
              {PROMPTS.map(p => (
                <button key={p.label} onClick={() => send(p.text)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all hover:shadow-sm ${CHIP[p.color]}`}>
                  <p.icon className="w-3.5 h-3.5" />{p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-end gap-3 bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-3 border border-gray-200 dark:border-gray-700 focus-within:border-indigo-400 dark:focus-within:border-indigo-500 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about your business… e.g. 'How are my sales?' or 'What should I focus on?'"
              rows={1}
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-none outline-none max-h-32 leading-relaxed"
              style={{ minHeight: '24px' }}
              onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 128) + 'px'; }}
              disabled={loading}
            />
            <div className="flex items-center gap-2 flex-shrink-0">
              {!showChips && messages.length > 0 && (
                <button onClick={() => setShowChips(true)} className="p-2 rounded-xl text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors" title="Show suggestions">
                  <Zap className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => send(input)} disabled={!input.trim() || loading} className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors shadow-sm">
                {loading ? <RefreshCw className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
              </button>
            </div>
          </div>
          <p className="text-xs text-center text-gray-400 mt-2">Enter to send · Shift+Enter for new line · Live data from all modules</p>
        </div>
      </div>
    </div>
  );
}

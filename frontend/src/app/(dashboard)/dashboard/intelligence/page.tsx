'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Brain, Send, Loader2, Copy, X, Sparkles, Target, DollarSign, Users, Headphones, Lightbulb, AlertTriangle, TrendingUp, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const PROMPTS = [
  { label: 'Business summary', text: 'Give me a full business summary for today — revenue, pipeline, team, risks.', icon: TrendingUp },
  { label: 'Top priorities', text: 'What are my top 3 priorities this week based on current data?', icon: Target },
  { label: 'Cash flow risks', text: 'Analyze my cash position and flag any financial risks I should act on.', icon: DollarSign },
  { label: 'Growth opportunities', text: 'Where are the biggest growth opportunities in my business right now?', icon: Lightbulb },
  { label: 'Team health', text: 'How is the team doing? Any burnout or resourcing issues?', icon: Users },
  { label: 'Support queue', text: 'How is my support team doing? Is ticket volume under control?', icon: Headphones },
  { label: 'Everything overdue', text: 'List everything overdue — invoices, tasks, tickets, and deals.', icon: AlertTriangle },
];

function renderLine(line: string, i: number) {
  if (line.startsWith('- ') || line.startsWith('• '))
    return (
      <p key={i} className="flex gap-2.5 leading-relaxed">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0 mt-2" />
        <span>{line.slice(2)}</span>
      </p>
    );
  if (/^\d+\./.test(line)) {
    const dot = line.indexOf('.');
    return (
      <p key={i} className="flex gap-2.5 leading-relaxed">
        <span className="text-indigo-400 font-semibold flex-shrink-0 w-4">{line.slice(0, dot)}.</span>
        <span>{line.slice(dot + 1).trim()}</span>
      </p>
    );
  }
  if (line.startsWith('**') && line.endsWith('**'))
    return <p key={i} className="font-semibold text-gray-900 dark:text-white mt-3 first:mt-0">{line.slice(2, -2)}</p>;
  if (line === '') return <div key={i} className="h-2" />;
  return <p key={i} className="leading-relaxed">{line}</p>;
}

function Bubble({ msg, onCopy }: { msg: Message; onCopy: (t: string) => void }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-md shadow-indigo-200/50 dark:shadow-indigo-900/50">
          <Brain className="w-4 h-4 text-white" />
        </div>
      )}
      <div className={`group max-w-[75%] ${isUser ? '' : ''}`}>
        {isUser ? (
          <div className="bg-indigo-600 text-white rounded-3xl rounded-br-lg px-5 py-3 text-sm leading-relaxed shadow-sm">
            {msg.content}
          </div>
        ) : (
          <div className="relative">
            <div className="bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700/60 rounded-3xl rounded-bl-lg px-5 py-4 text-sm text-gray-700 dark:text-gray-200 shadow-sm backdrop-blur-sm space-y-1">
              {msg.content.split('\n').map((line, i) => renderLine(line, i))}
            </div>
            <button
              onClick={() => onCopy(msg.content)}
              className="absolute -bottom-6 left-0 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity px-1"
            >
              <Copy className="w-3 h-3" /> Copy
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex gap-3 justify-start">
      <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-indigo-200/50 dark:shadow-indigo-900/50">
        <Brain className="w-4 h-4 text-white" />
      </div>
      <div className="bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700/60 rounded-3xl rounded-bl-lg px-5 py-4 shadow-sm">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map(i => (
            <span key={i} className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.18}s` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AIBrainPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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
      }]);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'AI unavailable — configure your API key in Settings → AI.');
      setMessages(prev => prev.filter(m => m.id !== userMsg.id));
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [messages, loading]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] max-w-3xl mx-auto w-full">

      {/* Header */}
      <div className="flex items-center justify-between py-4 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-300/30 dark:shadow-indigo-900/40">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-900" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white leading-none">Business Brain</p>
            <p className="text-xs text-gray-400 mt-0.5">AI · Live data</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-3 py-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> New chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-6 pb-6 scroll-smooth">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-10">
            {/* Hero */}
            <div className="text-center">
              <div className="relative inline-flex mb-5">
                {/* Glow ring */}
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-violet-400 to-indigo-500 blur-xl opacity-30 scale-110" />
                <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-2xl shadow-indigo-400/30 dark:shadow-indigo-900/50">
                  <Brain className="w-9 h-9 text-white" />
                  <Sparkles className="w-4 h-4 text-yellow-300 absolute top-2 right-2" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                What can I help you decide?
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-xs mx-auto leading-relaxed">
                I have live access to your CRM, finance, HR, projects, and support data.
              </p>
            </div>

            {/* Prompt cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
              {PROMPTS.map(p => (
                <button
                  key={p.label}
                  onClick={() => send(p.text)}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 hover:shadow-md transition-all text-left group backdrop-blur-sm"
                >
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/60 dark:to-violet-950/60 flex items-center justify-center flex-shrink-0 group-hover:from-indigo-100 group-hover:to-violet-100 dark:group-hover:from-indigo-900/60 dark:group-hover:to-violet-900/60 transition-all">
                    <p.icon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors">{p.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6 pt-2">
            {messages.map(msg => (
              <Bubble
                key={msg.id}
                msg={msg}
                onCopy={t => { navigator.clipboard.writeText(t); toast.success('Copied'); }}
              />
            ))}
            {loading && <ThinkingBubble />}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 pb-2">
        <div className="relative flex items-end gap-3 bg-white dark:bg-gray-800/80 rounded-3xl px-5 py-3.5 border border-gray-200 dark:border-gray-700/60 shadow-lg shadow-gray-100/80 dark:shadow-gray-900/40 focus-within:border-indigo-400 dark:focus-within:border-indigo-500 transition-all backdrop-blur-sm">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask anything about your business…"
            rows={1}
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-none outline-none leading-relaxed"
            style={{ minHeight: '22px', maxHeight: '120px' }}
            onInput={e => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 120) + 'px';
            }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            className="w-9 h-9 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-md shadow-indigo-300/40 dark:shadow-indigo-900/40 flex-shrink-0"
          >
            {loading
              ? <Loader2 className="w-4 h-4 text-white animate-spin" />
              : <Send className="w-4 h-4 text-white" />}
          </button>
        </div>
        <p className="text-xs text-center text-gray-400 mt-2">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}

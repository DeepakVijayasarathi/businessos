'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Brain, Send, RefreshCw, Copy, X, Sparkles, Target, DollarSign, Users, Headphones, Lightbulb, AlertTriangle, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

const PROMPTS = [
  { label: 'Business summary', text: 'Give me a complete business summary for today.', icon: TrendingUp },
  { label: 'Top priorities', text: 'What are my top 3 priorities this week based on current data?', icon: Target },
  { label: 'Cash flow', text: 'Analyze my cash position and any financial risks.', icon: DollarSign },
  { label: 'Team & projects', text: 'How is the team doing? Any burnout or project risks?', icon: Users },
  { label: 'Support load', text: 'How is my support queue? Is ticket volume sustainable?', icon: Headphones },
  { label: 'Growth opportunities', text: 'Where are the biggest growth opportunities right now?', icon: Lightbulb },
  { label: 'Everything overdue', text: 'List everything overdue across invoices, tasks, tickets, and deals.', icon: AlertTriangle },
];

function Dots() {
  return (
    <div className="flex items-center gap-1 py-1 px-1">
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
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${isUser ? 'bg-indigo-600' : 'bg-gradient-to-br from-violet-500 to-indigo-600'}`}>
        {isUser
          ? <span className="text-white text-xs font-bold">You</span>
          : <Brain className="w-4 h-4 text-white" />}
      </div>
      <div className={`group max-w-[80%] flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
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
          <button onClick={() => onCopy(msg.content)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600">
            <Copy className="w-3.5 h-3.5" />
          </button>
        )}
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

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || loading) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: t, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const { data } = await api.post('/ai/brain-chat', { message: t, history });
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: data.data?.message || 'No response.', ts: Date.now() }]);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'AI unavailable — check Settings → AI.');
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
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-1 py-3 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md shadow-indigo-200 dark:shadow-indigo-900/40">
            <Brain className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 dark:text-white leading-tight">AI Business Brain</h1>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
              <span className="text-xs text-gray-400">Live access to all your data</span>
            </div>
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-3.5 h-3.5" /> New chat
          </button>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-1 scroll-smooth">
        {isEmpty ? (
          /* Welcome / prompt grid */
          <div className="flex flex-col items-center justify-center h-full gap-8 py-10">
            <div className="text-center">
              <div className="relative inline-block mb-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-xl shadow-indigo-300/30 dark:shadow-indigo-900/40">
                  <Brain className="w-8 h-8 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white dark:border-gray-900 flex items-center justify-center">
                  <Sparkles className="w-2.5 h-2.5 text-white" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">What can I help you decide?</h2>
              <p className="text-sm text-gray-500 mt-1.5 max-w-sm mx-auto">I have live access to your CRM, finance, HR, projects, and support — ask me anything about your business.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-2xl">
              {PROMPTS.map(p => (
                <button
                  key={p.label}
                  onClick={() => send(p.text)}
                  className="flex items-start gap-3 p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-700 hover:shadow-md transition-all text-left group"
                >
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-950/60 transition-colors">
                    <p.icon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{p.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5 py-4">
            {messages.map(msg => <Bubble key={msg.id} msg={msg} onCopy={t => { navigator.clipboard.writeText(t); toast.success('Copied'); }} />)}
            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Brain className="w-4 h-4 text-white" />
                </div>
                <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <Dots />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 pt-3 pb-1">
        <div className="flex items-end gap-3 bg-white dark:bg-gray-800 rounded-2xl px-4 py-3 border border-gray-200 dark:border-gray-700 shadow-sm focus-within:border-indigo-400 dark:focus-within:border-indigo-500 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask anything about your business…"
            rows={1}
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-none outline-none max-h-32 leading-relaxed"
            style={{ minHeight: '24px' }}
            onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 128) + 'px'; }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors flex-shrink-0"
          >
            {loading ? <RefreshCw className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
          </button>
        </div>
        <p className="text-xs text-center text-gray-400 mt-2">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}

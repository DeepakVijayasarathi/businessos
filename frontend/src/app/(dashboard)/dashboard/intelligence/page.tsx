'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import {
  Brain, Send, Loader2, Copy, RotateCcw, Sparkles, Target, DollarSign,
  Users, Headphones, Lightbulb, AlertTriangle, TrendingUp, Mic, MicOff,
  Pin, Download, ChevronRight, Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  followUps?: string[];
  pinned?: boolean;
}

const PROMPTS = [
  { label: 'Business snapshot', text: 'Give me a full business summary for today — revenue, pipeline, team, top risks.', icon: TrendingUp, color: 'from-indigo-500 to-violet-500' },
  { label: 'This week's priorities', text: 'What are my top 3 priorities this week based on current data?', icon: Target, color: 'from-violet-500 to-purple-500' },
  { label: 'Cash flow risks', text: 'Analyze my cash position and flag any financial risks I should act on now.', icon: DollarSign, color: 'from-emerald-500 to-teal-500' },
  { label: 'Growth opportunities', text: 'Where are the biggest growth opportunities in my business right now?', icon: Lightbulb, color: 'from-amber-500 to-orange-500' },
  { label: 'Team health', text: 'How is the team doing? Any burnout risk or resourcing issues?', icon: Users, color: 'from-blue-500 to-cyan-500' },
  { label: 'Support load', text: 'Is my support queue under control? What needs immediate attention?', icon: Headphones, color: 'from-pink-500 to-rose-500' },
  { label: 'Everything overdue', text: 'List everything overdue — invoices, tasks, tickets, and deals.', icon: AlertTriangle, color: 'from-red-500 to-orange-500' },
];

function renderContent(text: string) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('- ') || line.startsWith('• '))
      return (
        <p key={i} className="flex gap-2.5 leading-relaxed">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0 mt-[9px]" />
          <span>{line.slice(2)}</span>
        </p>
      );
    if (/^\d+\./.test(line)) {
      const dot = line.indexOf('.');
      return (
        <p key={i} className="flex gap-2.5 leading-relaxed">
          <span className="text-indigo-400 font-bold flex-shrink-0 w-5 text-right">{line.slice(0, dot)}.</span>
          <span>{line.slice(dot + 1).trim()}</span>
        </p>
      );
    }
    if (line.startsWith('**') && line.endsWith('**'))
      return <p key={i} className="font-semibold text-gray-900 dark:text-white mt-3 first:mt-0 text-[13px]">{line.slice(2, -2)}</p>;
    if (line === '') return <div key={i} className="h-1.5" />;
    return <p key={i} className="leading-relaxed">{line}</p>;
  });
}

function useVoiceInput(onResult: (t: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  const toggle = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { toast.error('Voice input not supported in this browser'); return; }
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const rec = new SpeechRecognition();
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [showPinned, setShowPinned] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { listening, toggle: toggleVoice } = useVoiceInput((t) => {
    setInput(t);
    setTimeout(() => inputRef.current?.focus(), 50);
  });

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
        followUps: data.data?.followUps || [],
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

  const togglePin = (id: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exportChat = () => {
    const text = messages.map(m => `${m.role === 'user' ? 'You' : 'AI Brain'}: ${m.content}`).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'ai-brain-conversation.txt'; a.click();
    URL.revokeObjectURL(url);
    toast.success('Conversation exported');
  };

  const pinnedMessages = messages.filter(m => pinnedIds.has(m.id) && m.role === 'assistant');
  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-[calc(100vh-80px)] gap-4">

      {/* Main chat column */}
      <div className="flex flex-col flex-1 min-w-0 max-w-3xl mx-auto w-full">

        {/* Header */}
        <div className="flex items-center justify-between py-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-300/30 dark:shadow-indigo-900/40">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-900 animate-pulse" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 dark:text-white">Business Brain</h1>
              <p className="text-xs text-gray-400">AI · Live data from all modules</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {pinnedMessages.length > 0 && (
              <button
                onClick={() => setShowPinned(p => !p)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${showPinned ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
              >
                <Pin className="w-3.5 h-3.5" /> {pinnedMessages.length} pinned
              </button>
            )}
            {messages.length > 0 && (
              <>
                <button onClick={exportChat} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Export conversation">
                  <Download className="w-4 h-4" />
                </button>
                <button onClick={() => { setMessages([]); setPinnedIds(new Set()); setShowPinned(false); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <RotateCcw className="w-3.5 h-3.5" /> New
                </button>
              </>
            )}
          </div>
        </div>

        {/* Pinned panel */}
        {showPinned && pinnedMessages.length > 0 && (
          <div className="mb-3 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 flex-shrink-0">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-1.5">
              <Pin className="w-3.5 h-3.5" /> Pinned Insights
            </p>
            <div className="space-y-2.5">
              {pinnedMessages.map(m => (
                <div key={m.id} className="text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 rounded-xl p-3 border border-amber-100 dark:border-amber-800/30 line-clamp-3">
                  {m.content.split('\n')[0]}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto scroll-smooth">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full gap-10 py-8">
              {/* Animated hero */}
              <div className="text-center">
                <div className="relative inline-flex mb-6">
                  <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-violet-400 to-indigo-500 blur-2xl opacity-25 scale-125 animate-pulse" />
                  <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-violet-400 to-indigo-500 blur-lg opacity-20 scale-110" />
                  <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-2xl shadow-indigo-400/30 dark:shadow-indigo-900/50">
                    <Brain className="w-11 h-11 text-white" />
                    <Sparkles className="w-5 h-5 text-yellow-300 absolute top-3 right-3 animate-spin" style={{ animationDuration: '3s' }} />
                  </div>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">What can I help you decide?</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-xs mx-auto leading-relaxed">
                  I have live access to every module — CRM, finance, HR, projects, and support.
                </p>
              </div>

              {/* Prompt grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 w-full">
                {PROMPTS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => send(p.text)}
                    className="group flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60 hover:border-transparent hover:shadow-lg transition-all text-left relative overflow-hidden"
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${p.color} opacity-0 group-hover:opacity-5 dark:group-hover:opacity-10 transition-opacity rounded-2xl`} />
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${p.color} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                      <p.icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">{p.label}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 ml-auto flex-shrink-0 group-hover:text-indigo-400 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6 py-4 pb-8">
              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-md shadow-indigo-200/40 dark:shadow-indigo-900/40">
                      <Brain className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div className={`max-w-[78%] flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    {msg.role === 'user' ? (
                      <div className="bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-3xl rounded-br-lg px-5 py-3 text-sm leading-relaxed shadow-md shadow-indigo-200/30 dark:shadow-indigo-900/30">
                        {msg.content}
                      </div>
                    ) : (
                      <>
                        <div className="group relative bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700/60 rounded-3xl rounded-bl-lg px-5 py-4 text-sm text-gray-700 dark:text-gray-200 shadow-sm backdrop-blur-sm">
                          <div className="space-y-1">{renderContent(msg.content)}</div>
                          {/* Action bar */}
                          <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50">
                            <button
                              onClick={() => { navigator.clipboard.writeText(msg.content); toast.success('Copied'); }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                              <Copy className="w-3 h-3" /> Copy
                            </button>
                            <button
                              onClick={() => togglePin(msg.id)}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${pinnedIds.has(msg.id) ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20'}`}
                            >
                              <Pin className="w-3 h-3" /> {pinnedIds.has(msg.id) ? 'Pinned' : 'Pin'}
                            </button>
                          </div>
                        </div>
                        {/* Follow-up suggestions */}
                        {msg.followUps && msg.followUps.length > 0 && (
                          <div className="flex flex-wrap gap-2 px-1">
                            {msg.followUps.map((q, i) => (
                              <button
                                key={i}
                                onClick={() => send(q)}
                                disabled={loading}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800/60 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 hover:border-indigo-300 transition-all disabled:opacity-50"
                              >
                                <Zap className="w-3 h-3" /> {q}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}

              {/* Thinking */}
              {loading && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-indigo-200/40 dark:shadow-indigo-900/40">
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
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex-shrink-0 pb-2 pt-1">
          <div className="relative flex items-end gap-3 bg-white dark:bg-gray-800/80 rounded-3xl px-5 py-3.5 border border-gray-200 dark:border-gray-700/60 shadow-lg shadow-gray-100 dark:shadow-gray-900/40 focus-within:border-indigo-400 dark:focus-within:border-indigo-500 focus-within:shadow-indigo-100/50 dark:focus-within:shadow-indigo-900/20 transition-all backdrop-blur-sm">
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
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={toggleVoice}
                className={`w-9 h-9 rounded-2xl flex items-center justify-center transition-all ${listening ? 'bg-red-500 shadow-md shadow-red-300/40 dark:shadow-red-900/40' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500'}`}
                title="Voice input"
              >
                {listening ? <MicOff className="w-4 h-4 text-white" /> : <Mic className="w-4 h-4" />}
              </button>
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || loading}
                className="w-9 h-9 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-md shadow-indigo-300/30 dark:shadow-indigo-900/40"
              >
                {loading ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
              </button>
            </div>
          </div>
          <p className="text-xs text-center text-gray-400 mt-2">Enter to send · Shift+Enter for new line · Mic for voice</p>
        </div>
      </div>
    </div>
  );
}

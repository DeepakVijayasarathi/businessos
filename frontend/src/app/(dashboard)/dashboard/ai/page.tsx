'use client';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '@/lib/api';
import { Send, Bot, User, Sparkles, Loader2, Plus, Trash2, MessageSquare, Zap } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';
interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function AIPage() {
  const [sessionId] = useState(() => typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2));
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hello! I'm your BusinessOS AI assistant. I can help you with CRM insights, drafting emails, analyzing data, answering questions about your business, and much more. What can I help you with today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [activeType, setActiveType] = useState('support');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: aiStatus } = useQuery({
    queryKey: ['ai-status'],
    queryFn: async () => { const { data } = await api.get('/ai/status'); return data.data; },
  });

  const { data: conversations } = useQuery({
    queryKey: ['ai-conversations'],
    queryFn: async () => {
      const { data } = await api.get('/ai/conversations');
      return data.data;
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
      const { data } = await api.post('/ai/chat', { message, sessionId, type: activeType, history });
      return data.data;
    },
    onSuccess: (data) => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
      }]);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'AI unavailable. Please configure your API key in Settings.');
    },
  });

  const handleSend = () => {
    const text = input.trim();
    if (!text || sendMutation.isPending) return;

    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: new Date() }]);
    setInput('');
    sendMutation.mutate(text);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const quickActions = [
    { label: 'Qualify a lead', prompt: 'Help me qualify a new lead from the tech industry' },
    { label: 'Draft follow-up email', prompt: 'Draft a professional follow-up email for a potential client' },
    { label: 'Analyze sales pipeline', prompt: 'Help me analyze my sales pipeline and identify bottlenecks' },
    { label: 'HR policy question', prompt: 'What is a standard employee leave policy?' },
    { label: 'Create project plan', prompt: 'Help me create a project plan for a software implementation' },
    { label: 'Invoice reminder', prompt: 'Draft a polite payment reminder email for an overdue invoice' },
  ];

  const aiTypes = [
    { id: 'support', label: 'Support', icon: '🎧' },
    { id: 'sales', label: 'Sales', icon: '💼' },
    { id: 'hr', label: 'HR', icon: '👥' },
    { id: 'internal', label: 'Internal', icon: '🏢' },
    { id: 'lead', label: 'Lead Qual', icon: '🎯' },
  ];

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-4">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 flex flex-col gap-4">
        <div className="glass-card rounded-2xl p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">AI Type</h3>
          <div className="space-y-1">
            {aiTypes.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveType(t.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${activeType === t.id ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
              >
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 flex-1 overflow-hidden">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Recent Conversations</h3>
          <div className="space-y-2 overflow-y-auto">
            {conversations?.slice(0, 10).map((conv: any) => (
              <div key={conv.id} className="p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 capitalize">{conv.type}</p>
                <p className="text-xs text-gray-400">{formatRelativeTime(conv.updatedAt)}</p>
              </div>
            )) || <p className="text-xs text-gray-400">No conversations yet</p>}
          </div>
        </div>
      </div>

      {/* Main Chat */}
      <div className="flex-1 flex flex-col glass-card rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">BusinessOS AI</h2>
            <p className="text-xs text-gray-500 capitalize">
              {aiStatus ? `Powered by ${aiStatus.provider === 'openai' ? 'ChatGPT' : 'Claude'} · ${aiStatus.model}` : 'Loading...'} · {activeType} mode
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {aiStatus && (
              <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${
                aiStatus.activeKeyConfigured
                  ? 'bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400'
                  : 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400'
              }`}>
                <Zap className="w-3 h-3" />
                {aiStatus.activeKeyConfigured ? (aiStatus.provider === 'openai' ? 'GPT-4o' : 'Claude') : 'No API Key'}
              </span>
            )}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${aiStatus?.activeKeyConfigured ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`} />
              <span className="text-xs text-gray-500">{aiStatus?.activeKeyConfigured ? 'Ready' : 'Configure API Key'}</span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                msg.role === 'assistant'
                  ? 'bg-gradient-to-br from-indigo-500 to-purple-500'
                  : 'bg-gray-300 dark:bg-gray-600'
              }`}>
                {msg.role === 'assistant' ? <Bot className="w-4 h-4 text-white" /> : <User className="w-4 h-4 text-gray-700 dark:text-white" />}
              </div>
              <div className={`max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                <div className={`rounded-2xl px-4 py-3 text-sm ${
                  msg.role === 'assistant'
                    ? 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200'
                    : 'bg-indigo-600 text-white'
                }`}>
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                </div>
                <span className="text-xs text-gray-400 px-1">
                  {msg.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}

          {sendMutation.isPending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                  <span className="text-sm text-gray-500">Thinking...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Quick actions */}
        {messages.length === 1 && (
          <div className="px-4 pb-2">
            <p className="text-xs text-gray-400 mb-2">Quick actions:</p>
            <div className="flex flex-wrap gap-2">
              {quickActions.map((qa, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(qa.prompt); inputRef.current?.focus(); }}
                  className="px-3 py-1.5 text-xs rounded-xl border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
                >
                  {qa.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-end gap-3 bg-gray-50 dark:bg-gray-800 rounded-2xl p-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Ask anything about your business..."
              rows={1}
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none resize-none max-h-32"
              style={{ minHeight: '1.5rem' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sendMutation.isPending}
              className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-gray-400 text-center mt-2">Press Enter to send · Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  );
}

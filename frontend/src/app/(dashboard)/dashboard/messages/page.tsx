'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import toast from 'react-hot-toast';
import {
  Search, Plus, Send, MoreVertical, Phone, Video, Smile,
  Paperclip, Check, CheckCheck, MessageSquare, Users, X,
  ChevronLeft, Wifi, WifiOff, Circle
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  sender?: { id: string; firstName: string; lastName: string; avatar?: string };
}

interface Conversation {
  id: string;
  type: string;
  name?: string;
  phone?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  isGroup: boolean;
  unreadCount: number;
  participants: Array<{
    userId: string;
    user: { id: string; firstName: string; lastName: string; avatar?: string };
  }>;
}

export default function MessagesPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch conversations
  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ['conversations'],
    queryFn: async () => { const { data } = await api.get('/messaging/conversations'); return data.data; },
    refetchInterval: 10000,
  });

  // Fetch messages for active conversation
  const { data: messagesData } = useQuery({
    queryKey: ['messages', activeConvId],
    queryFn: async () => { const { data } = await api.get(`/messaging/conversations/${activeConvId}/messages`); return data; },
    enabled: !!activeConvId,
    refetchOnWindowFocus: false,
  });

  const messages: Message[] = useMemo(() => messagesData?.data || [], [messagesData]);

  // Fetch users for new chat
  const { data: companyUsers = [] } = useQuery({
    queryKey: ['messaging-users'],
    queryFn: async () => { const { data } = await api.get('/messaging/users'); return data.data; },
    enabled: showNewChat,
  });

  // Send message
  const sendMutation = useMutation({
    mutationFn: (content: string) => api.post(`/messaging/conversations/${activeConvId}/messages`, { content }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['messages', activeConvId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
      setMessageInput('');
    },
    onError: () => toast.error('Failed to send message'),
  });

  // Start new conversation
  const startChatMutation = useMutation({
    mutationFn: (userId: string) => api.post('/messaging/conversations', { userIds: [userId] }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      setActiveConvId(res.data.data.id);
      setShowNewChat(false);
    },
  });

  // Track latest activeConvId for use inside the socket handler without re-subscribing
  const activeConvIdRef = useRef(activeConvId);
  useEffect(() => { activeConvIdRef.current = activeConvId; }, [activeConvId]);

  // Socket.IO real-time
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('bos_token');
    if (!token) return;
    try {
      const io = require('socket.io-client');
      const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000', { auth: { token } });
      socketRef.current = socket;
      socket.on('connect', () => setIsConnected(true));
      socket.on('disconnect', () => setIsConnected(false));
      socket.emit('join-user', user.id);
      socket.on('message:new', ({ conversationId, message }: any) => {
        qc.setQueryData(['messages', conversationId], (old: any) => {
          if (!old) return old;
          if ((old.data || []).some((m: any) => m.id === message.id)) return old;
          return { ...old, data: [...(old.data || []), message] };
        });
        qc.invalidateQueries({ queryKey: ['conversations'] });
        if (conversationId !== activeConvIdRef.current) {
          const senderName = message.sender ? `${message.sender.firstName} ${message.sender.lastName}` : 'Someone';
          toast(`${senderName}: ${message.content?.slice(0, 50)}`, { icon: '💬', duration: 4000 });
        }
      });
    } catch {}
    return () => { socketRef.current?.disconnect(); };
  }, [user, qc]);

  // Join conversation room when switching
  useEffect(() => {
    if (activeConvId && socketRef.current) {
      socketRef.current.emit('join-conversation', activeConvId);
    }
  }, [activeConvId]);

  // Close new chat modal on Escape
  useEffect(() => {
    if (!showNewChat) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowNewChat(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showNewChat]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!messageInput.trim() || !activeConvId) return;
    sendMutation.mutate(messageInput.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const getConvName = (conv: Conversation) => {
    if (conv.name) return conv.name;
    if (conv.type === 'whatsapp') return conv.phone || 'WhatsApp';
    const other = conv.participants.find(p => p.userId !== user?.id);
    return other ? `${other.user.firstName} ${other.user.lastName}` : 'Unknown';
  };

  const getConvInitial = (conv: Conversation) => {
    const name = getConvName(conv);
    return name.charAt(0).toUpperCase();
  };

  const getConvColor = (conv: Conversation) => {
    const colors = ['bg-indigo-500', 'bg-purple-500', 'bg-green-500', 'bg-blue-500', 'bg-rose-500', 'bg-amber-500'];
    const hash = conv.id.charCodeAt(0) % colors.length;
    return colors[hash];
  };

  const activeConv = conversations.find(c => c.id === activeConvId);
  const filteredConvs = conversations.filter(c =>
    getConvName(c).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-6 overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
      {/* Left Panel — Conversation List */}
      <div className={`w-80 flex-shrink-0 flex flex-col bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 ${activeConvId ? 'hidden md:flex' : 'flex'}`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900 dark:text-white text-lg">Messages</h2>
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1 text-xs ${isConnected ? 'text-green-500' : 'text-gray-400'}`}>
                <Circle className={`w-2 h-2 fill-current`} />
                {isConnected ? 'Live' : 'Offline'}
              </div>
              <button
                onClick={() => setShowNewChat(true)}
                aria-label="New conversation"
                className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-9 pr-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 outline-none"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConvs.length === 0 ? (
            <div className="p-8 text-center">
              <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm font-medium">No conversations yet</p>
              <p className="text-gray-400 text-xs mt-1">Click + to start a new chat</p>
            </div>
          ) : (
            filteredConvs.map(conv => (
              <button
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left border-b border-gray-100 dark:border-gray-800/50 ${activeConvId === conv.id ? 'bg-indigo-50 dark:bg-indigo-950/30 border-l-2 border-l-indigo-500' : ''}`}
              >
                <div className={`w-11 h-11 rounded-full ${getConvColor(conv)} flex items-center justify-center text-white font-semibold flex-shrink-0 relative`}>
                  {getConvInitial(conv)}
                  {conv.type === 'whatsapp' && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-[8px]">W</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{getConvName(conv)}</p>
                    <p className="text-xs text-gray-400 flex-shrink-0 ml-2">{conv.lastMessageAt ? formatRelativeTime(conv.lastMessageAt) : ''}</p>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-gray-500 truncate">{conv.lastMessage || 'No messages yet'}</p>
                    {conv.unreadCount > 0 && (
                      <span className="ml-2 flex-shrink-0 w-5 h-5 bg-indigo-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right Panel — Chat Window */}
      <div className={`flex-1 flex flex-col bg-gray-50 dark:bg-gray-900 ${!activeConvId ? 'hidden md:flex' : 'flex'}`}>
        {!activeConvId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg">
              <MessageSquare className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">BusinessOS Messenger</h3>
            <p className="text-gray-500 text-sm max-w-xs">Select a conversation or start a new chat to message your team or WhatsApp contacts</p>
            <button onClick={() => setShowNewChat(true)} className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
              <Plus className="w-4 h-4" /> New Message
            </button>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="px-4 py-3 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
              <button onClick={() => setActiveConvId(null)} aria-label="Back to conversations" className="md:hidden w-8 h-8 flex items-center justify-center text-gray-500">
                <ChevronLeft className="w-5 h-5" />
              </button>
              {activeConv && (
                <div className={`w-10 h-10 rounded-full ${getConvColor(activeConv)} flex items-center justify-center text-white font-semibold flex-shrink-0`}>
                  {getConvInitial(activeConv)}
                </div>
              )}
              <div className="flex-1">
                <p className="font-semibold text-sm text-gray-900 dark:text-white">{activeConv ? getConvName(activeConv) : ''}</p>
                <p className="text-xs text-green-500">{isConnected ? 'Online' : 'Connecting...'}</p>
              </div>
              <div className="flex items-center gap-1">
                <button disabled aria-label="Voice call" title="Coming soon" className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-300 dark:text-gray-600 cursor-not-allowed"><Phone className="w-4 h-4" /></button>
                <button disabled aria-label="Video call" title="Coming soon" className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-300 dark:text-gray-600 cursor-not-allowed"><Video className="w-4 h-4" /></button>
                <button disabled aria-label="More options" title="Coming soon" className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-300 dark:text-gray-600 cursor-not-allowed"><MoreVertical className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              {messages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center h-full text-center">
                  <p className="text-gray-400 text-sm">No messages yet. Say hello! 👋</p>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isMe = msg.senderId === user?.id;
                  const showAvatar = !isMe && (i === 0 || messages[i - 1]?.senderId !== msg.senderId);
                  const showTime = i === messages.length - 1 || messages[i + 1]?.senderId !== msg.senderId;

                  return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} items-end gap-2`}>
                      {!isMe && (
                        <div className={`w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${showAvatar ? 'opacity-100' : 'opacity-0'}`}>
                          {msg.sender?.firstName?.[0]}
                        </div>
                      )}
                      <div className={`max-w-[65%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                        {!isMe && showAvatar && (
                          <p className="text-xs text-gray-400 mb-1 ml-1">{msg.sender?.firstName} {msg.sender?.lastName}</p>
                        )}
                        <div className={`px-4 py-2.5 rounded-2xl text-sm ${isMe
                          ? 'bg-indigo-600 text-white rounded-br-sm'
                          : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-sm shadow-sm border border-gray-100 dark:border-gray-700'
                        }`}>
                          {msg.content}
                        </div>
                        {showTime && (
                          <div className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <p className="text-xs text-gray-400">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            {isMe && (msg.isRead ? <CheckCheck className="w-3 h-3 text-indigo-400" /> : <Check className="w-3 h-3 text-gray-400" />)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="px-4 py-3 bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <button disabled aria-label="Attach file" title="Coming soon" className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-300 dark:text-gray-600 cursor-not-allowed flex-shrink-0">
                  <Paperclip className="w-4 h-4" />
                </button>
                <div className="flex-1 flex items-center bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 py-2 gap-2">
                  <input
                    ref={inputRef}
                    value={messageInput}
                    onChange={e => setMessageInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none"
                  />
                  <button disabled aria-label="Insert emoji" title="Coming soon" className="text-gray-300 dark:text-gray-600 cursor-not-allowed"><Smile className="w-4 h-4" /></button>
                </div>
                <button
                  onClick={handleSend}
                  disabled={!messageInput.trim() || sendMutation.isPending}
                  aria-label="Send message"
                  className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">New Message</h3>
              <button onClick={() => setShowNewChat(false)} aria-label="Close new message dialog" className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 max-h-72 overflow-y-auto">
              {companyUsers.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">No other users in your company</p>
              ) : (
                companyUsers.map((u: any) => (
                  <button
                    key={u.id}
                    onClick={() => startChatMutation.mutate(u.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-semibold flex-shrink-0">
                      {u.firstName?.[0]}{u.lastName?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{u.firstName} {u.lastName}</p>
                      <p className="text-xs text-gray-500">{u.email}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

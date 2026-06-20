'use client';
import { Bell, Search, Sun, Moon, LogOut, User, Settings, X, CheckCheck, ExternalLink, Menu } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuthStore } from '@/store/auth.store';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';

const CommandPalette = dynamic(() => import('./CommandPalette'), { ssr: false });

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();
  const [showMenu, setShowMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => { const { data } = await api.get('/notifications?limit=15'); return data.data; },
    refetchInterval: 30000,
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  // Socket.IO for live notifications
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('bos_token');
    if (!token) return;
    let socket: any;
    try {
      const io = require('socket.io-client');
      socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000', {
        auth: { token },
      });
      socket.emit('join-user', user.id);
      socket.on('notification:new', (notif: any) => {
        qc.invalidateQueries({ queryKey: ['notifications'] });
        toast(notif.title, { icon: '🔔', duration: 4000 });
      });
    } catch {}
    return () => { socket?.disconnect(); };
  }, [user, qc]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Keyboard shortcut Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(true);
      }
      if (e.key === 'Escape') { setShowSearch(false); setShowNotifications(false); setShowMenu(false); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const unreadCount = notifData?.unreadCount || 0;
  const notifications = notifData?.notifications || [];

  const typeColor: Record<string, string> = {
    lead_created: 'bg-green-500',
    deal_won: 'bg-yellow-500',
    ticket_created: 'bg-red-500',
    invoice_paid: 'bg-emerald-500',
    default: 'bg-indigo-500',
  };

  return (
    <>
      <header className="h-16 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex items-center justify-between px-4 md:px-6 flex-shrink-0 z-40 relative gap-2">
        <button
          onClick={onMenuClick}
          aria-label="Open menu"
          className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors md:hidden flex-shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex-1" />

        {/* Search trigger — full bar on desktop, icon-only on mobile */}
        <button
          onClick={() => setShowSearch(true)}
          aria-label="Search"
          className="hidden md:flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-2 w-64 text-left hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <Search className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-400 flex-1">Search... </span>
          <kbd className="text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 text-gray-400">⌘K</kbd>
        </button>
        <button
          onClick={() => setShowSearch(true)}
          aria-label="Search"
          className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors flex-shrink-0"
        >
          <Search className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 ml-2 md:ml-4">
          {/* Theme */}
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Notification bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              aria-label="Notifications"
              className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 relative transition-colors"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="fixed left-4 right-4 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-11 sm:w-96 glass-card rounded-2xl shadow-2xl z-50 overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Notifications {unreadCount > 0 && <span className="ml-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{unreadCount}</span>}</h3>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button onClick={() => markAllRead.mutate()} className="text-xs text-indigo-600 dark:text-indigo-400 flex items-center gap-1 hover:underline">
                        <CheckCheck className="w-3 h-3" /> Mark all read
                      </button>
                    )}
                    <button onClick={() => setShowNotifications(false)} aria-label="Close notifications" className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="max-h-96 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-sm">
                      <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>No notifications yet</p>
                    </div>
                  ) : notifications.map((n: any) => (
                    <div
                      key={n.id}
                      className={`flex gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors ${!n.isRead ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''}`}
                      onClick={() => {
                        if (!n.isRead) markRead.mutate(n.id);
                        setShowNotifications(false);
                        if (n.link) { router.push(n.link); }
                      }}
                    >
                      <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${typeColor[n.type] || typeColor.default}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{n.title}</p>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{n.message}</p>
                        <p className="text-xs text-gray-400 mt-1">{formatRelativeTime(n.createdAt)}</p>
                      </div>
                      {n.link && <ExternalLink className="w-3 h-3 text-gray-400 flex-shrink-0 mt-1" />}
                    </div>
                  ))}
                </div>
                <div className="p-3 border-t border-gray-200 dark:border-gray-700 text-center">
                  <button onClick={() => setShowNotifications(false)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">View all activity</button>
                </div>
              </div>
            )}
          </div>

          {/* User menu */}
          <div className="relative">
            <button onClick={() => setShowMenu(!showMenu)} className="flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl px-2 py-1.5 transition-colors">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-semibold">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-xs font-medium text-gray-900 dark:text-white">{user?.firstName} {user?.lastName}</p>
                <p className="text-xs text-gray-500">{user?.company?.name}</p>
              </div>
            </button>
            {showMenu && (
              <div className="absolute right-0 top-12 w-48 glass-card rounded-xl shadow-xl z-50 overflow-hidden">
                <Link href="/dashboard/settings" className="flex items-center gap-2 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => setShowMenu(false)}>
                  <Settings className="w-4 h-4" /> Settings
                </Link>
                <hr className="border-gray-200 dark:border-gray-700" />
                <button onClick={async () => { await logout(); router.push('/login'); }} className="flex items-center gap-2 w-full px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-left">
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Command Palette */}
      {showSearch && <CommandPalette onClose={() => setShowSearch(false)} />}
    </>
  );
}

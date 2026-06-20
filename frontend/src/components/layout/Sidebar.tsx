'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Users, Briefcase, FolderKanban, DollarSign,
  Headphones, BookOpen, FileText, Bot, Workflow, Calendar,
  MessageSquare, Mail, BarChart3, Settings, Shield, Building2,
  Target, UserSquare, Zap, Globe, Bell, ChevronLeft, ChevronRight,
  TrendingUp, Brain, X,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
  { name: 'CRM', href: '/dashboard/crm', icon: Target, children: [
    { name: 'Leads', href: '/dashboard/crm/leads' },
    { name: 'Contacts', href: '/dashboard/crm/contacts' },
    { name: 'Companies', href: '/dashboard/crm/companies' },
    { name: 'Pipeline', href: '/dashboard/crm/pipeline' },
    { name: 'Activities', href: '/dashboard/crm/activities' },
  ]},
  { name: 'HR Management', href: '/dashboard/hr', icon: UserSquare, children: [
    { name: 'Employees', href: '/dashboard/hr/employees' },
    { name: 'Attendance', href: '/dashboard/hr/attendance' },
    { name: 'Leave', href: '/dashboard/hr/leave' },
    { name: 'Payroll', href: '/dashboard/hr/payroll' },
    { name: 'Performance', href: '/dashboard/hr/performance' },
  ]},
  { name: 'Projects', href: '/dashboard/projects', icon: FolderKanban },
  { name: 'Finance', href: '/dashboard/finance', icon: DollarSign, children: [
    { name: 'Invoices', href: '/dashboard/finance/invoices' },
    { name: 'Expenses', href: '/dashboard/finance/expenses' },
    { name: 'Income', href: '/dashboard/finance/income' },
    { name: 'Reports', href: '/dashboard/finance/reports' },
  ]},
  { name: 'Clients', href: '/dashboard/clients', icon: Users },
  { name: 'Helpdesk', href: '/dashboard/helpdesk', icon: Headphones },
  { name: 'Knowledge Base', href: '/dashboard/knowledgebase', icon: BookOpen },
  { name: 'Documents', href: '/dashboard/documents', icon: FileText },
  { name: 'AI Intelligence', href: '/dashboard/intelligence', icon: Brain },
  { name: 'AI Assistant', href: '/dashboard/ai', icon: Bot },
  { name: 'Workflows', href: '/dashboard/workflow', icon: Workflow },
  { name: 'Appointments', href: '/dashboard/appointments', icon: Calendar },
  { name: 'WhatsApp', href: '/dashboard/whatsapp', icon: MessageSquare },
  { name: 'Email', href: '/dashboard/email', icon: Mail },
  { name: 'Marketing', href: '/dashboard/marketing', icon: Globe },
  { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

const adminNav = [
  { name: 'Super Admin', href: '/admin', icon: Shield },
];

interface SidebarProps {
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ isMobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>(['CRM']);

  const toggleItem = (name: string) => {
    setExpandedItems(prev =>
      prev.includes(name) ? prev.filter(i => i !== name) : [...prev, name]
    );
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  // Close the mobile drawer on every route change
  useEffect(() => {
    onMobileClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside className={cn(
        'h-screen flex flex-col bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 transition-all duration-300 flex-shrink-0',
        'fixed inset-y-0 left-0 z-50 md:static md:z-auto',
        isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        collapsed ? 'md:w-16' : 'md:w-64',
        'w-64',
      )}>
        {/* Logo */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          {!collapsed && (
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-gray-900 dark:text-white text-sm">BusinessOS AI</span>
            </Link>
          )}
          {collapsed && (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center mx-auto">
              <Zap className="w-4 h-4 text-white" />
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hidden md:flex"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
          <button
            onClick={onMobileClose}
            aria-label="Close menu"
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 md:hidden"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navigation.map((item) => (
          <div key={item.name}>
            {item.children ? (
              <div>
                <button
                  onClick={() => toggleItem(item.name)}
                  className={cn('sidebar-item w-full', isActive(item.href) && 'active')}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.name}</span>
                      <ChevronRight className={cn('w-3 h-3 transition-transform', expandedItems.includes(item.name) && 'rotate-90')} />
                    </>
                  )}
                </button>
                {!collapsed && expandedItems.includes(item.name) && (
                  <div className="ml-4 mt-1 space-y-1 pl-3 border-l border-gray-200 dark:border-gray-700">
                    {item.children.map((child) => (
                      <Link key={child.href} href={child.href} className={cn('sidebar-item text-xs', isActive(child.href) && 'active')}>
                        {child.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Link href={item.href} className={cn('sidebar-item', isActive(item.href) && 'active')} title={collapsed ? item.name : undefined}>
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            )}
          </div>
        ))}

        {user?.isSuperAdmin && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
            {adminNav.map((item) => (
              <Link key={item.href} href={item.href} className={cn('sidebar-item', isActive(item.href) && 'active')}>
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* User */}
      {!collapsed && user && (
        <div className="p-3 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
              {user.firstName[0]}{user.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{user.firstName} {user.lastName}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
            </div>
          </div>
        </div>
      )}
      </aside>
    </>
  );
}

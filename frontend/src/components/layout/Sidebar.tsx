'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Users, Briefcase, FolderKanban, DollarSign,
  Headphones, BookOpen, FileText, Bot, Workflow, Calendar,
  MessageSquare, Mail, BarChart3, Settings, Shield, Building2,
  Target, UserSquare, Zap, Globe, Bell, ChevronLeft, ChevronRight,
  TrendingUp, Brain, X, Clock, ShoppingCart, FileSignature, UserCheck, Share2,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const navigation = [
  { name: 'Dashboard',      href: '/dashboard',              icon: LayoutDashboard, module: 'dashboard' },
  { name: 'Messages',       href: '/dashboard/messages',     icon: MessageSquare,   module: 'messages' },
  { name: 'CRM', href: '/dashboard/crm', icon: Target, module: 'crm', children: [
    { name: 'Leads',      href: '/dashboard/crm/leads' },
    { name: 'Contacts',   href: '/dashboard/crm/contacts' },
    { name: 'Companies',  href: '/dashboard/crm/companies' },
    { name: 'Pipeline',   href: '/dashboard/crm/pipeline' },
    { name: 'Activities', href: '/dashboard/crm/activities' },
  ]},
  { name: 'HR Management', href: '/dashboard/hr', icon: UserSquare, module: 'hr', children: [
    { name: 'Employees',   href: '/dashboard/hr/employees' },
    { name: 'Attendance',  href: '/dashboard/hr/attendance' },
    { name: 'Leave',       href: '/dashboard/hr/leave' },
    { name: 'Payroll',     href: '/dashboard/hr/payroll' },
    { name: 'Performance', href: '/dashboard/hr/performance' },
    { name: 'Recruitment', href: '/dashboard/hr/recruitment' },
  ]},
  { name: 'Projects',      href: '/dashboard/projects',     icon: FolderKanban, module: 'projects' },
  { name: 'Finance', href: '/dashboard/finance', icon: DollarSign, module: 'finance', children: [
    { name: 'Invoices',        href: '/dashboard/finance/invoices' },
    { name: 'Expenses',        href: '/dashboard/finance/expenses' },
    { name: 'Income',          href: '/dashboard/finance/income' },
    { name: 'Purchase Orders', href: '/dashboard/finance/purchase-orders' },
    { name: 'Reports',         href: '/dashboard/finance/reports' },
  ]},
  { name: 'Time Tracking',  href: '/dashboard/timesheets',    icon: Clock,       module: 'projects' },
  { name: 'Contracts',     href: '/dashboard/contracts',     icon: FileSignature, module: 'finance' },
  { name: 'OKRs & Goals',  href: '/dashboard/okr',           icon: TrendingUp,  module: 'analytics' },
  { name: 'Clients',       href: '/dashboard/clients',       icon: Users,       module: 'clients' },
  { name: 'Helpdesk',       href: '/dashboard/helpdesk',      icon: Headphones,  module: 'helpdesk' },
  { name: 'Knowledge Base', href: '/dashboard/knowledgebase', icon: BookOpen,    module: 'knowledgebase' },
  { name: 'Documents',      href: '/dashboard/documents',     icon: FileText,    module: 'documents' },
  { name: 'AI Intelligence',href: '/dashboard/intelligence',  icon: Brain,       module: 'intelligence' },
  { name: 'AI Assistant',   href: '/dashboard/ai',            icon: Bot,         module: 'ai' },
  { name: 'Workflows',      href: '/dashboard/workflow',      icon: Workflow,    module: 'workflow' },
  { name: 'Appointments',   href: '/dashboard/appointments',  icon: Calendar,    module: 'appointments' },
  { name: 'WhatsApp',       href: '/dashboard/whatsapp',      icon: MessageSquare, module: 'whatsapp' },
  { name: 'Email',          href: '/dashboard/email',         icon: Mail,        module: 'email' },
  { name: 'Social Studio',   href: '/dashboard/social',         icon: Share2,      module: 'marketing' },
  { name: 'Marketing',      href: '/dashboard/marketing',     icon: TrendingUp,  module: 'marketing' },
  { name: 'Analytics',      href: '/dashboard/analytics',     icon: BarChart3,   module: 'analytics' },
  { name: 'Notifications',   href: '/dashboard/notifications',  icon: Bell,        module: 'dashboard' },
  { name: 'Settings',       href: '/dashboard/settings',      icon: Settings,    module: 'settings' },
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
  const { hasModule } = usePermissions();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>(['CRM']);

  const { data: company } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => { const { data } = await api.get('/settings/company'); return data.data; },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const visibleNav = navigation.filter(item => hasModule(item.module ?? 'dashboard'));

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
            <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
              {company?.logo ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={company.logo.startsWith('http') ? company.logo : `${API_BASE}${company.logo}`}
                  alt={company.name || 'Logo'}
                  className="w-8 h-8 rounded-lg object-contain bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-4 h-4 text-white" />
                </div>
              )}
              <span className="font-bold text-gray-900 dark:text-white text-sm truncate">
                {company?.name || 'BusinessOS AI'}
              </span>
            </Link>
          )}
          {collapsed && (
            <Link href="/dashboard" className="mx-auto">
              {company?.logo ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={company.logo.startsWith('http') ? company.logo : `${API_BASE}${company.logo}`}
                  alt={company?.name || 'Logo'}
                  className="w-8 h-8 rounded-lg object-contain bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-white" />
                </div>
              )}
            </Link>
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
        {visibleNav.map((item) => (
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

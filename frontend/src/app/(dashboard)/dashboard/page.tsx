'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { formatCurrency, formatRelativeTime } from '@/lib/utils';
import {
  TrendingUp, TrendingDown, Users, Target, DollarSign, Headphones,
  FolderKanban, Bot, Calendar, ArrowUpRight, Briefcase, AlertTriangle,
  Plus, Clock, CheckCircle2, Zap, FileText,
} from 'lucide-react';

const RevenueAreaChart = dynamic(() => import('./DashboardCharts').then(m => m.RevenueAreaChart), { ssr: false });
const LeadSourcesPieChart = dynamic(() => import('./DashboardCharts').then(m => m.LeadSourcesPieChart), { ssr: false });

function StatCard({ title, value, change, icon: Icon, color, href }: any) {
  const isPositive = parseFloat(change) >= 0;
  const card = (
    <div className={`glass-card rounded-2xl p-5 ${href ? 'hover:shadow-lg transition-shadow cursor-pointer' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${isPositive ? 'text-green-700 bg-green-50 dark:bg-green-950/30' : 'text-red-600 bg-red-50 dark:bg-red-950/30'}`}>
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(parseFloat(change || '0'))}% MoM
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{typeof value === 'number' ? value.toLocaleString() : value ?? '—'}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{title}</p>
    </div>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

const COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

function daysOverdue(dueDate: string) {
  return Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000);
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [quickAction, setQuickAction] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => { const { data } = await api.get('/analytics/dashboard'); return data.data; },
  });

  const { data: revenueData } = useQuery({
    queryKey: ['revenue-chart'],
    queryFn: async () => { const { data } = await api.get('/analytics/revenue'); return data.data; },
  });

  const { data: leadSources } = useQuery({
    queryKey: ['lead-sources'],
    queryFn: async () => { const { data } = await api.get('/analytics/leads/sources'); return data.data; },
  });

  const { data: overdueInvoices } = useQuery({
    queryKey: ['overdue-invoices'],
    queryFn: async () => {
      const { data } = await api.get('/finance/invoices?status=overdue&limit=5');
      return data.data;
    },
  });

  const { data: topDealsData } = useQuery({
    queryKey: ['top-deals'],
    queryFn: async () => {
      const { data } = await api.get('/crm/deals?limit=5&sortBy=value&sortOrder=desc');
      return data.data;
    },
  });

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const overdueList: any[] = overdueInvoices?.invoices || [];
  const topDeals: any[] = topDealsData?.deals || [];
  const overdueTotal = overdueList.reduce((s: number, inv: any) => s + Number(inv.total || 0), 0);

  const momRevenue = stats?.revenue?.lastMonth > 0
    ? (((stats?.revenue?.thisMonth - stats?.revenue?.lastMonth) / stats?.revenue?.lastMonth) * 100).toFixed(1)
    : undefined;

  return (
    <div className="space-y-6 max-w-[1600px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {greeting()}, {user?.firstName} 👋
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="relative">
          <button onClick={() => setQuickAction(q => !q)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors">
            <Zap className="w-4 h-4" /> Quick Actions
          </button>
          {quickAction && (
            <div className="absolute right-0 top-11 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 py-2 z-30 w-52">
              {[
                { label: 'New Lead', href: '/dashboard/crm/leads', icon: Target },
                { label: 'New Invoice', href: '/dashboard/finance/invoices', icon: FileText },
                { label: 'New Ticket', href: '/dashboard/helpdesk', icon: Headphones },
                { label: 'Log Time', href: '/dashboard/timesheets', icon: Clock },
              ].map(({ label, href, icon: Icon }) => (
                <Link key={label} href={href} onClick={() => setQuickAction(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <Icon className="w-4 h-4 text-indigo-500" /> {label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Overdue invoice alert */}
      {overdueList.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                {overdueList.length} overdue invoice{overdueList.length > 1 ? 's' : ''} totalling {formatCurrency(overdueTotal)}
              </p>
              <p className="text-xs text-red-500 mt-0.5">
                {overdueList.slice(0, 3).map((inv: any) => `${inv.invoiceNo} (${daysOverdue(inv.dueDate)}d)`).join(' · ')}
              </p>
            </div>
          </div>
          <Link href="/dashboard/finance/invoices?status=overdue" className="text-xs font-medium text-red-600 hover:text-red-700 whitespace-nowrap flex items-center gap-1">
            View all <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <StatCard href="/dashboard/crm/leads" title="Total Leads" value={stats?.leads?.total} change={stats?.leads?.growth} icon={Target} color="bg-indigo-500" />
        <StatCard href="/dashboard/crm/pipeline" title="Open Deals" value={stats?.deals?.open} icon={Briefcase} color="bg-violet-500" />
        <StatCard href="/dashboard/finance/invoices" title="Monthly Revenue" value={formatCurrency(stats?.revenue?.thisMonth || 0)} change={momRevenue} icon={DollarSign} color="bg-emerald-500" />
        <StatCard href="/dashboard/helpdesk" title="Open Tickets" value={stats?.tickets?.open} icon={Headphones} color="bg-orange-500" />
        <StatCard href="/dashboard/projects" title="Active Projects" value={stats?.projects?.active} icon={FolderKanban} color="bg-blue-500" />
        <StatCard href="/dashboard/ai" title="AI Chats (30d)" value={stats?.ai?.conversationsThisMonth} icon={Bot} color="bg-pink-500" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Revenue Overview</h2>
              <p className="text-sm text-gray-500 mt-0.5">Monthly for {new Date().getFullYear()}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold gradient-text">{formatCurrency(stats?.revenue?.total || 0)}</p>
              <p className="text-xs text-gray-500">Year total</p>
            </div>
          </div>
          <RevenueAreaChart revenueData={revenueData} />
          {stats?.revenue?.thisMonth !== undefined && stats?.revenue?.lastMonth !== undefined && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-500">
              <span>This month: <span className="font-semibold text-gray-800 dark:text-gray-200">{formatCurrency(stats.revenue.thisMonth)}</span></span>
              <span>Last month: <span className="font-semibold text-gray-800 dark:text-gray-200">{formatCurrency(stats.revenue.lastMonth)}</span></span>
              {momRevenue !== undefined && (
                <span className={`font-semibold ${Number(momRevenue) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {Number(momRevenue) >= 0 ? '+' : ''}{momRevenue}% MoM
                </span>
              )}
            </div>
          )}
        </div>

        {/* Lead Sources */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Lead Sources</h2>
          {leadSources?.length > 0 ? (
            <>
              <LeadSourcesPieChart leadSources={leadSources} />
              <div className="space-y-2 mt-3">
                {leadSources.slice(0, 5).map((s: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-gray-600 dark:text-gray-400 capitalize">{s.source || 'Unknown'}</span>
                    </div>
                    <span className="font-semibold text-gray-900 dark:text-white">{s._count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <Target className="w-8 h-8 mb-2" />
              <p className="text-sm">No leads yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <RecentLeads />
        <TopDeals deals={topDeals} />
        <RecentTickets />
        <TodaysAppointments />
      </div>
    </div>
  );
}

function RecentLeads() {
  const { data } = useQuery({
    queryKey: ['recent-leads'],
    queryFn: async () => { const { data } = await api.get('/crm/leads?limit=5'); return data.data; },
  });
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Recent Leads</h3>
        <Link href="/dashboard/crm/leads" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">View all <ArrowUpRight className="w-3 h-3" /></Link>
      </div>
      <div className="space-y-3">
        {data?.map((lead: any) => (
          <div key={lead.id} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {lead.firstName?.[0]}{lead.lastName?.[0] || ''}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{lead.firstName} {lead.lastName}</p>
              <p className="text-xs text-gray-500 truncate">{lead.company || lead.email}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${lead.status === 'qualified' ? 'bg-green-100 text-green-700' : lead.status === 'new' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
              {lead.status}
            </span>
          </div>
        )) || <p className="text-sm text-gray-400 text-center py-4">No leads yet</p>}
      </div>
    </div>
  );
}

function TopDeals({ deals }: { deals: any[] }) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Top Deals</h3>
        <Link href="/dashboard/crm/pipeline" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">Pipeline <ArrowUpRight className="w-3 h-3" /></Link>
      </div>
      <div className="space-y-3">
        {deals.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No deals yet</p>
        ) : deals.map((deal: any) => (
          <div key={deal.id} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{deal.name}</p>
              <p className="text-xs text-gray-400 capitalize">{deal.stage?.name || '—'}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-bold text-green-600">{formatCurrency(deal.value || 0)}</p>
              <p className="text-xs text-gray-400">{deal.probability || 0}%</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentTickets() {
  const { data } = useQuery({
    queryKey: ['recent-tickets'],
    queryFn: async () => { const { data } = await api.get('/helpdesk?limit=5&status=open'); return data.data; },
  });
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Open Tickets</h3>
        <Link href="/dashboard/helpdesk" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">View all <ArrowUpRight className="w-3 h-3" /></Link>
      </div>
      <div className="space-y-3">
        {data?.map((ticket: any) => (
          <div key={ticket.id} className="flex items-start gap-3">
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${ticket.priority === 'urgent' ? 'bg-red-500 animate-pulse' : ticket.priority === 'high' ? 'bg-orange-500' : ticket.priority === 'medium' ? 'bg-yellow-500' : 'bg-green-500'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">#{ticket.ticketNo}</p>
              <p className="text-xs text-gray-500 truncate">{ticket.subject}</p>
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap">{formatRelativeTime(ticket.createdAt)}</span>
          </div>
        )) || <p className="text-sm text-gray-400 text-center py-4">No open tickets</p>}
      </div>
    </div>
  );
}

function TodaysAppointments() {
  const today = new Date().toISOString().split('T')[0];
  const { data } = useQuery({
    queryKey: ['todays-appointments'],
    queryFn: async () => { const { data } = await api.get(`/appointments?startDate=${today}&endDate=${today}`); return data.data; },
  });
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Today&apos;s Schedule</h3>
        <Link href="/dashboard/appointments" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">View all <ArrowUpRight className="w-3 h-3" /></Link>
      </div>
      <div className="space-y-2">
        {data?.length > 0 ? data.map((apt: any) => (
          <div key={apt.id} className="flex items-start gap-3 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800">
            <Calendar className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{apt.title}</p>
              <p className="text-xs text-gray-500">
                {new Date(apt.startAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                {' – '}
                {new Date(apt.endAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        )) : (
          <div className="text-center py-6 text-gray-400">
            <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No appointments today</p>
          </div>
        )}
      </div>
    </div>
  );
}

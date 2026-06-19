'use client';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { formatCurrency, formatRelativeTime } from '@/lib/utils';
import {
  TrendingUp, TrendingDown, Users, Target, DollarSign, Headphones,
  FolderKanban, Bot, Calendar, Activity, ArrowUpRight, Briefcase,
} from 'lucide-react';

const RevenueAreaChart = dynamic(() => import('./DashboardCharts').then(m => m.RevenueAreaChart), { ssr: false });
const LeadSourcesPieChart = dynamic(() => import('./DashboardCharts').then(m => m.LeadSourcesPieChart), { ssr: false });

function StatCard({ title, value, change, icon: Icon, color, prefix }: any) {
  const isPositive = parseFloat(change) >= 0;
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
            {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {Math.abs(parseFloat(change))}%
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{prefix}{value?.toLocaleString() ?? '—'}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{title}</p>
    </div>
  );
}

const COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

export default function DashboardPage() {
  const { user } = useAuthStore();

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const { data } = await api.get('/analytics/dashboard');
      return data.data;
    },
  });

  const { data: revenueData } = useQuery({
    queryKey: ['revenue-chart'],
    queryFn: async () => {
      const { data } = await api.get('/analytics/revenue');
      return data.data;
    },
  });

  const { data: leadSources } = useQuery({
    queryKey: ['lead-sources'],
    queryFn: async () => {
      const { data } = await api.get('/analytics/leads/sources');
      return data.data;
    },
  });

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="space-y-8 max-w-[1600px]">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {greeting()}, {user?.firstName} 👋
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Here&apos;s what&apos;s happening with your business today
          </p>
        </div>
        <div className="text-right text-sm text-gray-500">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <StatCard title="Total Leads" value={stats?.leads?.total} change={stats?.leads?.growth} icon={Target} color="bg-indigo-500" />
        <StatCard title="Open Deals" value={stats?.deals?.open} icon={Briefcase} color="bg-violet-500" />
        <StatCard title="Monthly Revenue" value={formatCurrency(stats?.revenue?.thisMonth || 0)} icon={DollarSign} color="bg-emerald-500" />
        <StatCard title="Open Tickets" value={stats?.tickets?.open} icon={Headphones} color="bg-orange-500" />
        <StatCard title="Active Projects" value={stats?.projects?.active} icon={FolderKanban} color="bg-blue-500" />
        <StatCard title="AI Chats (30d)" value={stats?.ai?.conversationsThisMonth} icon={Bot} color="bg-pink-500" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Revenue Overview</h2>
              <p className="text-sm text-gray-500 mt-0.5">Monthly revenue for {new Date().getFullYear()}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold gradient-text">{formatCurrency(stats?.revenue?.total || 0)}</p>
              <p className="text-xs text-gray-500">Total revenue</p>
            </div>
          </div>
          <RevenueAreaChart revenueData={revenueData} />
        </div>

        {/* Lead Sources */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-6">Lead Sources</h2>
          {leadSources?.length > 0 ? (
            <>
              <LeadSourcesPieChart leadSources={leadSources} />
              <div className="space-y-2 mt-4">
                {leadSources.slice(0, 5).map((s: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-gray-600 dark:text-gray-400 capitalize">{s.source || 'Unknown'}</span>
                    </div>
                    <span className="font-medium text-gray-900 dark:text-white">{s._count}</span>
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
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Recent Leads */}
        <RecentLeads />

        {/* Open Tickets */}
        <RecentTickets />

        {/* Today's Appointments */}
        <TodaysAppointments />
      </div>
    </div>
  );
}

function RecentLeads() {
  const { data } = useQuery({
    queryKey: ['recent-leads'],
    queryFn: async () => {
      const { data } = await api.get('/crm/leads?limit=5');
      return data.data;
    },
  });

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Recent Leads</h3>
        <a href="/dashboard/crm/leads" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
          View all <ArrowUpRight className="w-3 h-3" />
        </a>
      </div>
      <div className="space-y-3">
        {data?.map((lead: any) => (
          <div key={lead.id} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {lead.firstName[0]}{lead.lastName?.[0] || ''}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{lead.firstName} {lead.lastName}</p>
              <p className="text-xs text-gray-500 truncate">{lead.company || lead.email}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize badge-${lead.status === 'qualified' ? 'active' : lead.status === 'new' ? 'new' : 'pending'}`}>
              {lead.status}
            </span>
          </div>
        )) || <p className="text-sm text-gray-400 text-center py-4">No leads yet</p>}
      </div>
    </div>
  );
}

function RecentTickets() {
  const { data } = useQuery({
    queryKey: ['recent-tickets'],
    queryFn: async () => {
      const { data } = await api.get('/helpdesk?limit=5&status=open');
      return data.data;
    },
  });

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Open Tickets</h3>
        <a href="/dashboard/helpdesk" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
          View all <ArrowUpRight className="w-3 h-3" />
        </a>
      </div>
      <div className="space-y-3">
        {data?.map((ticket: any) => (
          <div key={ticket.id} className="flex items-start gap-3">
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${ticket.priority === 'urgent' ? 'bg-red-500' : ticket.priority === 'high' ? 'bg-orange-500' : 'bg-yellow-500'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">#{ticket.ticketNo}</p>
              <p className="text-xs text-gray-500 truncate">{ticket.subject}</p>
            </div>
            <span className="text-xs text-gray-400">{formatRelativeTime(ticket.createdAt)}</span>
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
    queryFn: async () => {
      const { data } = await api.get(`/appointments?startDate=${today}&endDate=${today}`);
      return data.data;
    },
  });

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Today&apos;s Schedule</h3>
        <a href="/dashboard/appointments" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
          View all <ArrowUpRight className="w-3 h-3" />
        </a>
      </div>
      <div className="space-y-3">
        {data?.length > 0 ? data.map((apt: any) => (
          <div key={apt.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
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

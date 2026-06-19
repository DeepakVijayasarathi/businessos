'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatCurrency, formatRelativeTime } from '@/lib/utils';
import { Building2, Users, DollarSign, Activity, Shield, CheckCircle2, XCircle } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';

export default function SuperAdminPage() {
  const [tab, setTab] = useState('companies');
  const qc = useQueryClient();

  const { data: companies } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: async () => {
      const { data } = await api.get('/admin/companies');
      return data;
    },
  });

  const { data: plans } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: async () => {
      const { data } = await api.get('/admin/plans');
      return data.data;
    },
  });

  const { data: health } = useQuery({
    queryKey: ['admin-health'],
    queryFn: async () => {
      const { data } = await api.get('/admin/health');
      return data.data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/companies/${id}/toggle`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-companies'] }); toast.success('Company status updated'); },
  });

  const tabs = ['companies', 'plans', 'users', 'health'];

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Super Admin</h1>
          <p className="text-sm text-gray-500">Platform management and oversight</p>
        </div>
      </div>

      {/* Health overview */}
      {health && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Companies', value: health.stats.companies, icon: Building2, color: 'bg-indigo-500' },
            { label: 'Users', value: health.stats.users, icon: Users, color: 'bg-violet-500' },
            { label: 'Leads', value: health.stats.leads, icon: Activity, color: 'bg-emerald-500' },
            { label: 'Uptime', value: `${Math.floor(health.uptime / 3600)}h`, icon: CheckCircle2, color: 'bg-blue-500' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="glass-card rounded-2xl p-5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
              <p className="text-sm text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'companies' && (
        <div className="glass-card rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                {['Company', 'Email', 'Plan', 'Users', 'Status', 'Created', 'Actions'].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-500 px-4 py-3 first:pl-6 last:pr-6">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {companies?.data?.map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-4 pl-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">{c.name[0]}</div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</p>
                        <p className="text-xs text-gray-500">{c.industry}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">{c.email}</td>
                  <td className="px-4 py-4">
                    <span className="text-xs font-medium text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 px-2 py-1 rounded-full">
                      {c.subscriptions?.[0]?.plan?.name || 'No plan'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">{c._count?.users}</td>
                  <td className="px-4 py-4">
                    {c.isActive ? (
                      <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="w-3.5 h-3.5" /> Active</span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-red-500"><XCircle className="w-3.5 h-3.5" /> Suspended</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-xs text-gray-500">{formatRelativeTime(c.createdAt)}</td>
                  <td className="px-4 py-4 pr-6">
                    <button
                      onClick={() => { if (confirm(`${c.isActive ? 'Suspend' : 'Activate'} ${c.name}?`)) toggleMutation.mutate(c.id); }}
                      className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${c.isActive ? 'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30' : 'border-green-200 text-green-600 hover:bg-green-50 dark:border-green-800 dark:hover:bg-green-950/30'}`}
                    >
                      {c.isActive ? 'Suspend' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'plans' && (
        <div className="grid md:grid-cols-3 gap-6">
          {plans?.map((plan: any) => (
            <div key={plan.id} className="glass-card rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900 dark:text-white text-lg">{plan.name}</h3>
                <span className="text-sm text-gray-500">{plan._count?.subscriptions} companies</span>
              </div>
              <p className="text-3xl font-bold text-indigo-600 mb-1">{formatCurrency(plan.price)}<span className="text-sm font-normal text-gray-500">/mo</span></p>
              <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <p>Max Users: {plan.maxUsers}</p>
                <p>Storage: {plan.maxStorage}GB</p>
                <p>Trial: {plan.trialDays} days</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'health' && health && (
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-white">System Health</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-gray-500">Status:</span> <span className="text-green-600 font-medium">{health.status}</span></div>
            <div><span className="text-gray-500">Database:</span> <span className="text-green-600 font-medium">{health.database}</span></div>
            <div><span className="text-gray-500">Node:</span> <span className="text-gray-900 dark:text-white">{health.nodeVersion}</span></div>
            <div><span className="text-gray-500">Uptime:</span> <span className="text-gray-900 dark:text-white">{Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m</span></div>
            <div><span className="text-gray-500">RSS Memory:</span> <span className="text-gray-900 dark:text-white">{Math.round(health.memory.rss / 1024 / 1024)}MB</span></div>
            <div><span className="text-gray-500">Heap Used:</span> <span className="text-gray-900 dark:text-white">{Math.round(health.memory.heapUsed / 1024 / 1024)}MB</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

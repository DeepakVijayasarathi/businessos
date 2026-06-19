'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { Plus, Phone, Mail, Users, MessageSquare, Calendar, CheckSquare, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

const ACTIVITY_ICONS: Record<string, any> = {
  call: Phone,
  email: Mail,
  meeting: Users,
  note: MessageSquare,
  task: CheckSquare,
  other: Calendar,
};

const ACTIVITY_COLORS: Record<string, string> = {
  call: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  email: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
  meeting: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  note: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
  task: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  other: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

export default function ActivitiesPage() {
  const [type, setType] = useState('');
  const [showModal, setShowModal] = useState(false);
  const qc = useQueryClient();

  const { data: activities, isLoading } = useQuery({
    queryKey: ['activities', type],
    queryFn: async () => {
      const params = type ? `?type=${type}` : '';
      const { data } = await api.get(`/crm/activities${params}`);
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/crm/activities/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['activities'] }); toast.success('Activity deleted'); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Activities</h1>
          <p className="text-sm text-gray-500 mt-0.5">{activities?.meta?.total || activities?.data?.length || 0} total</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> Log Activity
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setType('')} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${!type ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>All</button>
        {Object.keys(ACTIVITY_ICONS).map(t => (
          <button key={t} onClick={() => setType(t)} className={`px-3 py-1.5 rounded-full text-xs font-medium border capitalize transition-all ${type === t ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>{t}</button>
        ))}
      </div>

      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 glass-card rounded-2xl animate-pulse" />)
        ) : activities?.data?.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center text-gray-400">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No activities logged</p>
          </div>
        ) : activities?.data?.map((activity: any) => {
          const Icon = ACTIVITY_ICONS[activity.type] || Calendar;
          const colorClass = ACTIVITY_COLORS[activity.type] || ACTIVITY_COLORS.other;
          return (
            <div key={activity.id} className="glass-card rounded-2xl p-4 flex items-start gap-4 hover:shadow-md transition-all">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{activity.title}</p>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${colorClass}`}>{activity.type}</span>
                  {activity.isCompleted && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Done</span>}
                </div>
                {activity.notes && <p className="text-xs text-gray-500 line-clamp-2">{activity.notes}</p>}
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  {activity.dueDate && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDateTime(activity.dueDate)}</span>}
                  {activity.lead && <span>Lead: {activity.lead.firstName} {activity.lead.lastName}</span>}
                  {activity.contact && <span>Contact: {activity.contact.firstName} {activity.contact.lastName}</span>}
                  {activity.deal && <span>Deal: {activity.deal.name}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showModal && <ActivityModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

function ActivityModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: '', type: 'call', notes: '', dueDate: '', isCompleted: false });
  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/crm/activities', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['activities'] }); toast.success('Activity logged!'); onClose(); },
    onError: () => toast.error('Failed to log activity'),
  });
  const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500";
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Log Activity</h3>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="p-6 space-y-4">
          <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Title*</label><input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className={inputCls}>
                {Object.keys(ACTIVITY_ICONS).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Due Date</label><input type="datetime-local" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className={inputCls} /></div>
          </div>
          <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label><textarea rows={4} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputCls + ' resize-none'} /></div>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.isCompleted} onChange={e => setForm({ ...form, isCompleted: e.target.checked })} className="rounded" /><span className="text-sm text-gray-700 dark:text-gray-300">Mark as completed</span></label>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Logging...' : 'Log'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

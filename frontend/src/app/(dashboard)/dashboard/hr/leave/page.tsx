'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDate, statusColor } from '@/lib/utils';
import { Plus, Calendar, CheckCircle, XCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LeavePage() {
  const [showModal, setShowModal] = useState(false);
  const qc = useQueryClient();

  const { data: leaves, isLoading } = useQuery({
    queryKey: ['leaves'],
    queryFn: async () => { const { data } = await api.get('/hr/attendance/leaves'); return data; },
  });

  const { data: leaveTypes } = useQuery({
    queryKey: ['leave-types'],
    queryFn: async () => { const { data } = await api.get('/hr/attendance/leave-types'); return data.data; },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.put(`/hr/attendance/leaves/${id}/approve`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leaves'] }); toast.success('Leave approved'); },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.put(`/hr/attendance/leaves/${id}/reject`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leaves'] }); toast.success('Leave rejected'); },
  });

  const pending = leaves?.data?.filter((l: any) => l.status === 'pending').length || 0;
  const approved = leaves?.data?.filter((l: any) => l.status === 'approved').length || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Leave Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">{pending} pending requests</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> Apply Leave
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending', value: pending, color: 'text-yellow-600', icon: Clock },
          { label: 'Approved', value: approved, color: 'text-green-600', icon: CheckCircle },
          { label: 'Rejected', value: leaves?.data?.filter((l: any) => l.status === 'rejected').length || 0, color: 'text-red-500', icon: XCircle },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="glass-card rounded-2xl p-4 flex items-center gap-3">
              <Icon className={`w-8 h-8 ${s.color}`} />
              <div>
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-gray-100 dark:border-gray-800">
            <tr>
              {['Employee', 'Type', 'From', 'To', 'Days', 'Reason', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}><td colSpan={8} className="px-4 py-3"><div className="h-5 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" /></td></tr>
              ))
            ) : leaves?.data?.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 text-sm">No leave requests</td></tr>
            ) : leaves?.data?.map((leave: any) => {
              const days = Math.ceil((new Date(leave.endDate).getTime() - new Date(leave.startDate).getTime()) / 86400000) + 1;
              return (
                <tr key={leave.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{leave.employee?.user?.firstName} {leave.employee?.user?.lastName}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{leave.leaveType?.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{formatDate(leave.startDate)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{formatDate(leave.endDate)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{days}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-32 truncate">{leave.reason || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                      leave.status === 'approved' ? 'bg-green-100 text-green-700' :
                      leave.status === 'rejected' ? 'bg-red-100 text-red-600' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{leave.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    {leave.status === 'pending' && (
                      <div className="flex gap-1">
                        <button onClick={() => approveMutation.mutate(leave.id)} className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg" title="Approve"><CheckCircle className="w-4 h-4" /></button>
                        <button onClick={() => rejectMutation.mutate(leave.id)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title="Reject"><XCircle className="w-4 h-4" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && <LeaveModal leaveTypes={leaveTypes || []} onClose={() => setShowModal(false)} />}
    </div>
  );
}

function LeaveModal({ leaveTypes, onClose }: { leaveTypes: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ leaveTypeId: leaveTypes[0]?.id || '', startDate: '', endDate: '', reason: '' });
  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/hr/attendance/leaves', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leaves'] }); toast.success('Leave request submitted!'); onClose(); },
    onError: () => toast.error('Failed to submit leave request'),
  });
  const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500";
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Apply for Leave</h3>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="p-6 space-y-4">
          <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Leave Type</label>
            <select value={form.leaveTypeId} onChange={e => setForm({ ...form, leaveTypeId: e.target.value })} className={inputCls}>
              {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.name} ({t.daysAllowed} days/year)</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date*</label><input required type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className={inputCls} /></div>
            <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">End Date*</label><input required type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} min={form.startDate} className={inputCls} /></div>
          </div>
          <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Reason</label><textarea rows={3} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} className={inputCls + ' resize-none'} /></div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Submitting...' : 'Submit'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

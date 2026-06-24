'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDate, statusColor } from '@/lib/utils';
import { Plus, Calendar, CheckCircle, XCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { TextField, SelectField, TextAreaField } from '@/components/ui/FormField';

export default function LeavePage() {
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
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
  const filtered = leaves?.data?.filter((l: any) => activeTab === 'all' || l.status === activeTab) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Leave Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">{pending} pending approval</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> Apply Leave
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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

      {/* Status tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
        {([
          { key: 'all', label: 'All' },
          { key: 'pending', label: `Pending${pending > 0 ? ` (${pending})` : ''}` },
          { key: 'approved', label: 'Approved' },
          { key: 'rejected', label: 'Rejected' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeTab === t.key ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'} ${t.key === 'pending' && pending > 0 ? 'relative' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
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
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 text-sm">No {activeTab === 'all' ? '' : activeTab} leave requests</td></tr>
            ) : filtered.map((leave: any) => {
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leaves'] }); toast.success('Leave request submitted'); onClose(); },
    onError: () => toast.error('Failed to submit leave request'),
  });
  return (
    <Modal onClose={onClose} title="Apply for Leave" subtitle="Submit a new leave request for approval" icon={Calendar} iconColor="yellow">
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }}>
        <div className="p-6 space-y-4">
          <SelectField id="leave-leaveTypeId" label="Leave Type" value={form.leaveTypeId} onChange={e => setForm({ ...form, leaveTypeId: e.target.value })}>
            {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.name} ({t.daysAllowed} days/year)</option>)}
          </SelectField>
          <div className="grid grid-cols-2 gap-4">
            <TextField id="leave-startDate" label="Start Date" required type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
            <TextField id="leave-endDate" label="End Date" required type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} min={form.startDate} />
          </div>
          <TextAreaField id="leave-reason" label="Reason" rows={3} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Submitting...' : 'Submit'}</button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

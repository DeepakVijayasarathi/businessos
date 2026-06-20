'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Plus, Star, User, Calendar, TrendingUp, ChevronDown } from 'lucide-react';

export default function PerformancePage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<any>({ employeeId: '', period: '', reviewDate: new Date().toISOString().slice(0, 10), overallRating: '', goals: '', achievements: '', improvements: '', comments: '' });

  const { data: reviews, isLoading } = useQuery({
    queryKey: ['performance-reviews'],
    queryFn: async () => { const { data } = await api.get('/hr/employees/performance-reviews'); return data.data; },
  });

  const { data: employees } = useQuery({
    queryKey: ['employees-list'],
    queryFn: async () => { const { data } = await api.get('/hr/employees'); return data.data; },
  });

  const createMutation = useMutation({
    mutationFn: (d: any) => api.post('/hr/employees/performance-reviews', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['performance-reviews'] }); toast.success('Review created'); setShowModal(false); setForm({ employeeId: '', period: '', reviewDate: new Date().toISOString().slice(0, 10), overallRating: '', goals: '', achievements: '', improvements: '', comments: '' }); },
    onError: () => toast.error('Failed to create review'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/hr/employees/performance-reviews/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['performance-reviews'] }); toast.success('Review deleted'); },
  });

  const ratingColor = (r: number) => r >= 4 ? 'text-green-600' : r >= 3 ? 'text-yellow-600' : 'text-red-500';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Performance Reviews</h1>
          <p className="text-sm text-gray-500 mt-1">{reviews?.length || 0} reviews</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> New Review
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Reviews', value: reviews?.length || 0, icon: TrendingUp, color: 'text-indigo-600' },
          { label: 'Avg Rating', value: reviews?.length ? (reviews.reduce((s: number, r: any) => s + (r.overallRating || 0), 0) / reviews.length).toFixed(1) : '—', icon: Star, color: 'text-yellow-500' },
          { label: 'Completed', value: reviews?.filter((r: any) => r.status === 'completed').length || 0, icon: User, color: 'text-green-600' },
          { label: 'Pending', value: reviews?.filter((r: any) => r.status === 'draft').length || 0, icon: Calendar, color: 'text-orange-500' },
        ].map(s => (
          <div key={s.label} className="glass-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-500">{s.label}</p>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Reviews table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />)}
          </div>
        ) : !reviews?.length ? (
          <div className="p-12 text-center">
            <TrendingUp className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No performance reviews yet</p>
            <p className="text-gray-400 text-sm mt-1">Create the first review to get started</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left text-xs font-medium text-gray-500 px-6 py-3">Employee</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Period</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Review Date</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Rating</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Status</th>
                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Reviewer</th>
                <th className="text-right text-xs font-medium text-gray-500 px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {reviews.map((r: any) => (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900 dark:text-white">{r.employee?.user?.firstName} {r.employee?.user?.lastName}</p>
                  </td>
                  <td className="px-4 py-4 text-gray-600 dark:text-gray-400">{r.period || '—'}</td>
                  <td className="px-4 py-4 text-gray-600 dark:text-gray-400">{r.reviewDate ? new Date(r.reviewDate).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-4">
                    {r.overallRating ? (
                      <div className="flex items-center gap-1">
                        <Star className={`w-3.5 h-3.5 ${ratingColor(r.overallRating)}`} />
                        <span className={`font-semibold text-sm ${ratingColor(r.overallRating)}`}>{r.overallRating}/5</span>
                      </div>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${r.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-gray-600 dark:text-gray-400">{r.reviewer?.firstName} {r.reviewer?.lastName}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => { if (confirm('Delete this review?')) deleteMutation.mutate(r.id); }} className="text-red-500 hover:text-red-700 text-xs">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white">New Performance Review</h3>
            </div>
            <form onSubmit={e => { e.preventDefault(); createMutation.mutate(form); }}>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Employee *</label>
                  <select required value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">Select employee</option>
                    {employees?.map((emp: any) => (
                      <option key={emp.id} value={emp.id}>{emp.user?.firstName} {emp.user?.lastName}</option>
                    ))}
                  </select>
                </div>
                {[
                  { k: 'period', l: 'Period (e.g. Q1 2026)', placeholder: 'Q1 2026' },
                  { k: 'reviewDate', l: 'Review Date', type: 'date' },
                  { k: 'overallRating', l: 'Overall Rating (1-5)', type: 'number', placeholder: '4.5' },
                ].map(({ k, l, type = 'text', placeholder = '' }) => (
                  <div key={k}>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{l}</label>
                    <input type={type} step={k === 'overallRating' ? '0.1' : undefined} min={k === 'overallRating' ? '1' : undefined} max={k === 'overallRating' ? '5' : undefined} placeholder={placeholder} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                ))}
                {[
                  { k: 'goals', l: 'Goals' },
                  { k: 'achievements', l: 'Achievements' },
                  { k: 'improvements', l: 'Areas for Improvement' },
                  { k: 'comments', l: 'Additional Comments' },
                ].map(({ k, l }) => (
                  <div key={k}>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{l}</label>
                    <textarea value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                  </div>
                ))}
              </div>
              <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
                <button type="submit" disabled={!form.employeeId || createMutation.isPending} className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  {createMutation.isPending ? 'Saving...' : 'Create Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

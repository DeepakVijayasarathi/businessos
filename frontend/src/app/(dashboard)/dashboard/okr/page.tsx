'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Target, Plus, Trash2, Edit2, ChevronDown, ChevronRight, TrendingUp, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  on_track: { color: 'text-green-600 bg-green-50 dark:bg-green-950/30', icon: TrendingUp, label: 'On Track' },
  at_risk: { color: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30', icon: AlertTriangle, label: 'At Risk' },
  behind: { color: 'text-red-600 bg-red-50 dark:bg-red-950/30', icon: AlertTriangle, label: 'Behind' },
  completed: { color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30', icon: CheckCircle2, label: 'Completed' },
};

const OKR_TYPES = ['company', 'team', 'individual'];

const CURRENT_PERIOD = (() => {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `Q${q} ${now.getFullYear()}`;
})();

export default function OKRPage() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState(CURRENT_PERIOD);
  const [type, setType] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showOKRModal, setShowOKRModal] = useState(false);
  const [showKRModal, setShowKRModal] = useState(false);
  const [editingOKR, setEditingOKR] = useState<any>(null);
  const [editingKR, setEditingKR] = useState<any>(null);
  const [activeOKRId, setActiveOKRId] = useState('');
  const [okrForm, setOKRForm] = useState({ title: '', description: '', period: CURRENT_PERIOD, type: 'company', startDate: '', endDate: '' });
  const [krForm, setKRForm] = useState({ title: '', type: 'numeric', target: '', current: '0', unit: '' });

  const { data: okrs = [], isLoading } = useQuery<any[]>({
    queryKey: ['okrs', period, type],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (period) params.set('period', period);
      if (type) params.set('type', type);
      const { data } = await api.get(`/okr?${params}`);
      return data.data || [];
    },
  });

  const saveOKRMutation = useMutation({
    mutationFn: (payload: any) => editingOKR ? api.put(`/okr/${editingOKR.id}`, payload) : api.post('/okr', payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['okrs'] }); toast.success(editingOKR ? 'OKR updated' : 'OKR created'); setShowOKRModal(false); setEditingOKR(null); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const deleteOKRMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/okr/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['okrs'] }); toast.success('OKR deleted'); },
  });

  const saveKRMutation = useMutation({
    mutationFn: (payload: any) => editingKR ? api.put(`/okr/key-results/${editingKR.id}`, payload) : api.post(`/okr/${activeOKRId}/key-results`, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['okrs'] }); toast.success(editingKR ? 'Updated' : 'Key Result added'); setShowKRModal(false); setEditingKR(null); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const deleteKRMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/okr/key-results/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['okrs'] }),
  });

  function openOKRModal(okr?: any) {
    setEditingOKR(okr || null);
    if (okr) {
      setOKRForm({ title: okr.title, description: okr.description || '', period: okr.period, type: okr.type, startDate: okr.startDate?.split('T')[0] || '', endDate: okr.endDate?.split('T')[0] || '' });
    } else {
      const now = new Date();
      const startOfQ = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      const endOfQ = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0);
      setOKRForm({ title: '', description: '', period: CURRENT_PERIOD, type: 'company', startDate: startOfQ.toISOString().split('T')[0], endDate: endOfQ.toISOString().split('T')[0] });
    }
    setShowOKRModal(true);
  }

  function openKRModal(okrId: string, kr?: any) {
    setActiveOKRId(okrId);
    setEditingKR(kr || null);
    if (kr) {
      setKRForm({ title: kr.title, type: kr.type, target: String(kr.target), current: String(kr.current), unit: kr.unit || '' });
    } else {
      setKRForm({ title: '', type: 'numeric', target: '', current: '0', unit: '' });
    }
    setShowKRModal(true);
  }

  const totalOKRs = okrs.length;
  const onTrack = okrs.filter((o: any) => o.progress >= 70).length;
  const completed = okrs.filter((o: any) => o.status === 'completed').length;
  const avgProgress = okrs.length ? Math.round(okrs.reduce((s: number, o: any) => s + o.progress, 0) / okrs.length) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">OKRs & Goals</h1>
          <p className="text-sm text-gray-500 mt-0.5">Objectives and Key Results tracking</p>
        </div>
        <button onClick={() => openOKRModal()} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-medium">
          <Plus className="w-4 h-4" /> New Objective
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total OKRs', value: totalOKRs, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/30' },
          { label: 'On Track', value: onTrack, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/30' },
          { label: 'Completed', value: completed, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' },
          { label: 'Avg Progress', value: `${avgProgress}%`, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950/30' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="glass-card rounded-2xl p-5">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select value={period} onChange={e => setPeriod(e.target.value)} className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200">
          {['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026', 'H1 2026', 'H2 2026', 'FY 2026'].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          <button onClick={() => setType('')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${type === '' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500'}`}>All</button>
          {OKR_TYPES.map(t => (
            <button key={t} onClick={() => setType(t)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${type === t ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500'}`}>{t}</button>
          ))}
        </div>
      </div>

      {/* OKR List */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />)}</div>
      ) : okrs.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <Target className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-400">No objectives for {period}. Create your first OKR!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {okrs.map((okr: any) => {
            const cfg = STATUS_CONFIG[okr.status] || STATUS_CONFIG.on_track;
            const StatusIcon = cfg.icon;
            const isOpen = expanded[okr.id];
            return (
              <div key={okr.id} className="glass-card rounded-2xl overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <button onClick={() => setExpanded(e => ({ ...e, [okr.id]: !e[okr.id] }))} className="mt-0.5 flex-shrink-0">
                      {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">{okr.title}</p>
                          {okr.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{okr.description}</p>}
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-xs text-gray-400 capitalize">{okr.type}</span>
                            <span className="text-gray-200 dark:text-gray-700">•</span>
                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>
                              <StatusIcon className="w-3 h-3" />{cfg.label}
                            </span>
                            {okr.owner && <span className="text-xs text-gray-400">Owner: {okr.owner.firstName}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-lg font-bold text-gray-900 dark:text-white">{okr.progress}%</p>
                          </div>
                          <button onClick={() => openOKRModal(okr)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                            <Edit2 className="w-3.5 h-3.5 text-gray-400" />
                          </button>
                          <button onClick={() => deleteOKRMutation.mutate(okr.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="mt-3 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${okr.progress >= 70 ? 'bg-green-500' : okr.progress >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${okr.progress}%` }} />
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-gray-400">{okr.keyResults?.length || 0} key results</p>
                        <p className="text-xs text-gray-400">{okr.period}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-gray-50 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 px-5 py-4 space-y-3">
                    {(okr.keyResults || []).map((kr: any) => (
                      <div key={kr.id} className="flex items-center gap-3 group">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm text-gray-700 dark:text-gray-300">{kr.title}</p>
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                {Number(kr.current)}{kr.unit || ''} / {Number(kr.target)}{kr.unit || ''}
                              </p>
                              <button onClick={() => openKRModal(okr.id, kr)} className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-all">
                                <Edit2 className="w-3 h-3 text-gray-400" />
                              </button>
                              <button onClick={() => deleteKRMutation.mutate(kr.id)} className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded transition-all">
                                <Trash2 className="w-3 h-3 text-red-400" />
                              </button>
                            </div>
                          </div>
                          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${kr.progress >= 70 ? 'bg-green-500' : kr.progress >= 40 ? 'bg-yellow-500' : 'bg-red-400'}`} style={{ width: `${kr.progress}%` }} />
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-gray-500 w-8 text-right">{kr.progress}%</span>
                      </div>
                    ))}
                    <button onClick={() => openKRModal(okr.id)} className="w-full text-xs text-indigo-600 dark:text-indigo-400 py-2 border border-dashed border-indigo-200 dark:border-indigo-800 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-colors flex items-center justify-center gap-1">
                      <Plus className="w-3 h-3" /> Add Key Result
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* OKR Modal */}
      {showOKRModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-5">{editingOKR ? 'Edit Objective' : 'New Objective'}</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Title *</label>
                <input value={okrForm.title} onChange={e => setOKRForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Grow revenue by 40%" className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Description</label>
                <textarea value={okrForm.description} onChange={e => setOKRForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Period *</label>
                  <input value={okrForm.period} onChange={e => setOKRForm(f => ({ ...f, period: e.target.value }))} placeholder="Q1 2026" className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Type</label>
                  <select value={okrForm.type} onChange={e => setOKRForm(f => ({ ...f, type: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                    {OKR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Start Date *</label>
                  <input type="date" value={okrForm.startDate} onChange={e => setOKRForm(f => ({ ...f, startDate: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">End Date *</label>
                  <input type="date" value={okrForm.endDate} onChange={e => setOKRForm(f => ({ ...f, endDate: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowOKRModal(false); setEditingOKR(null); }} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">Cancel</button>
              <button onClick={() => saveOKRMutation.mutate(okrForm)} disabled={saveOKRMutation.isPending || !okrForm.title || !okrForm.period || !okrForm.startDate || !okrForm.endDate} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {saveOKRMutation.isPending ? 'Saving…' : editingOKR ? 'Save Changes' : 'Create Objective'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Key Result Modal */}
      {showKRModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-5">{editingKR ? 'Edit Key Result' : 'Add Key Result'}</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Title *</label>
                <input value={krForm.title} onChange={e => setKRForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Achieve $1M ARR" className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Type</label>
                  <select value={krForm.type} onChange={e => setKRForm(f => ({ ...f, type: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                    <option value="numeric">Numeric</option>
                    <option value="percentage">Percentage</option>
                    <option value="boolean">Boolean</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Current</label>
                  <input type="number" value={krForm.current} onChange={e => setKRForm(f => ({ ...f, current: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Target *</label>
                  <input type="number" value={krForm.target} onChange={e => setKRForm(f => ({ ...f, target: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Unit (optional)</label>
                <input value={krForm.unit} onChange={e => setKRForm(f => ({ ...f, unit: e.target.value }))} placeholder="$, %, users, deals..." className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowKRModal(false); setEditingKR(null); }} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">Cancel</button>
              <button onClick={() => saveKRMutation.mutate(krForm)} disabled={saveKRMutation.isPending || !krForm.title || !krForm.target} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {saveKRMutation.isPending ? 'Saving…' : editingKR ? 'Save' : 'Add Key Result'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

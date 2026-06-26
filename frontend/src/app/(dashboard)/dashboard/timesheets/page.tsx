'use client';
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Clock, Plus, Trash2, Edit2, ChevronLeft, ChevronRight, DollarSign, BarChart3, Timer, TrendingUp, Sparkles, Loader2, X, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getWeekRange(date: Date) {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function fmtHours(h: number) {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

export default function TimesheetsPage() {
  const qc = useQueryClient();
  const [weekDate, setWeekDate] = useState(new Date());
  const [insightLoading, setInsightLoading] = useState(false);
  const [insights, setInsights] = useState<any>(null);

  async function runInsights() {
    setInsightLoading(true);
    try {
      const { data } = await api.post('/ai/timesheet-insights', {});
      setInsights(data.data);
    } catch {
      toast.error('AI insights failed');
    } finally {
      setInsightLoading(false);
    }
  }
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    hours: '',
    description: '',
    projectId: '',
    billable: true,
    startTime: '',
    endTime: '',
  });

  const { start, end } = getWeekRange(weekDate);

  const startStr = start.toISOString().split('T')[0];
  const endStr = end.toISOString().split('T')[0];

  const { data: summary, isLoading } = useQuery({
    queryKey: ['timesheets-summary', startStr],
    queryFn: async () => {
      const { data } = await api.get('/timesheets/summary?period=week');
      return data.data;
    },
  });

  const { data: entriesData } = useQuery({
    queryKey: ['timeentries', startStr, endStr],
    queryFn: async () => {
      const { data } = await api.get(`/timesheets?startDate=${startStr}&endDate=${endStr}&limit=200`);
      return data.data;
    },
  });

  const { data: projects } = useQuery({
    queryKey: ['projects-list'],
    queryFn: async () => {
      const { data } = await api.get('/projects?limit=100&status=active');
      return data.data?.projects || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editing) return api.put(`/timesheets/${editing.id}`, payload);
      return api.post('/timesheets', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timesheets-summary'] });
      qc.invalidateQueries({ queryKey: ['timeentries'] });
      toast.success(editing ? 'Entry updated' : 'Time logged');
      closeModal();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/timesheets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timesheets-summary'] });
      qc.invalidateQueries({ queryKey: ['timeentries'] });
      toast.success('Entry deleted');
    },
  });

  function openNew(dateStr?: string) {
    setEditing(null);
    setForm({
      date: dateStr || new Date().toISOString().split('T')[0],
      hours: '',
      description: '',
      projectId: '',
      billable: true,
      startTime: '',
      endTime: '',
    });
    setShowModal(true);
  }

  function openEdit(entry: any) {
    setEditing(entry);
    setForm({
      date: entry.date?.split('T')[0] || new Date().toISOString().split('T')[0],
      hours: String(entry.hours),
      description: entry.description || '',
      projectId: entry.projectId || '',
      billable: entry.billable,
      startTime: entry.startTime || '',
      endTime: entry.endTime || '',
    });
    setShowModal(true);
  }

  function closeModal() { setShowModal(false); setEditing(null); }

  function handleSave() {
    if (!form.hours) return toast.error('Hours required');
    saveMutation.mutate({
      date: form.date,
      hours: Number(form.hours),
      description: form.description,
      projectId: form.projectId || undefined,
      billable: form.billable,
      startTime: form.startTime || undefined,
      endTime: form.endTime || undefined,
    });
  }

  // Build week grid
  const weekDays: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    weekDays.push(d);
  }

  const entries: any[] = entriesData?.entries || [];
  const byDate: Record<string, any[]> = {};
  for (const e of entries) {
    const k = e.date?.split('T')[0];
    if (k) { if (!byDate[k]) byDate[k] = []; byDate[k].push(e); }
  }

  const totalHours = Number(summary?.totalHours || 0);
  const billableHours = Number(summary?.billableHours || 0);
  const byProject: any[] = summary?.byProject || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Time Tracking</h1>
          <p className="text-sm text-gray-500 mt-0.5">Log and track billable hours by project</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={runInsights} disabled={insightLoading} className="flex items-center gap-2 px-4 py-2 border border-indigo-200 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors text-sm font-medium disabled:opacity-50">
            {insightLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {insightLoading ? 'Analyzing…' : 'AI Insights'}
          </button>
          <button onClick={() => openNew()} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors text-sm font-medium">
            <Plus className="w-4 h-4" /> Log Time
          </button>
        </div>
      </div>

      {/* AI Insights Panel */}
      {insights && (
        <div className="glass-card rounded-2xl border border-indigo-200 dark:border-indigo-800 overflow-hidden">
          <div className="flex items-center justify-between p-4 bg-indigo-50 dark:bg-indigo-950/30 border-b border-indigo-200 dark:border-indigo-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center"><Sparkles className="w-4 h-4 text-white" /></div>
              <div>
                <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">AI Productivity Insights — Score {insights.productivityScore}/100</p>
                <p className="text-xs text-indigo-500">{insights.summary}</p>
              </div>
            </div>
            <button onClick={() => setInsights(null)} className="text-indigo-400 hover:text-indigo-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-4 grid sm:grid-cols-3 gap-4">
            {insights.topInsights?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Insights</p>
                {insights.topInsights.map((a: string, i: number) => <div key={i} className="flex gap-2 text-xs text-gray-700 dark:text-gray-300 mb-1.5"><TrendingUp className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />{a}</div>)}
              </div>
            )}
            {insights.bottlenecks?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2">Bottlenecks</p>
                {insights.bottlenecks.map((a: string, i: number) => <div key={i} className="flex gap-2 text-xs text-gray-700 dark:text-gray-300 mb-1.5"><AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />{a}</div>)}
                {insights.burnoutRisk && <p className="text-xs mt-2 font-medium text-orange-600">Burnout risk: {insights.burnoutRisk}</p>}
              </div>
            )}
            {insights.recommendations?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recommendations</p>
                {insights.recommendations.map((r: string, i: number) => <div key={i} className="flex gap-2 text-xs text-gray-700 dark:text-gray-300 mb-1.5"><span className="text-indigo-500">→</span>{r}</div>)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'This Week', value: fmtHours(totalHours), icon: Clock, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/30' },
          { label: 'Billable', value: fmtHours(billableHours), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/30' },
          { label: 'Non-Billable', value: fmtHours(totalHours - billableHours), icon: Timer, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/30' },
          { label: 'Utilization', value: totalHours > 0 ? `${Math.round((billableHours / totalHours) * 100)}%` : '—', icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="glass-card rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Week navigator */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <button onClick={() => { const d = new Date(weekDate); d.setDate(d.getDate() - 7); setWeekDate(d); }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
          <button onClick={() => { const d = new Date(weekDate); d.setDate(d.getDate() + 7); setWeekDate(d); }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 divide-x divide-gray-50 dark:divide-gray-800">
          {weekDays.map(day => {
            const key = day.toISOString().split('T')[0];
            const dayEntries = byDate[key] || [];
            const dayHours = dayEntries.reduce((s: number, e: any) => s + Number(e.hours), 0);
            const isToday = key === new Date().toISOString().split('T')[0];
            return (
              <div key={key} className="min-h-36">
                <div className={`px-2 py-2 text-center border-b border-gray-50 dark:border-gray-800 ${isToday ? 'bg-indigo-50 dark:bg-indigo-950/30' : ''}`}>
                  <p className="text-xs text-gray-400">{DAYS[day.getDay()]}</p>
                  <p className={`text-sm font-bold ${isToday ? 'text-indigo-600' : 'text-gray-800 dark:text-gray-200'}`}>{day.getDate()}</p>
                  {dayHours > 0 && <p className="text-xs text-indigo-500 font-medium">{fmtHours(dayHours)}</p>}
                </div>
                <div className="p-1 space-y-1">
                  {dayEntries.map((e: any) => (
                    <div key={e.id} className={`rounded-lg px-2 py-1 text-xs cursor-pointer group relative ${e.billable ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
                      onClick={() => openEdit(e)}>
                      <p className="font-medium truncate">{e.project?.name || 'No project'}</p>
                      <p className="opacity-70">{fmtHours(Number(e.hours))}</p>
                      <button className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded transition-all"
                        onClick={ev => { ev.stopPropagation(); deleteMutation.mutate(e.id); }}>
                        <Trash2 className="w-3 h-3 text-red-400" />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => openNew(key)} className="w-full text-center py-1 opacity-0 hover:opacity-100 text-xs text-gray-400 hover:text-indigo-500 transition-all">
                    + Add
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* By project breakdown */}
      {byProject.length > 0 && (
        <div className="glass-card rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-500" /> Hours by Project
          </h3>
          <div className="space-y-3">
            {byProject.sort((a, b) => b.hours - a.hours).map(p => (
              <div key={p.id}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color || '#6366f1' }} />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{p.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{fmtHours(p.hours)}</span>
                </div>
                <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, (p.hours / (totalHours || 1)) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-5">{editing ? 'Edit Time Entry' : 'Log Time'}</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Date</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Hours *</label>
                  <input type="number" step="0.25" min="0" max="24" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} placeholder="0.0" className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Start</label>
                  <input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">End</label>
                  <input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Project</label>
                <select value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                  <option value="">No project</option>
                  {(projects || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="What did you work on?" className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.billable} onChange={e => setForm(f => ({ ...f, billable: e.target.checked }))} className="w-4 h-4 rounded accent-indigo-600" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Billable</span>
              </label>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={closeModal} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
              <button onClick={handleSave} disabled={saveMutation.isPending} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {saveMutation.isPending ? 'Saving…' : 'Save Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

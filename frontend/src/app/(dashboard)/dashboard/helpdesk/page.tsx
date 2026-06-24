'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatRelativeTime, statusColor, priorityColor } from '@/lib/utils';
import { Plus, Search, MessageSquare, Clock, CheckCircle2, AlertTriangle, Brain, X, Zap, Ticket, Timer, User, Users } from 'lucide-react';

function slaStatus(ticket: any) {
  if (!ticket.slaDeadline) return null;
  const now = Date.now();
  const deadline = new Date(ticket.slaDeadline).getTime();
  const hoursLeft = (deadline - now) / 3600000;
  if (hoursLeft < 0) return { label: `SLA breached ${Math.abs(Math.round(hoursLeft))}h ago`, cls: 'text-red-600 bg-red-100 dark:bg-red-950/30' };
  if (hoursLeft < 4) return { label: `SLA: ${Math.round(hoursLeft)}h left`, cls: 'text-orange-600 bg-orange-100 dark:bg-orange-950/30' };
  return null;
}
import toast from 'react-hot-toast';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { TextField, SelectField, TextAreaField } from '@/components/ui/FormField';

export default function HelpdeskPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [triageResult, setTriageResult] = useState<any>(null);
  const [triageLoading, setTriageLoading] = useState<string | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, priorityFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', debouncedSearch, statusFilter, priorityFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (statusFilter) params.append('status', statusFilter);
      if (priorityFilter) params.append('priority', priorityFilter);
      const { data } = await api.get(`/helpdesk?${params}`);
      return data;
    },
    refetchInterval: 30000,
  });

  const { data: stats } = useQuery({
    queryKey: ['ticket-stats'],
    queryFn: async () => {
      const { data } = await api.get('/helpdesk/stats');
      return data.data;
    },
  });

  const handleTriage = async (ticketId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (triageLoading) return;
    setTriageLoading(ticketId);
    try {
      const { data } = await api.post(`/helpdesk/${ticketId}/ai-triage`);
      setTriageResult(data.data);
    } catch {
      toast.error('AI triage failed');
    } finally {
      setTriageLoading(null);
    }
  };

  const avgResHours = stats?.avgResolutionTime ? Math.round(stats.avgResolutionTime / 60) : null;
  const statCards = [
    { label: 'Open', value: stats?.byStatus?.find((s: any) => s.status === 'open')?._count || 0, icon: MessageSquare, color: 'text-blue-500 bg-blue-50 dark:bg-blue-950/30' },
    { label: 'In Progress', value: stats?.byStatus?.find((s: any) => s.status === 'in_progress')?._count || 0, icon: Clock, color: 'text-yellow-500 bg-yellow-50 dark:bg-yellow-950/30' },
    { label: 'Resolved', value: stats?.byStatus?.find((s: any) => s.status === 'resolved')?._count || 0, icon: CheckCircle2, color: 'text-green-500 bg-green-50 dark:bg-green-950/30' },
    { label: 'Urgent', value: stats?.urgentCount || 0, icon: AlertTriangle, color: 'text-red-500 bg-red-50 dark:bg-red-950/30' },
    ...(avgResHours !== null ? [{ label: 'Avg Resolution', value: `${avgResHours}h`, icon: Timer, color: 'text-purple-500 bg-purple-50 dark:bg-purple-950/30' }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Helpdesk</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Ticket
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="glass-card rounded-2xl p-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
            <p className="text-sm text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets..." className="bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 outline-none flex-1" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 outline-none">
          <option value="">All Statuses</option>
          {['open', 'in_progress', 'resolved', 'closed', 'pending'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 outline-none">
          <option value="">All Priorities</option>
          {['low', 'medium', 'high', 'urgent'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {(statusFilter || priorityFilter) && (
          <button
            onClick={() => { setStatusFilter(''); setPriorityFilter(''); }}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" /> Clear filters
          </button>
        )}
      </div>

      {/* Tickets */}
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 glass-card rounded-xl animate-pulse" />)
        ) : data?.data?.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center text-gray-400">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No tickets found</p>
          </div>
        ) : data?.data?.map((ticket: any) => (
          <div
            key={ticket.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedTicket(ticket)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedTicket(ticket); } }}
            className={`glass-card rounded-xl p-5 cursor-pointer hover:shadow-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${ticket.priority === 'urgent' ? 'border-l-2 border-red-400' : ticket.priority === 'high' ? 'border-l-2 border-orange-400' : ''}`}
          >
            <div className="flex items-start gap-4">
              <div className={`mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${ticket.priority === 'urgent' ? 'bg-red-500 animate-pulse' : ticket.priority === 'high' ? 'bg-orange-500' : ticket.priority === 'medium' ? 'bg-yellow-500' : 'bg-green-500'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs font-mono text-gray-500">#{ticket.ticketNo}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusColor(ticket.status)}`}>{ticket.status.replace('_', ' ')}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${priorityColor(ticket.priority)}`}>{ticket.priority}</span>
                  {ticket.category && <span className="text-xs text-gray-500">{ticket.category.name}</span>}
                  {(() => { const s = slaStatus(ticket); return s ? <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${s.cls}`}>{s.label}</span> : null; })()}
                </div>
                <p className="font-medium text-gray-900 dark:text-white text-sm">{ticket.subject}</p>
                <div className="flex items-center gap-4 mt-1 flex-wrap">
                  <span className="text-xs text-gray-500">{ticket.source}</span>
                  <span className="text-xs text-gray-400">{formatRelativeTime(ticket.createdAt)}</span>
                  <span className="text-xs text-gray-400">{ticket._count?.comments} comments</span>
                  {ticket.assignedTo && (
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <User className="w-3 h-3" />{ticket.assignedTo.firstName} {ticket.assignedTo.lastName}
                    </span>
                  )}
                  {!ticket.assignedTo && <span className="flex items-center gap-1 text-xs text-orange-400"><Users className="w-3 h-3" />Unassigned</span>}
                </div>
              </div>
              <button
                onClick={e => handleTriage(ticket.id, e)}
                disabled={triageLoading === ticket.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 text-xs font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors disabled:opacity-50 flex-shrink-0"
              >
                <Brain className={`w-3.5 h-3.5 ${triageLoading === ticket.id ? 'animate-pulse' : ''}`} />
                {triageLoading === ticket.id ? 'Triaging...' : 'AI Triage'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {data?.meta && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-gray-500">
            Page {data.meta.page} of {data.meta.totalPages} · {data.meta.total} tickets
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={!data.meta.hasPrevPage}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={!data.meta.hasNextPage}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {showModal && <NewTicketModal onClose={() => setShowModal(false)} />}
      {selectedTicket && <TicketDetailModal ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />}

      {triageResult && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl w-full max-w-lg">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2"><Brain className="w-4 h-4 text-indigo-600" />AI Triage Result</h3>
              <button onClick={() => setTriageResult(null)} aria-label="Close triage result" className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Priority', value: triageResult.priority, color: triageResult.priority === 'urgent' ? 'text-red-600 bg-red-50 dark:bg-red-950/30' : triageResult.priority === 'high' ? 'text-orange-600 bg-orange-50' : 'text-blue-600 bg-blue-50 dark:bg-blue-950/30' },
                  { label: 'Sentiment', value: `${{ positive: '😊', neutral: '😐', frustrated: '😤', angry: '😡' }[triageResult.sentiment as string] || '😐'} ${triageResult.sentiment}`, color: 'text-gray-700 bg-gray-50 dark:bg-gray-800' },
                  { label: 'Category', value: triageResult.category, color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/30' },
                ].map(item => (
                  <div key={item.label} className={`${item.color} rounded-xl p-3 text-center`}>
                    <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                    <p className="text-sm font-semibold capitalize">{item.value}</p>
                  </div>
                ))}
              </div>
              {triageResult.summary && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                  <p className="text-xs font-medium text-gray-500 mb-1">Summary</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{triageResult.summary}</p>
                </div>
              )}
              {triageResult.suggestedReply && (
                <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-indigo-600">Suggested Reply</p>
                    <button
                      onClick={() => { navigator.clipboard.writeText(triageResult.suggestedReply); toast.success('Copied'); }}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{triageResult.suggestedReply}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NewTicketModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ subject: '', description: '', priority: 'medium', source: 'web' });

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/helpdesk', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tickets'] }); toast.success('Ticket created'); onClose(); },
    onError: () => toast.error('Failed to create ticket'),
  });

  return (
    <Modal onClose={onClose} title="New Support Ticket" subtitle="Log a new issue for the support team to triage" icon={Ticket} iconColor="red">
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }}>
        <div className="p-6 space-y-4">
          <TextField id="ticket-subject" label="Subject" required value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Brief description of the issue" />
          <TextAreaField id="ticket-description" label="Description" rows={4} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Detailed description..." />
          <div className="grid grid-cols-2 gap-4">
            <SelectField id="ticket-priority" label="Priority" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
              {['low', 'medium', 'high', 'urgent'].map(p => <option key={p} value={p}>{p}</option>)}
            </SelectField>
            <SelectField id="ticket-source" label="Source" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
              {['web', 'email', 'whatsapp', 'phone'].map(s => <option key={s} value={s}>{s}</option>)}
            </SelectField>
          </div>
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {mutation.isPending ? 'Creating...' : 'Create Ticket'}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function TicketDetailModal({ ticket, onClose }: { ticket: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);

  const { data } = useQuery({
    queryKey: ['ticket', ticket.id],
    queryFn: async () => {
      const { data } = await api.get(`/helpdesk/${ticket.id}`);
      return data.data;
    },
  });

  const commentMutation = useMutation({
    mutationFn: ({ content, isInternal }: { content: string; isInternal: boolean }) => api.post(`/helpdesk/${ticket.id}/comments`, { content, isInternal }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ticket', ticket.id] }); setComment(''); setIsInternal(false); },
    onError: () => toast.error('Failed to add comment'),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => api.put(`/helpdesk/${ticket.id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tickets'] }); qc.invalidateQueries({ queryKey: ['ticket', ticket.id] }); },
    onError: () => toast.error('Failed to update ticket status'),
  });

  const t = data || ticket;

  return (
    <Modal onClose={onClose} title={t.subject} subtitle={`#${t.ticketNo} · ${t.status?.replace('_', ' ')}`} icon={MessageSquare} iconColor="blue" size="2xl">
      <div className="flex items-center justify-end gap-2 px-6 pt-4">
        <select
          value={t.status}
          onChange={e => statusMutation.mutate(e.target.value)}
          className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none"
        >
          {['open', 'in_progress', 'pending', 'resolved', 'closed'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </div>

      <div className="p-6 space-y-4">
          {t.description && (
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <p className="text-sm text-gray-700 dark:text-gray-300">{t.description}</p>
            </div>
          )}

          {t.comments?.map((c: any) => (
            <div key={c.id} className={`flex gap-3 ${c.isInternal ? 'opacity-90' : ''}`}>
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {c.user?.firstName?.[0] || '?'}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{c.user ? `${c.user.firstName} ${c.user.lastName}` : 'Unknown user'}</span>
                  <span className="text-xs text-gray-400">{formatRelativeTime(c.createdAt)}</span>
                  {c.isInternal && <span className="text-xs text-orange-500 bg-orange-50 dark:bg-orange-950/30 px-1.5 py-0.5 rounded">Internal</span>}
                </div>
                <p className={`text-sm text-gray-600 dark:text-gray-400 rounded-xl p-3 border ${c.isInternal ? 'bg-orange-50/50 dark:bg-orange-950/10 border-orange-100 dark:border-orange-900' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>{c.content}</p>
              </div>
            </div>
          ))}
      </div>

      <div className="p-6 border-t border-gray-200 dark:border-gray-700 space-y-2">
        <div className="flex gap-3">
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder={isInternal ? 'Add an internal note (not visible to the customer)...' : 'Add a comment...'}
            rows={2}
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <button
            onClick={() => { if (comment.trim()) commentMutation.mutate({ content: comment.trim(), isInternal }); }}
            disabled={!comment.trim() || commentMutation.isPending}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer w-fit">
          <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} className="rounded" />
          Internal note (only visible to your team)
        </label>
      </div>
    </Modal>
  );
}

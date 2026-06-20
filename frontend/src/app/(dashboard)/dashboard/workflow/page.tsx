'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDateTime, statusColor } from '@/lib/utils';
import { Plus, Play, Pause, Trash2, Zap, ArrowRight, Mail, Bell, CheckSquare, Clock, Edit } from 'lucide-react';
import toast from 'react-hot-toast';
import { useModalA11y } from '@/hooks/useModalA11y';

const TRIGGER_TYPES = [
  { value: 'lead_created', label: 'Lead Created' },
  { value: 'lead_status_changed', label: 'Lead Status Changed' },
  { value: 'deal_created', label: 'Deal Created' },
  { value: 'ticket_created', label: 'Ticket Created' },
  { value: 'manual', label: 'Manual Trigger' },
  { value: 'schedule', label: 'Scheduled' },
];

const ACTION_ICONS: Record<string, any> = {
  send_email: Mail,
  create_task: CheckSquare,
  create_notification: Bell,
  update_lead: Zap,
  wait: Clock,
};

export default function WorkflowPage() {
  const [showBuilder, setShowBuilder] = useState(false);
  const [editWorkflow, setEditWorkflow] = useState<any>(null);
  const qc = useQueryClient();

  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: async () => { const { data } = await api.get('/workflows'); return data; },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.post(`/workflows/${id}/toggle`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workflows'] }); toast.success('Workflow updated'); },
  });

  const triggerMutation = useMutation({
    mutationFn: ({ id, payload }: any) => api.post(`/workflows/${id}/trigger`, { payload }),
    onSuccess: () => toast.success('Workflow triggered'),
    onError: () => toast.error('Trigger failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/workflows/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workflows'] }); toast.success('Workflow deleted'); },
    onError: () => toast.error('Failed to delete'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Workflow Automation</h1>
          <p className="text-sm text-gray-500 mt-0.5">Automate repetitive tasks and business processes</p>
        </div>
        <button onClick={() => { setEditWorkflow(null); setShowBuilder(true); }} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> New Workflow
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Workflows', value: workflows?.meta?.total || workflows?.data?.length || 0, color: 'text-indigo-600' },
          { label: 'Active', value: workflows?.data?.filter((w: any) => w.isActive).length || 0, color: 'text-green-600' },
          { label: 'Total Executions', value: workflows?.data?.reduce((s: number, w: any) => s + (w._count?.executions || 0), 0) || 0, color: 'text-blue-600' },
        ].map(stat => (
          <div key={stat.label} className="glass-card rounded-2xl p-4">
            <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Workflow list */}
      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 glass-card rounded-2xl animate-pulse" />)
        ) : workflows?.data?.length === 0 ? (
          <div className="glass-card rounded-2xl p-16 text-center">
            <Zap className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500 font-medium">No workflows yet</p>
            <p className="text-sm text-gray-400 mt-1">Create your first automation to save time on repetitive tasks</p>
            <button onClick={() => setShowBuilder(true)} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">Create Workflow</button>
          </div>
        ) : workflows?.data?.map((wf: any) => (
          <div key={wf.id} className="glass-card rounded-2xl p-5">
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${wf.isActive ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
                <Zap className={`w-5 h-5 ${wf.isActive ? 'text-green-600' : 'text-gray-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{wf.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${wf.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700'}`}>
                    {wf.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {wf.description && <p className="text-xs text-gray-500 mb-2">{wf.description}</p>}
                <div className="flex items-center gap-2 flex-wrap">
                  <TriggerBadge trigger={wf.trigger} />
                  <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  <NodeFlow nodes={wf.nodes || []} />
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                  <span>{wf._count?.executions || 0} executions</span>
                  <span>Updated {formatDateTime(wf.updatedAt)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => triggerMutation.mutate({ id: wf.id, payload: {} })} title="Trigger manually" className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg"><Play className="w-4 h-4" /></button>
                <button onClick={() => toggleMutation.mutate(wf.id)} title={wf.isActive ? 'Pause' : 'Activate'} className={`p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 ${wf.isActive ? 'text-green-500 hover:text-orange-500' : 'text-gray-400 hover:text-green-500'}`}>
                  {wf.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button onClick={() => { setEditWorkflow(wf); setShowBuilder(true); }} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg"><Edit className="w-4 h-4" /></button>
                <button onClick={() => { if (confirm('Delete this workflow?')) deleteMutation.mutate(wf.id); }} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showBuilder && <WorkflowBuilder workflow={editWorkflow} onClose={() => setShowBuilder(false)} />}
    </div>
  );
}

function TriggerBadge({ trigger }: { trigger: string }) {
  const label = TRIGGER_TYPES.find(t => t.value === trigger)?.label || trigger;
  return <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded text-xs font-medium">{label}</span>;
}

function NodeFlow({ nodes }: { nodes: any[] }) {
  if (!nodes.length) return <span className="text-xs text-gray-400">No actions</span>;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {nodes.slice(0, 3).map((node: any, i: number) => {
        const Icon = ACTION_ICONS[node.type] || Zap;
        return (
          <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-300">
            <Icon className="w-3 h-3" />{node.name || node.type}
          </span>
        );
      })}
      {nodes.length > 3 && <span className="text-xs text-gray-400">+{nodes.length - 3}</span>}
    </div>
  );
}

function WorkflowBuilder({ workflow, onClose }: { workflow: any; onClose: () => void }) {
  const qc = useQueryClient();
  const modalRef = useModalA11y(onClose);
  const [form, setForm] = useState({
    name: workflow?.name || '',
    description: workflow?.description || '',
    trigger: workflow?.trigger || 'manual',
    triggerConfig: workflow?.triggerConfig || {},
    nodes: workflow?.nodes || [],
  });
  const [nodes, setNodes] = useState<any[]>(workflow?.nodes || []);
  const [showActionMenu, setShowActionMenu] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: any) => workflow ? api.put(`/workflows/${workflow.id}`, data) : api.post('/workflows', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workflows'] }); toast.success(workflow ? 'Workflow updated' : 'Workflow created'); onClose(); },
    onError: () => toast.error('Failed to save workflow'),
  });

  const addNode = (type: string) => {
    const id = `node_${Date.now()}`;
    setNodes([...nodes, { id, type, name: type.replace('_', ' '), config: {} }]);
  };

  const removeNode = (id: string) => setNodes(nodes.filter(n => n.id !== id));

  const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div ref={modalRef} tabIndex={-1} className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 outline-none animate-in fade-in duration-200">
      <div className="glass-card rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">{workflow ? 'Edit' : 'New'} Workflow</h3>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label htmlFor="workflow-name" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Workflow Name*</label><input id="workflow-name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="e.g. New Lead Welcome Email" /></div>
            <div className="col-span-2"><label htmlFor="workflow-description" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label><input id="workflow-description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputCls} /></div>
            <div className="col-span-2"><label htmlFor="workflow-trigger" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Trigger</label>
              <select id="workflow-trigger" value={form.trigger} onChange={e => setForm({ ...form, trigger: e.target.value })} className={inputCls}>
                {TRIGGER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Actions ({nodes.length})</h4>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowActionMenu(v => !v)}
                  aria-expanded={showActionMenu}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg"
                >
                  <Plus className="w-3 h-3" /> Add Action
                </button>
                {showActionMenu && (
                  <>
                    <div className="fixed inset-0 z-[5]" onClick={() => setShowActionMenu(false)} />
                    <div className="absolute right-0 top-8 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-10 min-w-44">
                      {Object.keys(ACTION_ICONS).map(type => {
                        const Icon = ACTION_ICONS[type];
                        return (
                          <button key={type} onClick={() => { addNode(type); setShowActionMenu(false); }} className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
                            <Icon className="w-3.5 h-3.5" />{type.replace(/_/g, ' ')}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            {nodes.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center text-gray-400">
                <p className="text-sm">Add actions to define what this workflow will do</p>
              </div>
            ) : (
              <div className="space-y-2">
                {nodes.map((node, i) => {
                  const Icon = ACTION_ICONS[node.type] || Zap;
                  return (
                    <div key={node.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                      <div className="w-7 h-7 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">{node.type.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-gray-400">Step {i + 1}</p>
                      </div>
                      <button onClick={() => removeNode(node.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
          <button onClick={() => {
            if (!form.name) { toast.error('Name is required'); return; }
            mutation.mutate({ ...form, nodes });
          }} disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">
            {mutation.isPending ? 'Saving...' : workflow ? 'Update' : 'Create Workflow'}
          </button>
        </div>
      </div>
    </div>
  );
}

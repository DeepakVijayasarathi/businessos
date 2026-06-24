'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Plus, ChevronDown, DollarSign, User, TrendingUp, BarChart2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { TextField, SelectField, TextAreaField } from '@/components/ui/FormField';

export default function PipelinePage() {
  const [activePipelineId, setActivePipelineId] = useState<string>('');
  const [showDealModal, setShowDealModal] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState('');
  const qc = useQueryClient();

  const { data: pipelines } = useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => {
      const { data } = await api.get('/crm/pipelines');
      return data.data;
    },
  });

  useEffect(() => {
    if (pipelines?.length && !activePipelineId) {
      setActivePipelineId(pipelines[0].id);
    }
  }, [pipelines, activePipelineId]);

  const { data: kanban, isLoading } = useQuery({
    queryKey: ['kanban', activePipelineId],
    enabled: !!activePipelineId,
    queryFn: async () => {
      const { data } = await api.get(`/crm/kanban/${activePipelineId}`);
      return data.data.stages || [];
    },
  });

  const moveDeal = useMutation({
    mutationFn: ({ dealId, stageId }: any) => api.put(`/crm/deals/${dealId}/move`, { stageId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kanban', activePipelineId] }),
  });

  const pipeline = pipelines?.find((p: any) => p.id === activePipelineId);
  const totalValue = kanban?.reduce((sum: number, stage: any) => sum + stage.deals.reduce((s: number, d: any) => s + (d.value || 0), 0), 0) || 0;
  const weightedForecast = kanban?.reduce((sum: number, stage: any) => sum + stage.deals.reduce((s: number, d: any) => s + ((d.value || 0) * ((d.probability || 0) / 100)), 0), 0) || 0;
  const [showForecast, setShowForecast] = useState(false);

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">Total value: {formatCurrency(totalValue)} · Weighted: {formatCurrency(weightedForecast)}</p>
        </div>
        <div className="flex items-center gap-3">
          {pipelines?.length > 1 && (
            <select aria-label="Select pipeline" value={activePipelineId} onChange={e => setActivePipelineId(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none">
              {pipelines.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button onClick={() => setShowForecast(!showForecast)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${showForecast ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/20 dark:border-indigo-700 dark:text-indigo-300' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
            <BarChart2 className="w-4 h-4" /> Forecast
          </button>
          <button onClick={() => setShowDealModal(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> Add Deal
          </button>
        </div>
      </div>

      {showForecast && kanban && (
        <div className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-indigo-500" />
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Weighted Forecast by Stage</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {kanban.map((stage: any) => {
              const raw = stage.deals.reduce((s: number, d: any) => s + (d.value || 0), 0);
              const weighted = stage.deals.reduce((s: number, d: any) => s + ((d.value || 0) * ((d.probability || 0) / 100)), 0);
              const avgProb = stage.deals.length ? Math.round(stage.deals.reduce((s: number, d: any) => s + (d.probability || 0), 0) / stage.deals.length) : 0;
              return (
                <div key={stage.id} className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color || '#6366f1' }} />
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{stage.name}</p>
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(weighted)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{stage.deals.length} deal{stage.deals.length !== 1 ? 's' : ''} · {avgProb}% avg</p>
                  <p className="text-xs text-gray-400">Raw: {formatCurrency(raw)}</p>
                </div>
              );
            })}
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700">
              <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-2">Total Forecast</p>
              <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300">{formatCurrency(weightedForecast)}</p>
              <p className="text-xs text-indigo-400 mt-0.5">of {formatCurrency(totalValue)} pipeline</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max h-full">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-72 h-96 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
            ))
          ) : kanban?.map((stage: any) => (
            <div key={stage.id} className="kanban-column w-72 flex flex-col">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color || '#6366f1' }} />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{stage.name}</span>
                  <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">{stage.deals.length}</span>
                </div>
                <button onClick={() => { setSelectedStageId(stage.id); setShowDealModal(true); }} aria-label={`Add deal to ${stage.name}`} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-indigo-600 rounded">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto">
                {stage.deals.map((deal: any) => (
                  <DealCard key={deal.id} deal={deal} stages={kanban} onMove={(stageId) => moveDeal.mutate({ dealId: deal.id, stageId })} />
                ))}
                {stage.deals.length === 0 && (
                  <div className="h-20 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-center">
                    <p className="text-xs text-gray-400">No deals</p>
                  </div>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 px-1">
                <p className="text-xs text-gray-500">{formatCurrency(stage.deals.reduce((s: number, d: any) => s + (d.value || 0), 0))}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showDealModal && (
        <DealModal
          pipelineId={activePipelineId}
          stageId={selectedStageId}
          stages={kanban || []}
          onClose={() => { setShowDealModal(false); setSelectedStageId(''); }}
        />
      )}
    </div>
  );
}

function DealCard({ deal, stages, onMove }: { deal: any; stages: any[]; onMove: (stageId: string) => void }) {
  const [showMove, setShowMove] = useState(false);
  return (
    <div className="kanban-card">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm font-medium text-gray-900 dark:text-white leading-tight">{deal.name}</p>
        <div className="relative">
          <button onClick={() => setShowMove(!showMove)} className="p-1 text-gray-400 hover:text-gray-600 rounded"><ChevronDown className="w-3 h-3" /></button>
          {showMove && (
            <div className="absolute right-0 top-6 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-10 min-w-40">
              {stages.filter(s => s.id !== deal.stageId).map(s => (
                <button key={s.id} onClick={() => { onMove(s.id); setShowMove(false); }} className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                  Move to {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {deal.value && (
        <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 mb-2">
          <DollarSign className="w-3 h-3" />{formatCurrency(deal.value)}
        </div>
      )}
      {deal.contact && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <User className="w-3 h-3" />{deal.contact.firstName} {deal.contact.lastName}
        </div>
      )}
      {deal.closingDate && (
        <p className="text-xs text-gray-400 mt-1">Close: {new Date(deal.closingDate).toLocaleDateString()}</p>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          deal.probability >= 75 ? 'bg-green-100 text-green-700' :
          deal.probability >= 50 ? 'bg-yellow-100 text-yellow-700' :
          'bg-gray-100 text-gray-600'
        }`}>{deal.probability || 0}%</span>
      </div>
    </div>
  );
}

function DealModal({ pipelineId, stageId, stages, onClose }: { pipelineId: string; stageId: string; stages: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '', value: '', stageId: stageId || stages[0]?.id || '', probability: '50',
    expectedCloseDate: '', notes: '',
  });

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/crm/deals', { ...data, pipelineId, value: data.value ? parseFloat(data.value) : null, probability: parseInt(data.probability) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['kanban'] }); toast.success('Deal created'); onClose(); },
    onError: () => toast.error('Failed to create deal'),
  });

  return (
    <Modal onClose={onClose} title="New Deal" subtitle="Add a new deal to your pipeline" icon={DollarSign} iconColor="green">
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }}>
        <div className="p-6 space-y-4">
          <TextField id="deal-name" label="Deal Name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <TextField id="deal-value" label="Value" type="number" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} placeholder="0.00" />
            <TextField id="deal-probability" label="Win Probability %" type="number" min="0" max="100" value={form.probability} onChange={e => setForm({ ...form, probability: e.target.value })} />
            <SelectField id="deal-stageId" label="Stage" value={form.stageId} onChange={e => setForm({ ...form, stageId: e.target.value })}>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </SelectField>
            <TextField id="deal-expectedCloseDate" label="Expected Close" type="date" value={form.expectedCloseDate} onChange={e => setForm({ ...form, expectedCloseDate: e.target.value })} />
          </div>
          <TextAreaField id="deal-notes" label="Notes" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Creating...' : 'Create Deal'}</button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

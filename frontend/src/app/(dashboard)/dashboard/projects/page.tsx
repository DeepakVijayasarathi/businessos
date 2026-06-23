'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDate, statusColor } from '@/lib/utils';
import { Plus, FolderKanban, Calendar, Users, CheckCircle2, Clock, AlertCircle, Circle, Edit, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { TextField, SelectField, TextAreaField } from '@/components/ui/FormField';

export default function ProjectsPage() {
  const [showModal, setShowModal] = useState(false);
  const [editProject, setEditProject] = useState<any>(null);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); toast.success('Project deleted'); },
    onError: () => toast.error('Failed to delete project'),
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => { const { data } = await api.get('/projects'); return data; },
  });

  const statusIcons: Record<string, any> = {
    planning: Clock, active: CheckCircle2, on_hold: AlertCircle, completed: CheckCircle2, cancelled: Circle,
  };

  const statusColors: Record<string, string> = {
    planning: 'text-blue-500', active: 'text-green-500', on_hold: 'text-yellow-500', completed: 'text-purple-500', cancelled: 'text-gray-400',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Projects</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.meta?.total || 0} projects</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> New Project
        </button>
      </div>

      {/* Projects grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-48 glass-card rounded-2xl animate-pulse" />)
        ) : isError ? (
          <div className="col-span-3 glass-card rounded-2xl p-12 text-center text-gray-400">
            <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Failed to load projects. Please try again.</p>
          </div>
        ) : data?.data?.length === 0 ? (
          <div className="col-span-3 glass-card rounded-2xl p-12 text-center text-gray-400">
            <FolderKanban className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No projects yet. Create your first project!</p>
          </div>
        ) : data?.data?.map((project: any) => {
          const StatusIcon = statusIcons[project.status] || Circle;
          return (
            <div
              key={project.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedProject(project)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedProject(project); } }}
              className="glass-card rounded-2xl p-6 cursor-pointer hover:shadow-xl transition-all group focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: (project.color || '#6366f1') + '20' }}>
                  <FolderKanban className="w-5 h-5" style={{ color: project.color || '#6366f1' }} />
                </div>
                <div className="flex items-center gap-1">
                  <span className={`flex items-center gap-1 text-xs font-medium capitalize ${statusColors[project.status] || 'text-gray-500'}`}>
                    <StatusIcon className="w-3.5 h-3.5" />
                    {project.status.replace('_', ' ')}
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); setEditProject(project); setShowModal(true); }}
                    className="p-1 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Edit project"
                  ><Edit className="w-3.5 h-3.5" /></button>
                  <button
                    onClick={e => { e.stopPropagation(); if (confirm('Delete this project and all its tasks?')) deleteMutation.mutate(project.id); }}
                    className="p-1 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Delete project"
                  ><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>

              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{project.name}</h3>
              {project.description && <p className="text-xs text-gray-500 line-clamp-2 mb-4">{project.description}</p>}

              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Progress</span>
                  <span>{project.progress}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${project.progress}%`, background: project.color || '#6366f1' }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {project._count?.tasks || 0} tasks
                </div>
                <div className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {project.members?.length || 0} members
                </div>
                {project.endDate && (
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(project.endDate)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showModal && <ProjectModal project={editProject} onClose={() => { setShowModal(false); setEditProject(null); }} />}
      {selectedProject && <ProjectKanban project={selectedProject} onClose={() => setSelectedProject(null)} />}
    </div>
  );
}

function ProjectModal({ project, onClose }: { project?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: project?.name || '', description: project?.description || '',
    status: project?.status || 'planning', priority: project?.priority || 'medium',
    startDate: project?.startDate?.slice(0,10) || '', endDate: project?.endDate?.slice(0,10) || '',
    color: project?.color || '#6366f1',
  });

  const mutation = useMutation({
    mutationFn: (data: any) => project ? api.put(`/projects/${project.id}`, data) : api.post('/projects', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); toast.success(project ? 'Project updated' : 'Project created'); onClose(); },
    onError: () => toast.error(project ? 'Failed to update project' : 'Failed to create project'),
  });

  return (
    <Modal onClose={onClose} title={project ? 'Edit Project' : 'New Project'} subtitle={project ? 'Update project details' : 'Set up a new project to track tasks and progress'} icon={FolderKanban} iconColor="teal">
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="flex flex-col">
        <div className="p-6 space-y-4">
          <TextField id="project-name" label="Project Name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <TextAreaField id="project-description" label="Description" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <SelectField id="project-status" label="Status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              {['planning', 'active', 'on_hold', 'completed', 'cancelled'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </SelectField>
            <SelectField id="project-priority" label="Priority" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
              {['low', 'medium', 'high'].map(p => <option key={p} value={p}>{p}</option>)}
            </SelectField>
            <TextField id="project-startDate" label="Start Date" type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
            <TextField id="project-endDate" label="End Date" type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="project-color" className="text-xs font-medium text-gray-700 dark:text-gray-300">Color</label>
            <input id="project-color" type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} className="w-10 h-10 rounded-lg cursor-pointer border border-gray-200" />
          </div>
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">{mutation.isPending ? (project ? 'Saving...' : 'Creating...') : (project ? 'Save Changes' : 'Create Project')}</button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

const KANBAN_COLUMNS = [
  { key: 'todo', label: 'To Do', color: '#94a3b8' },
  { key: 'in_progress', label: 'In Progress', color: '#6366f1' },
  { key: 'review', label: 'Review', color: '#f59e0b' },
  { key: 'done', label: 'Done', color: '#10b981' },
];

function ProjectKanban({ project, onClose }: { project: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [addingTaskTo, setAddingTaskTo] = useState<string | null>(null);
  const { data: board, isLoading, isError } = useQuery({
    queryKey: ['kanban', project.id],
    queryFn: async () => { const { data } = await api.get(`/projects/${project.id}/kanban`); return data.data; },
  });

  const moveMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) => api.put(`/projects/tasks/${taskId}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kanban', project.id] }),
    onError: () => toast.error('Failed to move task'),
  });

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: project.color + '30' }}>
              <FolderKanban className="w-4 h-4" style={{ color: project.color }} />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">{project.name} — Kanban</h3>
          </div>
          <button onClick={onClose} aria-label="Close kanban board" className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="flex-1 overflow-x-auto p-6">
          {isError ? (
            <div className="text-center text-gray-400 py-12">
              <p className="text-sm">Failed to load board. Try closing and reopening.</p>
            </div>
          ) : (
          <div className="flex gap-4 h-full min-h-96">
            {KANBAN_COLUMNS.map(col => (
              <div key={col.key} className="kanban-column min-h-full">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300">{col.label}</h4>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-medium">{isLoading ? '…' : board?.[col.key]?.length || 0}</span>
                    <button onClick={() => setAddingTaskTo(col.key)} aria-label={`Add task to ${col.label}`} className="text-gray-400 hover:text-indigo-600 text-sm font-bold leading-none">+</button>
                  </div>
                </div>
                <div className="space-y-3 flex-1">
                  {isLoading ? (
                    Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />)
                  ) : board?.[col.key]?.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">No tasks</p>
                  ) : board?.[col.key]?.map((task: any) => (
                    <div key={task.id} className="kanban-card">
                      <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">{task.title}</p>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${task.priority === 'urgent' ? 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400' : task.priority === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>{task.priority}</span>
                        {task.assignee && (
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                            {task.assignee.firstName?.[0] || '?'}
                          </div>
                        )}
                      </div>
                      <select
                        aria-label={`Move "${task.title}"`}
                        value={task.status}
                        disabled={moveMutation.isPending}
                        onChange={e => moveMutation.mutate({ taskId: task.id, status: e.target.value })}
                        className="w-full text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 outline-none"
                      >
                        {KANBAN_COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      </div>
      {addingTaskTo && (
        <TaskModal
          projectId={project.id}
          status={addingTaskTo}
          onClose={() => setAddingTaskTo(null)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['kanban', project.id] })}
        />
      )}
    </div>
  );
}

function TaskModal({ projectId, status, onClose, onCreated }: { projectId: string; status: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium' });

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/projects/tasks', { ...data, projectId, status }),
    onSuccess: () => { onCreated(); toast.success('Task added'); onClose(); },
    onError: () => toast.error('Failed to add task'),
  });

  return (
    <Modal onClose={onClose} title="New Task" subtitle={`Adding to ${KANBAN_COLUMNS.find(c => c.key === status)?.label}`} icon={FolderKanban} iconColor="indigo">
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }}>
        <div className="p-6 space-y-4">
          <TextField id="task-title" label="Task Title" required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <TextAreaField id="task-description" label="Description" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <SelectField id="task-priority" label="Priority" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
            {['low', 'medium', 'high', 'urgent'].map(p => <option key={p} value={p}>{p}</option>)}
          </SelectField>
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">{mutation.isPending ? 'Adding...' : 'Add Task'}</button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

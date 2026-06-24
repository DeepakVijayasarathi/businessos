'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Briefcase, Plus, Users, Search, Star, Trash2, Edit2, Calendar, ChevronRight, UserCheck, XCircle, CheckCircle2, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];
const STAGE_COLORS: Record<string, string> = {
  applied: 'bg-blue-100 text-blue-700',
  screening: 'bg-yellow-100 text-yellow-700',
  interview: 'bg-purple-100 text-purple-700',
  offer: 'bg-orange-100 text-orange-700',
  hired: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

const JOB_TYPES = ['full_time', 'part_time', 'contract', 'intern'];
const JOB_STATUSES = ['open', 'closed', 'draft', 'paused'];

export default function RecruitmentPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'pipeline' | 'jobs'>('pipeline');
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [showJobModal, setShowJobModal] = useState(false);
  const [showCandidateModal, setShowCandidateModal] = useState(false);
  const [editingJob, setEditingJob] = useState<any>(null);
  const [editingCandidate, setEditingCandidate] = useState<any>(null);
  const [jobForm, setJobForm] = useState({ title: '', department: '', location: '', type: 'full_time', description: '', requirements: '', salaryMin: '', salaryMax: '', openings: '1', deadline: '', status: 'open' });
  const [candidateForm, setCandidateForm] = useState({ firstName: '', lastName: '', email: '', phone: '', source: '', notes: '', expectedSalary: '', stage: 'applied', jobId: '' });

  const { data: jobsData } = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => { const { data } = await api.get('/recruitment/jobs?limit=100'); return data.data; },
  });

  const { data: candidatesData } = useQuery({
    queryKey: ['candidates', selectedJob?.id, search],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '200' });
      if (selectedJob) params.set('jobId', selectedJob.id);
      if (search) params.set('search', search);
      const { data } = await api.get(`/recruitment/candidates?${params}`);
      return data.data;
    },
  });

  const saveJobMutation = useMutation({
    mutationFn: (payload: any) => editingJob ? api.put(`/recruitment/jobs/${editingJob.id}`, payload) : api.post('/recruitment/jobs', payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs'] }); toast.success(editingJob ? 'Job updated' : 'Job created'); setShowJobModal(false); setEditingJob(null); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const deleteJobMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/recruitment/jobs/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs'] }); toast.success('Job deleted'); if (selectedJob) setSelectedJob(null); },
  });

  const saveCandidateMutation = useMutation({
    mutationFn: (payload: any) => editingCandidate ? api.put(`/recruitment/candidates/${editingCandidate.id}`, payload) : api.post('/recruitment/candidates', payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['candidates'] }); toast.success(editingCandidate ? 'Candidate updated' : 'Candidate added'); setShowCandidateModal(false); setEditingCandidate(null); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const deleteCandidateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/recruitment/candidates/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['candidates'] }); toast.success('Candidate removed'); },
  });

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) => api.put(`/recruitment/candidates/${id}`, { stage }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['candidates'] }),
  });

  function openJobModal(job?: any) {
    setEditingJob(job || null);
    if (job) {
      setJobForm({ title: job.title, department: job.department || '', location: job.location || '', type: job.type, description: job.description || '', requirements: job.requirements || '', salaryMin: job.salaryMin || '', salaryMax: job.salaryMax || '', openings: String(job.openings), deadline: job.deadline?.split('T')[0] || '', status: job.status });
    } else {
      setJobForm({ title: '', department: '', location: '', type: 'full_time', description: '', requirements: '', salaryMin: '', salaryMax: '', openings: '1', deadline: '', status: 'open' });
    }
    setShowJobModal(true);
  }

  function openCandidateModal(candidate?: any) {
    setEditingCandidate(candidate || null);
    if (candidate) {
      setCandidateForm({ firstName: candidate.firstName, lastName: candidate.lastName || '', email: candidate.email, phone: candidate.phone || '', source: candidate.source || '', notes: candidate.notes || '', expectedSalary: candidate.expectedSalary || '', stage: candidate.stage, jobId: candidate.jobId });
    } else {
      setCandidateForm({ firstName: '', lastName: '', email: '', phone: '', source: '', notes: '', expectedSalary: '', stage: 'applied', jobId: selectedJob?.id || '' });
    }
    setShowCandidateModal(true);
  }

  const jobs = jobsData?.jobs || [];
  const candidates: any[] = candidatesData?.candidates || [];

  const byStage: Record<string, any[]> = {};
  for (const s of STAGES) byStage[s] = [];
  for (const c of candidates) { if (byStage[c.stage]) byStage[c.stage].push(c); }

  const openJobs = jobs.filter((j: any) => j.status === 'open').length;
  const totalCandidates = candidates.length;
  const hired = byStage.hired.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Recruitment</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage job postings and applicant pipeline</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => openCandidateModal()} className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 font-medium">
            <Users className="w-4 h-4" /> Add Candidate
          </button>
          <button onClick={() => openJobModal()} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-medium">
            <Plus className="w-4 h-4" /> Post Job
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Open Positions', value: openJobs, icon: Briefcase, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/30' },
          { label: 'Total Candidates', value: totalCandidates, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' },
          { label: 'Hired This View', value: hired, icon: UserCheck, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/30' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="glass-card rounded-2xl p-5 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl ${bg} flex items-center justify-center flex-shrink-0`}>
              <Icon className={`w-6 h-6 ${color}`} />
            </div>
            <div>
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['pipeline', 'jobs'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all ${tab === t ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'}`}>{t}</button>
        ))}
      </div>

      {tab === 'pipeline' && (
        <div className="space-y-4">
          {/* Filter by job */}
          <div className="flex items-center gap-3">
            <select value={selectedJob?.id || ''} onChange={e => setSelectedJob(jobs.find((j: any) => j.id === e.target.value) || null)} className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200">
              <option value="">All Jobs</option>
              {jobs.map((j: any) => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 flex-1 max-w-xs">
              <Search className="w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search candidates..." className="bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 outline-none flex-1" />
            </div>
          </div>

          {/* Kanban */}
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 overflow-x-auto pb-2">
            {STAGES.map(stage => (
              <div key={stage} className="min-w-36">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{stage}</span>
                  <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full px-1.5 py-0.5">{byStage[stage].length}</span>
                </div>
                <div className="space-y-2 min-h-24">
                  {byStage[stage].map(c => (
                    <div key={c.id} className="glass-card rounded-xl p-3 group">
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.firstName} {c.lastName}</p>
                          <p className="text-xs text-gray-400 truncate">{c.job?.title}</p>
                          {c.source && <p className="text-xs text-gray-300 dark:text-gray-500 mt-0.5 capitalize">{c.source}</p>}
                        </div>
                        <button onClick={() => deleteCandidateMutation.mutate(c.id)} className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded transition-all flex-shrink-0">
                          <Trash2 className="w-3 h-3 text-red-400" />
                        </button>
                      </div>
                      {/* Stage move */}
                      <div className="mt-2 flex gap-1">
                        {stage !== 'hired' && stage !== 'rejected' && (
                          <button onClick={() => stageMutation.mutate({ id: c.id, stage: STAGES[STAGES.indexOf(stage) + 1] })} className="flex-1 text-xs py-1 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 rounded-lg hover:bg-indigo-100 flex items-center justify-center gap-0.5">
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                        {stage !== 'rejected' && (
                          <button onClick={() => stageMutation.mutate({ id: c.id, stage: 'rejected' })} className="p-1 bg-red-50 dark:bg-red-950/20 text-red-400 rounded-lg hover:bg-red-100">
                            <XCircle className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'jobs' && (
        <div className="space-y-3">
          {jobs.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center">
              <Briefcase className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-400">No job postings yet. Create your first one!</p>
            </div>
          ) : jobs.map((j: any) => (
            <div key={j.id} className="glass-card rounded-2xl p-5 flex items-center gap-4 group">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center flex-shrink-0">
                <Briefcase className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900 dark:text-white">{j.title}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${j.status === 'open' ? 'bg-green-100 text-green-700' : j.status === 'paused' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>{j.status}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  {j.department && <span>{j.department}</span>}
                  {j.location && <span>• {j.location}</span>}
                  <span>• {j.type.replace('_', ' ')}</span>
                  <span className="text-indigo-500 font-medium">• {j._count?.candidates || 0} candidates</span>
                  {j.deadline && <span>• Due {formatDate(j.deadline)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openJobModal(j)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
                  <Edit2 className="w-4 h-4 text-gray-500" />
                </button>
                <button onClick={() => deleteJobMutation.mutate(j.id)} className="p-2 hover:bg-red-50 rounded-xl transition-colors">
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Job Modal */}
      {showJobModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-5">{editingJob ? 'Edit Job' : 'Post New Job'}</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Job Title *</label>
                <input value={jobForm.title} onChange={e => setJobForm(f => ({ ...f, title: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" placeholder="e.g. Senior Frontend Developer" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Department</label>
                  <input value={jobForm.department} onChange={e => setJobForm(f => ({ ...f, department: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" placeholder="Engineering" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Location</label>
                  <input value={jobForm.location} onChange={e => setJobForm(f => ({ ...f, location: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" placeholder="Remote / City" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Type</label>
                  <select value={jobForm.type} onChange={e => setJobForm(f => ({ ...f, type: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                    {JOB_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Status</label>
                  <select value={jobForm.status} onChange={e => setJobForm(f => ({ ...f, status: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                    {JOB_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Salary Min</label>
                  <input type="number" value={jobForm.salaryMin} onChange={e => setJobForm(f => ({ ...f, salaryMin: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" placeholder="50000" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Salary Max</label>
                  <input type="number" value={jobForm.salaryMax} onChange={e => setJobForm(f => ({ ...f, salaryMax: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" placeholder="80000" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Openings</label>
                  <input type="number" min="1" value={jobForm.openings} onChange={e => setJobForm(f => ({ ...f, openings: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Application Deadline</label>
                <input type="date" value={jobForm.deadline} onChange={e => setJobForm(f => ({ ...f, deadline: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Job Description</label>
                <textarea value={jobForm.description} onChange={e => setJobForm(f => ({ ...f, description: e.target.value }))} rows={3} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none" placeholder="Role overview, responsibilities..." />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Requirements</label>
                <textarea value={jobForm.requirements} onChange={e => setJobForm(f => ({ ...f, requirements: e.target.value }))} rows={2} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none" placeholder="Skills, experience required..." />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowJobModal(false); setEditingJob(null); }} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">Cancel</button>
              <button onClick={() => saveJobMutation.mutate(jobForm)} disabled={saveJobMutation.isPending || !jobForm.title} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {saveJobMutation.isPending ? 'Saving…' : editingJob ? 'Save Changes' : 'Post Job'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Candidate Modal */}
      {showCandidateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-5">{editingCandidate ? 'Edit Candidate' : 'Add Candidate'}</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Job *</label>
                <select value={candidateForm.jobId} onChange={e => setCandidateForm(f => ({ ...f, jobId: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                  <option value="">Select a job</option>
                  {jobs.map((j: any) => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">First Name *</label>
                  <input value={candidateForm.firstName} onChange={e => setCandidateForm(f => ({ ...f, firstName: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Last Name</label>
                  <input value={candidateForm.lastName} onChange={e => setCandidateForm(f => ({ ...f, lastName: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Email *</label>
                <input type="email" value={candidateForm.email} onChange={e => setCandidateForm(f => ({ ...f, email: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Phone</label>
                  <input value={candidateForm.phone} onChange={e => setCandidateForm(f => ({ ...f, phone: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Stage</label>
                  <select value={candidateForm.stage} onChange={e => setCandidateForm(f => ({ ...f, stage: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                    {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Source</label>
                  <input value={candidateForm.source} onChange={e => setCandidateForm(f => ({ ...f, source: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" placeholder="LinkedIn, referral..." />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Expected Salary</label>
                  <input type="number" value={candidateForm.expectedSalary} onChange={e => setCandidateForm(f => ({ ...f, expectedSalary: e.target.value }))} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Notes</label>
                <textarea value={candidateForm.notes} onChange={e => setCandidateForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowCandidateModal(false); setEditingCandidate(null); }} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">Cancel</button>
              <button onClick={() => saveCandidateMutation.mutate(candidateForm)} disabled={saveCandidateMutation.isPending || !candidateForm.firstName || !candidateForm.email || !candidateForm.jobId} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {saveCandidateMutation.isPending ? 'Saving…' : editingCandidate ? 'Save Changes' : 'Add Candidate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

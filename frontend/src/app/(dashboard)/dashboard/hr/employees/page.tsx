'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDate, statusColor } from '@/lib/utils';
import { Plus, Search, Mail, Phone, Building2, UserSquare, Users, UserPlus, Upload, Sparkles, Loader2, X, TrendingUp, AlertTriangle, Edit, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import toast from 'react-hot-toast';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { TextField, SelectField, TextAreaField } from '@/components/ui/FormField';
import { ExportButton } from '@/components/ui/ExportButton';
import { SampleCsvLink } from '@/components/ui/SampleCsvLink';
import { sanitizeName } from '@/lib/utils';

export default function EmployeesPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tab, setTab] = useState<'employees' | 'departments'>('employees');
  const [showModal, setShowModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState<any>(null);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const qc = useQueryClient();
  const importRef = useRef<HTMLInputElement>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insights, setInsights] = useState<any>(null);

  async function runHRInsights() {
    setInsightLoading(true);
    try {
      const { data } = await api.post('/ai/hr-insights', {});
      setInsights(data.data);
    } catch {
      toast.error('AI insights failed');
    } finally {
      setInsightLoading(false);
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    e.target.value = '';
    try {
      const { data } = await api.post('/hr/employees/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success(`${data.data?.created || 0} employees imported`);
    } catch {
      toast.error('Import failed — CSV needs: firstName, email columns');
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: employees, isLoading } = useQuery({
    queryKey: ['employees', debouncedSearch],
    queryFn: async () => {
      const params = debouncedSearch ? `?search=${debouncedSearch}` : '';
      const { data } = await api.get(`/hr/employees${params}`);
      return data;
    },
  });

  const { data: departments, isLoading: deptsLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => { const { data } = await api.get('/hr/departments'); return data.data; },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/hr/employees/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); toast.success('Employee deleted'); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to delete employee'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">HR Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">{employees?.meta?.total || 0} employees</p>
        </div>
        {tab === 'employees' ? (
          <div className="flex items-center gap-2">
            <button onClick={runHRInsights} disabled={insightLoading} className="flex items-center gap-2 px-3 py-2 border border-indigo-200 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 rounded-xl text-sm font-medium hover:bg-indigo-50 dark:hover:bg-indigo-950/30 disabled:opacity-50 transition-colors">
              {insightLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {insightLoading ? 'Analyzing…' : 'AI Insights'}
            </button>
            <ExportButton endpoint="/hr/employees/export" filename="employees.csv" params={{ search: debouncedSearch }} />
            <div className="flex flex-col items-center gap-1">
              <button onClick={() => importRef.current?.click()} className="flex items-center gap-2 px-3 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
                <Upload className="w-4 h-4" /> Import CSV
              </button>
              <SampleCsvLink
                filename="employees-sample.csv"
                headers={['firstName', 'lastName', 'email', 'employeeCode', 'jobTitle', 'salary', 'startDate']}
                rows={[['John', 'Doe', 'john.doe@example.com', 'EMP001', 'Software Engineer', '75000', '2026-01-15']]}
              />
            </div>
            <input ref={importRef} type="file" accept=".csv" onChange={handleImport} className="hidden" />
            <button onClick={() => { setEditEmployee(null); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
              <Plus className="w-4 h-4" /> Add Employee
            </button>
          </div>
        ) : (
          <button onClick={() => setShowDeptModal(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> Add Department
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
        {(['employees', 'departments'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${tab === t ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500'}`}>{t}</button>
        ))}
      </div>

      {/* AI HR Insights Panel */}
      {insights && (
        <div className="glass-card rounded-2xl border border-indigo-200 dark:border-indigo-800 overflow-hidden">
          <div className="flex items-center justify-between p-4 bg-indigo-50 dark:bg-indigo-950/30 border-b border-indigo-200 dark:border-indigo-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center"><Sparkles className="w-4 h-4 text-white" /></div>
              <div>
                <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">AI HR Insights — Score {insights.healthScore}/100</p>
                <p className="text-xs text-indigo-500">Burnout risk: {insights.burnoutRisk || 'N/A'} · Retention: {insights.trends?.retention || 'N/A'}</p>
              </div>
            </div>
            <button onClick={() => setInsights(null)} className="text-indigo-400 hover:text-indigo-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-4 grid sm:grid-cols-3 gap-4">
            {insights.alerts?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2">Alerts</p>
                {insights.alerts.map((a: string, i: number) => <div key={i} className="flex gap-2 text-xs text-gray-700 dark:text-gray-300 mb-1.5"><AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />{a}</div>)}
              </div>
            )}
            {insights.insights?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Insights</p>
                {insights.insights.map((a: string, i: number) => <div key={i} className="flex gap-2 text-xs text-gray-700 dark:text-gray-300 mb-1.5"><TrendingUp className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />{a}</div>)}
              </div>
            )}
            {insights.recommendations?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recommendations</p>
                {insights.recommendations.map((r: string, i: number) => <div key={i} className="flex gap-2 text-xs text-gray-700 dark:text-gray-300 mb-1.5"><span className="text-indigo-500 mt-0.5">→</span>{r}</div>)}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'employees' && (
        <>
          {/* Search */}
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 max-w-sm">
            <Search className="w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees..." className="bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 outline-none flex-1" />
          </div>

          {/* Employee cards */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-48 glass-card rounded-2xl animate-pulse" />)
            ) : employees?.data?.length === 0 ? (
              <div className="col-span-4 glass-card rounded-2xl p-12 text-center text-gray-400">
                <UserSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No employees found</p>
              </div>
            ) : employees?.data?.map((emp: any) => (
              <div key={emp.id} className="glass-card rounded-2xl p-5 hover:shadow-lg transition-all group relative">
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditEmployee(emp); setShowModal(true); }} aria-label="Edit employee" className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"><Edit className="w-3.5 h-3.5" /></button>
                  <button onClick={() => { if (confirm(`Delete employee ${emp.user?.firstName}? This also removes their attendance and payslip records.`)) deleteMutation.mutate(emp.id); }} aria-label="Delete employee" className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                    {emp.user?.firstName?.[0]}{emp.user?.lastName?.[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{emp.user?.firstName} {emp.user?.lastName}</p>
                    <p className="text-xs text-gray-500 truncate">{emp.jobTitle || 'Employee'}</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {emp.user?.email && <div className="flex items-center gap-1.5 text-xs text-gray-500"><Mail className="w-3 h-3" /><span className="truncate">{emp.user.email}</span></div>}
                  {emp.department && <div className="flex items-center gap-1.5 text-xs text-gray-500"><Building2 className="w-3 h-3" />{emp.department.name}</div>}
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className={`px-2 py-0.5 rounded-full font-medium capitalize ${statusColor(emp.status)}`}>{emp.status}</span>
                    <span className="text-gray-400">#{emp.employeeCode}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'departments' && (
        <div className="glass-card rounded-2xl overflow-hidden">
          {deptsLoading ? (
            <div className="p-12 text-center text-gray-400">Loading...</div>
          ) : !departments?.length ? (
            <div className="p-12 text-center text-gray-400">
              <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No departments yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left text-xs font-medium text-gray-500 px-6 py-3">Department</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Description</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Employees</th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Manager</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {departments.map((dept: any) => (
                  <tr key={dept.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <p className="font-medium text-gray-900 dark:text-white">{dept.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-gray-500 dark:text-gray-400 text-xs max-w-xs truncate">{dept.description || '—'}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                        <Users className="w-3.5 h-3.5" />
                        <span>{dept._count?.employees ?? dept.employeeCount ?? 0}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-gray-600 dark:text-gray-400">
                      {dept.manager ? `${dept.manager.user?.firstName ?? ''} ${dept.manager.user?.lastName ?? ''}`.trim() || dept.manager.firstName || '—' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      {showModal && <EmployeeModal employee={editEmployee} departments={departments || []} onClose={() => setShowModal(false)} />}
      {showDeptModal && <DepartmentModal onClose={() => setShowDeptModal(false)} />}
    </div>
  );
}

function DepartmentModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', description: '' });
  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/hr/departments', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); toast.success('Department created'); onClose(); },
    onError: () => toast.error('Failed to create department'),
  });
  return (
    <Modal onClose={onClose} title="Add Department" subtitle="Create a new department to organize your teams" icon={Building2} iconColor="purple">
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }}>
        <div className="p-6 space-y-4">
          <TextField id="dept-name" label="Name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <TextAreaField id="dept-description" label="Description" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Creating...' : 'Create'}</button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

function EmployeeModal({ employee, departments, onClose }: { employee?: any; departments: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!employee;
  const [userMode, setUserMode] = useState<'existing' | 'new'>('existing');
  const [form, setForm] = useState({
    userId: employee?.userId || '',
    employeeCode: employee?.employeeCode || `EMP${Date.now()}`,
    departmentId: employee?.departmentId || '',
    jobTitle: employee?.jobTitle || '',
    jobType: employee?.jobType || 'full_time',
    status: employee?.status || 'active',
    startDate: employee?.startDate ? String(employee.startDate).split('T')[0] : new Date().toISOString().split('T')[0],
    salary: employee?.salary ? String(employee.salary) : '',
  });
  const [newUser, setNewUser] = useState({ firstName: '', lastName: '', email: '' });

  const { data: usersData } = useQuery({
    queryKey: ['users-list'],
    queryFn: async () => { const { data } = await api.get('/users?limit=200'); return data.data as any[]; },
    enabled: !isEdit,
  });

  const mutation = useMutation({
    mutationFn: (data: any) => {
      if (isEdit) return api.put(`/hr/employees/${employee.id}`, data);
      const payload = userMode === 'new' ? { ...data, userId: undefined, newUser } : data;
      return api.post('/hr/employees', payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); toast.success(isEdit ? 'Employee updated' : 'Employee added'); onClose(); },
    onError: (err: any) => toast.error(err?.response?.data?.message || (isEdit ? 'Failed to update employee' : 'Failed to add employee')),
  });

  return (
    <Modal onClose={onClose} title={isEdit ? 'Edit Employee' : 'Add Employee'} subtitle={isEdit ? `Update ${employee.user?.firstName}'s details` : 'Add a new employee to your organization'} icon={UserPlus} iconColor="blue">
      <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }}>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <TextField id="emp-employeeCode" label="Employee Code" value={form.employeeCode} onChange={e => setForm({ ...form, employeeCode: e.target.value })} />
            <TextField id="emp-jobTitle" label="Job Title" value={form.jobTitle} onChange={e => setForm({ ...form, jobTitle: e.target.value })} />
            <SelectField id="emp-departmentId" label="Department" value={form.departmentId} onChange={e => setForm({ ...form, departmentId: e.target.value })}>
              <option value="">Select department</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </SelectField>
            <SelectField id="emp-jobType" label="Job Type" value={form.jobType} onChange={e => setForm({ ...form, jobType: e.target.value })}>
              {['full_time', 'part_time', 'contract', 'intern'].map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </SelectField>
            <TextField id="emp-startDate" label="Start Date" type="date" required value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
            <TextField id="emp-salary" label="Salary" type="number" value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} placeholder="0.00" />
          </div>
          {isEdit && (
            <SelectField id="emp-status" label="Status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              {['active', 'inactive', 'on_leave', 'terminated'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </SelectField>
          )}

          {!isEdit && (
            <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
                {([['existing', 'Existing user'], ['new', 'Create new user']] as const).map(([mode, label]) => (
                  <button key={mode} type="button" onClick={() => setUserMode(mode)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${userMode === mode ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'}`}>
                    {label}
                  </button>
                ))}
              </div>

              {userMode === 'existing' ? (
                <SelectField id="emp-userId" label="Select User" required value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value })}>
                  <option value="">Select a user account</option>
                  {(usersData || []).map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName} — {u.email}
                    </option>
                  ))}
                </SelectField>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <TextField id="emp-newFirstName" label="First Name" required value={newUser.firstName} onChange={e => setNewUser({ ...newUser, firstName: sanitizeName(e.target.value) })} />
                  <TextField id="emp-newLastName" label="Last Name" value={newUser.lastName} onChange={e => setNewUser({ ...newUser, lastName: sanitizeName(e.target.value) })} />
                  <div className="col-span-2">
                    <TextField id="emp-newEmail" label="Email" type="email" required value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <ModalFooter>
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">
            {mutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Employee'}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

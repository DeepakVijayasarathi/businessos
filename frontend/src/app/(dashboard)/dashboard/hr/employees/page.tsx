'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDate, statusColor } from '@/lib/utils';
import { Plus, Search, Mail, Phone, Building2, UserSquare, Users } from 'lucide-react';
import toast from 'react-hot-toast';

export default function EmployeesPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tab, setTab] = useState<'employees' | 'departments'>('employees');
  const [showModal, setShowModal] = useState(false);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const qc = useQueryClient();

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">HR Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">{employees?.meta?.total || 0} employees</p>
        </div>
        {tab === 'employees' ? (
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> Add Employee
          </button>
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
              <div key={emp.id} className="glass-card rounded-2xl p-5 hover:shadow-lg transition-all">
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
          )}
        </div>
      )}

      {showModal && <EmployeeModal departments={departments || []} onClose={() => setShowModal(false)} />}
      {showDeptModal && <DepartmentModal onClose={() => setShowDeptModal(false)} />}
    </div>
  );
}

function DepartmentModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', description: '' });
  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/hr/departments', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); toast.success('Department created!'); onClose(); },
    onError: () => toast.error('Failed to create department'),
  });
  const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500";
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Add Department</h3>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="p-6 space-y-4">
          <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Name*</label><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} /></div>
          <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label><textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputCls + ' resize-none'} /></div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Creating...' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmployeeModal({ departments, onClose }: { departments: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ userId: '', employeeCode: `EMP${Date.now()}`, departmentId: '', jobTitle: '', jobType: 'full_time', status: 'active', startDate: new Date().toISOString().split('T')[0], salary: '' });

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/hr/employees', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); toast.success('Employee added!'); onClose(); },
    onError: () => toast.error('Failed to add employee'),
  });

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Add Employee</h3>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Employee Code</label><input value={form.employeeCode} onChange={e => setForm({ ...form, employeeCode: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" /></div>
            <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Job Title</label><input value={form.jobTitle} onChange={e => setForm({ ...form, jobTitle: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" /></div>
            <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Department</label><select value={form.departmentId} onChange={e => setForm({ ...form, departmentId: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none"><option value="">Select department</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Job Type</label><select value={form.jobType} onChange={e => setForm({ ...form, jobType: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none">{['full_time', 'part_time', 'contract', 'intern'].map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date*</label><input type="date" required value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" /></div>
            <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Salary</label><input type="number" value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} placeholder="0.00" className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" /></div>
          </div>
          <p className="text-xs text-gray-500">Note: Employee must have an existing user account. Enter the user ID below.</p>
          <div><label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">User ID*</label><input required value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value })} placeholder="User UUID" className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" /></div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Adding...' : 'Add Employee'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

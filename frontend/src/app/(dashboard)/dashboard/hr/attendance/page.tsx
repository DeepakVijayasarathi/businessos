'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Clock, CheckCircle, XCircle, Calendar, LogIn, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AttendancePage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const qc = useQueryClient();

  const { data: attendance, isLoading } = useQuery({
    queryKey: ['attendance', year, month],
    queryFn: async () => {
      const { data } = await api.get(`/hr/attendance?year=${year}&month=${month}`);
      return data.data;
    },
  });

  const { data: todayRecord } = useQuery({
    queryKey: ['attendance-today'],
    queryFn: async () => {
      const todayStr = today.toISOString().split('T')[0];
      const { data } = await api.get(`/hr/attendance?startDate=${todayStr}&endDate=${todayStr}`);
      return data.data?.[0] || null;
    },
  });

  const checkInMutation = useMutation({
    mutationFn: () => api.post('/hr/attendance/check-in'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance'] }); qc.invalidateQueries({ queryKey: ['attendance-today'] }); toast.success('Checked in'); },
    onError: () => toast.error('Already checked in'),
  });

  const checkOutMutation = useMutation({
    mutationFn: () => api.post('/hr/attendance/check-out'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attendance'] }); qc.invalidateQueries({ queryKey: ['attendance-today'] }); toast.success('Checked out'); },
    onError: () => toast.error('No active check-in'),
  });

  const present = attendance?.filter((a: any) => a.status === 'present').length || 0;
  const absent = attendance?.filter((a: any) => a.status === 'absent').length || 0;
  const late = attendance?.filter((a: any) => a.status === 'late').length || 0;
  const totalHours = attendance?.reduce((s: number, a: any) => s + (a.hoursWorked || 0), 0) || 0;

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Attendance</h1>
          <p className="text-sm text-gray-500 mt-0.5">{MONTHS[month - 1]} {year}</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none">
            {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Check-in/out card */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">Today — {formatDate(today.toISOString())}</p>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              {todayRecord?.checkIn && <span className="flex items-center gap-1 text-green-600"><LogIn className="w-3 h-3" /> In: {new Date(todayRecord.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
              {todayRecord?.checkOut && <span className="flex items-center gap-1 text-orange-500"><LogOut className="w-3 h-3" /> Out: {new Date(todayRecord.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
              {todayRecord?.hoursWorked && <span className="flex items-center gap-1 text-gray-600"><Clock className="w-3 h-3" />{todayRecord.hoursWorked.toFixed(1)}h</span>}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => checkInMutation.mutate()} disabled={!!todayRecord?.checkIn || checkInMutation.isPending} className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-green-600">
              <LogIn className="w-4 h-4" /> Check In
            </button>
            <button onClick={() => checkOutMutation.mutate()} disabled={!todayRecord?.checkIn || !!todayRecord?.checkOut || checkOutMutation.isPending} className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-orange-600">
              <LogOut className="w-4 h-4" /> Check Out
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Present', value: present, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
          { label: 'Absent', value: absent, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
          { label: 'Late', value: late, color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
          { label: 'Total Hours', value: totalHours.toFixed(0) + 'h', color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
        ].map(s => (
          <div key={s.label} className="glass-card rounded-2xl p-4">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Attendance table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Monthly Record</h2>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              {['Date', 'Status', 'Check In', 'Check Out', 'Hours'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={5} className="px-4 py-3"><div className="h-5 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" /></td></tr>
              ))
            ) : attendance?.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">No attendance records</td></tr>
            ) : attendance?.map((rec: any) => (
              <tr key={rec.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{formatDate(rec.date)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                    rec.status === 'present' ? 'bg-green-100 text-green-700' :
                    rec.status === 'absent' ? 'bg-red-100 text-red-600' :
                    rec.status === 'late' ? 'bg-yellow-100 text-yellow-700' :
                    rec.status === 'half_day' ? 'bg-orange-100 text-orange-600' :
                    'bg-blue-100 text-blue-700'
                  }`}>{rec.status?.replace('_', ' ')}</span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{rec.checkIn ? new Date(rec.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{rec.checkOut ? new Date(rec.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{rec.hoursWorked ? rec.hoursWorked.toFixed(1) + 'h' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

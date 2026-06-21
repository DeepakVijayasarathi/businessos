'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import { FileText, Plus, Download, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal, ModalFooter } from '@/components/ui/Modal';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function PayrollPage() {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [showGenModal, setShowGenModal] = useState(false);

  const { data: payslips, isLoading } = useQuery({
    queryKey: ['payslips', month, year],
    queryFn: async () => {
      const { data } = await api.get(`/hr/attendance/payslips?month=${month}&year=${year}`);
      return data;
    },
  });

  const totalGross = payslips?.data?.reduce((s: number, p: any) => s + (p.grossSalary || 0), 0) || 0;
  const totalNet = payslips?.data?.reduce((s: number, p: any) => s + (p.netSalary || 0), 0) || 0;
  const totalDeductions = payslips?.data?.reduce((s: number, p: any) => s + (p.deductions || 0), 0) || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Payroll</h1>
          <p className="text-sm text-gray-500 mt-0.5">{MONTHS[month - 1]} {year}</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none">
            {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => setShowGenModal(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> Generate
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Gross', value: formatCurrency(totalGross), color: 'text-indigo-600' },
          { label: 'Total Deductions', value: formatCurrency(totalDeductions), color: 'text-red-500' },
          { label: 'Total Net Payout', value: formatCurrency(totalNet), color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="glass-card rounded-2xl p-4">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Payslips — {MONTHS[month - 1]} {year}</h2>
          <span className="text-xs text-gray-400">{payslips?.data?.length || 0} records</span>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-gray-100 dark:border-gray-800">
            <tr>
              {['Employee', 'Basic Salary', 'Allowances', 'Deductions', 'Net Salary', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-5 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" /></td></tr>
              ))
            ) : payslips?.data?.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center">
                <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-gray-400 text-sm">No payslips generated for this period</p>
                <p className="text-gray-400 text-xs mt-1">Click &quot;Generate&quot; to create payslips</p>
              </td></tr>
            ) : payslips?.data?.map((slip: any) => (
              <tr key={slip.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                      {slip.employee?.user?.firstName?.[0]}{slip.employee?.user?.lastName?.[0]}
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{slip.employee?.user?.firstName} {slip.employee?.user?.lastName}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{formatCurrency(slip.basicSalary)}</td>
                <td className="px-4 py-3 text-sm text-green-600">{formatCurrency(slip.allowances || 0)}</td>
                <td className="px-4 py-3 text-sm text-red-500">{formatCurrency(slip.deductions || 0)}</td>
                <td className="px-4 py-3 text-sm font-semibold text-indigo-600">{formatCurrency(slip.netSalary)}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${slip.status === 'paid' ? 'bg-green-100 text-green-700' : slip.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>{slip.status}</span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => {
                      api.get(`/hr/attendance/payslips/${slip.id}/pdf`, { responseType: 'blob' }).then(res => {
                        const url = URL.createObjectURL(res.data);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `payslip-${MONTHS[month - 1]}-${year}.pdf`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }).catch(() => toast.error('Failed to download payslip'));
                    }}
                    className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                    title="Download"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {showGenModal && <GenerateModal month={month} year={year} onClose={() => setShowGenModal(false)} />}
    </div>
  );
}

function GenerateModal({ month, year, onClose }: { month: number; year: number; onClose: () => void }) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/hr/attendance/payslips/generate', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payslips'] }); toast.success('Payslips generated'); onClose(); },
    onError: () => toast.error('Failed to generate payslips'),
  });

  return (
    <Modal onClose={onClose} title="Generate Payslips" subtitle="Run payroll for the selected period" icon={DollarSign} iconColor="teal" size="sm">
      <div className="p-6">
        <p className="text-sm text-gray-500">This will generate payslips for all active employees for {MONTHS[month - 1]} {year}.</p>
      </div>
      <ModalFooter>
        <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
        <button onClick={() => mutation.mutate({ month, year })} disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">
          {mutation.isPending ? 'Generating...' : 'Generate All'}
        </button>
      </ModalFooter>
    </Modal>
  );
}

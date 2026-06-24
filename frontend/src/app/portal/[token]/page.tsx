'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { FileText, Ticket, CheckCircle2, Clock, AlertCircle, Building2, Mail, Phone } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

interface PortalData {
  clientEmail: string;
  company: { name: string; email?: string; phone?: string; website?: string; logo?: string };
  invoices: any[];
  tickets: any[];
}

const statusColor = (s: string) => {
  const map: Record<string, string> = {
    paid: 'bg-green-100 text-green-700', draft: 'bg-gray-100 text-gray-600',
    sent: 'bg-blue-100 text-blue-700', overdue: 'bg-red-100 text-red-700',
    open: 'bg-yellow-100 text-yellow-700', resolved: 'bg-green-100 text-green-700',
    closed: 'bg-gray-100 text-gray-600', pending: 'bg-orange-100 text-orange-700',
  };
  return map[s] || 'bg-gray-100 text-gray-600';
};

export default function ClientPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'invoices' | 'tickets'>('invoices');

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/v1/portal/me`, {
      headers: { Authorization: `Bearer ${decodeURIComponent(token)}` },
    })
      .then(r => r.json())
      .then(json => {
        if (json.success) setData(json.data);
        else setError(json.message || 'Invalid or expired portal link');
      })
      .catch(() => setError('Failed to load portal. Please try again.'));
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Link Invalid or Expired</h2>
          <p className="text-gray-500 text-sm">{error}</p>
          <p className="text-gray-400 text-xs mt-4">Contact your service provider for a new portal link.</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalDue = data.invoices
    .filter(i => i.status !== 'paid')
    .reduce((s, i) => s + (Number(i.total) || 0), 0);
  const totalPaid = data.invoices
    .filter(i => i.status === 'paid')
    .reduce((s, i) => s + (Number(i.total) || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-gray-900">{data.company.name}</p>
              <p className="text-xs text-gray-500">Client Portal</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Logged in as</p>
            <p className="text-sm font-medium text-gray-700">{data.clientEmail}</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-xs text-gray-500 mb-1">Outstanding Balance</p>
            <p className="text-2xl font-bold text-red-500">{formatCurrency(totalDue)}</p>
            <p className="text-xs text-gray-400 mt-1">{data.invoices.filter(i => i.status !== 'paid').length} unpaid invoices</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-xs text-gray-500 mb-1">Total Paid</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
            <p className="text-xs text-gray-400 mt-1">{data.invoices.filter(i => i.status === 'paid').length} paid invoices</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <p className="text-xs text-gray-500 mb-1">Support Tickets</p>
            <p className="text-2xl font-bold text-indigo-600">{data.tickets.length}</p>
            <p className="text-xs text-gray-400 mt-1">{data.tickets.filter(t => t.status === 'open').length} open</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {(['invoices', 'tickets'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all ${tab === t ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
              {t === 'invoices' ? <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Invoices</span> : <span className="flex items-center gap-1.5"><Ticket className="w-3.5 h-3.5" /> Support Tickets</span>}
            </button>
          ))}
        </div>

        {/* Invoices tab */}
        {tab === 'invoices' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {data.invoices.length === 0 ? (
              <div className="py-16 text-center">
                <FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-400">No invoices yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-100 bg-gray-50">
                    <tr>
                      {['Invoice #', 'Date', 'Due Date', 'Amount', 'Status'].map(h => (
                        <th key={h} className="text-left text-xs font-medium text-gray-500 px-5 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.invoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-gray-50">
                        <td className="px-5 py-4 text-sm font-mono font-semibold text-indigo-600">{inv.invoiceNo}</td>
                        <td className="px-5 py-4 text-sm text-gray-600">{formatDate(inv.issueDate)}</td>
                        <td className="px-5 py-4 text-sm text-gray-600">{inv.dueDate ? formatDate(inv.dueDate) : '—'}</td>
                        <td className="px-5 py-4 text-sm font-semibold text-gray-900">{formatCurrency(Number(inv.total))}</td>
                        <td className="px-5 py-4">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${statusColor(inv.status)}`}>{inv.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tickets tab */}
        {tab === 'tickets' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {data.tickets.length === 0 ? (
              <div className="py-16 text-center">
                <Ticket className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-400">No support tickets yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-100 bg-gray-50">
                    <tr>
                      {['Ticket #', 'Subject', 'Category', 'Status', 'Date'].map(h => (
                        <th key={h} className="text-left text-xs font-medium text-gray-500 px-5 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.tickets.map(t => (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="px-5 py-4 text-sm font-mono font-semibold text-indigo-600">#{t.ticketNo}</td>
                        <td className="px-5 py-4 text-sm text-gray-900 max-w-xs truncate">{t.subject}</td>
                        <td className="px-5 py-4 text-sm text-gray-500 capitalize">{t.category || '—'}</td>
                        <td className="px-5 py-4">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${statusColor(t.status)}`}>{t.status}</span>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-400">{formatDate(t.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Company contact */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">Contact {data.company.name}</p>
          <div className="flex flex-wrap gap-4 text-sm text-gray-500">
            {data.company.email && <a href={`mailto:${data.company.email}`} className="flex items-center gap-1.5 hover:text-indigo-600"><Mail className="w-4 h-4" />{data.company.email}</a>}
            {data.company.phone && <span className="flex items-center gap-1.5"><Phone className="w-4 h-4" />{data.company.phone}</span>}
          </div>
        </div>
      </main>
    </div>
  );
}

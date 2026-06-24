'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDate, statusColor } from '@/lib/utils';
import { Users, Mail, Phone, Building2, Search, ExternalLink, FileText, TicketIcon, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ClientsPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [tab, setTab] = useState<'invoices' | 'tickets' | 'projects'>('invoices');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: contacts, isLoading } = useQuery({
    queryKey: ['client-contacts', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (debouncedSearch) params.set('search', debouncedSearch);
      const { data } = await api.get(`/crm/contacts?${params}`);
      return data;
    },
  });

  const { data: clientInvoices } = useQuery({
    queryKey: ['client-invoices', selectedClient?.id],
    enabled: !!selectedClient && tab === 'invoices',
    queryFn: async () => {
      const email = selectedClient.email;
      const params = email ? `?clientEmail=${encodeURIComponent(email)}` : '';
      const { data } = await api.get(`/finance/invoices${params}`);
      return data.data;
    },
  });

  const { data: clientTickets } = useQuery({
    queryKey: ['client-tickets', selectedClient?.id],
    enabled: !!selectedClient && tab === 'tickets',
    queryFn: async () => {
      const email = selectedClient.email;
      const params = email ? `?clientEmail=${encodeURIComponent(email)}` : '';
      const { data } = await api.get(`/helpdesk${params}`);
      return data.data;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Client Portal</h1>
        <p className="text-sm text-gray-500 mt-0.5">View and manage your clients&apos; activity</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 h-[calc(100vh-220px)] min-h-96">
        {/* Client list */}
        <div className="flex flex-col glass-card rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
              <Search className="w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients..." className="bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 outline-none flex-1" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 px-4 py-3 animate-pulse"><div className="h-4 bg-gray-100 dark:bg-gray-700 rounded mb-2" /><div className="h-3 bg-gray-50 dark:bg-gray-800 rounded w-2/3" /></div>)
            ) : contacts?.data?.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No clients found</p>
              </div>
            ) : contacts?.data?.map((c: any) => (
              <button key={c.id} onClick={() => setSelectedClient(c)} className={`w-full text-left px-4 py-3 transition-all hover:bg-gray-50 dark:hover:bg-gray-800/60 ${selectedClient?.id === c.id ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-2 border-indigo-500' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                    {c.firstName?.[0]}{c.lastName?.[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.firstName} {c.lastName}</p>
                    <p className="text-xs text-gray-400 truncate">{c.email || c.phone || 'No contact info'}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Client detail */}
        <div className="lg:col-span-2 flex flex-col">
          {!selectedClient ? (
            <div className="glass-card rounded-2xl flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select a client to view details</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 flex-1">
              {/* Client info card */}
              <div className="glass-card rounded-2xl p-5">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white text-lg font-semibold flex-shrink-0">
                    {selectedClient.firstName?.[0]}{selectedClient.lastName?.[0]}
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">{selectedClient.firstName} {selectedClient.lastName}</h2>
                    {selectedClient.jobTitle && <p className="text-sm text-gray-500">{selectedClient.jobTitle}</p>}
                    <div className="flex flex-wrap gap-4 mt-2">
                      {selectedClient.email && <span className="flex items-center gap-1 text-xs text-gray-500"><Mail className="w-3 h-3" />{selectedClient.email}</span>}
                      {selectedClient.phone && <span className="flex items-center gap-1 text-xs text-gray-500"><Phone className="w-3 h-3" />{selectedClient.phone}</span>}
                      {selectedClient.crmCompany && <span className="flex items-center gap-1 text-xs text-gray-500"><Building2 className="w-3 h-3" />{selectedClient.crmCompany.name}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <p className="text-xs text-gray-400">Client since {formatDate(selectedClient.createdAt)}</p>
                    {selectedClient.email && (
                      <button
                        onClick={async () => {
                          try {
                            const { data } = await api.post('/portal/token', { clientEmail: selectedClient.email });
                            await navigator.clipboard.writeText(data.data.url);
                            toast.success('Portal link copied to clipboard!');
                          } catch {
                            toast.error('Failed to generate portal link');
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 rounded-lg transition-colors"
                      >
                        <Link2 className="w-3.5 h-3.5" /> Copy Portal Link
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
                {(['invoices', 'tickets', 'projects'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${tab === t ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500'}`}>{t}</button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 glass-card rounded-2xl overflow-hidden">
                {tab === 'invoices' && (
                  <div className="divide-y divide-gray-50 dark:divide-gray-800">
                    {!clientInvoices ? (
                      <div className="p-4 space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />)}
                      </div>
                    ) : clientInvoices.length === 0 ? (
                      <div className="p-12 text-center">
                        <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                        <p className="text-gray-400 text-sm">No invoices</p>
                      </div>
                    ) : clientInvoices.map((inv: any) => (
                      <div key={inv.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{inv.invoiceNo}</p>
                          <p className="text-xs text-gray-400">{formatDate(inv.issueDate)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">${Number(inv.total || 0).toLocaleString()}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColor(inv.status)}`}>{inv.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {tab === 'tickets' && (
                  <div className="divide-y divide-gray-50 dark:divide-gray-800">
                    {!clientTickets ? (
                      <div className="p-4 space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />)}
                      </div>
                    ) : clientTickets.length === 0 ? (
                      <div className="p-12 text-center">
                        <TicketIcon className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                        <p className="text-gray-400 text-sm">No tickets</p>
                      </div>
                    ) : clientTickets.map((ticket: any) => (
                      <div key={ticket.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{ticket.title}</p>
                          <p className="text-xs text-gray-400">{formatDate(ticket.createdAt)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ticket.priority === 'urgent' ? 'bg-red-100 text-red-600' : ticket.priority === 'high' ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-600'}`}>{ticket.priority}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColor(ticket.status)}`}>{ticket.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {tab === 'projects' && (
                  <div className="p-12 text-center text-gray-400 text-sm">
                    <p>Project association not available yet</p>
                    <p className="text-xs mt-1 text-gray-300">Link projects to contacts via the Projects module</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

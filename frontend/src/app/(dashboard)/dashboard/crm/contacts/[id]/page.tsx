'use client';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Briefcase, Headphones, FileText, Phone, Mail, Calendar, MessageSquare, User, Building2, Star } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import ActivityTimeline from '@/components/ActivityTimeline';

const iconMap: Record<string, any> = {
  Briefcase, Headphones, FileText, Phone, Mail, Calendar, MessageSquare, User,
};

const typeColor: Record<string, string> = {
  deal: 'bg-purple-100 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800',
  ticket: 'bg-red-100 dark:bg-red-950/30 border-red-200 dark:border-red-800',
  invoice: 'bg-green-100 dark:bg-green-950/30 border-green-200 dark:border-green-800',
  activity: 'bg-blue-100 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
};

const dotColor: Record<string, string> = {
  deal: 'bg-purple-500', ticket: 'bg-red-500', invoice: 'bg-green-500', activity: 'bg-blue-500',
};

export default function ContactTimelinePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['contact-timeline', id],
    queryFn: async () => { const { data } = await api.get(`/crm/contacts/${id}/timeline`); return data.data; },
    enabled: !!id,
  });

  const contact = data?.contact;
  const timeline = data?.timeline || [];
  const stats = data?.stats;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {contact ? `${contact.firstName} ${contact.lastName}` : 'Contact Timeline'}
          </h1>
          <p className="text-sm text-gray-500">360° view of all interactions</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">{[...Array(5)].map((_, i) => <div key={i} className="glass-card rounded-2xl p-4 h-20 animate-pulse" />)}</div>
      ) : (
        <>
          {/* Contact card */}
          {contact && (
            <div className="glass-card rounded-2xl p-6 flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                {contact.firstName?.[0]}{contact.lastName?.[0]}
              </div>
              <div className="flex-1">
                <h2 className="font-semibold text-gray-900 dark:text-white">{contact.firstName} {contact.lastName}</h2>
                {contact.jobTitle && <p className="text-sm text-gray-500">{contact.jobTitle}</p>}
                <div className="flex flex-wrap gap-3 mt-2">
                  {contact.email && <a href={`mailto:${contact.email}`} className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"><Mail className="w-3 h-3" />{contact.email}</a>}
                  {contact.phone && <a href={`tel:${contact.phone}`} className="flex items-center gap-1 text-xs text-gray-500"><Phone className="w-3 h-3" />{contact.phone}</a>}
                  {contact.company && <span className="flex items-center gap-1 text-xs text-gray-500"><Building2 className="w-3 h-3" />{contact.company}</span>}
                </div>
              </div>
              {/* Stats */}
              <div className="flex gap-4 text-center">
                {[
                  { label: 'Deals', value: stats?.deals || 0, color: 'text-purple-600' },
                  { label: 'Tickets', value: stats?.tickets || 0, color: 'text-red-500' },
                  { label: 'Invoices', value: stats?.invoices || 0, color: 'text-green-600' },
                  { label: 'Activities', value: stats?.activities || 0, color: 'text-blue-600' },
                ].map(s => (
                  <div key={s.label}>
                    <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-gray-400">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-white">Interaction Timeline</h2>
              <p className="text-xs text-gray-500 mt-0.5">{timeline.length} total interactions</p>
            </div>
            {timeline.length === 0 ? (
              <div className="p-12 text-center text-gray-400 text-sm">No interactions recorded yet</div>
            ) : (
              <div className="p-6">
                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
                  <div className="space-y-4">
                    {timeline.map((item: any, i: number) => {
                      const Icon = iconMap[item.icon] || MessageSquare;
                      return (
                        <div key={i} className="relative flex gap-4 pl-12">
                          {/* Dot */}
                          <div className={`absolute left-2 w-5 h-5 rounded-full ${dotColor[item.type] || 'bg-gray-400'} flex items-center justify-center -translate-x-0.5`}>
                            <Icon className="w-2.5 h-2.5 text-white" />
                          </div>
                          <div className={`flex-1 p-3 rounded-xl border ${typeColor[item.type] || 'bg-gray-50 border-gray-200'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">{item.title}</p>
                                {item.subtitle && <p className="text-xs text-gray-500 mt-0.5">{item.subtitle}</p>}
                              </div>
                              <div className="text-right flex-shrink-0">
                                {item.status && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/60 dark:bg-gray-900/40 text-gray-600 dark:text-gray-400 capitalize">{item.status}</span>
                                )}
                                <p className="text-xs text-gray-400 mt-1">{formatRelativeTime(item.date)}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Record edit history (audit trail) */}
          {contact && <ActivityTimeline module="crm.contacts" resourceId={contact.id} />}
        </>
      )}
    </div>
  );
}

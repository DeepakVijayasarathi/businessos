'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatDate, formatDateTime, statusColor } from '@/lib/utils';
import { Plus, Calendar, Clock, User, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useModalA11y } from '@/hooks/useModalA11y';

const STATUS_OPTS = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'];

export default function AppointmentsPage() {
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [month, setMonth] = useState(new Date());
  const [status, setStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: appointments, isLoading } = useQuery({
    queryKey: ['appointments', status],
    queryFn: async () => {
      const params = status ? `?status=${status}` : '';
      const { data } = await api.get(`/appointments${params}`);
      return data;
    },
  });

  const { data: calendarData } = useQuery({
    queryKey: ['appointments-calendar', month.getFullYear(), month.getMonth()],
    enabled: view === 'calendar',
    queryFn: async () => {
      const { data } = await api.get(`/appointments/calendar?year=${month.getFullYear()}&month=${month.getMonth() + 1}`);
      return data.data;
    },
  });

  const { data: services } = useQuery({
    queryKey: ['appointment-services'],
    queryFn: async () => { const { data } = await api.get('/appointments/services'); return data.data; },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.post(`/appointments/${id}/cancel`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['appointments'] }); toast.success('Appointment cancelled'); },
  });

  const prevMonth = () => setMonth(d => new Date(d.getFullYear(), d.getMonth() - 1));
  const nextMonth = () => setMonth(d => new Date(d.getFullYear(), d.getMonth() + 1));

  const calendarDays = () => {
    const year = month.getFullYear();
    const m = month.getMonth();
    const firstDay = new Date(year, m, 1).getDay();
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const days: (number | null)[] = Array(firstDay).fill(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  };

  const getAppsForDay = (day: number) => {
    if (!calendarData) return [];
    return calendarData.filter((a: any) => {
      const d = new Date(a.startAt);
      return d.getDate() === day && d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Appointments</h1>
          <p className="text-sm text-gray-500 mt-0.5">{appointments?.meta?.total || appointments?.data?.length || 0} total</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
            <button onClick={() => setView('list')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${view === 'list' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500'}`}>List</button>
            <button onClick={() => setView('calendar')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${view === 'calendar' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500'}`}>Calendar</button>
          </div>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> Book
          </button>
        </div>
      </div>

      {view === 'list' ? (
        <>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setStatus('')} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${!status ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-300'}`}>All</button>
            {STATUS_OPTS.map(s => (
              <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 rounded-full text-xs font-medium border capitalize transition-all ${status === s ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-300'}`}>{s.replace('_', ' ')}</button>
            ))}
          </div>

          <div className="space-y-3">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 glass-card rounded-2xl animate-pulse" />)
            ) : appointments?.data?.length === 0 ? (
              <div className="glass-card rounded-2xl p-12 text-center text-gray-400">
                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No appointments</p>
              </div>
            ) : appointments?.data?.map((a: any) => (
              <div key={a.id} className="glass-card rounded-2xl p-4 flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{a.service?.name || 'Appointment'}</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColor(a.status)}`}>{a.status?.replace('_', ' ')}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    {a.contact && <span className="flex items-center gap-1"><User className="w-3 h-3" />{a.contact.firstName} {a.contact.lastName}</span>}
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDateTime(a.startAt)}</span>
                  </div>
                </div>
                {a.status === 'scheduled' && (
                  <button onClick={() => { if (confirm('Cancel this appointment?')) cancelMutation.mutate(a.id); }} className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">Cancel</button>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {month.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h2>
            <div className="flex gap-2">
              <button onClick={prevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={nextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="text-center text-[10px] sm:text-xs font-medium text-gray-500 py-1 sm:py-2">{d.slice(0, 1)}<span className="hidden sm:inline">{d.slice(1)}</span></div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
            {calendarDays().map((day, i) => {
              const apps = day ? getAppsForDay(day) : [];
              const isToday = day === new Date().getDate() && month.getMonth() === new Date().getMonth() && month.getFullYear() === new Date().getFullYear();
              const openDay = () => {
                if (!day) return;
                const d = new Date(month.getFullYear(), month.getMonth(), day, 9, 0);
                setPrefillDate(d.toISOString().slice(0, 16));
                setShowModal(true);
              };
              return (
                <div
                  key={i}
                  role={day ? 'button' : undefined}
                  tabIndex={day ? 0 : undefined}
                  onClick={openDay}
                  onKeyDown={e => { if (day && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDay(); } }}
                  className={`min-h-12 sm:min-h-20 rounded-lg sm:rounded-xl p-1 sm:p-2 text-xs ${day ? 'hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500' : ''}`}
                >
                  {day && (
                    <>
                      <span className={`w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full text-[10px] sm:text-xs font-medium mb-1 ${isToday ? 'bg-indigo-600 text-white' : 'text-gray-700 dark:text-gray-300'}`}>{day}</span>
                      {apps.length > 0 && (
                        <span className="sm:hidden block w-1.5 h-1.5 rounded-full bg-indigo-500 mx-auto" />
                      )}
                      <div className="hidden sm:block">
                        {apps.slice(0, 2).map((a: any) => (
                          <div key={a.id} className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded px-1 py-0.5 mb-0.5 truncate">{a.service?.name}</div>
                        ))}
                        {apps.length > 2 && <span className="text-gray-400">+{apps.length - 2} more</span>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showModal && <BookModal services={services || []} initialStartTime={prefillDate} onClose={() => { setShowModal(false); setPrefillDate(null); }} />}
    </div>
  );
}

function BookModal({ services, initialStartTime, onClose }: { services: any[]; initialStartTime?: string | null; onClose: () => void }) {
  const modalRef = useModalA11y(onClose);
  const qc = useQueryClient();
  const [form, setForm] = useState({
    serviceId: services[0]?.id || '',
    startTime: initialStartTime || '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    notes: '',
  });

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/appointments/book', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['appointments'] }); toast.success('Appointment booked'); onClose(); },
    onError: () => toast.error('Failed to book appointment'),
  });

  const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div ref={modalRef} tabIndex={-1} className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 outline-none animate-in fade-in duration-200">
      <div className="glass-card rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Book Appointment</h3>
          <button onClick={onClose} className="text-gray-400">✕</button>
        </div>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="p-6 space-y-4">
          <div><label htmlFor="appointment-serviceId" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Service</label>
            <select id="appointment-serviceId" value={form.serviceId} onChange={e => setForm({ ...form, serviceId: e.target.value })} className={inputCls}>
              {services.map(s => <option key={s.id} value={s.id}>{s.name} ({s.duration}min)</option>)}
            </select>
          </div>
          <div><label htmlFor="appointment-startTime" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Date & Time*</label><input id="appointment-startTime" required type="datetime-local" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label htmlFor="appointment-firstName" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">First Name*</label><input id="appointment-firstName" required value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} className={inputCls} /></div>
            <div><label htmlFor="appointment-lastName" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label><input id="appointment-lastName" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} className={inputCls} /></div>
            <div><label htmlFor="appointment-email" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label><input id="appointment-email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} /></div>
            <div><label htmlFor="appointment-phone" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label><input id="appointment-phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputCls} /></div>
          </div>
          <div><label htmlFor="appointment-notes" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label><textarea id="appointment-notes" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputCls + ' resize-none'} /></div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{mutation.isPending ? 'Booking...' : 'Book'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

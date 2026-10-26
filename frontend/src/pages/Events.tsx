import React, { useCallback, useEffect, useState } from 'react';

import { api } from '../lib/api';
import { daysUntil, eventDate } from '../lib/time';
import type { ClassEvent } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { EmptyState, ErrorState, KindChip, LoadingBlock, Modal, PageHeader, Spinner } from '../components/ui';
import { IconCalendar, IconPlus } from '../components/icons';

export default function Events() {
  const { user } = useAuth();
  const toast = useToast();
  const [events, setEvents] = useState<ClassEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', kind: 'event' as 'event' | 'deadline', starts_at: '', location: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<{ events: ClassEvent[] }>('/events?scope=upcoming');
      setEvents(data.events);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load events.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Events & deadlines"
        subtitle="One calendar for everything your class can’t afford to miss."
        action={
          <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
            <IconPlus className="h-4 w-4" /> Add event
          </button>
        }
      />

      {loading ? (
        <LoadingBlock rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : events.length === 0 ? (
        <EmptyState icon={<IconCalendar className="h-8 w-8" />} title="Nothing scheduled" hint="Add the next internal, submission deadline or class get-together." />
      ) : (
        <ul className="space-y-3">
          {events.map((ev) => {
            const d = eventDate(ev.starts_at);
            const days = daysUntil(ev.starts_at);
            return (
              <li key={ev.id} className="card flex items-center gap-4 p-4 sm:p-5">
                <div className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl ${ev.kind === 'deadline' ? 'bg-rose-50 text-rose-600' : 'bg-brand-50 text-brand-600'}`}>
                  <span className="text-lg font-extrabold leading-none">{d.day}</span>
                  <span className="text-[10px] font-bold tracking-wide">{d.month}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{ev.title}</h3>
                    <KindChip kind={ev.kind} />
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-sm text-slate-600">{ev.description}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {d.weekday} · {d.time}
                    {ev.location ? ` · ${ev.location}` : ''} ·{' '}
                    <span className={days <= 2 ? 'font-semibold text-rose-500' : ''}>{days <= 0 ? 'today' : `in ${days} days`}</span>
                  </p>
                </div>
                {ev.is_owner && (
                  <button
                    type="button"
                    className="btn-ghost text-xs hover:!text-rose-600"
                    onClick={async () => {
                      try {
                        await api(`/events/${ev.id}`, { method: 'DELETE' });
                        toast('Event removed.', 'info');
                        void load();
                      } catch (e) {
                        toast(e instanceof Error ? e.message : 'Delete failed.', 'error');
                      }
                    }}
                  >
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add an event or deadline">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api('/events', { method: 'POST', body: { ...form, starts_at: new Date(form.starts_at).toISOString() } });
              setCreateOpen(false);
              setForm({ title: '', description: '', kind: 'event', starts_at: '', location: '' });
              toast('Added to the class calendar.', 'success');
              void load();
            } catch (err) {
              toast(err instanceof Error ? err.message : 'Could not add event.', 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <label className="label" htmlFor="etitle">Title</label>
            <input id="etitle" className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={120} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ekind">Type</label>
              <select id="ekind" className="input" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as 'event' | 'deadline' }))}>
                <option value="event">Event</option>
                <option value="deadline">Deadline</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="ewhen">When</label>
              <input id="ewhen" className="input" type="datetime-local" value={form.starts_at} onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))} required />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="eloc">Location <span className="font-normal text-slate-400">(optional)</span></label>
            <input id="eloc" className="input" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} maxLength={120} />
          </div>
          <div>
            <label className="label" htmlFor="edesc">Description</label>
            <textarea id="edesc" className="input min-h-[70px]" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} maxLength={600} />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy || !form.title.trim() || !form.starts_at}>
            {busy && <Spinner className="h-4 w-4" />} Add to calendar
          </button>
        </form>
      </Modal>
    </>
  );
}

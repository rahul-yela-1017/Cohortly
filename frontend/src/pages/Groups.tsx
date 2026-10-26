import React, { useCallback, useEffect, useState } from 'react';

import { api } from '../lib/api';
import type { StudyGroup } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar, EmptyState, ErrorState, LoadingBlock, Modal, PageHeader, Spinner } from '../components/ui';
import { IconClock, IconPlus, IconUsers } from '../components/icons';

export default function Groups() {
  const { user } = useAuth();
  const toast = useToast();
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', course: '', schedule: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<{ groups: StudyGroup[] }>('/study-groups');
      setGroups(data.groups);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load study groups.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (g: StudyGroup) => {
    try {
      await api(`/study-groups/${g.id}/${g.is_member ? 'leave' : 'join'}`, { method: 'POST', body: {} });
      toast(g.is_member ? `Left ${g.name}.` : `Joined ${g.name}.`, 'success');
      void load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Action failed.', 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="Study groups"
        subtitle="Small groups for weekly problem sets, revision rooms and prep squads."
        action={
          <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
            <IconPlus className="h-4 w-4" /> New group
          </button>
        }
      />

      {loading ? (
        <LoadingBlock rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : groups.length === 0 ? (
        <EmptyState icon={<IconUsers className="h-8 w-8" />} title="No study groups yet" hint="Create one for your favourite course and classmates can join instantly." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <li key={g.id} className="card flex flex-col p-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="chip bg-brand-50 text-brand-700">{g.course || 'General'}</span>
                <span className="text-xs text-slate-400">{g.members.length} member{g.members.length === 1 ? '' : 's'}</span>
              </div>
              <h3 className="text-sm font-semibold text-slate-900">{g.name}</h3>
              <p className="mt-1 line-clamp-2 text-sm text-slate-600">{g.description}</p>
              {g.schedule && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <IconClock className="h-3.5 w-3.5" /> {g.schedule}
                </p>
              )}
              <div className="mt-3 flex -space-x-1.5">
                {g.members.slice(0, 6).map((m) => (
                  <Avatar key={m.id} name={m.name} color={m.avatar_color} size={26} className="ring-2 ring-white" />
                ))}
              </div>
              <div className="mt-4 border-t border-slate-100 pt-3">
                <button type="button" className={g.is_member ? 'btn-secondary w-full !py-2 text-xs' : 'btn-primary w-full !py-2 text-xs'} onClick={() => void toggle(g)}>
                  {g.is_member ? (g.owner_id === user?.id ? 'You own this group' : 'Leave group') : 'Join group'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create a study group">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api('/study-groups', { method: 'POST', body: form });
              setCreateOpen(false);
              setForm({ name: '', description: '', course: '', schedule: '' });
              toast('Study group created.', 'success');
              void load();
            } catch (err) {
              toast(err instanceof Error ? err.message : 'Could not create group.', 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <label className="label" htmlFor="gname">Name</label>
            <input id="gname" className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={60} required />
          </div>
          <div>
            <label className="label" htmlFor="gdesc">Description</label>
            <textarea id="gdesc" className="input min-h-[70px]" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} maxLength={280} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="gcourse">Course</label>
              <input id="gcourse" className="input" value={form.course} onChange={(e) => setForm((f) => ({ ...f, course: e.target.value }))} maxLength={60} />
            </div>
            <div>
              <label className="label" htmlFor="gsched">Schedule</label>
              <input id="gsched" className="input" value={form.schedule} onChange={(e) => setForm((f) => ({ ...f, schedule: e.target.value }))} placeholder="Sundays, 7pm" maxLength={120} />
            </div>
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy || !form.name.trim()}>
            {busy && <Spinner className="h-4 w-4" />} Create group
          </button>
        </form>
      </Modal>
    </>
  );
}

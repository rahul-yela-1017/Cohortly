import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { relative } from '../lib/time';
import type { Invitation, Team } from '../lib/types';
import { useToast } from '../context/ToastContext';
import { Avatar, EmptyState, ErrorState, KindChip, LoadingBlock, Modal, PageHeader, Spinner } from '../components/ui';
import { IconPlus, IconTeams } from '../components/icons';

export default function Teams() {
  const toast = useToast();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[]>([]);
  const [incoming, setIncoming] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [t, i] = await Promise.all([
        api<{ teams: Team[] }>('/teams'),
        api<{ invitations: Invitation[] }>('/invitations?direction=incoming'),
      ]);
      setTeams(t.teams);
      setIncoming(i.invitations.filter((x) => x.status === 'pending'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load teams.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const socket = getSocket();
    const onChange = () => void load();
    socket?.on('invite:new', onChange);
    socket?.on('invite:updated', onChange);
    socket?.on('team:updated', onChange);
    return () => {
      socket?.off('invite:new', onChange);
      socket?.off('invite:updated', onChange);
      socket?.off('team:updated', onChange);
    };
  }, [load]);

  const respond = async (inv: Invitation, action: 'accept' | 'decline') => {
    try {
      await api(`/invitations/${inv.id}/respond`, { method: 'POST', body: { action } });
      toast(action === 'accept' ? `You joined ${inv.team_name}.` : 'Invitation declined.', 'success');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not respond.', 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="Teams"
        subtitle="Project squads with their own encrypted chat and file space."
        action={
          <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
            <IconPlus className="h-4 w-4" /> New team
          </button>
        }
      />

      {incoming.length > 0 && (
        <section aria-label="Pending invitations" className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Invitations for you</h2>
          <ul className="space-y-3">
            {incoming.map((inv) => (
              <li key={inv.id} className="card flex flex-wrap items-center gap-3 p-4">
                <Avatar name={inv.team_name} color={inv.team_color} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{inv.team_name}</p>
                  <p className="text-xs text-slate-500">
                    Invited by {inv.inviter?.name || 'a classmate'} · {relative(inv.created_at)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-primary !py-2 text-xs" onClick={() => void respond(inv, 'accept')}>
                    Accept
                  </button>
                  <button type="button" className="btn-secondary !py-2 text-xs" onClick={() => void respond(inv, 'decline')}>
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {loading ? (
        <LoadingBlock rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : teams.length === 0 ? (
        <EmptyState
          icon={<IconTeams className="h-8 w-8" />}
          title="No teams yet"
          hint="Create a team for your project or study squad, then invite classmates — they join as soon as they accept."
          action={
            <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
              <IconPlus className="h-4 w-4" /> Create your first team
            </button>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <li key={t.id}>
              <Link to={`/app/teams/${t.id}`} className="card block p-5 transition hover:-translate-y-0.5 hover:shadow-pop motion-reduce:hover:translate-y-0">
                <div className="mb-3 flex items-center gap-3">
                  <Avatar name={t.name} color={t.avatar_color} size={44} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-500">{t.members.length} member{t.members.length === 1 ? '' : 's'}</p>
                  </div>
                </div>
                <p className="line-clamp-2 min-h-[40px] text-sm text-slate-600">{t.description || 'No description yet.'}</p>
                <div className="mt-3 flex -space-x-1.5">
                  {t.members.slice(0, 5).map((m) => (
                    <Avatar key={m.id} name={m.name} color={m.avatar_color} size={26} className="ring-2 ring-white" />
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create a team">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const { team } = await api<{ team: Team }>('/teams', { method: 'POST', body: { name, description } });
              setCreateOpen(false);
              setName('');
              setDescription('');
              toast('Team created — invite classmates next.', 'success');
              navigate(`/app/teams/${team.id}`);
            } catch (err) {
              toast(err instanceof Error ? err.message : 'Could not create team.', 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          <div>
            <label className="label" htmlFor="tname">Team name</label>
            <input id="tname" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="DBMS Project Squad" maxLength={60} required />
          </div>
          <div>
            <label className="label" htmlFor="tdesc">Description <span className="font-normal text-slate-400">(optional)</span></label>
            <textarea id="tdesc" className="input min-h-[72px]" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} placeholder="What is this team working on?" />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy || !name.trim()}>
            {busy && <Spinner className="h-4 w-4" />} Create team
          </button>
        </form>
      </Modal>
    </>
  );
}

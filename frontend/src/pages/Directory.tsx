import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '../lib/api';
import type { Profile } from '../lib/types';
import { useToast } from '../context/ToastContext';
import { Avatar, EmptyState, ErrorState, LoadingBlock, Modal, PageHeader } from '../components/ui';
import { IconChat, IconSearch, IconUsers } from '../components/icons';

export default function Directory() {
  const toast = useToast();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Profile | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const data = await api<{ results: Profile[] }>(`/directory?limit=30${q ? `&q=${encodeURIComponent(q)}` : ''}`);
        setResults(data.results);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Directory unavailable.');
      } finally {
        setLoading(false);
      }
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q]);

  const message = async (p: Profile) => {
    setStarting(true);
    try {
      const { conversation } = await api<{ conversation: { id: string } }>('/conversations/dm', {
        method: 'POST',
        body: { user_id: p.id },
      });
      setSelected(null);
      navigate(`/app/chat/${conversation.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not open a conversation.', 'error');
    } finally {
      setStarting(false);
    }
  };

  return (
    <>
      <PageHeader title="Classmates" subtitle="Everyone here is on your approved class roster." />

      <div className="relative mb-6">
        <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          className="input !pl-11"
          placeholder="Search by name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search classmates by name"
        />
      </div>

      {loading ? (
        <LoadingBlock rows={4} />
      ) : error ? (
        <ErrorState message={error} />
      ) : results.length === 0 ? (
        <EmptyState
          icon={<IconUsers className="h-8 w-8" />}
          title={q ? `No classmates match “${q}”` : 'No activated classmates yet'}
          hint={q ? 'Check the spelling, or search by first name.' : 'Classmates appear here once they activate their account with the class roster.'}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((p) => (
            <li key={p.id} className="card flex items-center gap-3.5 p-4 transition hover:shadow-pop">
              <Avatar name={p.name} color={p.avatar_color} size={46} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{p.name}</p>
                <p className="truncate text-xs text-slate-500">{p.bio || `Roll ${p.roll_number}`}</p>
              </div>
              <button type="button" className="btn-secondary !px-3 !py-2 text-xs" onClick={() => setSelected(p)}>
                View
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Classmate profile">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar name={selected.name} color={selected.avatar_color} size={56} />
              <div>
                <p className="text-base font-semibold text-slate-900">{selected.name}</p>
                <p className="text-sm text-slate-500">Roll {selected.roll_number}</p>
              </div>
            </div>
            {selected.bio !== undefined && selected.bio && (
              <p className="rounded-2xl bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-700">{selected.bio}</p>
            )}
            {selected.email && (
              <p className="text-sm text-slate-600">
                <span className="font-medium text-slate-800">Email:</span> {selected.email}
              </p>
            )}
            {!selected.has_keys && (
              <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
                {selected.name.split(' ')[0]} hasn’t set up end-to-end encryption yet, so encrypted chat isn’t available until they log in once.
              </p>
            )}
            <button type="button" className="btn-primary w-full" onClick={() => void message(selected)} disabled={starting || !selected.has_keys}>
              <IconChat className="h-4 w-4" /> Start private conversation
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}

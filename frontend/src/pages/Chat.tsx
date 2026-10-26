import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import MessageThread from '../components/MessageThread';
import { Avatar, EmptyState, LoadingBlock } from '../components/ui';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { relative } from '../lib/time';
import type { Conversation, Profile } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { IconChat, IconLock, IconSearch } from '../components/icons';

export default function Chat() {
  const { convId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Profile[]>([]);
  const [searchingPeople, setSearchingPeople] = useState(false);

  const refresh = useCallback(async () => {
    const data = await api<{ conversations: Conversation[] }>('/conversations');
    setConversations(data.conversations);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const socket = getSocket();
    const onChange = () => void refresh();
    socket?.on('chat:message', onChange);
    socket?.on('team:updated', onChange);
    return () => {
      socket?.off('chat:message', onChange);
      socket?.off('team:updated', onChange);
    };
  }, [refresh]);

  /* New-conversation people search */
  useEffect(() => {
    if (!query.trim()) {
      setPeople([]);
      return;
    }
    setSearchingPeople(true);
    const t = setTimeout(async () => {
      try {
        const data = await api<{ results: Profile[] }>(`/directory?limit=6&q=${encodeURIComponent(query)}`);
        setPeople(data.results);
      } finally {
        setSearchingPeople(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const openDm = async (p: Profile) => {
    const { conversation } = await api<{ conversation: Conversation }>('/conversations/dm', {
      method: 'POST',
      body: { user_id: p.id },
    });
    setQuery('');
    setPeople([]);
    await refresh();
    navigate(`/app/chat/${conversation.id}`);
  };

  const active = conversations.find((c) => c.id === convId) || null;
  const filtered = conversations.filter((c) => c.title.toLowerCase().includes(query.toLowerCase() || ''));

  return (
    <div className="card flex h-[calc(100vh-190px)] min-h-[480px] overflow-hidden lg:h-[calc(100vh-160px)]">
      {/* Conversation list */}
      <div className={`w-full flex-col border-r border-slate-200 sm:w-80 ${convId ? 'hidden sm:flex' : 'flex'}`}>
        <div className="border-b border-slate-100 p-3.5">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input !py-2 !pl-9 text-sm"
              placeholder="Search or start a conversation…"
              aria-label="Search conversations or classmates"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {query.trim() && (
            <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-100">
              {searchingPeople ? (
                <p className="p-3 text-xs text-slate-400">Searching classmates…</p>
              ) : people.length === 0 ? (
                <p className="p-3 text-xs text-slate-400">No classmates match.</p>
              ) : (
                people.map((p) => (
                  <button key={p.id} type="button" className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50" onClick={() => void openDm(p)}>
                    <Avatar name={p.name} color={p.avatar_color} size={30} />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{p.name}</span>
                    <span className="text-xs font-medium text-brand-600">Message</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto p-2">
          {loading ? (
            <LoadingBlock rows={4} />
          ) : filtered.length === 0 ? (
            <div className="p-3">
              <EmptyState icon={<IconChat className="h-7 w-7" />} title="No conversations yet" hint="Search a classmate above to start an encrypted conversation." />
            </div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => navigate(`/app/chat/${c.id}`)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                  c.id === convId ? 'bg-brand-50' : 'hover:bg-slate-50'
                }`}
              >
                <Avatar name={c.title} color={c.avatar_color} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900">{c.title}</span>
                    {c.last_message && <span className="shrink-0 text-[11px] text-slate-400">{relative(c.last_message.created_at)}</span>}
                  </span>
                  <span className="flex items-center gap-1.5 truncate text-xs text-slate-500">
                    <IconLock className="h-3 w-3 shrink-0 text-slate-400" />
                    <span className="truncate">{c.last_message ? 'Encrypted message' : 'No messages yet'}</span>
                  </span>
                </span>
                {c.unread > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">
                    {c.unread}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Thread */}
      <div className={`min-w-0 flex-1 flex-col ${convId ? 'flex' : 'hidden sm:flex'}`}>
        {active ? (
          <>
            <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
              <button type="button" className="btn-ghost sm:hidden !p-1.5" onClick={() => navigate('/app/chat')} aria-label="Back to conversations">
                ←
              </button>
              <Avatar name={active.title} color={active.avatar_color} size={36} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{active.title}</p>
                <p className="text-[11px] text-slate-500">
                  {active.type === 'team' ? `Team · ${active.member_count} members` : 'Private · end-to-end encrypted'}
                </p>
              </div>
            </div>
            <MessageThread conversation={active} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8">
            <EmptyState icon={<IconChat className="h-8 w-8" />} title="Select a conversation" hint="Pick a conversation on the left, or search a classmate to start a new encrypted chat." />
          </div>
        )}
      </div>
    </div>
  );
}

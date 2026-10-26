import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import MessageThread from '../components/MessageThread';
import { api, downloadFile, saveBlob } from '../lib/api';
import { decryptBinary, decryptText, encryptBinary, encryptText, myPublicKey, publicKeyFor } from '../lib/crypto';
import { formatBytes, relative } from '../lib/time';
import type { Conversation, FileMeta, Invitation, Profile, Team } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar, EmptyState, ErrorState, KindChip, LoadingBlock, Modal, Spinner } from '../components/ui';
import { IconArrowLeft, IconDownload, IconFile, IconLock, IconPaperclip, IconPlus, IconSearch } from '../components/icons';

type Tab = 'chat' | 'files' | 'members';

interface FileWithManifest extends FileMeta {
  manifest?: string;
}

export default function TeamDetail() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, keyring } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [files, setFiles] = useState<FileWithManifest[]>([]);
  const [names, setNames] = useState<Record<string, { name: string; mime: string; size: number }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('chat');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Profile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    setError('');
    try {
      const { team: t } = await api<{ team: Team }>(`/teams/${teamId}`);
      setTeam(t);
      if (t.role === 'member' && t.conversation_id) {
        const { conversations } = await api<{ conversations: Conversation[] }>('/conversations');
        setConversation(conversations.find((c) => c.id === t.conversation_id) || null);
        const f = await api<{ files: FileWithManifest[] }>(`/teams/${t.id}/files`).catch(() => ({ files: [] }));
        setFiles(f.files || []);
      }
      const out = await api<{ invitations: Invitation[] }>('/invitations?direction=outgoing');
      setInvites(out.invitations.filter((i) => i.team_id === teamId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Team unavailable.');
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!query.trim()) {
      setPeople([]);
      return;
    }
    const t = setTimeout(async () => {
      const data = await api<{ results: Profile[] }>(`/directory?limit=6&q=${encodeURIComponent(query)}`);
      setPeople(data.results);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  /* Decrypt file-name manifests locally once keys are ready */
  useEffect(() => {
    if (keyring !== 'ready') return;
    files.forEach(async (f) => {
      if (!f.manifest || names[f.id]) return;
      try {
        const m = JSON.parse(await decryptText(f.manifest));
        setNames((prev) => ({ ...prev, [f.id]: { name: m.name, mime: m.mime, size: m.size } }));
      } catch {
        /* not decryptable on this device */
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, keyring]);

  if (loading) return <LoadingBlock rows={4} />;
  if (error || !team) return <ErrorState message={error || 'Team not found.'} onRetry={() => void load()} />;

  const isMember = team.role === 'member';

  const invite = async (p: Profile) => {
    try {
      await api(`/teams/${team.id}/invitations`, { method: 'POST', body: { user_id: p.id } });
      toast(`Invitation sent to ${p.name}.`, 'success');
      setQuery('');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Invite failed.', 'error');
    }
  };

  const upload = async (file: File) => {
    if (!team || uploading) return;
    setUploading(true);
    try {
      const memberKeys: string[] = [];
      const mine = myPublicKey();
      if (!mine) throw new Error('Unlock your keys first.');
      memberKeys.push(mine);
      for (const m of team.members) {
        if (m.id === user?.id) continue;
        const pk = await publicKeyFor(m.id);
        if (!pk) throw new Error(`${m.name} hasn’t set up encryption keys yet.`);
        memberKeys.push(pk);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const cipher = await encryptBinary(memberKeys, bytes);
      const manifest = await encryptText(
        memberKeys,
        JSON.stringify({ name: file.name, mime: file.type || 'application/octet-stream', size: file.size }),
      );
      const form = new FormData();
      form.append('file', new Blob([cipher as BlobPart]), 'attachment.enc');
      form.append('scope_type', 'team');
      form.append('scope_ref', team.id);
      form.append('encrypted', 'true');
      form.append('manifest', manifest);
      const { file: meta } = await api<{ file: FileWithManifest }>('/files', { method: 'POST', form });
      setFiles((prev) => [meta, ...prev]);
      setNames((n) => ({ ...n, [meta.id]: { name: file.name, mime: file.type, size: file.size } }));
      toast('Encrypted file shared with the team.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed.', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const download = async (f: FileWithManifest) => {
    try {
      const info = names[f.id] || { name: 'team-file', mime: 'application/octet-stream', size: f.size };
      const blob = await downloadFile(f.id);
      const plain = await decryptBinary(new Uint8Array(await blob.arrayBuffer()));
      saveBlob(new Blob([plain as BlobPart], { type: info.mime }), info.name);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Download failed.', 'error');
    }
  };

  return (
    <div className="flex h-[calc(100vh-190px)] min-h-[520px] flex-col lg:h-[calc(100vh-160px)]">
      {/* Header */}
      <div className="card mb-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" className="btn-ghost !p-2" onClick={() => navigate('/app/teams')} aria-label="Back to teams">
            <IconArrowLeft className="h-4 w-4" />
          </button>
          <Avatar name={team.name} color={team.avatar_color} size={48} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold tracking-tight text-slate-900">{team.name}</h1>
            <p className="truncate text-sm text-slate-500">{team.description || 'No description.'}</p>
          </div>
          {isMember && (
            <button type="button" className="btn-secondary" onClick={() => setInviteOpen(true)}>
              <IconPlus className="h-4 w-4" /> Invite
            </button>
          )}
        </div>
        {isMember && (
          <div className="mt-4 flex gap-1.5 border-t border-slate-100 pt-3" role="tablist" aria-label="Team sections">
            {(['chat', 'files', 'members'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`chip capitalize transition ${tab === t ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {t === 'chat' ? 'Team chat' : t}
              </button>
            ))}
          </div>
        )}
      </div>

      {!isMember ? (
        <EmptyState
          icon={<IconLock className="h-8 w-8" />}
          title="You’re invited — waiting on you"
          hint="Accept the invitation from the Teams page to unlock this team’s chat and files."
        />
      ) : tab === 'chat' && conversation ? (
        <div className="card min-h-0 flex-1 overflow-hidden">
          <MessageThread conversation={conversation} />
        </div>
      ) : tab === 'files' ? (
        <div className="card min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">Shared files</p>
            <button
              type="button"
              className="btn-secondary !py-2 text-xs"
              onClick={() => fileRef.current?.click()}
              disabled={keyring !== 'ready' || uploading}
            >
              {uploading ? <Spinner className="h-3.5 w-3.5" /> : <IconPaperclip className="h-3.5 w-3.5" />} Upload encrypted file
            </button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              aria-label="Upload team file"
              onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
            />
          </div>
          {keyring !== 'ready' && (
            <p className="mb-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">Unlock your encryption keys to upload or open team files.</p>
          )}
          {files.length === 0 ? (
            <EmptyState
              icon={<IconFile className="h-7 w-7" />}
              title="No files yet"
              hint="Files shared here are encrypted on your device and visible only to accepted members."
            />
          ) : (
            <ul className="space-y-2">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <IconFile className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {names[f.id]?.name || (keyring === 'ready' ? 'Encrypted file' : 'Encrypted file (locked)')}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatBytes(f.size)} · encrypted · {relative(f.created_at)}
                    </p>
                  </div>
                  <button type="button" className="btn-secondary !px-3 !py-2 text-xs" onClick={() => void download(f)} disabled={keyring !== 'ready'}>
                    <IconDownload className="h-3.5 w-3.5" /> Download
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="card min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <p className="mb-4 text-sm font-semibold text-slate-800">Members ({team.members.length})</p>
          <ul className="space-y-2">
            {team.members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                <Avatar name={m.name} color={m.avatar_color} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {m.name} {m.id === user?.id && <span className="text-xs font-normal text-slate-400">(you)</span>}
                  </p>
                  <p className="text-xs text-slate-500">Roll {m.roll_number}</p>
                </div>
                {m.id === team.owner_id && <span className="chip bg-brand-50 text-brand-700">Owner</span>}
              </li>
            ))}
          </ul>
          {invites.length > 0 && (
            <>
              <p className="mb-3 mt-6 text-sm font-semibold text-slate-800">Invitations</p>
              <ul className="space-y-2">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                    <Avatar name={i.invitee?.name || '?'} color={i.invitee?.avatar_color} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{i.invitee?.name}</p>
                      <p className="text-xs text-slate-500">{relative(i.created_at)}</p>
                    </div>
                    <KindChip kind={i.status} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title={`Invite to ${team.name}`}>
        <div className="space-y-3">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input !pl-9"
              placeholder="Search classmates…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search classmates to invite"
            />
          </div>
          {query.trim() && (
            <ul className="max-h-64 overflow-y-auto rounded-xl border border-slate-100">
              {people.length === 0 && <li className="p-3 text-xs text-slate-400">No classmates match.</li>}
              {people
                .filter((p) => !team.members.some((m) => m.id === p.id))
                .map((p) => (
                  <li key={p.id}>
                    <button type="button" className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50" onClick={() => void invite(p)}>
                      <Avatar name={p.name} color={p.avatar_color} size={30} />
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{p.name}</span>
                      <span className="text-xs font-medium text-brand-600">Invite</span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
          <p className="text-xs text-slate-400">Invitees get access to team chat and files only after accepting.</p>
        </div>
      </Modal>
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api, downloadFile, saveBlob } from '../lib/api';
import {
  decryptBinary,
  decryptText,
  encryptBinary,
  encryptText,
  keyringStatus,
  myPublicKey,
  onKeyringChange,
  publicKeyFor,
} from '../lib/crypto';
import { getSocket } from '../lib/socket';
import { dayOf, formatBytes, timeOf } from '../lib/time';
import type { Conversation, Message } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar, Spinner } from './ui';
import { IconDownload, IconFile, IconLock, IconPaperclip, IconSend } from './icons';

interface Decrypted {
  text?: string;
  fileName?: string;
  fileMime?: string;
  fileSize?: number;
  error?: string;
}

const PAGE = 40;

export default function MessageThread({ conversation }: { conversation: Conversation }) {
  const { user } = useAuth();
  const toast = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const [keyring, setKeyring] = useState(keyringStatus());
  const [decrypted, setDecrypted] = useState<Record<string, Decrypted>>({});
  const [peerName, setPeerName] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<number | undefined>(undefined);
  const lastTypingSent = useRef(0);

  const isTeam = conversation.type === 'team';

  useEffect(() => onKeyringChange(setKeyring), []);

  /* ------------------------------------------------ participant public keys */
  const memberIds = useMemo(() => {
    if (isTeam) return conversationMembers(conversation);
    return conversation.other_user ? [conversation.other_user.id] : [];
  }, [conversation, isTeam]);

  const [memberIdsState, setMemberIdsState] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!isTeam) {
        if (alive) setMemberIdsState(memberIds);
        return;
      }
      try {
        const { team } = await api<{ team: { members: { id: string }[] } }>(`/teams/${conversation.team_id}`);
        if (alive) setMemberIdsState(team.members.map((m) => m.id));
      } catch {
        if (alive) setMemberIdsState([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [conversation.team_id, isTeam, memberIds]);

  /* ------------------------------------------------ load + decrypt history */
  const decryptOne = useCallback(
    async (m: Message) => {
      if (keyringStatus() !== 'ready') return;
      try {
        if (m.kind === 'file') {
          const meta = JSON.parse(await decryptText(m.ciphertext));
          setDecrypted((d) => ({ ...d, [m.id]: { fileName: meta.name, fileMime: meta.mime, fileSize: meta.size } }));
        } else {
          const text = await decryptText(m.ciphertext);
          setDecrypted((d) => ({ ...d, [m.id]: { text } }));
        }
      } catch {
        setDecrypted((d) => ({ ...d, [m.id]: { error: 'Unable to decrypt on this device.' } }));
      }
    },
    [],
  );

  const load = useCallback(
    async (before?: string) => {
      if (before) setLoadingOlder(true);
      else setLoading(true);
      try {
        const data = await api<{ messages: Message[]; has_more: boolean }>(
          `/conversations/${conversation.id}/messages?limit=${PAGE}${before ? `&before=${before}` : ''}`,
        );
        setMessages((prev) => (before ? [...data.messages, ...prev] : data.messages));
        setHasMore(data.has_more && data.messages.length === PAGE);
        data.messages.forEach((m) => {
          if (!decrypted[m.id]) void decryptOne(m);
        });
        if (!before) {
          requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
          });
          void api(`/conversations/${conversation.id}/read`, { method: 'POST' });
        }
      } catch {
        toast('Could not load this conversation.', 'error');
      } finally {
        setLoading(false);
        setLoadingOlder(false);
      }
    },
    [conversation.id, decrypted, decryptOne, toast],
  );

  useEffect(() => {
    setMessages([]);
    setDecrypted({});
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  /* Re-decrypt everything when the keyring becomes ready */
  useEffect(() => {
    if (keyring === 'ready') messages.forEach((m) => void decryptOne(m));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyring]);

  /* ------------------------------------------------ realtime */
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onMessage = (payload: { conversation_id: string; message: Message }) => {
      if (payload.conversation_id !== conversation.id) return;
      setMessages((prev) => (prev.some((m) => m.id === payload.message.id) ? prev : [...prev, payload.message]));
      void decryptOne(payload.message);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current?.scrollHeight || 0, behavior: 'smooth' }));
      if (document.hasFocus()) void api(`/conversations/${conversation.id}/read`, { method: 'POST' });
    };
    const onRead = (payload: { conversation_id: string; user_id: string }) => {
      if (payload.conversation_id !== conversation.id) return;
      setMessages((prev) =>
        prev.map((m) => (m.read_by.includes(payload.user_id) ? m : { ...m, read_by: [...m.read_by, payload.user_id] })),
      );
    };
    const onTyping = (payload: { conversation_id: string; name: string }) => {
      if (payload.conversation_id !== conversation.id) return;
      setTyping(payload.name);
      window.clearTimeout(typingTimer.current);
      typingTimer.current = window.setTimeout(() => setTyping(null), 2600);
    };
    socket.on('chat:message', onMessage);
    socket.on('chat:read', onRead);
    socket.on('chat:typing', onTyping);
    return () => {
      socket.off('chat:message', onMessage);
      socket.off('chat:read', onRead);
      socket.off('chat:typing', onTyping);
    };
  }, [conversation.id, decryptOne]);

  /* ------------------------------------------------ send */
  const collectKeys = useCallback(async (): Promise<string[] | null> => {
    const mine = myPublicKey();
    if (!mine) return null;
    const keys = [mine];
    for (const id of memberIdsState) {
      if (id === user?.id) continue;
      const pk = await publicKeyFor(id);
      if (!pk) {
        setPeerName(id);
        return null;
      }
      keys.push(pk);
    }
    return keys;
  }, [memberIdsState, user?.id]);

  /* Opens the global unlock dialog (handled by AppShell) when keys aren't ready. */
  const requestUnlock = () => window.dispatchEvent(new CustomEvent('cc:unlock-requested'));

  const sendText = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const keys = await collectKeys();
      if (!keys) {
        toast('A participant hasn’t set up encryption keys yet.', 'error');
        return;
      }
      const ciphertext = await encryptText(keys, text);
      const { message } = await api<{ message: Message }>(`/conversations/${conversation.id}/messages`, {
        method: 'POST',
        body: { kind: 'text', ciphertext },
      });
      setMessages((prev) => [...prev, message]);
      setDecrypted((d) => ({ ...d, [message.id]: { text } }));
      setDraft('');
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Message failed to send.', 'error');
    } finally {
      setSending(false);
    }
  };

  const attachRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const sendFile = async (file: File) => {
    if (uploading) return;
    setUploading(true);
    try {
      const keys = await collectKeys();
      if (!keys) {
        toast('A participant hasn’t set up encryption keys yet.', 'error');
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const cipherBytes = await encryptBinary(keys, bytes);
      const form = new FormData();
      form.append('file', new Blob([cipherBytes as BlobPart]), 'attachment.enc');
      form.append('scope_type', isTeam ? 'team' : 'dm');
      form.append('scope_ref', (isTeam ? conversation.team_id : conversation.id) || '');
      form.append('encrypted', 'true');
      const { file: fileMeta } = await api<{ file: { id: string } }>('/files', { method: 'POST', form });
      const metaJson = JSON.stringify({ name: file.name, mime: file.type || 'application/octet-stream', size: file.size });
      const ciphertext = await encryptText(keys, metaJson);
      const { message } = await api<{ message: Message }>(`/conversations/${conversation.id}/messages`, {
        method: 'POST',
        body: { kind: 'file', ciphertext, file_id: fileMeta.id },
      });
      setMessages((prev) => [...prev, message]);
      setDecrypted((d) => ({ ...d, [message.id]: { fileName: file.name, fileMime: file.type, fileSize: file.size } }));
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }));
      toast('Encrypted attachment sent.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed.', 'error');
    } finally {
      setUploading(false);
      if (attachRef.current) attachRef.current.value = '';
    }
  };

  const download = async (m: Message) => {
    const meta = decrypted[m.id];
    if (!meta?.fileName) return;
    try {
      const blob = await downloadFile(m.file_id!);
      const plain = await decryptBinary(new Uint8Array(await blob.arrayBuffer()));
      saveBlob(new Blob([plain as BlobPart], { type: meta.fileMime }), meta.fileName);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Download failed.', 'error');
    }
  };

  /* ------------------------------------------------ render */
  let lastDay = '';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="scroll-thin flex-1 space-y-1 overflow-y-auto px-4 py-4 sm:px-6">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`skeleton h-12 ${i % 2 ? 'ml-auto w-2/3' : 'w-1/2'}`} />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-16 text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <IconLock className="h-5 w-5" />
            </span>
            <p className="text-sm font-semibold text-slate-800">No messages yet</p>
            <p className="mt-1 max-w-xs text-sm text-slate-500">
              Everything you send here is encrypted on your device before it reaches the server.
            </p>
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="pb-3 text-center">
                <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={() => void load(messages[0]?.id)} disabled={loadingOlder}>
                  {loadingOlder ? <Spinner className="h-3.5 w-3.5" /> : null} Load earlier messages
                </button>
              </div>
            )}
            {messages.map((m) => {
              const mine = m.sender_id === user?.id;
              const day = dayOf(m.created_at);
              const showDay = day !== lastDay;
              lastDay = day;
              const content = decrypted[m.id];
              const readByOthers = !mine && false;
              void readByOthers;
              return (
                <React.Fragment key={m.id}>
                  {showDay && (
                    <div className="sticky top-0 z-10 my-3 flex justify-center">
                      <span className="rounded-full bg-slate-200/80 px-3 py-1 text-[11px] font-semibold text-slate-600 backdrop-blur">{day}</span>
                    </div>
                  )}
                  <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`group max-w-[85%] sm:max-w-[70%] ${mine ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                          mine ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'
                        }`}
                      >
                        {m.kind === 'file' ? (
                          content?.fileName ? (
                            <button
                              type="button"
                              onClick={() => void download(m)}
                              className={`flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition ${
                                mine ? 'hover:bg-brand-700' : 'hover:bg-slate-50'
                              }`}
                            >
                              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${mine ? 'bg-brand-500/60' : 'bg-brand-50 text-brand-600'}`}>
                                <IconFile className="h-4 w-4" />
                              </span>
                              <span>
                                <span className="block max-w-[180px] truncate font-medium">{content.fileName}</span>
                                <span className={`block text-[11px] ${mine ? 'text-brand-100' : 'text-slate-500'}`}>
                                  {formatBytes(content.fileSize || 0)} · encrypted · tap to download
                                </span>
                              </span>
                              <IconDownload className="h-4 w-4 opacity-70" />
                            </button>
                          ) : content?.error ? (
                            <span className={`text-xs italic ${mine ? 'text-brand-100' : 'text-slate-500'}`}>{content.error}</span>
                          ) : keyring !== 'ready' ? (
                            <span className={`flex items-center gap-1.5 text-xs italic ${mine ? 'text-brand-100' : 'text-slate-500'}`}>
                              <IconLock className="h-3.5 w-3.5" /> Encrypted attachment
                            </span>
                          ) : (
                            <span className="flex items-center gap-2 text-xs italic opacity-70">
                              <Spinner className="h-3.5 w-3.5" /> Decrypting…
                            </span>
                          )
                        ) : content?.text !== undefined ? (
                          <span className="whitespace-pre-wrap break-words">{content.text}</span>
                        ) : content?.error ? (
                          <span className={`text-xs italic ${mine ? 'text-brand-100' : 'text-slate-500'}`}>{content.error}</span>
                        ) : keyring !== 'ready' ? (
                          <span className={`flex items-center gap-1.5 text-xs italic ${mine ? 'text-brand-100' : 'text-slate-500'}`}>
                            <IconLock className="h-3.5 w-3.5" /> Encrypted message
                          </span>
                        ) : (
                          <span className="flex items-center gap-2 text-xs italic opacity-70">
                            <Spinner className="h-3.5 w-3.5" /> Decrypting…
                          </span>
                        )}
                      </div>
                      <p className={`mt-1 flex items-center gap-1.5 text-[11px] text-slate-400 ${mine ? 'justify-end' : ''}`}>
                        {timeOf(m.created_at)}
                        {mine && m.read_by.some((r) => r !== user?.id) && <span className="font-medium text-accent-600">Read</span>}
                      </p>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
            {typing && (
              <p className="pl-1 text-xs italic text-slate-500" aria-live="polite">
                {typing} is typing…
              </p>
            )}
          </>
        )}
      </div>

      <div className="border-t border-slate-200 bg-white px-3 py-3 sm:px-4">
        {peerName && <p className="mb-2 text-xs font-medium text-rose-600">Waiting on a participant’s encryption keys.</p>}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void sendText();
          }}
        >
          <input
            ref={attachRef}
            type="file"
            className="hidden"
            aria-label="Attach an encrypted file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                if (f.size > 25 * 1024 * 1024) toast('Files must be under 25 MB.', 'error');
                else void sendFile(f);
              }
            }}
          />
          <button
            type="button"
            className="btn-ghost shrink-0 !p-2.5"
            aria-label="Choose a file to attach (encrypted on your device)"
            title="Attach file (encrypted on your device)"
            disabled={keyring !== 'ready' || uploading}
            onClick={() => attachRef.current?.click()}
          >
            {uploading ? <Spinner className="h-5 w-5" /> : <IconPaperclip className="h-5 w-5" />}
          </button>
          <textarea
            className="input max-h-32 min-h-[44px] flex-1 resize-y"
            rows={1}
            placeholder={keyring === 'ready' ? 'Write a message…' : 'Tap here to unlock your keys and write…'}
            aria-label="Message"
            value={draft}
            readOnly={keyring !== 'ready'}
            aria-disabled={keyring !== 'ready'}
            onClick={keyring === 'ready' ? undefined : requestUnlock}
            onFocus={keyring === 'ready' ? undefined : requestUnlock}
            onChange={(e) => {
              setDraft(e.target.value);
              const now = Date.now();
              if (now - lastTypingSent.current > 1200) {
                lastTypingSent.current = now;
                getSocket()?.emit('typing', { conversation_id: conversation.id });
              }
            }}
            onKeyDown={(e) => {
              if (keyring !== 'ready') {
                // Never leave the keyboard dead: any key opens the unlock dialog.
                e.preventDefault();
                requestUnlock();
                return;
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendText();
              }
            }}
          />
          <button type="submit" className="btn-primary shrink-0 !px-3.5" aria-label="Send message" disabled={sending || !draft.trim() || keyring !== 'ready'}>
            {sending ? <Spinner className="h-4 w-4" /> : <IconSend className="h-4 w-4" />}
          </button>
        </form>
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400">
          <IconLock className="h-3 w-3" /> End-to-end encrypted with OpenPGP — the server stores ciphertext only.
        </p>
      </div>
    </div>
  );
}

/* Team member ids are fetched asynchronously; DM ids come from the conversation. */
function conversationMembers(conversation: Conversation): string[] {
  return conversation.other_user ? [conversation.other_user.id] : [];
}

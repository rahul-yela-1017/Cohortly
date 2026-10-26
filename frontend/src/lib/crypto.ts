/**
 * End-to-end encryption built on OpenPGP (RFC 9580) via openpgp.js — the same
 * battle-tested library used by production mail clients.
 *
 * Threat model:
 *  - Keypairs (Curve25519) are generated *in the browser*. Private keys never
 *    leave the device in plaintext.
 *  - The private key is encrypted with a passphrase derived from the user's
 *    password before it is uploaded, so the server and MongoDB only ever
 *    store ciphertext (messages AND keys).
 *  - Messages and chat attachments are encrypted to every participant's
 *    public key on the sender's device and decrypted only on recipients'
 *    devices.
 *  - A decrypted copy is cached in this browser's IndexedDB so a page reload
 *    doesn't re-ask for the password (device-local, like Signal desktop).
 *    Clearing site data or locking the keyring removes it.
 */
import * as openpgp from 'openpgp';

import { api } from './api';

export type KeyringStatus = 'ready' | 'locked' | 'setup';

let privateKey: openpgp.PrivateKey | null = null;
let publicKeyArmored: string | null = null;
let status: KeyringStatus = 'setup';
const listeners = new Set<(s: KeyringStatus) => void>();

export function keyringStatus(): KeyringStatus {
  return status;
}
export function onKeyringChange(fn: (s: KeyringStatus) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function setStatus(s: KeyringStatus) {
  status = s;
  listeners.forEach((fn) => fn(s));
}

/* ---------------------------------------------------------- IndexedDB cache */

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('cohortly-keyring', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('keys');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(userId: string): Promise<string | undefined> {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const tx = db.transaction('keys', 'readonly').objectStore('keys').get(userId);
      tx.onsuccess = () => resolve(tx.result as string | undefined);
      tx.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}
async function idbSet(userId: string, armored: string) {
  try {
    const db = await idb();
    await new Promise((resolve) => {
      const tx = db.transaction('keys', 'readwrite').objectStore('keys').put(armored, userId);
      tx.onsuccess = () => resolve(null);
      tx.onerror = () => resolve(null);
    });
  } catch {
    /* cache is best-effort */
  }
}
export async function clearKeyCache(userId: string) {
  try {
    const db = await idb();
    await new Promise((resolve) => {
      const tx = db.transaction('keys', 'readwrite').objectStore('keys').delete(userId);
      tx.onsuccess = () => resolve(null);
      tx.onerror = () => resolve(null);
    });
  } catch {
    /* ignore */
  }
  privateKey = null;
  setStatus('setup');
}

/* ---------------------------------------------------------- lifecycle */

export interface BootResult {
  status: KeyringStatus;
}

/** Called after login (with password) or on app boot (password may be absent). */
export async function bootKeyring(userId: string, email: string, password?: string): Promise<BootResult> {
  const server = await api<{ public_key: string | null; encrypted_private_key: string | null }>('/me/keys');

  if (!server.public_key || !server.encrypted_private_key) {
    if (!password) {
      setStatus('setup');
      return { status: 'setup' };
    }
    const pair = await openpgp.generateKey({
      type: 'ecc',
      curve: 'curve25519',
      userIDs: [{ name: userId.slice(0, 8), email }],
      passphrase: password,
      format: 'armored',
    });
    await api('/me/keys', { method: 'POST', body: { public_key: pair.publicKey, encrypted_private_key: pair.privateKey } });
    privateKey = await openpgp.readPrivateKey({ armoredKey: pair.privateKey as string });
    privateKey = await openpgp.decryptKey({ privateKey, passphrase: password });
    publicKeyArmored = pair.publicKey as string;
    await idbSet(userId, privateKey.armor());
    setStatus('ready');
    return { status: 'ready' };
  }

  publicKeyArmored = server.public_key;
  const cached = await idbGet(userId);
  if (cached) {
    try {
      privateKey = await openpgp.readPrivateKey({ armoredKey: cached });
      setStatus('ready');
      return { status: 'ready' };
    } catch {
      /* fall through */
    }
  }
  if (password) {
    const s = await unlockWithPassword(server.encrypted_private_key, password);
    if (s === 'ready' && privateKey) await idbSet(userId, privateKey.armor());
    return { status: s };
  }
  setStatus('locked');
  return { status: 'locked' };
}

export async function unlockKeyring(userId: string, password: string): Promise<KeyringStatus> {
  const server = await api<{ encrypted_private_key: string | null }>('/me/keys');
  if (!server.encrypted_private_key) return 'setup';
  const s = await unlockWithPassword(server.encrypted_private_key, password);
  if (s === 'ready') await idbSet(userId, privateKey!.armor());
  return s;
}

async function unlockWithPassword(encryptedArmored: string, password: string): Promise<KeyringStatus> {
  try {
    const enc = await openpgp.readPrivateKey({ armoredKey: encryptedArmored });
    privateKey = await openpgp.decryptKey({ privateKey: enc, passphrase: password });
    setStatus('ready');
    return 'ready';
  } catch {
    setStatus('locked');
    return 'locked';
  }
}

/** Re-wrap the private key with a new passphrase (after a password change) and
 *  upload the new ciphertext so other devices can still unlock it. */
export async function rotateKeyPassphrase(userId: string, newPassword: string): Promise<boolean> {
  if (!privateKey) return false;
  try {
    const rewrapped = await openpgp.encryptKey({ privateKey, passphrase: newPassword });
    const armored = rewrapped.armor();
    await api('/me/keys', {
      method: 'POST',
      body: { public_key: publicKeyArmored, encrypted_private_key: armored },
    });
    await idbSet(userId, privateKey.armor());
    return true;
  } catch {
    return false;
  }
}

/** Abandon the old keypair and create a fresh one (e.g. after an email-based
 *  password reset when the old passphrase is no longer known). Old ciphertext
 *  stays in the database but becomes unreadable — this is inherent to E2EE. */
export async function resetKeys(userId: string, email: string, password: string): Promise<KeyringStatus> {
  const pair = await openpgp.generateKey({
    type: 'ecc',
    curve: 'curve25519',
    userIDs: [{ name: userId.slice(0, 8), email }],
    passphrase: password,
    format: 'armored',
  });
  await api('/me/keys', { method: 'POST', body: { public_key: pair.publicKey, encrypted_private_key: pair.privateKey } });
  pkCache.clear();
  privateKey = await openpgp.readPrivateKey({ armoredKey: pair.privateKey as string });
  privateKey = await openpgp.decryptKey({ privateKey, passphrase: password });
  publicKeyArmored = pair.publicKey as string;
  await idbSet(userId, privateKey.armor());
  setStatus('ready');
  return 'ready';
}

export function lockKeyring() {
  privateKey = null;
  setStatus('locked');
}

export function myPublicKey(): string | null {
  return publicKeyArmored;
}

/* ---------------------------------------------------------- public-key directory */

const pkCache = new Map<string, string | null>();

export async function publicKeyFor(userId: string): Promise<string | null> {
  if (pkCache.has(userId)) return pkCache.get(userId)!;
  try {
    const { user } = await api<{ user: { public_key?: string | null } }>(`/users/${userId}`);
    const pk = user.public_key || null;
    pkCache.set(userId, pk);
    return pk;
  } catch {
    return null;
  }
}
export function forgetPublicKey(userId: string) {
  pkCache.delete(userId);
}

/* ---------------------------------------------------------- encrypt / decrypt */

async function keys(armoredList: string[]): Promise<openpgp.PublicKey[]> {
  const out: openpgp.PublicKey[] = [];
  for (const armored of armoredList) {
    out.push(await openpgp.readKey({ armoredKey: armored }));
  }
  return out;
}

export async function encryptText(recipientPublicKeys: string[], text: string): Promise<string> {
  if (!privateKey) throw new Error('Keyring locked');
  const encryptionKeys = await keys(recipientPublicKeys);
  return openpgp.encrypt({
    message: await openpgp.createMessage({ text }),
    encryptionKeys,
    format: 'armored',
  }) as Promise<string>;
}

export async function decryptText(armored: string): Promise<string> {
  if (!privateKey) throw new Error('Keyring locked');
  const message = await openpgp.readMessage({ armoredMessage: armored });
  const { data } = await openpgp.decrypt({ message, decryptionKeys: privateKey, format: 'utf8' });
  return data as string;
}

export async function encryptBinary(recipientPublicKeys: string[], bytes: Uint8Array): Promise<Uint8Array> {
  if (!privateKey) throw new Error('Keyring locked');
  const encryptionKeys = await keys(recipientPublicKeys);
  return openpgp.encrypt({
    message: await openpgp.createMessage({ binary: bytes }),
    encryptionKeys,
    format: 'binary',
  }) as Promise<Uint8Array>;
}

export async function decryptBinary(bytes: Uint8Array): Promise<Uint8Array> {
  if (!privateKey) throw new Error('Keyring locked');
  const message = await openpgp.readMessage({ binaryMessage: bytes });
  const { data } = await openpgp.decrypt({ message, decryptionKeys: privateKey, format: 'binary' });
  return data as Uint8Array;
}

export async function fingerprint(): Promise<string> {
  if (!privateKey) return '';
  return privateKey.getKeyID().toHex();
}

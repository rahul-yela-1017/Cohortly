/** Socket.IO client singleton (authenticated handshake via the Vite proxy). */
import { io, Socket } from 'socket.io-client';

import { getToken } from './api';

let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (socket) return socket;
  const s = io({ path: '/socket.io', auth: { token: getToken() }, transports: ['websocket', 'polling'] });
  s.on('connect_error', (e) => console.warn('[cc-socket] connect_error', String(e && e.message)));
  (window as unknown as Record<string, unknown>).__ccSocket = s;
  socket = s;
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}

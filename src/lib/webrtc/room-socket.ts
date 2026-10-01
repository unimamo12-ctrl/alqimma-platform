'use client';

import { io, type Socket } from 'socket.io-client';

export function createRoomSocket(): Socket {
  // autoConnect is disabled on purpose: the connection is opened from the
  // effect that also registers the listeners, so a connect event can never
  // fire before someone is listening (React StrictMode remounts included).
  return io({ path: '/api/socketio', autoConnect: false });
}

export function closeRoomSocket(socket: Socket) {
  socket.removeAllListeners();
  socket.disconnect();
}

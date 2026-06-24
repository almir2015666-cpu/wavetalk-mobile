import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export const SERVER_URL = 'http://192.168.0.35:3001';

export type User = { id: string; name: string; channel: string; talking: boolean };

export interface SocketCallbacks {
  onJoined:        (users: User[], existingPeers: {id:string;name:string}[]) => void;
  onChannelUpdate: (users: User[], talkerId: string | null) => void;
  onPttStart:      (userId: string, name: string) => void;
  onPttStop:       (userId: string, name: string, duration: string) => void;
  onPttBlocked:    (by: string) => void;
  onAudioRecv:     (data: string, from: string, name: string) => void;
  onPing:          (ms: number) => void;
  onConnect:       () => void;
  onDisconnect:    () => void;
}

export function useSocket(callbacks: SocketCallbacks) {
  const socketRef = useRef<Socket | null>(null);
  const cbRef     = useRef(callbacks);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  cbRef.current   = callbacks;

  useEffect(() => {
    const s = io(SERVER_URL, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 1500,
      extraHeaders: {
        'bypass-tunnel-reminder': 'true',
      },
    });
    socketRef.current = s;

    s.on('connect', () => {
      cbRef.current.onConnect();
      pingTimer.current = setInterval(() => {
        if (s.connected) s.emit('ping:client', Date.now());
      }, 4000);
    });

    s.on('disconnect', () => {
      cbRef.current.onDisconnect();
      clearInterval(pingTimer.current!);
    });

    s.on('joined',         ({ users, existingPeers }: any) => cbRef.current.onJoined(users, existingPeers ?? []));
    s.on('channel:update', ({ users, talking }: any)       => cbRef.current.onChannelUpdate(users, talking));
    s.on('ptt:start',      ({ userId, name }: any)         => cbRef.current.onPttStart(userId, name));
    s.on('ptt:stop',       ({ userId, name, duration }: any) => cbRef.current.onPttStop(userId, name, duration));
    s.on('ptt:blocked',    ({ by }: any)                   => cbRef.current.onPttBlocked(by));
    s.on('audio:recv',     ({ data, from, name }: any)     => cbRef.current.onAudioRecv(data, from, name));
    s.on('pong:server',    (ts: number)                    => cbRef.current.onPing(Date.now() - ts));

    return () => {
      clearInterval(pingTimer.current!);
      s.disconnect();
    };
  }, []);

  const join      = useCallback((name: string, channel: string) => socketRef.current?.emit('join',      { name, channel }), []);
  const pttStart  = useCallback(() => socketRef.current?.emit('ptt:start'), []);
  const pttStop   = useCallback(() => socketRef.current?.emit('ptt:stop'),  []);
  const sendAudio = useCallback((data: string) => socketRef.current?.emit('audio:send', { data }), []);
  const getId     = useCallback(() => socketRef.current?.id ?? '', []);

  return { join, pttStart, pttStop, sendAudio, getId };
}

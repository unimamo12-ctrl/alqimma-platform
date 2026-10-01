'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Socket } from 'socket.io-client';
import { useApiData } from '@/lib/hooks/use-api';
import { useLiveMesh, type Snapshot } from '@/lib/webrtc/use-live-mesh';
import { closeRoomSocket, createRoomSocket } from '@/lib/webrtc/room-socket';

interface Participant {
  userId: string;
  name?: string;
  role: string;
  isMuted: boolean;
  isCameraOff: boolean;
  isHandRaised: boolean;
}

interface ChatMessage {
  userId: string;
  name?: string;
  content: string;
  createdAt: string;
}

export default function StudentLiveRoomPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;
  const router = useRouter();

  const [socket] = useState<Socket>(() => createRoomSocket());
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showChat, setShowChat] = useState(true);
  const [ended, setEnded] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(socket);

  const me = useApiData<{ user: { id: string } }>('/api/auth/me');
  const mesh = useLiveMesh({ socket, sessionId, myUserId: me.data?.user?.id ?? '' });
  const { snapshot, remotes, localStream, setError } = mesh;

  useEffect(() => {
    socketRef.current = socket;

    const handleConnect = () => {
      setIsConnected(true);
      socket.emit('join-session', { sessionId });
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('session-joined', ({ participants: list, chatMessages: chat }: {
      participants?: Participant[];
      chatMessages?: ChatMessage[];
    }) => {
      setParticipants(list ?? []);
      setChatMessages(chat ?? []);
    });

    socket.on('session-error', ({ message }: { message?: string }) => {
      setError(message || 'تعذّر الدخول إلى الحصة');
    });

    socket.on('session-ended', () => setEnded(true));

    socket.on('participant-joined', ({ participant }: { participant: Participant }) => {
      setParticipants((prev) =>
        prev.some((p) => p.userId === participant.userId) ? prev : [...prev, participant],
      );
    });

    socket.on('participant-left', ({ userId }: { userId: string }) => {
      setParticipants((prev) => prev.filter((p) => p.userId !== userId));
    });

    socket.on('participant-updated', ({ userId, ...updates }: Partial<Participant> & { userId: string }) => {
      setParticipants((prev) => prev.map((p) => (p.userId === userId ? { ...p, ...updates } : p)));
    });

    socket.on('chat-message', (message: ChatMessage) => {
      setChatMessages((prev) => [...prev, message]);
    });

    // the socket may already be connected by the time this effect runs
    if (socket.connected) handleConnect();
    else socket.connect();

    return () => closeRoomSocket(socket);
  }, [sessionId, setError, socket]);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  const teacher = remotes.find((remote) => remote.role === 'TEACHER');
  const others = remotes.filter((remote) => remote.role !== 'TEACHER');

  const toggleMic = () => {
    const next = !isMuted;
    setIsMuted(next);
    mesh.toggleMute(next);
  };

  const toggleHand = () => {
    const next = !isHandRaised;
    setIsHandRaised(next);
    socketRef.current?.emit('raise-hand', { sessionId, isHandRaised: next });
  };

  const sendMessage = (event: React.FormEvent) => {
    event.preventDefault();
    if (!newMessage.trim() || !socketRef.current) return;
    socketRef.current.emit('chat-message', { sessionId, content: newMessage.trim() });
    setNewMessage('');
  };

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-gray-400 dark:text-slate-500 text-sm">{isConnected ? 'متصل' : 'غير متصل'}</span>
          {snapshot && <span className="text-xs text-yellow-300">لقطة شاشة معلّقة</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowChat(!showChat)}
            className={`px-3 py-2 rounded-lg text-sm font-medium${
              showChat ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 dark:text-slate-600'
            }`}
          >
            الدردشة
          </button>
          <button
            type="button"
            onClick={() => router.push('/student/live')}
            className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 dark:text-slate-600 text-sm font-medium"
          >
            خروج
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 p-4 overflow-y-auto">
          {ended ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="text-5xl mb-3">🔚</div>
                <p className="text-white mb-4">انتهت الحصة</p>
                <button
                  type="button"
                  onClick={() => router.push('/student/live')}
                  className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm"
                >
                  العودة
                </button>
              </div>
            </div>
          ) : teacher ? (
            <div className="relative bg-gray-800 rounded-2xl overflow-hidden aspect-video">
              <RemoteTile stream={teacher.stream} name={teacher.name || 'الأستاذ'} />
              {snapshot && <SnapshotOverlay snapshot={snapshot} />}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-gray-400 dark:text-slate-500 text-sm">
                في انتظار بث الأستاذ... تأكد أن الحصة بدأت.
              </p>
            </div>
          )}

          {others.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-3 mt-3">
              {others.map((remote) => (
                <RemoteTile key={remote.userId} stream={remote.stream} name={remote.name || 'طالب'} />
              ))}
            </div>
          )}
        </div>

        {showChat && (
          <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-white font-semibold">الدردشة</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.length === 0 ? (
                <p className="text-gray-500 dark:text-slate-400 text-center text-sm">لا توجد رسائل</p>
              ) : (
                chatMessages.map((message, index) => (
                  <div key={index} className="bg-gray-700 rounded-lg p-3">
                    <p className="text-white text-sm">{message.content}</p>
                    <p className="text-gray-400 dark:text-slate-500 text-xs mt-1">
                      {message.name ?? 'مشارك'} · {new Date(message.createdAt).toLocaleTimeString('ar-DZ')}
                    </p>
                  </div>
                ))
              )}
            </div>
            <form onSubmit={sendMessage} className="p-4 border-t border-gray-700 flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(event) => setNewMessage(event.target.value)}
                placeholder="اكتب رسالة..."
                className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg text-sm focus:outline-none"
              />
              <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">
                إرسال
              </button>
            </form>
          </div>
        )}
      </div>

      {mesh.error && (
        <div className="mx-4 mb-2 p-3 bg-red-900/90 border border-red-700 text-red-100 rounded-lg text-sm flex items-start gap-3">
          <span>⚠️</span>
          <p className="flex-1">{mesh.error}</p>
          <button type="button" onClick={() => mesh.setError('')} className="text-red-300 hover:text-white" aria-label="إغلاق">
            ✕
          </button>
        </div>
      )}

      <footer className="bg-gray-800 border-t border-gray-700 px-4 py-3">
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => void (mesh.cameraStatus === 'ready' ? mesh.stopCamera() : mesh.startCamera())}
            className={`p-3 rounded-full ${
              mesh.cameraStatus === 'ready' ? 'bg-gray-700 text-white' : 'bg-red-500 text-white'
            }`}
            title="الكاميرا"
          >
            {mesh.cameraStatus === 'ready' ? '📷' : '📹'}
          </button>
          <button
            type="button"
            onClick={toggleMic}
            disabled={mesh.cameraStatus !== 'ready'}
            className={`p-3 rounded-full disabled:opacity-40 ${
              isMuted ? 'bg-red-500 text-white' : 'bg-gray-700 text-white'
            }`}
            title="الميكروفون"
          >
            {isMuted ? '🔇' : '🎤'}
          </button>
          <button
            type="button"
            onClick={toggleHand}
            className={`p-3 rounded-full ${isHandRaised ? 'bg-yellow-500 text-white' : 'bg-gray-700 text-white'}`}
            title="رفع اليد"
          >
            ✋
          </button>
          <span className="text-gray-400 dark:text-slate-500 text-xs">الحاضرون: {participants.filter((p) => p.role === 'STUDENT').length + 1}</span>
        </div>
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => void mesh.startCamera()}
            className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 dark:text-slate-600 text-xs"
          >
            تشغيل الكاميرا للمشاركة
          </button>
        </div>
        <div className="mt-2 flex justify-center">
          <video ref={localVideoRef} autoPlay muted playsInline className="hidden" />
        </div>
      </footer>
    </div>
  );
}

function RemoteTile({ stream, name }: { stream: MediaStream; name: string }) {
  const ref = useCallback((element: HTMLVideoElement | null) => {
    if (element && element.srcObject !== stream) {
      element.srcObject = stream;
      void element.play().catch(() => undefined);
    }
  }, [stream]);

  return (
    <div className="w-full h-full relative">
      <video ref={ref} autoPlay playsInline className="w-full h-full object-contain bg-black" />
      <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 text-white rounded text-xs">{name}</div>
    </div>
  );
}

function SnapshotOverlay({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="absolute inset-0 bg-black/90 flex items-center justify-center p-3 pointer-events-none">
      <div className="text-center">
        <p className="text-white text-xs mb-2">{snapshot.name}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={snapshot.url} alt={snapshot.name} className="max-h-[70vh] max-w-full object-contain rounded" />
      </div>
    </div>
  );
}

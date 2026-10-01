'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Socket } from 'socket.io-client';
import { useApiData, useSubmit } from '@/lib/hooks/use-api';
import { TURN_CONFIGURED, useLiveMesh, type Snapshot } from '@/lib/webrtc/use-live-mesh';
import { closeRoomSocket, createRoomSocket } from '@/lib/webrtc/room-socket';
import { useRecorder } from '@/lib/webrtc/use-recorder';
import { saveRecording } from '@/lib/webrtc/save-recording';

interface Participant {
  socketId: string;
  userId: string;
  name?: string;
  role: string;
  isMuted: boolean;
  isCameraOff: boolean;
  isHandRaised: boolean;
  isSharingScreen?: boolean;
}

interface ChatMessage {
  userId: string;
  name?: string;
  content: string;
  createdAt: string;
}

export default function LiveClassroomPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;
  const router = useRouter();

  const [socket] = useState<Socket>(() => createRoomSocket());
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showChat, setShowChat] = useState(true);
  const [showParticipants, setShowParticipants] = useState(false);
  const [startedLocally, setStartedLocally] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(socket);

  const sessionInfo = useApiData<{
    session: { status: string; title: string; courseId: string; course?: { title: string } };
  }>(`/api/live/${sessionId}`);
  const me = useApiData<{ user: { id: string } }>('/api/auth/me');
  const { submit: updateStatus, error: statusError } = useSubmit<
    { status: string },
    { session: { status: string } }
  >(`/api/live/${sessionId}`, 'PATCH');

  const mesh = useLiveMesh({ socket, sessionId, myUserId: me.data?.user?.id ?? '' });
  const { snapshot, clearSnapshot, showSnapshot, isSharing, localStream, setError } = mesh;

  const recorder = useRecorder({
    getOutgoingStream: mesh.getOutgoingStream,
    getCameraStream: mesh.getCameraStream,
  });

  const [isEnding, setIsEnding] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const isEndingRef = useRef(false);

  useEffect(() => {
    socketRef.current = socket;

    const handleConnect = () => {
      setIsConnected(true);
      socket.emit('join-session', { sessionId });
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('session-joined', ({ participants: list, chatMessages: chat, isRecording: rec }: {
      participants?: Participant[];
      chatMessages?: ChatMessage[];
      isRecording?: boolean;
    }) => {
      setParticipants(list ?? []);
      setChatMessages(chat ?? []);
      setIsRecording(Boolean(rec));
    });

    socket.on('session-error', ({ message }: { message?: string }) => {
      setError(message || 'تعذّر الدخول إلى الحصة');
    });

    socket.on('session-started', () => setStartedLocally(true));

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

    socket.on('chat-cleared', () => setChatMessages([]));
    socket.on('recording-started', () => setIsRecording(true));
    socket.on('recording-stopped', () => setIsRecording(false));

    // the recording is already saved by endSession, so land on the videos page
    socket.on('session-ended', () => {
      if (!isEndingRef.current) router.push('/teacher/videos');
    });

    // the socket may already be connected by the time this effect runs
    if (socket.connected) handleConnect();
    else socket.connect();

    return () => closeRoomSocket(socket);
  }, [router, sessionId, setError, socket]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  const isLive = startedLocally || sessionInfo.data?.session?.status === 'LIVE';
  const isBroadcasting = isLive || isSharing;

  const toggleMic = () => {
    const next = !isMuted;
    setIsMuted(next);
    mesh.toggleMute(next);
  };

  const toggleCamera = () => {
    if (mesh.cameraStatus === 'ready') mesh.stopCamera();
    else void mesh.startCamera();
  };

  const toggleScreenShare = () => {
    if (isSharing) mesh.stopScreenShare();
    else void mesh.startScreenShare();
  };

  const toggleHandRaise = () => {
    const next = !isHandRaised;
    setIsHandRaised(next);
    socketRef.current?.emit('raise-hand', { sessionId, isHandRaised: next });
  };

  const captureSnapshot = async () => {
    setCapturing(true);
    await showSnapshot(localVideoRef.current, isSharing ? 'لقطة الشاشة' : 'لقطة الكاميرا');
    setCapturing(false);
  };

  const sendMessage = (event: React.FormEvent) => {
    event.preventDefault();
    if (!newMessage.trim() || !socketRef.current) return;
    socketRef.current.emit('chat-message', { sessionId, content: newMessage.trim() });
    setNewMessage('');
  };

  const startBroadcast = async () => {
    setIsStarting(true);
    const result = await updateStatus({ status: 'LIVE' });
    if (result) {
      socketRef.current?.emit('start-session', { sessionId });
      setStartedLocally(true);
    }
    setIsStarting(false);
  };

  const persistRecording = useCallback(async () => {
    const result = await recorder.stop();
    if (!result) return false;

    const sessionData = sessionInfo.data?.session;
    const courseId = sessionData?.courseId;
    if (!courseId) {
      setSaveNotice('تعذّر حفظ التسجيل: بيانات الدورة غير متاحة.');
      return false;
    }

    try {
      await saveRecording({
        recording: result,
        sessionId,
        courseId,
        title: `تسجيل: ${sessionData?.title ?? 'البث المباشر'}`,
description: 'تسجيل تلقائي للبث المباشر.',
          // Left as a draft on purpose: the teacher watches the recording back
          // and publishes it with one click. `publish: true` here is what makes it
          // appear for students the moment it is saved, which puts a bad take in
          // front of the class before anyone has checked it.
        });
      socketRef.current?.emit('stop-recording', { sessionId });
      setIsRecording(false);
      setSaveNotice('تم حفظ التسجيل كمسودة — انشره من صفحة الفيديوهات ليراه الطلاب.');
      return true;
    } catch (err) {
      setSaveNotice(err instanceof Error ? err.message : 'تعذّر حفظ التسجيل');
      return false;
    }
  }, [recorder, sessionId, sessionInfo.data]);

  const toggleRecording = useCallback(() => {
    if (recorder.isRecording) {
      void persistRecording();
      return;
    }
    if (recorder.start()) {
      setIsRecording(true);
      socketRef.current?.emit('start-recording', { sessionId });
    } else {
      setError(recorder.error);
    }
  }, [persistRecording, recorder, sessionId, setError]);

  const endSession = useCallback(async () => {
    if (!confirm('هل أنت متأكد من إنهاء الحصة للجميع؟')) return;

    isEndingRef.current = true;
    setIsEnding(true);
    // save first so the draft exists before the teacher lands on /teacher/videos
    await persistRecording();

    socketRef.current?.emit('end-session', { sessionId });
    await updateStatus({ status: 'ENDED' });
    router.push('/teacher/videos');
  }, [persistRecording, router, sessionId, updateStatus]);

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-white font-semibold">البث المباشر</h1>
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-gray-400 dark:text-slate-500 text-sm">{isConnected ? 'متصل' : 'غير متصل'}</span>
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium${
              isBroadcasting ? 'bg-red-500/20 text-red-300' : 'bg-gray-700 text-gray-300 dark:text-slate-600'
            }`}
          >
            {isSharing ? 'مشاركة شاشة' : isBroadcasting ? 'البث جارٍ' : 'لم يبدأ البث'}
          </span>
          {!TURN_CONFIGURED && (
            // Without TURN, students behind a symmetric NAT or a strict
            // firewall never connect at all. Surfacing it here beats letting
            // them conclude the teacher's connection is the problem.
            <span
              className="px-2 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300"
              title="لا يوجد خادم TURN مضبوط. لن يتصل الطلاب إلا على الشبكات المفتوحة. اضبط NEXT_PUBLIC_TURN_URL في .env ثم أعد تشغيل الخادم."
            >
              TURN غير مضبوط
            </span>
          )}
          {isRecording && (
            <span className="flex items-center gap-2 px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              يتم التسجيل
              <span dir="ltr">{formatElapsed(recorder.elapsedSeconds)}</span>
            </span>
          )}
          {recorder.status === 'finalizing' && (
            <span className="px-3 py-1 bg-gray-700 text-gray-300 dark:text-slate-600 rounded-full text-sm">
              جارٍ حفظ التسجيل...
            </span>
          )}
          {saveNotice && (
            <span className="px-3 py-1 bg-gray-700 text-gray-200 rounded-full text-sm">{saveNotice}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isLive && (
            <button
              type="button"
              onClick={() => void startBroadcast()}
              disabled={isStarting}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium"
            >
              {isStarting ? 'جارٍ البدء...' : 'بدء البث'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowChat(!showChat)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors${
              showChat ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 dark:text-slate-600'
            }`}
          >
            الدردشة
          </button>
          <button
            type="button"
            onClick={() => setShowParticipants(!showParticipants)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors${
              showParticipants ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 dark:text-slate-600'
            }`}
          >
            المشاركون ({participants.filter((p) => p.role === 'STUDENT').length})
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="grid gap-3">
            <div className="relative bg-gray-800 rounded-2xl overflow-hidden aspect-video">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-contain bg-black"
              />

              {mesh.cameraStatus !== 'ready' && !isSharing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-800 text-center px-6">
                  <div className="text-5xl">📷</div>
                  <p className="text-gray-400 dark:text-slate-500 text-sm">الكاميرا مغلقة</p>
                  <button
                    type="button"
                    onClick={() => void mesh.startCamera()}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
                  >
                    تشغيل الكاميرا
                  </button>
                </div>
              )}

              {snapshot && <SnapshotOverlay snapshot={snapshot} onClose={mesh.cameraStatus === 'ready' || isSharing ? clearSnapshot : undefined} />}

              <div className="absolute bottom-3 right-3 px-3 py-1 bg-black/60 text-white rounded-lg text-xs">
                {isSharing ? 'أنت (مشاركة شاشة)' : 'أنت (الأستاذ)'}
              </div>
            </div>

            {mesh.remotes.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {mesh.remotes.map((remote) => (
                  <RemoteTile
                    key={remote.userId}
                    stream={remote.stream}
                    name={remote.name || 'مشارك'}
                    muted={isMuted && remote.role !== 'TEACHER'}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {showChat && (
          <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-white font-semibold">الدردشة</h3>
              <button type="button" onClick={() => socketRef.current?.emit('clear-chat', { sessionId })} className="text-gray-400 dark:text-slate-500 hover:text-white text-sm">
                مسح
              </button>
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

        {showParticipants && (
          <div className="w-72 bg-gray-800 border-r border-gray-700 flex flex-col">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-white font-semibold">الطلاب ({participants.filter((p) => p.role === 'STUDENT').length})</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {participants.filter((p) => p.role === 'STUDENT').length === 0 ? (
                <p className="text-gray-500 dark:text-slate-400 text-center text-sm">لا يوجد طلاب بعد</p>
              ) : (
                participants
                  .filter((p) => p.role === 'STUDENT')
                  .map((participant) => (
                    <div key={participant.userId} className="bg-gray-700 rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <p className="text-white text-sm">{participant.name ?? 'طالب'}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
                          {participant.isMuted && <span>🔇 مكتوم</span>}
                          {participant.isCameraOff && <span>📹 كاميرا مغلقة</span>}
                          {participant.isHandRaised && <span>✋ رفع يده</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => socketRef.current?.emit('mute-participant', { sessionId, targetUserId: participant.userId })}
                          className="p-2 text-gray-400 dark:text-slate-500 hover:text-white rounded-lg hover:bg-gray-600"
                          title="كتم الميكروفون"
                        >
                          🔇
                        </button>
                        <button
                          type="button"
                          onClick={() => socketRef.current?.emit('remove-participant', { sessionId, targetUserId: participant.userId })}
                          className="p-2 text-gray-400 dark:text-slate-500 hover:text-red-400 rounded-lg hover:bg-gray-600"
                          title="إزالة"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}
      </div>

      {(mesh.error || statusError) && (
        <div className="mx-4 mb-2 p-3 bg-red-900/90 border border-red-700 text-red-100 rounded-lg text-sm flex items-start gap-3">
          <span>⚠️</span>
          <p className="flex-1 leading-relaxed">{mesh.error || statusError}</p>
          <button type="button" onClick={() => mesh.setError('')} className="text-red-300 hover:text-white" aria-label="إغلاق">
            ✕
          </button>
        </div>
      )}

      <footer className="bg-gray-800 border-t border-gray-700 px-4 py-3">
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={toggleMic}
            disabled={mesh.cameraStatus !== 'ready' && !isSharing}
            className={`p-3 rounded-full transition-colors disabled:opacity-40 ${
              isMuted ? 'bg-red-500 text-white' : 'bg-gray-700 text-white'
            }`}
            title="الميكروفون"
          >
            {isMuted ? '🔇' : '🎤'}
          </button>
          <button
            type="button"
            onClick={toggleCamera}
            className={`p-3 rounded-full transition-colors ${
              mesh.cameraStatus === 'ready' ? 'bg-gray-700 text-white' : 'bg-red-500 text-white'
            }`}
            title="الكاميرا"
          >
            {mesh.cameraStatus === 'ready' ? '📷' : '📹'}
          </button>
          <button
            type="button"
            onClick={toggleScreenShare}
            className={`px-4 py-3 rounded-full font-medium transition-colors ${
              isSharing ? 'bg-green-600 text-white' : 'bg-gray-700 text-white'
            }`}
            title="مشاركة أي شاشة"
          >
            {isSharing ? '🖥️ إيقاف المشاركة' : '🖥️ مشاركة الشاشة'}
          </button>
          <button
            type="button"
            onClick={() => void captureSnapshot()}
            disabled={capturing || (mesh.cameraStatus !== 'ready' && !isSharing)}
            className="p-3 rounded-full bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-40"
            title="إرسال لقطة شاشة للطلاب"
          >
            {capturing ? '⏳' : '📸'}
          </button>
          <button
            type="button"
            onClick={toggleHandRaise}
            className={`p-3 rounded-full transition-colors ${
              isHandRaised ? 'bg-yellow-500 text-white' : 'bg-gray-700 text-white'
            }`}
            title="رفع اليد"
          >
            ✋
          </button>
          <button
            type="button"
            onClick={toggleRecording}
            disabled={recorder.status === 'finalizing'}
            className={`p-3 rounded-full transition-colors disabled:opacity-50 ${
              isRecording ? 'bg-red-500 text-white' : 'bg-gray-700 text-white'
            }`}
            title={isRecording ? 'إيقاف التسجيل وحفظه' : 'بدء التسجيل'}
          >
            ⏺️
          </button>
          <button
            type="button"
            onClick={() => void endSession()}
            disabled={isEnding}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-full font-medium transition-colors disabled:opacity-50"
          >
            {isEnding ? 'جارٍ الحفظ والانتقال...' : 'إنهاء الحصة'}
          </button>
        </div>
      </footer>
    </div>
  );
}

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function RemoteTile({ stream, name, muted }: { stream: MediaStream; name: string; muted: boolean }) {
  const ref = useCallback((element: HTMLVideoElement | null) => {
    if (element && element.srcObject !== stream) {
      element.srcObject = stream;
      void element.play().catch(() => undefined);
    }
  }, [stream]);

  return (
    <div className="relative bg-gray-800 rounded-xl overflow-hidden aspect-video">
      <video ref={ref} autoPlay playsInline muted={muted} className="w-full h-full object-contain bg-black" />
      <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 text-white rounded text-xs">{name}</div>
    </div>
  );
}

function SnapshotOverlay({ snapshot, onClose }: { snapshot: Snapshot; onClose?: () => void }) {
  return (
    <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-3">
      <p className="text-white text-xs mb-2">{snapshot.name}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={snapshot.url} alt={snapshot.name} className="max-h-full max-w-full object-contain rounded" />
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="mt-3 px-4 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm"
        >
          إغلاق اللقطة
        </button>
      )}
    </div>
  );
}

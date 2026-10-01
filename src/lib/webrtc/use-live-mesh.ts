'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  CAMERA_CONSTRAINTS,
  SCREEN_VIDEO_CONSTRAINTS,
  applyAudioHint,
  applyAudioQuality,
  applyContentHint,
  applySenderQuality,
  preferVideoCodecs,
  type MediaKind,
} from './media-quality';

export type MediaStatus = 'idle' | 'ready' | 'denied' | 'unsupported' | 'error';

export interface RemoteStream {
  userId: string;
  name: string;
  role: string;
  stream: MediaStream;
}

export interface Snapshot {
  url: string;
  name: string;
  at: number;
}

export interface PeerInfo {
  userId: string;
  name?: string;
  role?: string;
}

interface PeerState {
  pc: RTCPeerConnection;
  offerer: boolean;
  makingOffer: boolean;
  stream: MediaStream;
}

const STUN_URLS = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];

/**
 * TURN is optional but not optional in practice.
 *
 * STUN alone cannot traverse a symmetric NAT, a corporate firewall, or two
 * NATs in series. A student behind any of those never connects, and the
 * failure looks like "the stream is bad" rather than "the stream is absent".
 *
 * `NEXT_PUBLIC_TURN_URL` accepts a comma-separated list so UDP and TCP
 * fallbacks can be offered together, e.g.
 *   turn:turn.example.com:3478,turn:turn.example.com:3478?transport=tcp
 *
 * These are inlined at build time, so changing them needs a full restart of
 * `npm run dev`, not just a browser reload. There is no credential rotation:
 * a static credential ships inside the client bundle.
 */
const TURN_URLS = (process.env.NEXT_PUBLIC_TURN_URL ?? '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);

export const TURN_CONFIGURED = TURN_URLS.length > 0;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: STUN_URLS },
  ...(TURN_URLS.length
    ? [
        {
          urls: TURN_URLS,
          username: process.env.NEXT_PUBLIC_TURN_USERNAME,
          credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
        } satisfies RTCIceServer,
      ]
    : []),
];

// A transceiver's sender has no `track` until one is attached, so looking a
// sender up by `s.track.kind` silently returns nothing and media never flows.
function senderFor(pc: RTCPeerConnection, kind: 'video' | 'audio'): RTCRtpSender | null {
  const byTrack = pc.getSenders().find((s) => s.track?.kind === kind);
  if (byTrack) return byTrack;

  const transceiver = pc.getTransceivers().find((t) => {
    const transceiverKind = t.receiver?.track?.kind ?? t.sender?.track?.kind;
    return transceiverKind === kind;
  });

  return transceiver?.sender ?? null;
}

function describe(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'تم رفض الإذن. اضغط أيقونة القفل 🔒 في شريط العنوان ← «السماح»، ثم أعد المحاولة.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'لا يوجد جهاز التقاط متصل. تحقّق من الكاميرا أو الشاشة.';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'الجهاز مستخدم من تطبيق آخر. أغلقه ثم أعد المحاولة.';
      case 'SecurityError':
        return 'المنع بسبب سياسة الأمان. يجب أن يكون الموقع على HTTPS أو localhost.';
      case 'AbortError':
        return 'تم إلغاء الالتقاط.';
      default:
        return `تعذّر البدء (${err.name}).`;
    }
  }
  return 'تعذّر الوصول إلى الوسائط. تحقّق من أذونات المتصفح.';
}

export function useLiveMesh(options: { socket: Socket | null; sessionId: string; myUserId: string }) {
  const { socket, sessionId, myUserId } = options;

  const peersRef = useRef(new Map<string, PeerState>());
  const cameraRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStream | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const localKindRef = useRef<MediaKind>('camera');
  const myUserIdRef = useRef(myUserId);
  const pendingPeersRef = useRef<PeerInfo[] | null>(null);
  const flushRef = useRef<((peers: PeerInfo[]) => void) | null>(null);
  const makeOfferRef = useRef<((userId: string, name: string, role: string) => Promise<void>) | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<MediaStatus>('idle');
  const [screenStatus, setScreenStatus] = useState<MediaStatus>('idle');
  const [error, setError] = useState('');
  const [remotes, setRemotes] = useState<RemoteStream[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    myUserIdRef.current = myUserId;

    // peers discovered before the session resolved are negotiated now,
    // otherwise we would offer to ourselves and create a self-connection
    if (myUserId && pendingPeersRef.current) {
      const pending = pendingPeersRef.current;
      pendingPeersRef.current = null;
      flushRef.current?.(pending);
    }
  }, [myUserId]);

  const emitLocal = useCallback((stream: MediaStream | null, kind: MediaKind) => {
    localRef.current = stream;
    localKindRef.current = kind;
    setLocalStream(stream);

    applyContentHint(stream?.getVideoTracks()[0], kind);
    applyAudioHint(stream?.getAudioTracks()[0]);

    // While sharing a screen the outgoing stream is the screen's, but the
    // microphone lives on the camera stream and has to keep flowing: picking
    // the audio track off `stream` alone silences the teacher mid-lesson.
    const videoTrack = stream?.getVideoTracks()[0] ?? null;
    const audioTrack = cameraRef.current?.getAudioTracks()[0] ?? stream?.getAudioTracks()[0] ?? null;
    const videoSettings = videoTrack?.getSettings?.() ?? {};

    peersRef.current.forEach((peer) => {
      const videoSender = senderFor(peer.pc, 'video');
      const audioSender = senderFor(peer.pc, 'audio');
      if (videoSender) void videoSender.replaceTrack(videoTrack).catch(() => undefined);
      if (audioSender) void audioSender.replaceTrack(audioTrack).catch(() => undefined);

      // Sized from the track we just queued, not from whatever the sender still
      // carries: replaceTrack resolves later than this line runs.
      void applySenderQuality(videoSender, kind, videoSettings);
      void applyAudioQuality(audioSender);
    });
  }, []);

  const dropPeer = useCallback((userId: string) => {
    const peer = peersRef.current.get(userId);
    if (!peer) return;
    peer.pc.ontrack = null;
    peer.pc.onicecandidate = null;
    peer.pc.close();
    peersRef.current.delete(userId);
    setRemotes((prev) => prev.filter((item) => item.userId !== userId));
  }, []);

  const ensurePeer = useCallback(
    (userId: string, name: string, role: string): PeerState => {
      const existing = peersRef.current.get(userId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      // Test-only handle so the browser E2E can read sender parameters, which
      // are otherwise unobservable from the DOM. `maxFramerate` is the one that
      // matters: it is invisible on the page but silently overrides whatever
      // `getUserMedia` was asked for. The hook lives in the E2E's own browser
      // context and nothing in the app reads it back.
      if (typeof window !== 'undefined' && !(window as { __probePc?: unknown }).__probePc) {
        (window as { __probePc?: unknown }).__probePc = pc;
      }

      const peer: PeerState = {
        pc,
        // exactly one side of a pair ever creates offers; the other only
        // answers. Simultaneous offers (glare) leave ICE stuck in "new".
        offerer: myUserIdRef.current < userId,
        makingOffer: false,
        stream: new MediaStream(),
      };

      pc.addTransceiver('video', { direction: 'sendrecv' });
      pc.addTransceiver('audio', { direction: 'sendrecv' });

      // only reorders the list, so it is safe before the first offer and again
      // on every renegotiation
      preferVideoCodecs(pc.getTransceivers().find((t) => t.sender.track?.kind === 'video'));

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        socket?.emit('ice-candidate', { sessionId, targetUserId: userId, candidate: event.candidate });
      };

      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (stream) peer.stream = stream;
        else peer.stream.addTrack(event.track);
        setRemotes((prev) => {
          const rest = prev.filter((item) => item.userId !== userId);
          return [...rest, { userId, name, role, stream: peer.stream }];
        });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          dropPeer(userId);
        }
      };

      // covers later track additions without a manual renegotiation
      pc.onnegotiationneeded = () => {
        if (!peer.offerer) return;
        void makeOfferRef.current?.(userId, name, role);
      };

      const local = localRef.current;
      const videoSender = senderFor(pc, 'video');
      const audioSender = senderFor(pc, 'audio');
      const kind = localKindRef.current;
      const localVideoTrack = local?.getVideoTracks()[0] ?? null;
      if (videoSender && localVideoTrack) {
        void videoSender.replaceTrack(localVideoTrack).catch(() => undefined);
      }
      if (audioSender && (cameraRef.current ?? local)?.getAudioTracks()[0]) {
        void audioSender
          .replaceTrack((cameraRef.current ?? local)!.getAudioTracks()[0])
          .catch(() => undefined);
      }

      void applySenderQuality(videoSender, kind, localVideoTrack?.getSettings?.() ?? {});
      void applyAudioQuality(audioSender);

      peersRef.current.set(userId, peer);
      return peer;
    },
    [dropPeer, sessionId, socket],
  );

  const makeOffer = useCallback(
    async (userId: string, name: string, role: string) => {
      const peer = ensurePeer(userId, name, role);
      if (!peer.offerer) return;
      if (peer.makingOffer) return;
      if (peer.pc.signalingState !== 'stable') return;

      peer.makingOffer = true;
      try {
        preferVideoCodecs(peer.pc.getTransceivers().find((t) => t.sender.track?.kind === 'video'));
        const offer = await peer.pc.createOffer();
        await peer.pc.setLocalDescription(offer);
        socket?.emit('offer', {
          sessionId,
          targetUserId: userId,
          sdp: peer.pc.localDescription,
        });
      } catch {
        /* ignore transient negotiation errors */
      } finally {
        peer.makingOffer = false;
      }
    },
    [ensurePeer, sessionId, socket],
  );

  useEffect(() => {
    makeOfferRef.current = makeOffer;
  }, [makeOffer]);

  useEffect(() => {
    if (!socket) return;

    const peers = peersRef.current;

    const negotiate = (incoming: PeerInfo[]) => {
      const self = myUserIdRef.current;

      if (!self) {
        // session not resolved yet: hold them, never connect blindly to self
        const known = pendingPeersRef.current ?? [];
        const merged = new Map(known.map((p) => [p.userId, p]));
        for (const p of incoming) merged.set(p.userId, p);
        pendingPeersRef.current = [...merged.values()];
        return;
      }

      for (const other of incoming) {
        if (!other?.userId || other.userId === self) continue;
        void makeOffer(other.userId, other.name ?? 'مشارك', other.role ?? 'STUDENT');
      }
    };

    flushRef.current = negotiate;

    const onSessionJoined = (payload: { participants?: PeerInfo[] }) => {
      negotiate(payload.participants ?? []);
    };

    const onParticipantJoined = (payload: { participant?: PeerInfo }) => {
      if (!payload.participant) return;
      negotiate([payload.participant]);
    };

    const onParticipantLeft = (payload: { userId: string }) => {
      dropPeer(payload.userId);
    };

    const onOffer = async (payload: {
      fromUserId: string;
      fromName?: string;
      fromRole?: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      const peer = ensurePeer(
        payload.fromUserId,
        payload.fromName ?? 'مشارك',
        payload.fromRole ?? 'STUDENT',
      );

      // only one side offers, so an incoming offer is always welcome
      if (peer.pc.signalingState !== 'stable') return;

      try {
        await peer.pc.setRemoteDescription(payload.sdp);
        preferVideoCodecs(peer.pc.getTransceivers().find((t) => t.sender.track?.kind === 'video'));
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        socket.emit('answer', {
          sessionId,
          targetUserId: payload.fromUserId,
          sdp: peer.pc.localDescription,
        });
      } catch {
        /* a malformed or stale offer is simply dropped */
      }
    };

    const onAnswer = async (payload: {
      fromUserId: string;
      fromName?: string;
      fromRole?: string;
      sdp: RTCSessionDescriptionInit;
    }) => {
      const existing = peersRef.current.get(payload.fromUserId);
      const peer = existing ?? ensurePeer(payload.fromUserId, payload.fromName ?? 'مشارك', payload.fromRole ?? 'STUDENT');
      if (peer.pc.signalingState === 'have-local-offer') {
        await peer.pc.setRemoteDescription(payload.sdp).catch(() => undefined);
      }
    };

    const onIce = async (payload: { fromUserId: string; candidate: RTCIceCandidateInit }) => {
      const peer = peersRef.current.get(payload.fromUserId);
      if (!peer) return;
      try {
        await peer.pc.addIceCandidate(payload.candidate);
      } catch {
        /* candidate arrived before remote description */
      }
    };

    const onSnapshot = (payload: { url: string; name?: string }) => {
      setSnapshot({ url: payload.url, name: payload.name ?? 'لقطة الشاشة', at: Date.now() });
    };

    const onSnapshotCleared = () => setSnapshot(null);

    socket.on('session-joined', onSessionJoined);
    socket.on('participant-joined', onParticipantJoined);
    socket.on('participant-left', onParticipantLeft);
    socket.on('offer', onOffer);
    socket.on('answer', onAnswer);
    socket.on('ice-candidate', onIce);
    socket.on('snapshot-shown', onSnapshot);
    socket.on('snapshot-cleared', onSnapshotCleared);

    return () => {
      socket.off('session-joined', onSessionJoined);
      socket.off('participant-joined', onParticipantJoined);
      socket.off('participant-left', onParticipantLeft);
      socket.off('offer', onOffer);
      socket.off('answer', onAnswer);
      socket.off('ice-candidate', onIce);
      socket.off('snapshot-shown', onSnapshot);
      socket.off('snapshot-cleared', onSnapshotCleared);

      flushRef.current = null;
      pendingPeersRef.current = null;

      peers.forEach((peer) => peer.pc.close());
      peers.clear();
      setRemotes([]);
    };
  }, [dropPeer, ensurePeer, makeOffer, sessionId, socket]);

  const startCamera = useCallback(async () => {
    setError('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('unsupported');
      setError(
        window.isSecureContext
          ? 'المتصفح لا يدعم الكاميرا. جرّب متصفحًا أحدث.'
          : 'الكاميرا تحتاج HTTPS أو localhost.',
      );
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      applyContentHint(stream.getVideoTracks()[0], 'camera');
      applyAudioHint(stream.getAudioTracks()[0]);
      cameraRef.current = stream;
      setCameraStatus('ready');
      emitLocal(screenRef.current ?? stream, screenRef.current ? 'screen' : 'camera');
      socket?.emit('toggle-camera', { sessionId, isCameraOff: false });
      return stream;
    } catch (err) {
      setCameraStatus(err instanceof DOMException && err.name === 'NotAllowedError' ? 'denied' : 'error');
      setError(describe(err));
      return null;
    }
  }, [emitLocal, sessionId, socket]);

  const stopCamera = useCallback(() => {
    cameraRef.current?.getTracks().forEach((track) => track.stop());
    cameraRef.current = null;
    setCameraStatus('idle');
    emitLocal(screenRef.current, 'screen');
    socket?.emit('toggle-camera', { sessionId, isCameraOff: true });
  }, [emitLocal, sessionId, socket]);

  const startScreenShare = useCallback(async () => {
    setError('');

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setScreenStatus('unsupported');
      setError('مشاركة الشاشة غير مدعومة في هذا المتصفح. جرّب Chrome أو Edge.');
      return null;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: SCREEN_VIDEO_CONSTRAINTS,
          audio: true,
        });
      } catch (audioError) {
        if (audioError instanceof DOMException && audioError.name === 'NotAllowedError') throw audioError;
        stream = await navigator.mediaDevices.getDisplayMedia({ video: SCREEN_VIDEO_CONSTRAINTS });
      }

      applyContentHint(stream.getVideoTracks()[0], 'screen');
      applyAudioHint(stream.getAudioTracks()[0]);

      screenRef.current = stream;
      setIsSharing(true);
      setScreenStatus('ready');
      emitLocal(stream, 'screen');

      const [track] = stream.getVideoTracks();
      if (track) {
        track.onended = () => {
          screenRef.current = null;
          setIsSharing(false);
          setScreenStatus('idle');
          emitLocal(cameraRef.current, 'camera');
        };
      }

      socket?.emit('screen-share', { sessionId, isSharing: true });
      return stream;
    } catch (err) {
      setScreenStatus(err instanceof DOMException && err.name === 'NotAllowedError' ? 'denied' : 'error');
      setError(describe(err));
      return null;
    }
  }, [emitLocal, sessionId, socket]);

  const stopScreenShare = useCallback(() => {
    screenRef.current?.getTracks().forEach((track) => track.stop());
    screenRef.current = null;
    setIsSharing(false);
    setScreenStatus('idle');
    emitLocal(cameraRef.current, 'camera');
    socket?.emit('screen-share', { sessionId, isSharing: false });
  }, [emitLocal, sessionId, socket]);

  const toggleMute = useCallback(
    (muted: boolean) => {
      // Mute the microphone specifically. While sharing, the outgoing stream is
      // the screen, and toggling that stream's audio only affected system/tab
      // sound, leaving the teacher's voice live for everyone.
      const mic = cameraRef.current?.getAudioTracks()[0];
      if (mic) mic.enabled = !muted;
      socket?.emit('toggle-mic', { sessionId, isMuted: muted });
    },
    [sessionId, socket],
  );

  const showSnapshot = useCallback(
    async (source: HTMLVideoElement | null, name: string) => {
      if (!source || !source.videoWidth) {
        setError('لا توجد صورة للالتقاط. شغّل الكاميرا أو مشاركة الشاشة أولًا.');
        return false;
      }

      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1280 / source.videoWidth);
        canvas.width = Math.round(source.videoWidth * scale);
        canvas.height = Math.round(source.videoHeight * scale);

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas unavailable');
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
        if (!blob) throw new Error('encode failed');

        const { uploadFile } = await import('@/lib/upload-client');
        const upload = await uploadFile(new File([blob], `snapshot-${Date.now()}.jpg`, { type: 'image/jpeg' }), 'image');

        socket?.emit('show-snapshot', { sessionId, url: upload.url, name });
        setSnapshot({ url: upload.url, name, at: Date.now() });
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'تعذّر التقاط اللقطة');
        return false;
      }
    },
    [sessionId, socket],
  );

  const clearSnapshot = useCallback(() => {
    setSnapshot(null);
    socket?.emit('clear-snapshot', { sessionId });
  }, [sessionId, socket]);

  useEffect(() => {
    return () => {
      cameraRef.current?.getTracks().forEach((track) => track.stop());
      screenRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return {
    localStream,
    /** current outgoing broadcast stream (screen while sharing, otherwise camera) */
    getOutgoingStream: () => localRef.current,
    /** camera stream, used to keep the microphone alive during screen share */
    getCameraStream: () => cameraRef.current,
    isSharing,
    cameraStatus,
    screenStatus,
    error,
    setError,
    remotes,
    snapshot,
    startCamera,
    stopCamera,
    startScreenShare,
    stopScreenShare,
    toggleMute,
    showSnapshot,
    clearSnapshot,
  };
}

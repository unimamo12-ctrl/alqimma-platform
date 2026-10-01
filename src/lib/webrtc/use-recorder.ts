'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderStatus = 'idle' | 'recording' | 'finalizing';

export interface RecordingResult {
  blob: Blob;
  extension: 'webm' | 'mp4';
  mimeType: string;
  durationSeconds: number;
}

const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

function pickMimeType(): { mimeType: string; extension: 'webm' | 'mp4' } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const mimeType of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return { mimeType, extension: mimeType.startsWith('video/mp4') ? 'mp4' : 'webm' };
    }
  }
  return null;
}

function extensionForMime(mimeType: string): 'webm' | 'mp4' {
  return mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
}

interface UseRecorderOptions {
  /** stream that is currently going out to students (screen or camera) */
  getOutgoingStream: () => MediaStream | null;
  /** camera stream, keeps the mic alive while the screen is shared */
  getCameraStream: () => MediaStream | null;
}

export function useRecorder({ getOutgoingStream, getCameraStream }: UseRecorderOptions) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const compositeRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState('');

  const supported = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';

  const buildComposite = useCallback((): MediaStream | null => {
    const outgoing = getOutgoingStream();
    if (!outgoing || outgoing.getVideoTracks().length === 0) return null;

    const tracks: MediaStreamTrack[] = [...outgoing.getVideoTracks()];

    // microphone keeps running even when the outgoing stream is the screen
    const mic = getCameraStream()?.getAudioTracks()[0];
    if (mic) tracks.push(mic);

    // screen audio (system/tab sound) when the browser provides it
    for (const track of outgoing.getAudioTracks()) {
      if (track.kind === 'audio') tracks.push(track);
    }

    const composite = new MediaStream(tracks);
    compositeRef.current = composite;
    return composite;
  }, [getCameraStream, getOutgoingStream]);

  const releaseComposite = useCallback(() => {
    compositeRef.current = null;
  }, []);

  useEffect(() => {
    if (status !== 'recording') return;
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.round((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  const start = useCallback((): boolean => {
    setError('');

    const picked = pickMimeType();
    if (!picked) {
      setError('المتصفح لا يدعم تسجيل الفيديو. جرّب Chrome أو Edge.');
      return false;
    }

    const composite = buildComposite();
    if (!composite) {
      setError('شغّل الكاميرا أو مشاركة الشاشة قبل بدء التسجيل.');
      return false;
    }

    try {
      const recorder = new MediaRecorder(composite, {
        mimeType: picked.mimeType,
        videoBitsPerSecond: 2_500_000,
      });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsedSeconds(0);
      setStatus('recording');
      return true;
    } catch (err) {
      releaseComposite();
      setError(err instanceof Error ? err.message : 'تعذّر بدء التسجيل');
      return false;
    }
  }, [buildComposite, releaseComposite]);

  const stop = useCallback(async (): Promise<RecordingResult | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      releaseComposite();
      return null;
    }

    setStatus('finalizing');

    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));

    const done = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    recorder.stop();
    await done;

    recorderRef.current = null;
    releaseComposite();

    // MediaRecorder reports e.g. "video/webm;codecs=vp9,opus"; the upload
    // allow-list only knows the bare type, so drop the codec parameters.
    const mimeType = (recorder.mimeType || 'video/webm').split(';')[0].trim();
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];

    setStatus('idle');
    setElapsedSeconds(0);

    if (blob.size === 0) {
      setError('لم يُسجَّل أي محتوى. تأكد من أن الكاميرا تعمل.');
      return null;
    }

    return { blob, extension: extensionForMime(mimeType), mimeType, durationSeconds };
  }, [releaseComposite]);

  // keep an in-flight recording alive if the component unmounts unexpectedly
  useEffect(
    () => () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      recorderRef.current = null;
      compositeRef.current = null;
    },
    [],
  );

  return { status, isRecording: status === 'recording', elapsedSeconds, error, supported, start, stop };
}

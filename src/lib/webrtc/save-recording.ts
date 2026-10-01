import type { RecordingResult } from '@/lib/webrtc/use-recorder';

export interface SaveRecordingInput {
  recording: RecordingResult;
  sessionId: string;
  courseId: string;
  title: string;
  description?: string;
  thumbnail?: string;
  /**
   * Publish straight away instead of leaving an unpublished draft behind.
   *
   * `POST /api/videos` deliberately treats a recording as a draft unless this is
   * explicitly `true`, so the caller has to opt in — but the live room does,
   * because the alternative was a finished recording that no student could see.
   */
  publish?: boolean;
}

export interface SaveRecordingOutput {
  videoId: string;
  url: string;
  isPublished: boolean;
}

/**
 * Uploads the recorded broadcast and links it to the session.
 *
 * `publish` defaults to false, which is the safe reading for anything that is not
 * a deliberate "the teacher finished recording". The live room passes `true`,
 * because recording is itself the teacher's decision: they pressed record, then
 * ended the session, and a student who missed the broadcast has no other route
 * back to it. Making them find and press "publish" as a second, separate action
 * is how recordings used to sit invisible in the list while everyone assumed the
 * capture had failed.
 */
export async function saveRecording({
  recording,
  sessionId,
  courseId,
  title,
  description,
  thumbnail,
  publish = false,
}: SaveRecordingInput): Promise<SaveRecordingOutput> {
  const form = new FormData();
  form.append('kind', 'video');
  form.append(
    'file',
    new File([recording.blob], `recording-${sessionId}.${recording.extension}`, {
      type: recording.mimeType,
    }),
  );

  const uploadRes = await fetch('/api/uploads', { method: 'POST', body: form });
  const uploadBody = await uploadRes.json().catch(() => null);
  const uploadedUrl = uploadBody?.data?.upload?.url;

  if (!uploadRes.ok || !uploadedUrl) {
    throw new Error(uploadBody?.message ?? 'تعذّر رفع ملف التسجيل');
  }

  const createRes = await fetch('/api/videos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      courseId,
      title,
      description,
      thumbnail,
      url: uploadedUrl,
      duration: recording.durationSeconds,
liveSessionId: sessionId,
        isPublished: publish,
      }),
  });
  const createBody = await createRes.json().catch(() => null);

  if (!createRes.ok || !createBody?.data?.video?.id) {
    // No safe way to delete an orphaned upload: /api/uploads exposes no DELETE
    // and inventing one would let anyone remove arbitrary files by url.
    const reason = createBody?.message ?? 'تعذّر إنشاء فيديو التسجيل';
    throw new Error(`${reason} (الملف مرفوع على: ${uploadedUrl})`);
  }

  return {
    videoId: createBody.data.video.id,
    url: uploadedUrl,
    isPublished: createBody.data.video.isPublished === true,
  };
}

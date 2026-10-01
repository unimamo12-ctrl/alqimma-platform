'use client';

/**
 * Media quality policy for the live mesh.
 *
 * Everything the browser would otherwise decide for us lives here: how hard we
 * ask for resolution, how much bitrate we allow, which codec we prefer, and
 * what we tell the encoder about the content. The defaults are the problem
 * this fixes: `getUserMedia({ video: true })` plus a bare `addTransceiver`
 * leaves every value to the browser, which means a 640x480 capture, an
 * un-capped bitrate, and no idea that a shared screen is text.
 */

export type MediaKind = 'camera' | 'screen';

/**
 * `ideal`, never `exact`.
 *
 * `exact` makes getUserMedia reject the whole call when the camera cannot hit
 * the number, which turns a "slightly softer video" into "no video at all".
 * `ideal` lets the browser give us the best it can and report what it got, so a
 * 720p-only laptop still joins the lesson at 720p instead of failing to publish.
 * Screen share adds `max` because a 4K desktop downscaled by the browser's own
 * scaler is both cheaper to encode and far better looking than 4K shipped at
 * lecture bitrates.
 *
 * Frame rate is capped at 60, and `max` is deliberate: a 120fps capture would
 * be downscaled by the encoder back down to 60 anyway, so asking for it only
 * costs capture bandwidth and a hotter sensor. 60fps costs roughly double the
 * bitrate and roughly double the encoder CPU of 30fps, which is why
 * `videoBitrateCeiling` scales with the frame rate — a 60fps stream encoded at
 * the 30fps ceiling does not look like 60fps, it looks like a soft 30fps stream
 * paying twice for the privilege.
 *
 * Screen share stays at 30. Shared content is static text and diagrams where
 * extra frames carry almost no information, and `maintain-resolution` already
 * tells the encoder to shed frame rate before it sheds sharpness.
 */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 60, max: 60 },
  },
  audio: {
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl: { ideal: true },
  },
};

export const SCREEN_VIDEO_CONSTRAINTS: DisplayMediaStreamOptions['video'] = {
  width: { ideal: 1920, max: 1920 },
  height: { ideal: 1080, max: 1080 },
  frameRate: { ideal: 30 },
};

const KBPS = 1000;

/**
 * Bitrate ceilings in bits per second, keyed by the *sourced* height.
 *
 * These are ceilings, not targets. Chrome's bandwidth estimator still lowers
 * the actual rate when the link is congested; a ceiling that is too low would
 * permanently cap a good connection, which is why these are generous.
 * Screen share gets more at every tier: it is mostly high-frequency edges and
 * text, and those are what fall apart first when the rate drops.
 *
 * The numbers are quoted at 30fps. `HIGH_FPS_MULTIPLIER` scales them for a
 * faster source, because per-frame cost barely falls with frame rate — halving
 * the frame interval does not halve the bits a frame needs, so a 60fps stream
 * needs close to twice the rate to be as clean, not twice-as-soft.
 */
const TIERS: Array<{ maxHeight: number; camera: number; screen: number }> = [
  { maxHeight: 360, camera: 500 * KBPS, screen: 900 * KBPS },
  { maxHeight: 480, camera: 900 * KBPS, screen: 1600 * KBPS },
  { maxHeight: 720, camera: 1800 * KBPS, screen: 2500 * KBPS },
  { maxHeight: 1080, camera: 4200 * KBPS, screen: 4500 * KBPS },
];

/**
 * Above this source frame rate the tiers are scaled up.
 *
 * `FRAME_RATE_CEILING` is the highest rate any source is asked for, so the
 * multiplier is applied at most once no matter what a device reports.
 */
const FRAME_RATE_CEILING = 60;
const HIGH_FPS_MULTIPLIER = 2;

/**
 * @param frameRate frames per second the source actually delivers. Omitted or
 * zero means "not known yet", which is treated as 30 — the tiers are quoted at
 * 30, so an unknown rate gets the 30fps ceiling and is corrected by the next
 * `applySenderQuality` call once the track reports its real rate.
 */
export function videoBitrateCeiling(
  width: number,
  height: number,
  kind: MediaKind,
  frameRate = 0,
): number {
  const highFps = frameRate > 30;
  const scale = highFps ? HIGH_FPS_MULTIPLIER : 1;

  // Unknown source: fall back to the top tier rather than the lowest, because
  // this is only reached before a track reports its settings and a ceiling that
  // is too low here would quietly stick after the real resolution is known.
  if (!width || !height) return (kind === 'screen' ? 4500 : 4200) * KBPS * scale;

  for (const tier of TIERS) {
    if (height <= tier.maxHeight) {
      return (kind === 'screen' ? tier.screen : tier.camera) * scale;
    }
  }
  // taller than anything we cap for: 4K screens exist and should still send
  return (kind === 'screen' ? 7500 : 5500) * KBPS * scale;
}

/** Opus ceiling for a lesson voice. Generous: it is a cap, not a target. */
const AUDIO_CEILING = 128 * KBPS;

/**
 * Screen content loses resolution and camera content loses frame rate, so the
 * two sources get opposite instructions.
 *
 * `maintain-resolution` on a shared screen is the whole ballgame for text: a
 * lecture at 15fps and full resolution is far more useful than 30fps at half
 * resolution. A talking head is the opposite — judder reads as a broken
 * connection, while a softer image just reads as a soft camera.
 */
function degradationFor(kind: MediaKind): RTCDegradationPreference {
  return kind === 'screen' ? 'maintain-resolution' : 'maintain-framerate';
}

/**
 * `detail` tells the encoder the pixels are text and edges, so it spends bits
 * on sharpness instead of spending them on motion-compensation noise. Without
 * it a shared slide is encoded as if it were a face.
 */
function contentHintFor(kind: MediaKind): 'detail' | 'motion' {
  return kind === 'screen' ? 'detail' : 'motion';
}

export function applyContentHint(track: MediaStreamTrack | undefined, kind: MediaKind): void {
  if (!track) return;
  try {
    track.contentHint = contentHintFor(kind);
  } catch {
    // Safari and older Firefox have no contentHint; it is an optimisation only.
  }
}

export function applyAudioHint(track: MediaStreamTrack | undefined): void {
  if (!track) return;
  try {
    track.contentHint = 'speech';
  } catch {
    // ditto
  }
}

/**
 * `degradationPreference` is specified on the *encoding*, but the TypeScript
 * DOM lib this project compiles against still declares it one level up, on
 * `RTCRtpSendParameters`. Browsers read it off the encoding, so that is where
 * it has to be written; the cast keeps the assignment honest about it.
 */
type EncodingWithDegradation = RTCRtpEncodingParameters & {
  degradationPreference?: RTCDegradationPreference;
};

/**
 * Push the policy onto one sender.
 *
 * `setParameters` is the only way to bound a sender, and it is separate from
 * `replaceTrack` — attaching a 1080p screen track to a sender still configured
 * for a 480p camera keeps the old ceiling until this runs again. That is why
 * every call site invokes this after replacing the track, not once per peer.
 *
 * `source` lets the caller pass the resolution of the track it just queued for
 * sending. `replaceTrack` is async, so reading `sender.track.getSettings()`
 * right after it is still looking at the *previous* track and would size the
 * ceiling for the wrong source.
 */
export async function applySenderQuality(
  sender: RTCRtpSender | null,
  kind: MediaKind,
  source?: { width?: number; height?: number; frameRate?: number },
): Promise<void> {
  if (!sender) return;

  const settings = source ?? sender.track?.getSettings?.() ?? {};
  const width = settings.width ?? 0;
  const height = settings.height ?? 0;
  const frameRate = settings.frameRate ?? 0;

  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }

    // only the first encoding can be reconfigured; setParameters throws
    // otherwise, and we would lose the whole call including the audio sender
    const encoding = params.encodings[0] as EncodingWithDegradation;
    encoding.maxBitrate = videoBitrateCeiling(width, height, kind, frameRate);
    // This is the ceiling that actually governs the outgoing frame rate, and it
    // is easy to forget: asking `getUserMedia` for 60fps and then pinning
    // `maxFramerate` to 30 here throws the extra frames away at the encoder and
    // leaves a 60fps capture costing 60fps of CPU for a 30fps stream. Capped at
    // FRAME_RATE_CEILING rather than the reported rate, so a device that
    // misreports 120 is bounded rather than trusted.
    encoding.maxFramerate = Math.min(frameRate || FRAME_RATE_CEILING, FRAME_RATE_CEILING);
    encoding.degradationPreference = degradationFor(kind);
    encoding.priority = 'high';

    await sender.setParameters(params);
  } catch {
    // A sender with no parameters yet, or one already negotiated, can reject
    // this. Falling back to browser defaults is better than losing the track.
  }
}

export async function applyAudioQuality(sender: RTCRtpSender | null): Promise<void> {
  if (!sender) return;

  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }

    const encoding = params.encodings[0];
    encoding.maxBitrate = AUDIO_CEILING;
    // Audio yields to video when both compete, so the lesson keeps moving
    // instead of the picture freezing while the teacher's voice stays clean.
    encoding.priority = 'low';

    await sender.setParameters(params);
  } catch {
    // see above
  }
}

/**
 * Preference order for video codecs.
 *
 * H.264 leads when a High or Main profile is on offer: those are
 * hardware-encoded on essentially every machine that ships a webcam, so the
 * picture costs almost no CPU and the teacher hears their own fan stay quiet.
 *
 * Constrained baseline H.264 is deliberately ranked *below* VP8 and VP9. That
 * is the profile WebRTC defaults to, and it is level 3.1, which cannot carry
 * 1080p — Chrome clamps the outgoing resolution to match the negotiated
 * profile. Preferring it would silently downscale every shared screen, which is
 * a worse outcome than the higher CPU of a software VP8 encode.
 *
 * VP9 comes before VP8 because it is the better text codec at the same rate.
 * AV1 is last: software AV1 encode would eat the machine.
 *
 * This only reorders. Nothing is removed, so a pair that cannot agree on any
 * one codec still negotiates something instead of failing the connection.
 */
const CODEC_RANK: Record<string, number> = {
  'h264-high': 10,
  'h264-main': 20,
  vp9: 30,
  vp8: 40,
  'h264-unknown': 55,
  'h264-baseline': 60,
  'h264-constrained-baseline': 65,
};

const H264_PROFILE = /^video\/h264$/i;

function rankH264(codec: RTCRtpCodec): number {
  const line = codec.sdpFmtpLine ?? '';
  const idc = /profile-level-id=([0-9a-f]{2})/i.exec(line)?.[1];
  if (!idc) return CODEC_RANK['h264-unknown'];

  const profileIdc = Number.parseInt(idc, 16);
  if (profileIdc === 100) return CODEC_RANK['h264-high'];
  if (profileIdc === 77) return CODEC_RANK['h264-main'];
  if (profileIdc === 66) return CODEC_RANK['h264-baseline'];

  // extended profile, or a constraint byte that marks constrained baseline
  const isConstrained = /packetization-mode=1/.test(line) && /profile-level-id=4[26]00/i.test(line);
  return isConstrained ? CODEC_RANK['h264-constrained-baseline'] : CODEC_RANK['h264-unknown'];
}

function codecRank(codec: RTCRtpCodec): number {
  const mime = codec.mimeType.toLowerCase();
  if (H264_PROFILE.test(mime)) return rankH264(codec);

  const family = mime.split('/')[1] ?? '';
  return CODEC_RANK[family] ?? 80;
}

/**
 * Reorder this transceiver's codec list. Safe to call before every offer and
 * answer; a transceiver that has stopped throws and is simply skipped.
 */
export function preferVideoCodecs(transceiver: RTCRtpTransceiver | null | undefined): void {
  if (!transceiver) return;

  try {
    const capabilities = RTCRtpReceiver.getCapabilities(transceiver.receiver.track.kind);
    if (!capabilities?.codecs?.length) return;

    const ordered = [...capabilities.codecs].sort((a, b) => codecRank(a) - codecRank(b));
    transceiver.setCodecPreferences(ordered);
  } catch {
    // No capability data, or the transceiver is closed. Browser default order
    // still applies, which is what shipped before.
  }
}

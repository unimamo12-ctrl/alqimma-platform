/**
 * Unit checks for the bitrate ladder in `src/lib/webrtc/media-quality.ts`.
 *
 * These numbers cannot be covered by the browser E2E. That runs against
 * Chromium's fake camera, which reports 20fps and so never takes the high-fps
 * branch — the live policy is right to apply no multiplier there, which means
 * an E2E can never tell a correct 60fps ceiling from a forgotten one. This
 * drives the exported function instead, so both sides of the 30fps boundary are
 * checked directly.
 *
 * Runs with tsx because the policy is TypeScript and shared with the browser.
 */

import { videoBitrateCeiling } from '../src/lib/webrtc/media-quality.ts';

let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`PASS ${label}${detail ? ` :: ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`FAIL ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}

function eq(label, actual, expected) {
  check(label, actual === expected, `got ${actual}, want ${expected}`);
}

const camera1080At30 = videoBitrateCeiling(1920, 1080, 'camera', 30);
const camera1080At60 = videoBitrateCeiling(1920, 1080, 'camera', 60);

eq('1080p camera at 30fps keeps the base ceiling', camera1080At30, 4_200_000);
eq('1080p camera at 60fps doubles the ceiling', camera1080At60, 8_400_000);

// The boundary is the whole point of the table, so both sides are pinned.
eq('exactly 30fps is not treated as high-fps', videoBitrateCeiling(1920, 1080, 'camera', 30), 4_200_000);
eq('31fps crosses into the high-fps branch', videoBitrateCeiling(1920, 1080, 'camera', 31), 8_400_000);

// An unreported rate must not silently claim the expensive branch, otherwise a
// track that has not reported yet gets 60fps pricing it is not using.
eq('unknown frame rate is treated as 30', videoBitrateCeiling(1920, 1080, 'camera', 0), 4_200_000);
eq('omitted frame rate is treated as 30', videoBitrateCeiling(1920, 1080, 'camera'), 4_200_000);

// Every tier has to scale, not just the one at the top, or a 720p60 laptop is
// the case that quietly loses quality.
for (const [w, h] of [[640, 360], [854, 480], [1280, 720], [1920, 1080]]) {
  const at30 = videoBitrateCeiling(w, h, 'camera', 30);
  const at60 = videoBitrateCeiling(w, h, 'camera', 60);
  check(
    `camera ${h}p doubles from 30 to 60fps`,
    at60 === at30 * 2 && at30 > 0,
    `30fps=${at30} 60fps=${at60}`,
  );
}

// Screen share stays at 30fps in the constraints, so its high-fps branch is only
// reachable from a display that volunteers more than was asked for.
const screen1080At30 = videoBitrateCeiling(1920, 1080, 'screen', 30);
const screen1080At60 = videoBitrateCeiling(1920, 1080, 'screen', 60);
check(
  'screen share outranks camera at equal resolution and rate',
  screen1080At30 > camera1080At30 && screen1080At60 > camera1080At60,
  `screen30=${screen1080At30} camera30=${camera1080At30}`,
);

// Unknown resolution falls back to the TOP tier, so it must scale too — this is
// the branch that runs before a track reports its settings.
eq('unknown resolution falls back to the 1080 camera ceiling', videoBitrateCeiling(0, 0, 'camera', 30), 4_200_000);
eq('unknown resolution at 60fps scales that fallback', videoBitrateCeiling(0, 0, 'camera', 60), 8_400_000);
eq('unknown resolution falls back to the 1080 screen ceiling', videoBitrateCeiling(0, 0, 'screen', 30), 4_500_000);

// Taller than anything in the table: 4K exists and should still send.
eq('4K camera uses the overflow tier at 30fps', videoBitrateCeiling(3840, 2160, 'camera', 30), 5_500_000);
eq('4K screen uses the overflow tier at 30fps', videoBitrateCeiling(3840, 2160, 'screen', 30), 7_500_000);

// A tier must never return zero or NaN: a 0 maxBitrate means "unlimited" to some
// implementations and "mute" to others.
for (const kind of ['camera', 'screen']) {
  for (const h of [0, 360, 480, 720, 1080, 2160]) {
    for (const fps of [0, 15, 30, 60, 120]) {
      const v = videoBitrateCeiling(1920, h, kind, fps);
      check(`${kind} ${h}p @${fps}fps yields a positive finite ceiling`, Number.isFinite(v) && v > 0, `${v}`);
    }
  }
}

console.log(failed === 0 ? 'ALL QUALITY POLICY CHECKS PASSED' : `FAILED ${failed}`);
process.exit(failed === 0 ? 0 : 1);

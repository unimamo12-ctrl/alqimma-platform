/**
 * Dark mode, checked at the state a user actually sees.
 *
 * Two classes of bug are covered here, and the second one is the reason this
 * file exists separately from `e2e:dark`:
 *
 *  1. A row or card that keeps a *light* background in dark mode, which turns
 *     its own near-white text invisible. Reported as "the text and the numbers
 *     don't show".
 *  2. The same thing on **hover**. `hover:bg-gray-50` was left unmapped because
 *     the codemod's class-list detector only recognised a string whose first
 *     colour token had no variant prefix, so `className="hover:bg-gray-50"` was
 *     skipped entirely — and a hovered table row then painted near-white under
 *     near-white text. Hover is invisible to a plain DOM sweep, so it has to be
 *     driven with a real pointer.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const PASSWORD = 'password123';

let failures = 0;
function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}${detail ? ` :: ${detail}` : ''}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}

const lum = ({ r, g, b }) => {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const browser = await chromium.launch();

async function login(email) {
  // a fresh context per role: a live session redirects /login away
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('alqimma-theme', 'dark');
  });
  return { context, page };
}

/** Hover each row and require its text to still be readable against it. */
async function checkHoverRows(page, label) {
  const rows = page.locator('tbody tr');
  const count = await rows.count();
  if (count === 0) {
    // several admin screens are card grids, not tables; nothing to hover
    ok(`${label}: hovered rows stay readable`, true, 'no table rows on this screen');
    return;
  }

  let worst = null;

  for (let i = 0; i < Math.min(count, 4); i += 1) {
    const row = rows.nth(i);
    if (!(await row.isVisible())) continue;

    await row.hover();
    await page.waitForTimeout(250);

    const measured = await row.evaluate((el) => {
      const parseLocal = (c) => {
        if (!c || c === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
        /*
         * Resolved by painting it, not parsed. Chromium serialises computed
         * colours as oklab()/lab() for many values, so an rgb()-only regex
         * returns null for exactly the dark-mode colours under test and the
         * whole measurement silently reports "nothing measurable".
         */
        const cvs = document.createElement('canvas');
        cvs.width = 1;
        cvs.height = 1;
        const ctx = cvs.getContext('2d', { willReadFrequently: true });
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#000';
        ctx.fillStyle = c;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
      };

      // Walk up compositing translucent layers until something opaque is behind
      // the row. Reading the row's own background alone returns `transparent`
      // for most tables, which is what made an earlier version of this measure
      // nothing at all and quietly pass.
      const backdrop = (start) => {
        let acc = null;
        let node = start;
        while (node) {
          const c = parseLocal(getComputedStyle(node).backgroundColor);
          if (c && c.a > 0) {
            acc = acc
              ? { r: c.r + (acc.r - c.r) * (1 - c.a), g: c.g + (acc.g - c.g) * (1 - c.a), b: c.b + (acc.b - c.b) * (1 - c.a) }
              : { r: c.r, g: c.g, b: c.b };
            if (c.a >= 0.99) return acc;
          }
          node = node.parentElement;
        }
        const body = parseLocal(getComputedStyle(document.body).backgroundColor);
        return acc ?? body ?? { r: 0, g: 0, b: 0 };
      };

      // the first element that renders real text inside the row
      let target = null;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node && !target) {
        if (node.textContent.trim().length > 0 && node.parentElement) {
          const cs = getComputedStyle(node.parentElement);
          if (cs.display !== 'none' && cs.visibility !== 'hidden') target = node.parentElement;
        }
        node = walker.nextNode();
      }
      if (!target) return null;

      const fg = parseLocal(getComputedStyle(target).color);
      if (!fg) return null;
      return { fg, bg: backdrop(el), color: getComputedStyle(target).color };
    });

    if (!measured) continue;
    const r = contrast(measured.fg, measured.bg);
    if (!worst || r < worst.r) worst = { r, ...measured, row: i };
  }

  if (!worst) {
    ok(`${label}: hovered rows stay readable`, false, 'no row text could be measured');
    return;
  }

  /*
   * 4.5, not something looser. The unmapped `hover:bg-gray-50` bug paints the
   * row rgb(249,250,251) under near-white text; measuring that first text node
   * happens to land on a muted one and scores 2.99, which a 2.5 bar waves
   * through. 4.5 is WCAG AA for normal text and is what separates the two cases.
   */
  ok(
    `${label}: hovered rows stay readable`,
    worst.r >= 4.5,
    `worst row #${worst.row} r=${worst.r.toFixed(2)} text ${worst.color} on rgb(${worst.bg.r},${worst.bg.g},${worst.bg.b})`,
  );

  // The bug's exact signature, asserted independently of which text node was
  // sampled: a near-white backdrop appearing under the pointer in dark mode.
  ok(
    `${label}: hovering does not paint a near-white row`,
    lum(worst.bg) < 0.05,
    `backdrop rgb(${worst.bg.r},${worst.bg.g},${worst.bg.b})`,
  );
}

try {
  const { context, page } = await login('admin@alqimma.com');

  for (const [route, label] of [
    ['/admin/students', 'admin students'],
    ['/admin/teachers', 'admin teachers'],
    ['/admin/content', 'admin content'],
    ['/admin/subscriptions', 'admin subscriptions'],
  ]) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await checkHoverRows(page, label);
  }

  await context.close();

  // and the student-facing tables
  const s = await login('student@alqimma.com');
  for (const [route, label] of [
    ['/student/subscriptions', 'student subscriptions'],
    ['/student/live', 'student live'],
  ]) {
    await s.page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    await s.page.waitForTimeout(1200);
    await checkHoverRows(s.page, label);
  }
  await s.context.close();
} catch (error) {
  failures += 1;
  console.log(`  FAIL  the run threw :: ${error.message}`);
} finally {
  await browser.close();
}

if (failures > 0) {
  console.error(`\nFAILED ${failures} dark hover check(s)`);
  process.exit(1);
}

console.log('\nALL DARK HOVER CHECKS PASSED');
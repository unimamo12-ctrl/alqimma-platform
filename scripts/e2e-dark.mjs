/**
 * Dark mode.
 *
 * Two things are checked, and the second is the one that actually catches
 * regressions. A `dark:` variant is easy to forget on a single element, and the
 * result is a white card sitting on a near-black page — invisible in a diff, and
 * obvious to a user. So after forcing dark mode, every page is walked and any
 * element still painting an opaque *light* background is reported.
 *
 * Elements with an inline `background-color` are skipped: the subject colour
 * strip on /student/subjects is deliberately the brand colour in both modes.
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

// Chromium serialises colours as lab()/oklab() as well as rgb(), so a plain
// rgb() parse reports every modern colour as "not dark" and the audit silently
// passes on the elements it was written to catch.
function isDark(colour) {
  if (!colour || colour === 'none' || colour === 'transparent') return false;
  const oklab = /^oklab\(([\d.]+)/.exec(colour);
  if (oklab) return Number(oklab[1]) < 0.5;
  const lab = /^lab\(([\d.]+)/.exec(colour);
  if (lab) return Number(lab[1]) < 50;
  const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(colour);
  if (!rgb) return false;
  return (Number(rgb[1]) + Number(rgb[2]) + Number(rgb[3])) / 3 < 90;
}

const browser = await chromium.launch();

async function session(email) {
  // a fresh context per role: reusing one leaves the previous session's cookies
  // in place and /login redirects to the dashboard with no form to fill
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await context.newPage();

  if (email) {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(2500);
  } else {
    // land on the origin first; localStorage is unreadable on about:blank
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  }

  return { context, page };
}

async function forceDark(page) {
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('alqimma-theme', 'dark');
  });
}

async function lightSurfaces(page) {
  return page.evaluate(() => {
    const found = [];

    /*
     * Colours are resolved by painting them onto a canvas, not by regex.
     * Chromium returns `oklab()` for most computed colours, so the rgb()-only
     * regex this audit started with returned null for essentially every element
     * and it reported "clean" while a white card sat on a black page. A check
     * that cannot fail is worse than no check: it looks like coverage.
     */
    const parse = (value) => {
      if (!value || value === 'transparent' || value === 'none') return null;
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: a / 255 };
    };

    const over = (top, bottom) => ({
      r: top.r + (bottom.r - top.r) * (1 - top.a),
      g: top.g + (bottom.g - top.g) * (1 - top.a),
      b: top.b + (bottom.b - top.b) * (1 - top.a),
      a: 1,
    });

    /*
     * Composite every translucent layer down to something opaque. The hero's
     * stat cards are `bg-slate-50/60`, and skipping a sub-60% alpha — as this
     * audit originally did — walked straight past them to the dark section
     * behind and judged the contrast there instead.
     */
    const effectiveBackground = (el) => {
      const stack = [];
      let node = el;
      while (node) {
        const colour = parse(getComputedStyle(node).backgroundColor);
        if (colour && colour.a > 0) {
          stack.push(colour);
          if (colour.a >= 0.999) break;
        }
        node = node.parentElement;
      }
      const page = parse(getComputedStyle(document.body).backgroundColor) ?? { r: 0, g: 0, b: 0, a: 1 };
      let result = stack.length ? stack[stack.length - 1] : page;
      for (let i = stack.length - 2; i >= 0; i -= 1) result = over(stack[i], result);
      return result.a >= 0.999 ? result : over(result, page);
    };

    for (const el of document.querySelectorAll('body *')) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      // an inline colour is a deliberate brand/accent choice, not a missed variant
      if (el.getAttribute('style')?.includes('background')) continue;

      const own = parse(style.backgroundColor);
      if (!own || own.a < 0.05) continue;
      // skip if the element fully inherits its backdrop rather than painting one
      if (own.a < 0.999 && getComputedStyle(el).backgroundImage !== 'none') continue;

      /*
       * Decorative specks are exempt. A 6x6 "online" dot in `bg-emerald-500` and
       * the white ring on an avatar badge are supposed to stay bright; flagging
       * them trains the reader to ignore real findings. Anything that renders
       * text, or is big enough to be a surface, is still checked.
       */
      const rect = el.getBoundingClientRect();
      const area = rect.width * rect.height;
      const rendersText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!rendersText && area < 700) continue;

      const bg = effectiveBackground(el);
      const luminance = (0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b) / 255;
      if (luminance > 0.55) {
        found.push(`${el.tagName.toLowerCase()}.${String(el.className || '').slice(0, 60)}`);
      }
    }

    return [...new Set(found)];
  });
}

const roles = [
  [null, ['/', '/teachers', '/live', '/login', '/register']],
  ['admin@alqimma.com', ['/admin', '/admin/subscriptions', '/admin/students', '/admin/teachers', '/admin/content', '/account']],
  ['student@alqimma.com', ['/student', '/student/subjects', '/student/live', '/student/videos', '/student/exercises', '/student/subscriptions', '/student/quizzes', '/student/notifications']],
  ['teacher@alqimma.com', ['/teacher', '/teacher/courses', '/teacher/videos', '/teacher/exercises', '/teacher/files', '/teacher/live', '/teacher/quizzes', '/teacher/students']],
];

let totalLight = 0;

try {
  // --- the toggle itself ----------------------------------------------------
  {
    const { context, page } = await session(null);
    await forceDark(page);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);

    const toggle = page.locator('button[aria-label*="الوضع"]');
    ok('a theme toggle is present', (await toggle.count()) > 0);
    ok('it starts in dark', (await toggle.first().getAttribute('aria-pressed')) === 'true');
    ok('color-scheme follows the class, not an inline style', (await page.evaluate(() => document.documentElement.style.colorScheme)) === '', 'no inline style written');
    ok('the icon offers the light mode', (await page.locator('button[aria-label*="النهاري"]').count()) > 0);

    await toggle.first().click();
    await page.waitForTimeout(600);
    ok('clicking it goes light', (await toggle.first().getAttribute('aria-pressed')) === 'false');
    ok('the light choice is stored', (await page.evaluate(() => localStorage.getItem('alqimma-theme'))) === 'light');

    await toggle.first().click();
    await page.waitForTimeout(600);

    // no flash: the class has to be set while the document is still parsing
    await page.reload({ waitUntil: 'domcontentloaded' });
    const early = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    ok('the theme survives a reload with no light flash', early, `dark at domcontentloaded=${early}`);
    ok('the dark choice is stored', (await page.evaluate(() => localStorage.getItem('alqimma-theme'))) === 'dark');

    /*
     * The check this file was missing. Hydration only mismatches when the script
     * actually adds the class, so it stays invisible unless dark mode is already
     * the stored choice — which is why the rest of `verify` reported a clean run
     * while a dark-mode user saw a console error on every page load.
     */
    const consoleErrors = [];
    const onConsole = (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    };
    const onPageError = (err) => consoleErrors.push(err.message);
    page.on('console', onConsole);
    page.on('pageerror', onPageError);

    for (const route of ['/', '/teachers', '/live']) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
    }

    page.off('console', onConsole);
    page.off('pageerror', onPageError);

    const hydration = consoleErrors.filter((m) => /hydrated|hydrat|did not match/i.test(m));
    ok(
      'a stored dark theme hydrates without a mismatch',
      hydration.length === 0,
      hydration.length === 0 ? 'no hydration warning' : hydration[0].slice(0, 120),
    );

    // A signed-out visitor gets 401 from /api/auth/me on the public pages, and
    // Chromium logs every failed resource load as a console error. That is the
    // auth probe doing its job, not a fault in this feature.
    const unexpected = consoleErrors.filter((m) => !/status of 401/.test(m));
    ok(
      'no unexpected console errors with dark mode active',
      unexpected.length === 0,
      unexpected.length === 0 ? `clean (${consoleErrors.length} expected 401s ignored)` : unexpected[0].slice(0, 120),
    );

    await context.close();
  }

  // --- no page keeps a light surface ---------------------------------------
  for (const [email, routes] of roles) {
    const { context, page } = await session(email);
    await forceDark(page);

    for (const route of routes) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);

      const bodyIsDark = isDark(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
      const leftovers = await lightSurfaces(page);

      ok(
        `${email ? email.split('@')[0] : 'public'} ${route} is dark`,
        bodyIsDark && leftovers.length === 0,
        leftovers.length === 0 ? 'clean' : `${leftovers.length} light: ${leftovers.slice(0, 2).join(' | ')}`,
      );
      totalLight += leftovers.length;
    }

    await context.close();
  }
} catch (error) {
  failures += 1;
  console.log(`  FAIL  the run threw :: ${error.message}`);
} finally {
  await browser.close();
}

if (failures > 0 || totalLight > 0) {
  console.error(`\nFAILED ${failures} dark mode check(s), ${totalLight} light surfaces`);
  process.exit(1);
}

console.log('\nALL DARK MODE CHECKS PASSED');
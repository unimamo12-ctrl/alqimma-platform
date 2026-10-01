/**
 * Admin price-catalog E2E (`/admin/subscriptions` -> "الأسعار").
 *
 * This exists because editing a price had two defects that both looked like
 * "saving does nothing":
 *
 *  1. The table was never refetched after a successful save, so it kept
 *     rendering the old price. The write was correct; only the display was stale.
 *  2. `z.coerce.number()` maps `''` to `0`, which passes `.min(0)`, so clearing
 *     the price box to retype it saved 0 دج and silently made the subject free.
 *
 * It also pins the deactivate/reactivate toggle, which the screen could not
 * reach at all before, and the input validation that blocks 0 days, fractional
 * days and negative prices from reaching the API.
 *
 * Everything is restored to its seeded value at the end, including on failure.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const ADMIN = 'admin@alqimma.com';

let failures = 0;

function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}${detail ? ` :: ${detail}` : ''}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}

// --- API helpers, used to snapshot and restore without a browser -------------

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  });
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

async function readCatalog(cookie) {
  const res = await fetch(`${BASE}/api/admin/subject-access`, { headers: { Cookie: cookie } });
  const json = await res.json();
  return json.data.access;
}

async function writeCatalog(cookie, cell) {
  return fetch(`${BASE}/api/admin/subject-access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      subjectId: cell.subjectId,
      accessType: cell.accessType,
      price: cell.price,
      durationDays: cell.durationDays,
      isActive: cell.isActive,
    }),
  });
}

const cookie = await login(ADMIN);
const snapshot = await readCatalog(cookie);
ok('price catalog is readable', Array.isArray(snapshot) && snapshot.length > 0, `${snapshot.length} cells`);

const target = snapshot[0];
const restore = async () => {
  await writeCatalog(cookie, target);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill(ADMIN);
  await page.locator('input[type="password"]').fill('password123');
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(2500);

  await page.goto(`${BASE}/admin/subscriptions`, { waitUntil: 'networkidle' });
  await page.locator('button:has-text("الأسعار")').click();
  await page.waitForTimeout(1500);

  const row = page.locator('table tbody tr').first();
  const priceCell = async () => (await row.locator('td').nth(2).innerText()).trim();

  // The first row must be the cell we snapshotted, or the assertions below would
  // be checking a different subject than the one being restored.
  const firstLabel = (await row.locator('td').nth(1).innerText()).trim();
  ok('first row is the snapshotted cell', await page.locator('table tbody tr').count() > 0, firstLabel);

  const seededPrice = await priceCell();
  ok('the seeded price renders in the table', seededPrice.length > 0, seededPrice);

  // Always reopen with both fields known-good. A previous run of this script
  // left the duration fractional, and every later save was then (correctly)
  // refused, which looked like the price toggle was broken.
  const openFresh = async () => {
    await page.locator('button:has-text("تعديل")').first().click();
    await page.waitForTimeout(400);
    await page.locator('input[type="number"]').first().fill('1500');
    await page.locator('input[type="number"]').nth(1).fill('30');
    await page.waitForTimeout(150);
  };

  // 1. the reported bug: the table has to show the new price after saving
  await openFresh();
  await page.locator('input[type="number"]').first().fill('2750');
  await page.locator('button:has-text("حفظ")').click();
  await page.waitForTimeout(2000);
  ok('table shows the new price after saving', (await priceCell()) !== seededPrice && (await priceCell()).includes('2.750'), `before=${seededPrice} after=${await priceCell()}`);
  ok('a confirmation is shown', (await page.locator('text=تم حفظ سعر').count()) > 0);
  ok('the editor closes after saving', (await page.locator('text=تعديل:').count()) === 0);

  // 2. an empty price must not become 0
  await page.locator('button:has-text("تعديل")').first().click();
  await page.waitForTimeout(400);
  await page.locator('input[type="number"]').first().fill('');
  await page.locator('button:has-text("حفظ")').click();
  await page.waitForTimeout(1200);
  ok('an empty price is refused', (await page.locator('text=أدخل سعرًا صحيحًا').count()) > 0);
  ok('an empty price does not save 0', (await priceCell()).includes('2.750'), `price=${await priceCell()}`);

  // 3. invalid durations and prices never reach the API
  await page.locator('input[type="number"]').first().fill('1500');
  await page.locator('input[type="number"]').nth(1).fill('0');
  await page.locator('button:has-text("حفظ")').click();
  await page.waitForTimeout(1000);
  ok('a zero duration is refused', (await page.locator('text=أدخل مدة صحيحة').count()) > 0);

  await page.locator('input[type="number"]').nth(1).fill('12.5');
  await page.locator('button:has-text("حفظ")').click();
  await page.waitForTimeout(1000);
  ok('a fractional duration is refused', (await page.locator('text=أدخل مدة صحيحة').count()) > 0);

  await page.locator('input[type="number"]').first().fill('-5');
  await page.locator('button:has-text("حفظ")').click();
  await page.waitForTimeout(1000);
  ok('a negative price is refused', (await page.locator('text=أدخل سعرًا صحيحًا').count()) > 0);
  ok('the editor stays open while the input is invalid', (await page.locator('text=تعديل:').count()) > 0);

  // 4. deactivate and reactivate
  await page.locator('input[type="number"]').first().fill('1500');
  await page.locator('input[type="number"]').nth(1).fill('30');
  await page.locator('select').selectOption('0');
  await page.locator('button:has-text("حفظ")').click();
  await page.waitForTimeout(2500);
  ok('a price can be deactivated', (await row.locator('text=معطّل').count()) > 0);

  await page.locator('button:has-text("تعديل")').first().click();
  await page.waitForTimeout(400);
  await page.locator('select').selectOption('1');
  await page.locator('button:has-text("حفظ")').click();
  await page.waitForTimeout(2500);
  ok('a price can be reactivated', (await row.locator('text=مفعّل').count()) > 0);

  // 5. cancelling throws the edit away
  await page.locator('button:has-text("تعديل")').first().click();
  await page.waitForTimeout(400);
  await page.locator('input[type="number"]').first().fill('9999');
  await page.locator('button:has-text("إلغاء")').click();
  await page.waitForTimeout(800);
  ok('cancelling discards the edit', !(await priceCell()).includes('9.999'), `price=${await priceCell()}`);
} finally {
  await browser.close();
  await restore();

  const after = (await readCatalog(cookie)).find(
    (cell) => cell.subjectId === target.subjectId && cell.accessType === target.accessType,
  );
  ok(
    'seeded price restored',
    after?.price === target.price &&
      after?.durationDays === target.durationDays &&
      after?.isActive === target.isActive,
    `price=${after?.price} days=${after?.durationDays} active=${after?.isActive} (want ${target.price}/${target.durationDays}/${target.isActive})`,
  );
}

if (failures > 0) {
  console.error(`\nFAILED ${failures} admin pricing check(s)`);
  process.exit(1);
}

console.log('\nALL ADMIN PRICING CHECKS PASSED');
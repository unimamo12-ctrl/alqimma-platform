import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { unlink } from "node:fs/promises";
import { join } from "node:path";

const BASE = "http://localhost:3000";
let failures = 0;
const ok = (l, c, d = "") => {
  if (c) console.log(`  PASS  ${l}${d ? ` :: ${d}` : ""}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${l}${d ? ` :: ${d}` : ""}`);
  }
};

// a real 1x1 PNG, so the upload path is exercised for what it is
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const prisma = new PrismaClient();
const student = await prisma.student.findFirstOrThrow({
  where: { user: { email: 'test-all-access@alqimma.com' } },
  include: { user: { select: { email: true } } },
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.locator('input[type="email"]').fill(student.user.email);
await page.locator('input[type="password"]').fill("password123");
await page.locator('button[type="submit"]').click();
await page.waitForTimeout(2500);

await page.goto(`${BASE}/student/subjects`, { waitUntil: "networkidle" });
await page.waitForTimeout(1800);

// the SCIENCE card is the one without an existing subscription
const scienceCard = page.locator("div.rounded-2xl", { has: page.locator("h2", { hasText: "العلوم" }) }).first();
await scienceCard.locator('button:has-text("اشترك الآن")').nth(1).click();
await page.waitForTimeout(1000);

ok("the dialog offers a receipt upload", (await page.locator('text=صورة الوصل').count()) > 0);
ok("the picker is labelled as optional", (await page.locator('text=ارفع صورة الوصل').count()) > 0);

// attach the receipt
await page.locator('input[type="file"]').setInputFiles({
  name: "receipt.png",
  mimeType: "image/png",
  buffer: Buffer.from(PNG_1PX, "base64"),
});
await page.waitForTimeout(2500);

const preview = page.locator('img[alt="صورة الوصل"]');
ok("a preview of the receipt is shown", (await preview.count()) > 0);
const previewSrc = (await preview.first().getAttribute("src")) ?? "";
ok("the preview points at a local upload", /^\/uploads\/image\//.test(previewSrc), previewSrc);

// and submit
await page.locator('input[placeholder*="اختياري"]').fill("CCP-PROOF-1");
await page.locator('button:has-text("تأكيد الاشتراك")').click();
await page.waitForTimeout(2500);

const science = await prisma.subject.findUniqueOrThrow({ where: { name: "SCIENCE" } });
const sub = await prisma.subscription.findFirst({
  where: { studentId: student.id, subjectId: science.id, accessType: "VIDEO" },
  include: { payments: true },
});
const payment = sub?.payments?.[0];

ok("the subscription was created", Boolean(sub), sub ? sub.status : "missing");
ok("the payment is pending review", payment?.status === "PENDING", payment?.status);
ok("the reference is stored", payment?.transactionId === "CCP-PROOF-1", payment?.transactionId ?? "null");
ok(
  "the receipt path is stored on the payment",
  typeof payment?.proofUrl === "string" && /^\/uploads\/image\//.test(payment.proofUrl),
  payment?.proofUrl ?? "null",
);

// the admin has to be able to see it
const adminCookie = (
  await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@alqimma.com", password: "password123" }),
  })
).headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

const adminRes = await fetch(`${BASE}/api/admin/subscriptions`, { headers: { Cookie: adminCookie } });
const adminJson = await adminRes.json();
const adminRow = adminJson.data?.subscriptions?.find((s) => s.id === sub?.id);
ok("the admin list carries the receipt", adminRow?.payments?.[0]?.proofUrl === payment?.proofUrl, adminRow?.payments?.[0]?.proofUrl ?? "missing");

// the admin panel renders a clickable thumbnail
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" }).catch(() => {});
const adminPage = await (await browser.newContext({ viewport: { width: 1280, height: 1400 } })).newPage();
await adminPage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await adminPage.locator('input[type="email"]').fill("admin@alqimma.com");
await adminPage.locator('input[type="password"]').fill("password123");
await adminPage.locator('button[type="submit"]').click();
await adminPage.waitForTimeout(2500);
await adminPage.goto(`${BASE}/admin/subscriptions`, { waitUntil: "networkidle" });
await adminPage.locator('button:has-text("بانتظار التحقق")').click();
await adminPage.waitForTimeout(1500);

const thumb = adminPage.locator('img[alt="صورة الوصل"]');
ok("the admin sees a receipt thumbnail", (await thumb.count()) > 0, `${await thumb.count()} thumbnails`);
if ((await thumb.count()) > 0) {
  const href = await thumb.first().evaluate((el) => el.closest("a")?.getAttribute("href") ?? "");
  ok("the thumbnail opens the full image", href.startsWith("/uploads/image/"), href);
}

// a hand-crafted external URL must be refused
const bad = await fetch(`${BASE}/api/subscriptions`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: (await (async () => {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: student.user.email, password: "password123" }),
    });
    return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  })()) },
  body: JSON.stringify({
    subjectId: science.id,
    accessType: "EXERCISE",
    paymentMethod: "MOB",
    proofUrl: "https://evil.example/x.png",
  }),
});
ok("an external receipt URL is refused", bad.status === 400, `status=${bad.status}`);

await browser.close();

// cleanup
const proofUrl = payment?.proofUrl;
await prisma.payment.deleteMany({ where: { subscriptionId: sub?.id ?? "" } });
await prisma.subscription.deleteMany({ where: { id: sub?.id ?? "" } });
if (proofUrl) {
  await unlink(join(process.cwd(), "public", proofUrl.replace(/^\//, ""))).catch(() => undefined);
}
await prisma.$disconnect();

console.log(failures === 0 ? "\nRECEIPT PROOF CHECKS PASSED" : `\nFAILED ${failures}`);
process.exit(failures ? 1 : 0);
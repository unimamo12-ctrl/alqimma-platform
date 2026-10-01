import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = "http://localhost:3000";
const p = new PrismaClient();
let failures = 0;
const ok = (l, c, d = "") => {
  if (c) console.log(`  PASS  ${l}${d ? ` :: ${d}` : ""}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${l}${d ? ` :: ${d}` : ""}`);
  }
};

const math = await p.subject.findUniqueOrThrow({ where: { name: "MATH" } });
const level = await p.level.findFirstOrThrow();
const teacher = await p.teacher.findFirstOrThrow({ where: { user: { email: "teacher@alqimma.com" } } });

// one FREE session and one PAID session in the same subject
const freeCourse = await p.course.create({
  data: { teacherId: teacher.id, subjectId: math.id, levelId: level.id, title: "LOCK FREE", type: "FREE", isPublished: true },
});
const paidCourse = await p.course.create({
  data: { teacherId: teacher.id, subjectId: math.id, levelId: level.id, title: "LOCK PAID", type: "PAID", isPublished: true },
});
const freeLive = await p.liveSession.create({ data: { teacherId: teacher.id, courseId: freeCourse.id, title: "LOCK FREE LIVE", status: "LIVE", scheduledAt: new Date() } });
const paidLive = await p.liveSession.create({ data: { teacherId: teacher.id, courseId: paidCourse.id, title: "LOCK PAID LIVE", status: "LIVE", scheduledAt: new Date() } });

const email = `e2e-lock-${Date.now()}@alqimma.test`;
const user = await p.user.create({
  data: {
    email,
    password: await bcrypt.hash("password123", 12),
    role: "STUDENT",
    status: "ACTIVE",
    emailVerified: true,
    student: { create: { firstName: "E2ELock", lastName: "Student" } },
  },
  include: { student: true },
});

const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1280, height: 1100 } })).newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.locator('input[type="email"]').fill(email);
await page.locator('input[type="password"]').fill("password123");
await page.locator('button[type="submit"]').click();
await page.waitForTimeout(2500);

const card = (title) => page.locator('div.rounded-2xl', { has: page.locator('h2', { hasText: title }) }).last();

console.log("\n=== a student with no subscription at all ===");
await page.goto(`${BASE}/student/live`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

const freeCard = card("LOCK FREE LIVE");
const paidCard = card("LOCK PAID LIVE");

ok("the FREE session is listed", (await freeCard.count()) > 0);
ok("the PAID session is listed even without a subscription", (await paidCard.count()) > 0);

const freeText = (await freeCard.innerText()).replace(/\s+/g, " ");
const paidText = (await paidCard.innerText()).replace(/\s+/g, " ");
console.log("  free card:", freeText.slice(0, 90));
console.log("  paid card:", paidText.slice(0, 90));

ok("FREE offers انضم الآن", freeText.includes("انضم الآن"), freeText.slice(0, 60));
ok("FREE offers no subscribe button", !freeText.includes("اشترك لتنضم"));
ok("PAID offers اشترك rather than a join button", paidText.includes("اشترك لتنضم") && !paidText.includes("انضم الآن"), paidText.slice(0, 60));

console.log("\n=== clicking اشترك must open the right dialog ===");
await paidCard.locator('a:has-text("اشترك لتنضم")').click();
await page.waitForTimeout(2500);
ok("the subscribe dialog opened by itself", (await page.locator('text=إتمام الاشتراك').count()) > 0);
const dialog = (await page.locator("body").innerText()).replace(/\s+/g, " ");
ok("it is the LIVE cell of the right subject", /الرياضيات/.test(dialog) && /البث المباشر/.test(dialog), dialog.match(/الرياضيات[^ا-]*البث المباشر/)?.[0] ?? "not matched");
ok("both payment methods are there", dialog.includes("بريدي موب") && dialog.includes("موب"));

console.log("\n=== submitting it, then waiting for the admin ===");
await page.locator('input[placeholder*="اختياري"]').fill("LOCK-REF-1");
await page.locator('button:has-text("تأكيد الاشتراك")').click();
await page.waitForTimeout(2500);

const sub = await p.subscription.findFirst({ where: { studentId: user.student.id, subjectId: math.id, accessType: "LIVE" } });
ok("the request is pending", sub?.status === "PENDING", sub?.status);

await page.goto(`${BASE}/student/live`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
const pendingText = (await card("LOCK PAID LIVE").innerText()).replace(/\s+/g, " ");
ok("still locked while pending", pendingText.includes("اشترك لتنضم"), pendingText.slice(0, 60));

// admin approves
const adminRes = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@alqimma.com", password: "password123" }),
});
const adminCookie = adminRes.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const approved = await fetch(`${BASE}/api/admin/subscriptions/${sub.id}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: adminCookie },
  body: JSON.stringify({ action: "APPROVE" }),
});
ok("the admin approves", (await approved.json()).success === true);

await page.goto(`${BASE}/student/live`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
const afterText = (await card("LOCK PAID LIVE").innerText()).replace(/\s+/g, " ");
ok("after approval it offers انضم الآن", afterText.includes("انضم الآن"), afterText.slice(0, 70));
ok("and no longer offers اشترك", !afterText.includes("اشترك لتنضم"));

await b.close();

await p.attendance.deleteMany({ where: { sessionId: { in: [freeLive.id, paidLive.id] } } });
await p.liveSession.deleteMany({ where: { id: { in: [freeLive.id, paidLive.id] } } });
await p.payment.deleteMany({ where: { subscription: { studentId: user.student.id } } });
await p.subscription.deleteMany({ where: { studentId: user.student.id } });
await p.enrollment.deleteMany({ where: { studentId: user.student.id } });
await p.course.deleteMany({ where: { id: { in: [freeCourse.id, paidCourse.id] } } });
await p.student.deleteMany({ where: { id: user.student.id } });
await p.user.deleteMany({ where: { id: user.id } });
await p.$disconnect();

console.log(failures === 0 ? "\nLOCKED-CARD CHECKS PASSED" : `\nFAILED ${failures}`);
process.exit(failures ? 1 : 0);
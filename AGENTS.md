<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Local verification

Server must be running first (`npm run dev`, http://localhost:3000) because the
socket/websocket smoke tests and the browser E2E hit a live server.

- `npm run typecheck` — tsc, no output on success
- `npm run lint` — eslint, no output on success
- `npm run check:quality` — unit checks on the bitrate/frame-rate table
- `npm run check:ratelimit` — unit checks on how a client address is derived
- `npm run check:integrity` — asserts no row outlives or contradicts what it points at
- `npm run bootstrap:deploy` — apply migrations, repair the catalog, create a first admin if there is none
- `npm run e2e:bootstrap-deploy` — proves the above against a throwaway schema; needs a writable Postgres, so it is **not** in `verify`
- `npm run build` — runs `bootstrap:deploy` first; stop the dev server before, it rewrites `.next`
- `npm run verify` — typecheck + lint + check:quality + check:ratelimit + check:integrity + smoke + smoke:live + smoke:webrtc + e2e:live + e2e:recording + e2e:quiz + e2e:pricing + e2e:subs + e2e:auth + e2e:buy + e2e:receipt + e2e:freepaid + e2e:bootstrap + e2e:nocourses + e2e:locked + e2e:dark + e2e:dark-hover + e2e:sweep + cleanup:sessions

Test accounts all use password `password123`: `admin@alqimma.com`,
`teacher@alqimma.com`, `student@alqimma.com`.

Every test script self-cleans: only the live session, snapshots, and refresh tokens
that the run itself created are removed. `npm run cleanup:sessions` removes older
leftover test sessions. Never point cleanup at seeded or real sessions.

The browser E2E uses Chromium fake media, so it does not cover real camera/mic
permissions or `getDisplayMedia` prompts, and it cannot cover cross-network ICE.
Those need TURN (`NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USERNAME`,
`NEXT_PUBLIC_TURN_CREDENTIAL`) and a real two-device run.

# Subscriptions and payments

There are no bundles. Access is sold per subject per access type: a student buys
LIVE, VIDEO, or EXERCISE for one subject, and that purchase unlocks only that cell.
The catalog lives in `SubjectAccess` (one row per subject × accessType, with price
and duration). Admin manages it from `/admin/subscriptions` → "الأسعار".

The flow:

1. Student browses `/student/subjects`, picks a subject and an access type, and
   submits a payment method (Baridi or MOB) plus an optional transfer reference.
2. This creates a `PENDING` subscription and a `PENDING` payment. **Nothing is
   unlocked yet.**
3. Admin reviews pending requests at `/admin/subscriptions` → "بانتظار التحقق",
   confirms the money arrived, and approves. Approval flips the subscription to
   `ACTIVE` and the payment to `COMPLETED` in one transaction.
4. Only then does the content gate open.

Enforcement is in `src/lib/subscriptions/access.ts`. `requireAccess` is the guard
every content API calls; `accessibleSubjectIds` filters list endpoints so students
only see what they can actually open. The three content types are gated
independently: LIVE on `/api/live`, VIDEO on `/api/videos`, EXERCISE on
`/api/exercises`. A student with only LIVE access gets a 403 on videos and
exercises — that is the intended behaviour, not a bug.

### FREE and PAID courses

`Course.type` is `FREE` | `PAID` and is the teacher's decision, set in
`/teacher/courses`. It sits *above* the access type:

- **FREE** — any signed-in student opens it. No subscription, no payment, no
  admin approval.
- **PAID** — needs the subscription cell matching the content type being opened:
  the live room needs `LIVE`, a video needs `VIDEO`, an exercise needs `EXERCISE`.

Both kinds can sit in the same subject, which is the case that shapes the code. An
access filter written as `subjectId in allowed` cannot express it: it hides free
content from the very students it is free for. So `courseAccessFilter` returns one
`OR` — `{type: 'FREE'} OR {type: 'PAID', subjectId in allowed}` — and every list
endpoint uses it, and `requireCourseAccess` is the detail-route form of the same
rule. Both live in `access.ts` so a new content type cannot forget the FREE arm.

A teacher with **no** course is the cold-start path, and it was a dead end: every
content page needs a course picker, `/teacher/live` said "create a course first
from the control panel" when no page could create one, and the other three showed
an empty `اختر الدورة` dropdown with no explanation. All four now render
`NoCoursesNotice` (`teacher/_components/no-courses-notice.tsx`) *instead of* the
dropdown, with a button to `/teacher/courses`. `npm run e2e:nocourses` checks each
page gives a notice, a route out, no dead dropdown, and that the route out really
does create a course and unblock the teacher.

### Recording a broadcast

Only the host teacher may record: `start-recording`/`stop-recording` in `server.ts`
both check `canManage`, which is `role === 'ADMIN' || room.hostTeacherId === user.teacherId`.
A teacher in someone else's room gets a silent no-op. `POST /api/videos` checks
the same thing on the upload path, so the socket check is not the only gate.

**A finished recording is a draft, and the teacher publishes it.** `saveRecording`
takes a `publish` flag that defaults to false and the live room leaves it false,
so a finished broadcast reaches the students only after the teacher presses
"قبول ونشر" — they get to watch the take back first, and a bad recording is caught
before a class sees it. `POST /api/videos` likewise treats a recording as a draft
unless `isPublished === true` explicitly, so no caller inherits the behaviour by
accident.

The teacher keeps an "إخفاء" toggle afterwards, and `e2e:recording` walks the whole
round trip — draft → invisible to the student → published → visible → hidden →
gone → published again. That last leg is the only way to un-send a recording, so
it is asserted rather than assumed.

Note the trap this replaced: it *was* `publish: true` once, because the extra
click looked like friction. But "no publish button and no explanation" reads to a
teacher as "the recording failed", which is a worse outcome than one deliberate
click. `saveRecording` therefore reports `isPublished` back, and the live room
says what to do next: "تم حفظ التسجيل كمسودة — انشره من صفحة الفيديوهات".

Two paths then point at the same file: the session's `recordingUrl` (the replay
link in `/student/live`, gated on `isRecorded`) and the `Video` row (the entry in
`/student/videos`). Both are written by the same `POST /api/videos` call, so a
recording cannot end up in one and not the other.

`CourseType` was in the schema and accepted by the API while nothing read it, so a
FREE course still demanded a subscription. `npm run e2e:freepaid` covers it: a
student with nothing sees every FREE item and 403 on every PAID one, holding
`MATH:LIVE` opens the PAID live room but not the PAID video, FREE stays open
throughout, and flipping the flag takes effect on the next request.

Two consequences worth remembering:

- **Any script that creates a course to test gating must set `type: 'PAID'`.** The
  schema default is FREE, and FREE is open to everyone, so a default makes every
  gating assertion pass or fail for the wrong reason. `e2e:subs` and `e2e:buy` do
  this explicitly.
- **`npm run seed` forces the demo course back to `PAID`.** It used to default to
  FREE, which was harmless while nothing read the field; once FREE opened
  courses, the seed silently un-gated the whole platform.

The seeded `student@alqimma.com` holds **MATH:VIDEO only**, so it can never open
a broadcast: `/api/live` returns it no joinable session. `test-all-access@` and
`test-multi-subject@` are the accounts that hold an ACTIVE LIVE subscription.

### Locked broadcasts are listed, not hidden

A student browsing `/student/live` sees three kinds of card, decided server-side:

- **FREE course** → "انضم الآن";
- **PAID course, LIVE held** → "انضم الآن";
- **PAID course, LIVE not held** → listed, locked, with "اشترك لتنضم".

The third case used to be filtered out. That was safe and useless: the student
could not tell a broadcast existed, so there was nothing to sell. `GET /api/live`
now sends `hasAccess` per session and the card renders the right action, so a
locked card can never present a join button that 403s.

Two consequences to keep in mind:

- **A PAID session is only offered as lockable when its subject's LIVE price cell
  is active.** A deactivated cell makes subscribing impossible, so showing the
  card would be an offer with no way to act on it.
- **"listed" is not "granted".** Any test that asserted a PAID session is *absent*
  from a student's list is now asserting the wrong thing and must assert
  `hasAccess === false` plus a 403 on the detail route instead. `e2e:subs`,
  `e2e:buy` and `e2e:freepaid` all check joinability, not list length.

The locked card links to `/student/subjects?subject=<id>&access=LIVE`, and that
page derives the subscribe dialog from the query string during render rather than
from an effect — the URL and the loaded catalogue are inputs, not events, and the
dialog closes on its own once the cell reads as subscribed after the reload.

Because the gate is silent, a teacher broadcasting into an empty room cannot tell
"nobody came" from "nobody is allowed to come". `GET /api/live/audience?courseId=`
answers that before the broadcast starts, and the create form in
`/teacher/live` shows the eligible count, their names, and a warning when it is
zero. Its `eligibleCount` uses the same predicate as `/api/live`
(ACTIVE + unexpired LIVE subscription for the course's subject), so it must never
be widened — `e2e:live` asserts every student in the audience can open the
session and that a student outside it is refused. A deactivated `SubjectAccess`
LIVE cell is reported separately as `livePriceActive`, because it blocks *new*
subscriptions without invalidating the ones students already hold.

Payment methods are `BARIDI` (BaridiMob / CCP transfer) and `MOB` (mobile payment).
Both require manual admin verification; there is no automatic payment confirmation.

### Receipt photo

`Payment.proofUrl` holds a picture of the transfer receipt the student attaches
when requesting a subscription, and the admin panel renders it as a thumbnail that
opens the full image. BaridiMob and MOB are both manual, so the reference number
alone leaves the admin guessing.

- **It is uploaded before the subscription exists**, through
  `POST /api/subscriptions/proof`, and the returned URL is then sent with
  `POST /api/subscriptions`. That endpoint is student-only and always
  `kind=image`, so it reuses the storage helpers without opening `/api/uploads` to
  students — that route is teacher/admin, and admitting them would let any student
  push arbitrary images into the platform. It also keeps the 10MB image cap instead
  of the video/document ones.
- **`proofUrl` is only accepted as `/uploads/image/<name>`.** Same rule the quiz
  image fields use, and for the same reason: without it the column is an open
  proxy that makes the admin panel fetch an arbitrary host and leaks its IP.
  `e2e:receipt` asserts a hand-crafted `https://…` is refused with a 400.
- **A failed upload must not block the purchase.** The receipt is optional: on
  error `proofUrl` stays empty, the error is shown, and the subscription still
  goes through on the reference alone.
- **Watch for the field being stripped on the way out.** Both admin endpoints
  hand-pick payment fields, and a `proofUrl` missing from that list compiles
  cleanly and simply renders no receipt. It failed exactly that way once.
- The dialog clears the receipt on close, or a half-finished upload would follow
  the student to the next cell they subscribe to.

### Every cell is independent

One cell is one `(student, subject, accessType)` row, and `Subscription` carries
`@@unique([studentId, subjectId, accessType])`. Nothing grants a neighbouring cell,
in either direction. `npm run e2e:subs` proves all of it, and is the place to add
a case if this is ever extended:

- Same subject, different type: `MATH:LIVE` serves no video and no exercise, and
  both are `403` when opened directly.
- Different subject, same type: `MATH:LIVE` does not reveal a `PHYSICS` session.
- Two cells side by side: `MATH:LIVE` + `PHYSICS:VIDEO` each work, and the video
  list contains the physics video and not the math one.
- Expiry is per cell: an expired `MATH:VIDEO` does not close `MATH:LIVE`, and is
  itself not served.
- `PENDING`/`REJECTED` grant nothing, including on a direct URL.
- Approval is per cell: approving `MATH:LIVE` leaves a `PHYSICS:LIVE` sibling at
  `REJECTED`, settles only the approved payment, and invents no payment for the
  sibling.
- The unique index is what stops a second purchase of a held cell; the insert must
  throw, not create a duplicate entitlement. `POST /api/subscriptions` also checks
  first and answers `409` with a reason, so a duplicate is a message rather than a
  raw unique-violation or a 500.

`npm run e2e:buy` covers the same journey through the UI a student actually uses:
`/student/subjects` → the "اشترك الآن" dialog → Baridi or MOB plus an optional
reference → `PENDING` unlocking nothing → the student's own subscriptions page →
`409` on a repeat purchase → admin approval → and the bought cell opening while
its siblings stay shut. It builds its own student and its own MATH content and
removes both.

Two traps in that script worth not re-learning:

- Do **not** pick the cell under test by indexing the flat list of "اشترك الآن"
  buttons. It silently buys whichever subject sits in that slot, and every later
  assertion is then about a cell the student never bought — which reads as a gate
  failure. Locate the subject `Card` by its heading instead.
- The payment buttons' accessible names include their hint, so the MOB option is
  "موب دفع بالهاتف". `getByRole('button', { name: 'موب', exact: true })` finds
  nothing and `has-text("موب")` also matches "بريدي موب"; use `/^موب/`.

Assertions there are by **session/video id, never by count**. The seeded database
already contains MATH live sessions and videos, so counting tests the seed and
passes even when the gate leaks.

`scripts/e2e-subscriptions.mjs` cannot import `hashPassword` from the app: it
lives behind the `@/` alias, which plain node does not resolve. It calls
`bcryptjs` at 12 rounds instead, matching `SALT_ROUNDS`.

### Editing a price

`/admin/subscriptions` → "الأسعار" edits `SubjectAccess`. Two defects made a correct
save look like it did nothing, both now covered by `npm run e2e:pricing`:

- **A successful save must patch the table from the server's response.** Nothing
  refetched the catalog, so the table kept rendering the old price and the admin
  re-edited the same value. Any list that is written to must refresh from the
  write result, not from a cached fetch.
- **`z.coerce.number()` maps `''` to `0`, which passes `.min(0)`.** Clearing the
  price box to retype it therefore saved 0 دج and made the subject free without
  any warning. Both numeric fields are `z.preprocess`ed so a blank string becomes
  `undefined` and fails validation, and the client refuses to submit an empty
  price, a 0/fractional duration, or a negative price.
- The editor renders *above* the table. It used to sit below it, so on a long
  catalog clicking تعديل appeared to do nothing at all.
- Deactivating a cell is reachable from the editor only. There is no separate
  toggle, and `isActive` must be sent back on every price write or a price edit
  would silently re-enable a cell the admin had disabled.
- `npm run seed` forces `SubjectAccess.isActive` back to `true` (and
  `Course.isPublished` likewise). A test that deactivates a cell must not be able
  to leave one invisible *and* blocking every new subscription for it.

# Quizzes

Lifecycle is `DRAFT → PUBLISHED → AVAILABLE → IN_PROGRESS → COMPLETED → EXPIRED →
ARCHIVED`, but only `DRAFT`, `PUBLISHED` and `ARCHIVED` are ever stored. The rest
are derived on every read by `resolveQuizStatus` (`src/lib/quiz/status.ts`) from the
`opensAt`/`closesAt` window plus the attempts, so a quiz expires by itself and needs
no background job.

Invariants worth keeping when changing this area:

- The stored status is never trusted from the client. Publication state, window,
  enrolment and attempt count are re-checked server-side in `beginAttempt`,
  `recordAnswer` and `finalizeAttempt`.
- The answer key (`isCorrect`, `modelAnswer`, `matchValue`) only crosses to the
  teacher. `src/lib/quiz/types.ts` is the allow-list for everything the browser
  receives; student payloads go through `toStudentQuestion`.
- `finalizeAttempt` claims the attempt with a compare-and-set inside the
  transaction, so submit racing the deadline produces exactly one grade.
- `computeGrade` treats a stored teacher verdict as authoritative. Without that, a
  manually graded answer would be reset to `PENDING_REVIEW` on every recompute and
  manual correction could never finish.
- A student who already has an attempt keeps their `QuizAssignment` row forever, so
  reassigning or archiving a quiz can never orphan a result or a report row.
- Questions freeze on the **first attempt**, not on publication. A quiz that is
  already handed out but untouched by any student stays fully editable, so a
  teacher can still add a missing question after publishing. The check lives
  inside `writeQuizDraft`, which throws 409 rather than silently dropping the
  new questions, and the teacher editor unlocks itself on
  `storedStatus === 'ARCHIVED' || (!isDraft && attemptCount > 0)`.
- `replaceAssignments` computes its `already` set from the rows that survived the
  delete, not from every pre-existing row. Reading it from the full set makes a
  still-selected student look already-assigned, so their row is deleted and
  never recreated and one save would unassign the entire class.
- Students must be enrolled in the quiz's course to be targeted; `courseWide`
  expands to the whole roster and is then stored as explicit rows.
- `AVERAGE` aggregates across graded attempts in `buildStudentResult`; it does not
  just display the last one.
- Answers are revealed only when `showCorrectAnswers` is on **and** no assigned
  student can still continue (`counts.openStudents === 0`) or the window is closed.
- Unanswered questions are counted separately from wrong ones; unanswered is never
  silently graded as incorrect.

## Pictures on questions and options

A `QuizQuestion` and a `QuestionOption` both carry a nullable `imageUrl`, and
either may be text-only, picture-only, or both. Related decisions worth keeping:

- `text` stays non-nullable. A picture-only question stores `''`, so every reader
  that renders `text` can keep treating it as a plain string and only has to ask
  whether there is something to show.
- Validation accepts an empty `text` **only** when `imageUrl` is present, and
  rejects an option that has neither. That check is what keeps a question from
  being saved as a blank card.
- `imageUrl` is only ever accepted as `/uploads/image/<file>`: an absolute or
  protocol-relative URL is refused, so a quiz cannot be used to make a teacher's
  browser fetch an arbitrary host (or to smuggle a `javascript:` URL into the
  result page). Uploads go through the existing `POST /api/uploads` with
  `kind=image`, which is teacher/admin only and caps the file at 10MB.
- `imageUrl` is safe to send to students and belongs in the browser allow-list in
  `src/lib/quiz/types.ts`, unlike the answer key.
- In the attempt page the whole option row is the click target, so a picture
  option is answerable without hitting a small radio. "Next" stays a separate
  control on purpose: navigating automatically would discard an in-progress
  answer on slow connections.
- Stored under `public/uploads`, which is fine for one node but not for a
  multi-instance deploy. Moving to object storage means only the value shape in
  the validator and the `ImagePicker` need to change.

## Sign-up and sign-in

Two bugs here were user-visible and neither threw a stack trace, so
`npm run e2e:auth` covers both.

- **Never return a ZodError's own `message` to a page.** It is the serialised
  issue array, and the register and change-password pages render `message`
  verbatim — so a student who mistyped the password confirmation saw
  `[ { "code": "custom", "path": ["confirmPassword"], "message": "كلمتا المرور غير متطابقتين" } ]`
  instead of the sentence. Both routes now go through `parseBody`
  (`src/lib/validation/quiz.ts`), which returns the first issue's message.
- **Never identify a failure by its Arabic wording.** The login route tested
  `message.includes('غير صحيحة')` to mean "wrong password", so a *suspended*
  account missed that branch and was answered with **HTTP 500** — an ordinary
  outcome reported as a server fault, and a status the client reads as "retry
  later" instead of "this account is disabled". `loginUser` now throws
  `AuthError` with a `code` (`INVALID_CREDENTIALS` | `ACCOUNT_INACTIVE`), and the
  route branches on the code: 401 wrong password, 403 disabled, 5xx only for a
  genuinely unexpected failure.
- A too-short password is a **malformed request (400)** and never reaches the
  credential check. That is correct, and it means such an attempt does not count
  against the rate limit — worth knowing before writing a test with a 4-character
  "wrong password" and concluding sign-in returns 400.

Registration is student/teacher only and cannot create an admin by design;
`scripts/create-admin.mjs` exists because an operator still needs one, and a
deployment that never ran `npm run seed` otherwise has no way in at all.

## Two defaults that failed open

Neither of these was reachable through the UI tests, and neither is a
hypothetical: both were live in this repo. They share one shape — a condition
that reads as a safety check but whose *permissive* branch is the one that runs.

### A rate-limit key the client chooses

`clientIp` used to read `X-Forwarded-For` and take `split(',')[0]`. That element
is the one the *client* picked, because the header is **append-only**: a proxy
adds the address it saw to the end of whatever arrived. So the list looks like
`"<anything the client chose>, <real client ip>"`, and element `[0]` is
attacker-controlled. A fresh header per request meant a fresh bucket per
request, measured at 12 consecutive guesses against the password-only admin gate
with no lockout at all.

- **Take the rightmost entry** — the one the nearest trusted proxy appended —
  falling back to `x-real-ip` for an edge that rewrites rather than appends.
  `npm run check:ratelimit` pins the parsing, including the empty-header and
  no-header cases that would otherwise yield a `""` or shared key.
- **The honest limit is behind that fix.** With no proxy in front, the header is
  whatever the client typed and *no* element is safe; the limiter then degrades
  to one shared bucket, which is noisy but fails closed. Do not describe it as
  spoof-proof without a proxy in front of it.
- **The gate had a second, private copy of the limiter.** `panel-access` kept its
  own `Map` and its own leftmost-element parser, so it was vulnerable
  independently of the shared helper and a fix to one would not have reached the
  other. It now calls `checkLimit` / `clearLimit` / `clientKey` like every other
  route, which also bounds that map's growth under an address spray.
- Still per-process, so it resets on restart and does not coordinate across
  instances. A multi-instance deploy wants this in the database or a shared
  cache. Same for the login route's bucket.

### A reset token in the response because `NODE_ENV` was unset

`forgot-password` returned the working `resetUrl` in its JSON when
`process.env.NODE_ENV !== 'production'`. On a container platform `NODE_ENV` is
frequently *unset*, and `'production' === undefined` is false, so the condition
is **true** — the response handed back a live token for any address on the
platform, which is account takeover rather than a development convenience. It
also meant the flag protected nothing on a staging deploy with `NODE_ENV=staging`.

- It is now **opt-in** via `ALLOW_INSECURE_DEV_RESET === 'true'`, and the whole
  branch is inert once `PASSWORD_RESET_WEBHOOK_URL` is set, because a configured
  webhook is then the real delivery path.
- With neither set, the response is the same generic Arabic message for every
  address — no token, no indication of whether the account exists.
- Assert the *absence* of the field, not just the `200`: the message and the
  status are identical in both cases, so a status-code test cannot tell the
  secure response from the leak.
- `PASSWORD_RESET_SECRET` falls back to `JWT_SECRET`, which is convenient and
  means resetting a secret can silently invalidate every session — set the
  dedicated variable on a real deployment.

## A deployment that has to work by pressing Deploy

`npm run build` runs `scripts/deploy-bootstrap.mjs` before `next build`, so a
deployment with an empty database becomes usable without opening a shell. That
state is not hypothetical: `alqimma-platform.onrender.com` answered
`/api/subjects` and `/api/levels` with `[]`, had no admin, and had no way in from
the browser — `/api/auth/register` only accepts STUDENT and TEACHER on purpose.

It runs three things, and **every one of them is safe to run on every deploy**,
which is the only property that makes putting it in the build acceptable:

1. `prisma migrate deploy`, through `node node_modules/prisma/build/index.js`
   rather than `npx prisma` — `npx` is `npx.cmd` on Windows and `execFileSync`
   cannot run a `.cmd` without a shell, so the `npx` form fails locally and works
   on Render. A failed migration fails the build on purpose: an app on a schema it
   does not match turns every query into an unreadable 500.
2. `seedCatalog(prisma, { force: false })`, **only if the catalog is empty**.
3. Create an admin **only if the platform has no admin at all**.

### The two traps, both of which would have shipped

- **`create-admin.mjs` is an upsert.** Wiring that into a build would silently
  reassign the admin's password on *every* deploy, so an operator changes their
  password and it reverts a few days later with no trace. The bootstrap creates an
  account only when none exists, and an account that already exists keeps its
  password — including when `ADMIN_EMAIL` names a different address, which must
  not promote or reset anything.
- **`seedCatalog`'s `force: true` is right for a fixture and wrong here.** It
  rewrites `SubjectAccess.isActive`, so on a deploy it would reactivate every
  price cell an admin had deliberately switched off. `force: false` creates what
  is missing and leaves the rest alone. `e2e:bootstrap-deploy` asserts exactly
  this: it disables a cell, redeploys, and requires it to still be disabled.

### The password has to reach the operator somehow

`ADMIN_PASSWORD` is used when set. When it is not, one is generated and **printed
once** into the deploy log, which only the dashboard owner can read. Requiring the
variable would be stricter, but it turns a working deploy into a failed one over a
missing env var, and `password123` is not an acceptable fallback — it is the
documented test password for 18 scripts, so a deployment that defaulted to it
would publish a known credential.

`SKIP_BOOTSTRAP=1` opts out for a lint-only CI job, and a build with no
`DATABASE_URL` skips the database work rather than failing.

### `.env.example` has to be un-ignored

`.gitignore` used to hold `.env*`, which also matched `.env.example`. So the
committed template could never be committed, a fresh clone had nothing to copy,
and every variable had to be rediscovered from the source. It is now negated
explicitly, while the real `.env` stays ignored.

## Data integrity

`npm run check:integrity` is in `verify` and asserts the things a cascade cannot
guarantee. Relations with a non-nullable foreign key cannot orphan — the
database rejects the delete — so checking them would be theatre. What *can* rot
is anything held in a plain column, which is exactly where the dead quiz
notifications came from:

- **notification `link` is a string**, so nothing enforces the target exists.
  Every `notification` is parsed against the routes the app actually serves and
  the target looked up. This is the check that found the three notifications
  pointing at a deleted quiz.
- **`isRecorded: true` with no `recordingUrl`** — a replay link that resolves to
  nothing.
- **a published video inside an unpublished course** — unreachable, because both
  flags are checked and the course hides the video.
- **an `ENDED` session with no `endedAt`**, and **`ACTIVE` subscriptions outside
  `startDate`/`endDate`** — status that contradicts the row's own dates, which is
  exactly what the access gate trusts.
- **the foreign keys themselves**, via four `LEFT JOIN` counts, so a broken one
  shows up as a deleted parent rather than as a mystery.

Write the check so it can fail. An integrity script whose queries are all valid
and whose filters match nothing reports clean forever, which is worse than no
check because it reads as coverage.

## The catalog, and platforms that were never seeded

A course needs a subject *and* a level, and both were **read-only** until this was
fixed: `/api/subjects` and `/api/levels` had a GET route and nothing else, and no
UI anywhere created them. So a deployment whose database never ran `npm run seed`
had an empty catalog and no way out of it from the browser — `/teacher/courses`
rendered two permanently empty dropdowns that could not be submitted, and the only
fix was a shell. That is exactly the state
`alqimma-platform.onrender.com` was in: `/api/subjects` and `/api/levels` both
returned `[]`.

- **`POST /api/admin/subjects`, `POST /api/admin/levels`** (admin-only) and the
  matching `DELETE`s. A subject is created together with its three
  `SubjectAccess` price cells, because a subject with no prices has nothing a
  student can buy — it looks configured and is unusable. The `name` is latin and
  unique because it is the join key everywhere else (`Course.subject.name`,
  `Teacher.subjects`, the seed).
- **Deletion refuses while anything references it** (`409`), naming the count. A
  course is a teacher's work and a subscription is a student's money; cascading
  either destroys real data. Deleting a subject also removes its price cells,
  which have no meaning without it.
- **The admin "المواد والمستويات" tab is the default view** of `/admin/content`,
  since on a fresh deployment it is the only tab that can do anything.
- **The teacher's form refuses to pretend.** With an empty catalog it renders an
  explanation and a link, not two dead dropdowns.
- **`npm run e2e:bootstrap`** covers the whole path. It fakes the empty catalog by
  *intercepting* the two GETs rather than wiping the real rows — wiping would
  orphan the seeded course — then adds a subject and a level through the UI,
  creates a course against both, and checks the delete guards.
  `scripts/seed-catalog.mjs` restores just the catalog and nothing else.
## Dark mode

Class-based, toggled in the navbar and in the mobile drawer, persisted under
`alqimma-theme` in localStorage, defaulting to the OS preference.

- **The variant is declared, not configured.** Tailwind 4 dropped v3's
  `darkMode` key, so `@custom-variant dark (&:where(.dark, .dark *))` sits at the
  top of `globals.css`. It is class-based rather than `prefers-color-scheme`
  because a visitor who picks light on a dark-mode OS must be believed.
- **The theme is the class on `<html>`, not React state.** `ThemeProvider` reads
  it back through `useSyncExternalStore` and writes it with a class toggle.
  Deriving it in state would need a `setState`-in-effect, which the repo's lint
  rules reject, and would also desync from what the inline script already did.
- **The inline script in the root layout is what prevents a flash.** Any effect
  runs after the browser has painted the light page. It reads the same
  localStorage key and sets the class while the document is still parsing.
- **It writes the class and nothing else.** Setting `style.colorScheme` from the
  script put an inline style on `<html>` before hydration, and React reported a
  hydration mismatch on every load. `color-scheme` comes from `.dark` in
  `globals.css` instead, which is the only reason it works at all.
- **`suppressHydrationWarning` on `<html>` is load-bearing.** React owns that
  element's `className` and the no-flash script adds `dark` to it before
  hydration, so React compares its own JSX (no `dark`) against the DOM it finds
  (with `dark`) and logs a hydration error on every page load. Both halves of the
  no-flash requirement cannot be met without it: the class must be set before
  paint, and React cannot know the visitor's stored choice. Putting the class on a
  wrapper instead does not work either — `color-scheme` and the body background
  both have to react to the mode.
- **The mismatch only appears when dark mode is already the stored choice.** A
  fresh session gets no class, so a naive run reports clean while a dark-mode user
  sees the error. `e2e:dark` therefore re-navigates with the preference persisted
  and asserts on console output; the rest of `verify` cannot see this by
  construction.
- **`scripts/add-dark-variants.mjs` generated the variants**, and its two rules
  are worth keeping if it is ever re-run: tokenise each string by whitespace and
  map whole tokens (`bg-gray-50` must not match inside `bg-gray-500`), and map the
  *static spans* of a template literal rather than skipping it. The first version
  skipped templates entirely and left every component that interpolates its
  className light — including the shared `Card`, so most of the app.
- **The class-list detector has to allow a variant prefix.** `looksLikeClassList`
  originally only recognised a string whose *first* colour token was unprefixed,
  so `className="hover:bg-gray-50"` was skipped entirely. Those are table-row
  hover states: unmapped, hovering a row in dark mode painted it `rgb(249,250,251)`
  under near-white text and the row vanished under the cursor. That is the shape
  the "the text and the numbers don't show" report actually had.
- **Hover needs its own map entries, not the base rule.** A hover must end up
  *lighter* than the surface under it; reusing `bg-gray-50 -> slate-900/60` on a
  `slate-900` card produces the identical colour and the row stops responding to
  the pointer. `VARIANT_MAP` is matched on the whole token before the base map.
- **`npm run e2e:dark-hover` drives a real pointer.** A DOM sweep cannot see a
  `:hover` state, so the hover half of the bug was invisible to `e2e:dark`. It
  asserts WCAG AA (4.5) on the hovered row *and* that the backdrop is not
  near-white. The AA bar matters: the unmapped bug measures 2.99 on the first
  text node, so a looser threshold waves it through.
- **Resolve computed colours by painting them, not by parsing them.** Chromium
  returns `oklab()`/`lab()` for many values, so an `rgb()`-only regex yields
  `null` for exactly the dark-mode colours under test, and the measurement
  silently reports nothing to check.
- **Opacity is part of a token, and that applies to translucent surfaces too.**
    `bg-slate-50/60` is not `bg-slate-50`, so a plain map lookup misses it — which
    is what left the homepage stat cards on a near-white 60%-alpha background with
    near-white numbers on top, reported as "the text and the numbers don't show".
    Strip the alpha, look up the base, re-attach it. Re-attaching blindly writes
    `bg-slate-900/60/60`, which is not a class, so the mapped value's own alpha has
    to be stripped first.
  - **Re-running the codemod leaves a stale sibling behind.** A token mapped before
    `VARIANT_MAP` existed keeps its old `dark:` value beside the new one, and the
    last one in the attribute wins. Both `dark:hover:bg-slate-800
    dark:hover:bg-slate-900` and `dark:bg-slate-800/60 dark:bg-slate-900/60` came
    from this. Sweep for a doubled `dark:` on one line after every run.
  - **The `e2e:dark` audit could not fail when it was first written.** It parsed
    computed colours with an `rgb()` regex, and Chromium returns `oklab()` for most
    of them, so it matched nothing and reported "clean" while a white card sat on a
    black page. It now resolves each colour by painting it onto a canvas and
    reading the pixel, and composites translucent layers down to something opaque
    rather than skipping anything under 60% alpha. A check that cannot fail is
    worse than no check, because it reads as coverage.
  - **Decorative specks are exempt** from that audit — under ~700px² and rendering
    no text — because a 6x6 `bg-emerald-500` online dot and the white ring on an
    avatar badge are meant to stay bright. Flagging them trains the reader to
    ignore real findings.
  - **`npm run e2e:dark` is what catches a forgotten variant.** It forces dark mode
    and walks every page looking for opaque light backgrounds. Reading colours
    needs to handle `oklab()`/`lab()` as well as `rgb()`, because Chromium
    serialises modern colours that way and an `rgb()`-only parse reports them all
  as "not dark". Elements with an inline background are skipped: the subject
  colour strip is deliberately the brand colour in both modes.
## Crawling for errors instead of guessing URLs

`npm run e2e:sweep` walks the app's **real** navigation graph — it starts at `/`
and follows the links the app renders — as each role, in light and dark, and
fails on any console error, uncaught exception, failed request, 4xx/5xx response
or broken image. Around 184 page visits.

It replaced a hand-written route list, and that is the point. The list reported
two "errors" that were both its own mistakes: a 403 on a live session owned by a
*different* teacher (correct authorization) and a 404 on a URL nothing in the app
links to. Guessing URLs finds the sweep's bugs, not the app's. Crawling cannot
report a page the product does not expose.

Its first real finding was three notifications linking to a deleted quiz, so
clicking them 404'd. `DELETE /api/quizzes/[id]` now removes those notifications in
the same transaction as the quiz — publishing writes one per assigned student, and
the notification row is the only record that the target ever existed, so nothing
else would ever tell a student to stop following a dead link.

Two things are deliberately exempted, both narrowly:

- the signed-out session probe (`/api/auth/me`), which is how the public pages
  decide to render a sign-in state;
- a 401 from `/api/live` **for the public role only**, because the public live
  page probes that endpoint and renders a sign-in state on 401.

Both are scoped rather than pattern-matched, so widening them to "any 401" would
hide the thing the sweep exists to catch.
## Live video quality

Every quality decision lives in `src/lib/webrtc/media-quality.ts`. Before this
existed, `getUserMedia({ video: true })` plus a bare `addTransceiver` left all of
it to the browser, which meant a 640x480 capture, no bitrate ceiling, and no
signal that a shared screen was text. The camera is now captured at **1080p60**
and the screen at **1080p30**, each sent under a per-resolution bitrate ceiling
that scales with the frame rate the source actually delivers.

- Constraints are `ideal`, never `exact`. `exact` makes `getUserMedia` reject
  the whole call when the camera cannot hit the number, turning a slightly softer
  video into no video at all — so a 720p-only laptop still joins at 720p instead
  of failing to publish. Screen share adds `max` because a 4K desktop
  downscaled by the browser's own scaler beats 4K shipped at lecture bitrates.
- **`encoding.maxFramerate` is the ceiling that actually applies to the frame
  rate.** Raising `frameRate` in `CAMERA_CONSTRAINTS` without touching it does
  nothing useful: the capture really is 60fps and the encoder then discards half
  of it at the sender, so you pay 60fps of capture bandwidth and CPU for a 30fps
  stream. It is set to the *reported* rate clamped to `FRAME_RATE_CEILING` rather
  than to a constant, because a constant only ever errs in one direction that
  matters — it silently caps a 60fps source back to 30.
- Frame rate is requested with `max` at 60. A 120fps capture would be downscaled
  to 60 by the encoder anyway, so asking for it costs capture bandwidth and
  sensor heat for nothing. Keep the request and `FRAME_RATE_CEILING` equal, or
  one of the two is dead policy.
- The bitrate table is quoted at 30fps and multiplied by `HIGH_FPS_MULTIPLIER`
  above it, because halving the frame interval does not halve the bits a frame
  needs. A 60fps stream held to the 30fps ceiling does not look like 60fps, it
  looks like a soft 30fps stream paying double for the privilege. Scale the whole
  table, not just the 1080 row — a 720p60 laptop is the case that would otherwise
  quietly lose quality. `npm run check:quality` pins every tier on both sides of
  the boundary, because the browser E2E cannot: Chromium's fake device reports
  20fps, so it never enters the high-fps branch and could not tell a correct
  60fps ceiling from a forgotten one.
- An unreported frame rate is treated as 30, not 60. That fallback runs before a
  track reports its settings, and defaulting upward would hand every early sender
  60fps pricing; the next `applySenderQuality` corrects it.
- Screen share stays at 30fps on purpose. Shared content is text and diagrams
  where extra frames carry almost no information, and `maintain-resolution`
  already sheds frame rate before it sheds sharpness. 60fps on a screen costs
  9 Mbps instead of 4.5 Mbps for a difference nobody sees on a slide.
- Bitrate values are **ceilings, not targets**. Chrome's bandwidth estimator
  still lowers the actual rate on a congested link, but a ceiling that is too
  low permanently caps a good connection. Screen share gets more at every tier
  because it is mostly edges and text, which are what break first. The
  unknown-resolution fallback is deliberately the *top* tier: it is only reached
  before a track reports its settings, and a ceiling set too low there sticks
  after the real resolution becomes known.
- **The first ~25 seconds of a stream look bad and then get good.** Chrome
  starts the encoder low and climbs: measured here at 480x270 → 640x360 →
  960x540 → 1280x720 → 1920x1080, reaching full resolution around t+27s with
  `qualityLimitationReason` flipping from `bandwidth` to `none`. It ramps in
  plateaus, so a resolution can sit still for ten seconds and then step. This is
  not fixable from JavaScript, but it is also why the E2E polls for the target
  resolution rather than looking for "the size stopped changing" — a stability
  heuristic declares the first plateau settled and fails halfway up the ramp.
- The two sources get opposite `degradationPreference` values and this is
  deliberate: `maintain-resolution` on a screen keeps a lecture readable at
  15fps, while `maintain-framerate` on a camera keeps a talking head smooth
  because judder reads as a dropped connection and a soft image does not.
- `contentHint` must be set on the *track*: `detail` for screen, `motion` for
  camera, `speech` for audio. Without `detail` a shared slide is encoded as if
  it were a face. Now that camera and screen are both 1080p, this tag is also
  the only way to tell the two sources apart — no size comparison can.
- `applySenderQuality` takes the source resolution as an argument on purpose.
  `replaceTrack` is async, so reading `sender.track.getSettings()` right after
  it still returns the *previous* track, which silently sizes the ceiling for
  the wrong source.
- The source kind is carried in `localKindRef` and passed explicitly. It cannot
  be sniffed off the stream: both a camera stream and a screen stream have a
  video track, so any "does it have video" test answers `screen` for both.
- Constrained-baseline H.264 is ranked **below** VP8 and VP9 on purpose. It is
  what WebRTC defaults to, it is level 3.1, and it cannot carry 1080p — Chrome
  clamps the outgoing resolution to the negotiated profile. High and Main
  profile H.264 are ranked first, where they are hardware-encoded and cheap.
- `degradationPreference` is written to the encoding with a local cast: the
  TypeScript DOM lib this project compiles against still declares it on
  `RTCRtpSendParameters`, but browsers read it from the encoding.
- Muting touches the microphone track specifically. While sharing, the outgoing
  stream is the screen's, so toggling that stream's audio only ever affected
  system/tab sound and left the teacher's voice live. For the same reason the
  outgoing audio track comes from the camera stream, not the outgoing one.

TURN is optional in code and effectively mandatory in practice: STUN cannot
traverse a symmetric NAT, a corporate firewall, or two NATs in series, and that
failure looks like "the stream is bad" rather than "the stream is absent".
`NEXT_PUBLIC_TURN_URL` takes a comma-separated list so UDP and TCP fallbacks can
be offered together. Those values are inlined at build time, so changing them
needs a full `npm run dev` restart. There is no credential rotation, so a
static credential ships in the client bundle — use a time-limited HMAC endpoint
before exposing this publicly. The teacher header shows a "TURN غير مضبوط"
badge whenever the variable is empty.

**1080p60 does not scale to a large class on this topology.** It is a full mesh,
and each peer connection gets its own encoder, so the teacher's uplink is roughly
`N x 8.4 Mbps` — about 84 Mbps at ten students and 168 Mbps at twenty, which no
school connection sustains. Past a couple of students the bandwidth estimator
will collapse every stream to a low layer, and because the policy is
`maintain-framerate` for the camera, what gives way first is *resolution*: 60fps
of a 480x270 blur. That is worse than the 720p30 it replaced, and it is the
failure mode to expect first on a real classroom uplink. The mesh only holds
1080p60 for a handful of students on a good connection.

Scaling it properly needs an SFU. Failing that, the cheap mitigations in
priority order are: step `HIGH_FPS_MULTIPLIER` and the tiers down as the peer
count grows, and drop the camera to `maintain-resolution` once the peer count
passes a threshold so congestion costs smoothness instead of legibility. Neither
is implemented, so the only current control is `NEXT_PUBLIC_*`-free: edit
`media-quality.ts`.

What is still missing, in the order it would bite:

- Nothing calls `getStats()`, so there is no instrumentation and no adaptive
  bitrate. The numbers above are a static policy, not a feedback loop.
- ICE candidates that arrive before `ensurePeer` has run are dropped rather
  than queued, and there is no `restartIce`, so a peer that goes
  `disconnected` is never recovered.
- Students are full publishers (`sendrecv`) even though their camera is hidden,
  so every student uploads video to the teacher and to every other student.
- The browser E2E uses Chromium's fake devices and a headless container, so it
  exercises the negotiation path but not a real encoder, a real camera, or a
  real network. The fake camera caps at **20fps**, so nothing in the E2E can
  prove 60fps: it asserts that `maxFramerate` *tracks the reported rate* and
  stays within the 60 cap, which is the part of the policy that is ours, and
  leaves the actual rate to `check:quality` and to real hardware. Capture
  resolution is asserted from the outgoing track, and delivered resolution only
  as a floor, because delivery is congestion-controlled and asserting an exact
  size would measure the test box rather than the policy.
- `window.__probePc` is installed by `use-live-mesh` purely so the E2E can read
  sender parameters, which are otherwise unreachable from the DOM. It is a
  test-only hook with no reader in `src/`; if it is ever read by application
  code, that is a bug.

`npm run e2e:quiz` covers the whole path, including the security rules above. It
uses the seeded student and removes every quiz, attempt, answer, notification and
refresh token that the run created, plus any picture it uploaded.

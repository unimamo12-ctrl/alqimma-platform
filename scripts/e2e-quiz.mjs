/**
 * Quiz lifecycle E2E.
 *
 * Covers draft -> publish -> assign -> attempt -> autosave -> submit ->
 * auto/manual grading -> results -> archive, plus the rules that protect the
 * answer key and the attempt limits. Everything it creates is removed at the
 * end, so a failed run never leaves a quiz behind.
 */
const BASE = 'http://localhost:3000';
const TITLE = 'E2E QUIZ LIFECYCLE';

const ACCOUNTS = {
  admin: 'admin@alqimma.com',
  teacher: 'teacher@alqimma.com',
  student: 'student@alqimma.com',
};

const createdRefreshTokens = new Set();
const createdQuizIds = [];
const uploadedFiles = new Set();
let quizId = null;

// a real 1x1 PNG, so the upload path is exercised for what it is
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let failures = 0;

function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

function eq(label, actual, expected) {
  ok(label, actual === expected, `expected ${expected}, got ${actual}`);
}

function trackRefresh(cookie) {
  const match = /(?:^|;\s*)refresh_token=([^;]+)/.exec(cookie ?? '');
  if (match) createdRefreshTokens.add(decodeURIComponent(match[1]));
  return cookie;
}

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  });
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  trackRefresh(cookie);
  return cookie;
}

async function api(cookie, path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(init.headers ?? {}),
    },
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

/** multipart upload through the real endpoint, not a stubbed URL */
async function uploadImage(cookie, filename) {
  const form = new FormData();
  form.append('file', new Blob([Buffer.from(PNG_1PX, 'base64')], { type: 'image/png' }), filename);
  form.append('kind', 'image');

  const res = await fetch(`${BASE}/api/uploads`, {
    method: 'POST',
    headers: cookie ? { cookie } : {},
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  const url = body?.data?.upload?.url;

  if (url?.startsWith('/uploads/')) uploadedFiles.add(url.slice('/uploads/'.length));

  return { status: res.status, body, url };
}

/** the picture must be reachable over http, not only present in the database */
async function servesFile(url) {
  if (!url) return false;
  const res = await fetch(`${BASE}${url}`);
  return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/');
}

function draftPayload(overrides = {}) {
  return {
    title: TITLE,
    description: 'اختبار آلي مؤقت',
    durationMin: 0,
    maxAttempts: 1,
    gradingPolicy: 'LAST_ATTEMPT',
    allowNavigation: true,
    shuffleQuestions: false,
    showCorrectAnswers: false,
    opensAt: null,
    closesAt: null,
    questions: [
      {
        type: 'MULTIPLE_CHOICE',
        text: 'ما ناتج 2 + 2؟',
        points: 3,
        isRequired: true,
        requiresManualGrading: false,
        modelAnswer: null,
        matchValue: null,
        matchMode: null,
        options: [
          { text: '3', isCorrect: false },
          { text: '4', isCorrect: true },
        ],
      },
      {
        type: 'TEXT',
        text: 'اشرح قاعدة distributive بأسلوبك.',
        points: 7,
        isRequired: true,
        requiresManualGrading: true,
        modelAnswer: 'توزيع الضرب على الجمع',
        matchValue: null,
        matchMode: null,
        options: [],
      },
    ],
    studentIds: [],
    courseWide: false,
    ...overrides,
  };
}

async function main() {
  console.log('=== QUIZ LIFECYCLE E2E ===');

  const sessions = {};
  for (const [role, email] of Object.entries(ACCOUNTS)) {
    sessions[role] = await login(email);
    ok(`login ${role}`, Boolean(sessions[role]));
  }

  const courses = (await api(sessions.teacher, '/api/courses')).body?.data?.courses ?? [];
  const courseId = courses[0]?.id;
  ok('teacher has a course', Boolean(courseId));
  if (!courseId) throw new Error('no course available for the quiz');

  // the candidate list is the enrolment roster, so this also proves the seeded
  // student really belongs to the course
  const candidates =
    (await api(sessions.teacher, `/api/quizzes/candidates?courseId=${courseId}`)).body?.data
      ?.students ?? [];
  const studentRow = candidates.find((row) => row.user?.email === ACCOUNTS.student);
  ok('seeded student is enrolled', Boolean(studentRow), `candidates: ${candidates.length}`);
  if (!studentRow) throw new Error('seeded student is not enrolled in any teacher course');
  const studentId = studentRow.id;

  console.log('--- draft ---');
  const created = await api(sessions.teacher, '/api/quizzes', {
    method: 'POST',
    body: JSON.stringify(draftPayload({ courseId })),
  });
  eq('create draft', created.status, 200);
  eq('created as DRAFT', created.body?.data?.quiz?.status, 'DRAFT');
  eq('total points computed', created.body?.data?.quiz?.totalPoints, 10);
  quizId = created.body?.data?.quiz?.id;
  if (!quizId) throw new Error('quiz was not created');
  createdQuizIds.push(quizId);

  const studentList = (await api(sessions.student, '/api/quizzes')).body?.data?.quizzes ?? [];
  ok(
    'draft is hidden from the student',
    !studentList.some((row) => row.id === quizId),
  );
  eq('student GET draft quiz', (await api(sessions.student, `/api/quizzes/${quizId}`)).status, 404);

  eq(
    'student cannot create a quiz',
    (await api(sessions.student, '/api/quizzes', { method: 'POST', body: JSON.stringify(draftPayload({ courseId })) })).status,
    403,
  );
  eq(
    'student cannot publish',
    (await api(sessions.student, `/api/quizzes/${quizId}/publish`, { method: 'POST' })).status,
    403,
  );
  eq(
    'publish without assignment is refused',
    (await api(sessions.teacher, `/api/quizzes/${quizId}/publish`, { method: 'POST' })).status,
    400,
  );

  console.log('--- publish and assign ---');
  const assigned = await api(sessions.teacher, `/api/quizzes/${quizId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ studentIds: [studentId], courseWide: false }),
  });
  eq('assign enrolled student', assigned.status, 200);

  eq(
    'assign a student outside the course is refused',
    (
      await api(sessions.teacher, `/api/quizzes/${quizId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ studentIds: ['not-a-real-student'], courseWide: false }),
      })
    ).status,
    400,
  );

  const published = await api(sessions.teacher, `/api/quizzes/${quizId}/publish`, { method: 'POST' });
  eq('publish', published.status, 200);

  const afterPublish = (await api(sessions.student, '/api/quizzes')).body?.data?.quizzes ?? [];
  const row = afterPublish.find((entry) => entry.id === quizId);
  ok('published quiz reaches the student list', Boolean(row));
  eq('derived status is AVAILABLE', row?.status, 'AVAILABLE');

  const intro = await api(sessions.student, `/api/quizzes/${quizId}`);
  eq('student can open the quiz', intro.status, 200);
  let studentQuestions = intro.body?.data?.quiz?.questions ?? [];
  const serialized = JSON.stringify(studentQuestions);
  ok(
    'no answer key in the student payload',
    !serialized.includes('isCorrect') &&
      !serialized.includes('modelAnswer') &&
      !serialized.includes('matchValue'),
    serialized.slice(0, 200),
  );

  console.log('--- editing a published quiz before anybody starts ---');
  const grown = draftPayload({
    courseId,
    // the editor always re-sends the current selection, so keep the student
    studentIds: [studentId],
    questions: [
      ...draftPayload({ courseId }).questions,
      {
        type: 'TEXT',
        text: 'سؤال أُضيف بعد النشر',
        points: 1,
        isRequired: false,
        requiresManualGrading: true,
        modelAnswer: 'إجابة',
        matchValue: null,
        matchMode: null,
        options: [],
      },
    ],
  });

  const editPublished = await api(sessions.teacher, `/api/quizzes/${quizId}`, {
    method: 'PUT',
    body: JSON.stringify(grown),
  });
  eq('a published quiz with no attempts accepts edits', editPublished.status, 200);

  const afterEdit = (await api(sessions.teacher, `/api/quizzes/${quizId}`)).body?.data?.quiz;
  eq('the added question is really stored', afterEdit?.questions?.length, 3);
  eq('total points recomputed after the edit', afterEdit?.totalPoints, 11);
  eq(
    'saving must not drop the existing assignment',
    afterEdit?.students?.length,
    1,
    JSON.stringify(afterEdit?.students ?? []),
  );

  // the edit replaced every question, so the ids the student holds are new
  studentQuestions = (await api(sessions.student, `/api/quizzes/${quizId}`)).body?.data?.quiz
    ?.questions ?? [];
  eq('the student sees the added question', studentQuestions.length, 3);

  const reserialized = JSON.stringify(studentQuestions);
  ok(
    'still no answer key after the teacher edit',
    !reserialized.includes('isCorrect') &&
      !reserialized.includes('modelAnswer') &&
      !reserialized.includes('matchValue'),
    reserialized.slice(0, 200),
  );

  const addedQuestion = studentQuestions.find((q) => q.text === 'سؤال أُضيف بعد النشر');
  ok('the added question is usable by the student flow', Boolean(addedQuestion?.id));

  console.log('--- picture questions ---');
  const questionPic = await uploadImage(sessions.teacher, 'question.png');
  const optionPicA = await uploadImage(sessions.teacher, 'option-a.png');
  const optionPicB = await uploadImage(sessions.teacher, 'option-b.png');
  eq('teacher can upload a picture', questionPic.status, 200);
  ok('upload returns a local url', /^\/uploads\/image\/[\w.-]+$/.test(questionPic.url ?? ''), questionPic.url);
  ok('the uploaded file is actually served', await servesFile(questionPic.url));
  eq(
    'a student cannot upload to the shared media folder',
    (await uploadImage(sessions.student, 'nope.png')).status,
    403,
  );

  // no text anywhere: the picture carries the question and every option
  const pictureQuiz = await api(sessions.teacher, '/api/quizzes', {
    method: 'POST',
    body: JSON.stringify(
      draftPayload({
        courseId,
        studentIds: [studentId],
        questions: [
          {
            type: 'MULTIPLE_CHOICE',
            text: '',
            imageUrl: questionPic.url,
            points: 2,
            isRequired: true,
            requiresManualGrading: false,
            modelAnswer: null,
            matchValue: null,
            matchMode: null,
            options: [
              { text: '', imageUrl: optionPicA.url, isCorrect: true },
              { text: '', imageUrl: optionPicB.url, isCorrect: false },
            ],
          },
        ],
      }),
    ),
  });
  eq('a question made only of pictures is accepted', pictureQuiz.status, 200);
  const pictureQuizId = pictureQuiz.body?.data?.quiz?.id;
  ok('picture quiz id returned', Boolean(pictureQuizId));
  createdQuizIds.push(pictureQuizId);

  const pictureDetail = await api(sessions.teacher, `/api/quizzes/${pictureQuizId}`);
  eq('question text stays empty', pictureDetail.body?.data?.quiz?.questions?.[0]?.text, '');
  eq(
    'question picture is stored',
    pictureDetail.body?.data?.quiz?.questions?.[0]?.imageUrl,
    questionPic.url,
  );
  eq(
    'option pictures are stored',
    pictureDetail.body?.data?.quiz?.questions?.[0]?.options?.map((o) => o.imageUrl).join(','),
    `${optionPicA.url},${optionPicB.url}`,
  );

  eq(
    'a question with neither text nor picture is refused',
    (
      await api(sessions.teacher, '/api/quizzes', {
        method: 'POST',
        body: JSON.stringify(
          draftPayload({
            courseId,
            questions: [{ ...draftPayload({ courseId }).questions[0], text: '', imageUrl: null }],
          }),
        ),
      })
    ).status,
    400,
  );

  eq(
    'an off-site picture url is refused',
    (
      await api(sessions.teacher, '/api/quizzes', {
        method: 'POST',
        body: JSON.stringify(
          draftPayload({
            courseId,
            questions: [
              { ...draftPayload({ courseId }).questions[0], text: '', imageUrl: 'https://evil.example/x.png' },
            ],
          }),
        ),
      })
    ).status,
    400,
  );

  await api(sessions.teacher, `/api/quizzes/${pictureQuizId}/publish`, { method: 'POST' });
  const pictureForStudent = (await api(sessions.student, `/api/quizzes/${pictureQuizId}`)).body?.data?.quiz
    ?.questions?.[0];
  eq('the student sees the question picture', pictureForStudent?.imageUrl, questionPic.url);
  eq('the student sees the option pictures', pictureForStudent?.options?.[1]?.imageUrl, optionPicB.url);
  ok(
    'pictures do not open a hole in the answer key',
    !JSON.stringify(pictureForStudent).includes('isCorrect'),
  );

  const pictureAttempt = await api(sessions.student, `/api/quizzes/${pictureQuizId}/attempts`, {
    method: 'POST',
  });
  eq('a picture question can be attempted', pictureAttempt.status, 200);
  const pictureAttemptId = pictureAttempt.body?.data?.attempt?.id;
  const pictureQuestionId = pictureForStudent.id;
  const correctPictureOption = pictureForStudent.options[0].id;

  eq(
    'answering by picture is saved',
    (
      await api(sessions.student, `/api/quizzes/${pictureQuizId}/attempts/${pictureAttemptId}/answers`, {
        method: 'PUT',
        body: JSON.stringify({ questionId: pictureQuestionId, selectedOptionId: correctPictureOption }),
      })
    ).status,
    200,
  );
  await api(sessions.student, `/api/quizzes/${pictureQuizId}/attempts/${pictureAttemptId}/submit`, {
    method: 'POST',
  });
  const pictureResult = await api(sessions.student, `/api/quizzes/${pictureQuizId}/result`);
  eq('the picture answer is graded correct', pictureResult.body?.data?.official?.percentage, 100);

  console.log('--- attempt ---');
  const begun = await api(sessions.student, `/api/quizzes/${quizId}/attempts`, { method: 'POST' });
  eq('begin attempt', begun.status, 200);
  const attemptId = begun.body?.data?.attempt?.id;
  ok('attempt id returned', Boolean(attemptId));

  const resumed = await api(sessions.student, `/api/quizzes/${quizId}/attempts`, { method: 'POST' });
  eq('second begin resumes the same attempt', resumed.body?.data?.attempt?.id, attemptId);

  eq(
    'questions freeze once an attempt exists',
    (
      await api(sessions.teacher, `/api/quizzes/${quizId}`, {
        method: 'PUT',
        body: JSON.stringify(draftPayload({ courseId })),
      })
    ).status,
    409,
  );

  const mcQuestion = studentQuestions.find((question) => question.type === 'MULTIPLE_CHOICE');
  const textQuestion = studentQuestions.find((question) => question.type === 'TEXT');
  const correctOption = mcQuestion.options.find((option) => option.text === '4');

  eq(
    'autosave multiple choice',
    (
      await api(sessions.student, `/api/quizzes/${quizId}/attempts/${attemptId}/answers`, {
        method: 'PUT',
        body: JSON.stringify({ questionId: mcQuestion.id, selectedOptionId: correctOption.id }),
      })
    ).status,
    200,
  );
  eq(
    'autosave free text',
    (
      await api(sessions.student, `/api/quizzes/${quizId}/attempts/${attemptId}/answers`, {
        method: 'PUT',
        body: JSON.stringify({ questionId: textQuestion.id, textAnswer: 'ضربBracket في جمع' }),
      })
    ).status,
    200,
  );
  eq(
    'a question added after publishing is answerable',
    (
      await api(sessions.student, `/api/quizzes/${quizId}/attempts/${attemptId}/answers`, {
        method: 'PUT',
        body: JSON.stringify({ questionId: addedQuestion.id, textAnswer: 'إجابة' }),
      })
    ).status,
    200,
  );
  eq(
    'answer from another quiz is refused',
    (
      await api(sessions.student, `/api/quizzes/${quizId}/attempts/${attemptId}/answers`, {
        method: 'PUT',
        body: JSON.stringify({ questionId: 'nope', textAnswer: 'x' }),
      })
    ).status,
    404,
  );

  const saved = await api(sessions.student, `/api/quizzes/${quizId}/attempts/${attemptId}`);
  eq('reload attempt', saved.status, 200);
  eq('choice persisted', saved.body?.data?.savedAnswers?.[mcQuestion.id]?.selectedOptionId, correctOption.id);
  ok(
    'reload exposes no grading data',
    !JSON.stringify(saved.body).includes('modelAnswer'),
  );

  console.log('--- submit and grading ---');
  const submitted = await api(
    sessions.student,
    `/api/quizzes/${quizId}/attempts/${attemptId}/submit`,
    { method: 'POST' },
  );
  eq('submit attempt', submitted.status, 200);
  eq('manual answer parks it in PENDING_REVIEW', submitted.body?.data?.attempt?.status, 'PENDING_REVIEW');
  eq(
    'auto-graded choice still counted',
    submitted.body?.data?.attempt?.correctCount,
    1,
  );

  eq(
    'writing after submit is refused',
    (
      await api(sessions.student, `/api/quizzes/${quizId}/attempts/${attemptId}/answers`, {
        method: 'PUT',
        body: JSON.stringify({ questionId: textQuestion.id, textAnswer: 'بعد التسليم' }),
      })
    ).status,
    409,
  );
  eq(
    'max attempts enforced',
    (await api(sessions.student, `/api/quizzes/${quizId}/attempts`, { method: 'POST' })).status,
    409,
  );
  eq(
    'questions are frozen after an attempt exists',
    (await api(sessions.teacher, `/api/quizzes/${quizId}`, { method: 'PUT', body: JSON.stringify(draftPayload({ courseId })) })).status,
    409,
  );

  const overview = (await api(sessions.teacher, `/api/quizzes/${quizId}/results`)).body?.data;
  eq('results row present', overview?.rows?.[0]?.studentId, studentId);
  eq('results state is PENDING_REVIEW', overview?.rows?.[0]?.state, 'PENDING_REVIEW');
  eq('summary counts one pending', overview?.summary?.pendingReview, 1);

  const detail = (
    await api(sessions.teacher, `/api/quizzes/${quizId}/results?studentId=${studentId}`)
  ).body?.data;
  const textBreakdown = (detail?.attempts?.[0]?.breakdown ?? []).find(
    (question) => question.id === textQuestion.id,
  );
  ok('text answer awaits review', textBreakdown?.answers?.[0]?.isCorrect === null);

  const graded = await api(sessions.teacher, `/api/quizzes/${quizId}/manual-grading`, {
    method: 'POST',
    body: JSON.stringify({
      attemptId,
      grades: [
        { questionId: textQuestion.id, isCorrect: true, pointsAwarded: 7, feedback: 'ممتاز' },
        // the question the teacher added after publishing is gradable too
        { questionId: addedQuestion.id, isCorrect: true, pointsAwarded: 1 },
      ],
    }),
  });
  eq('manual grading accepted', graded.status, 200);
  eq('attempt leaves PENDING_REVIEW', graded.body?.data?.attempt?.status, 'GRADED');
  eq('manual points counted', graded.body?.data?.attempt?.scorePoints, 11);
  eq('percentage computed', graded.body?.data?.attempt?.percentage, 100);

  eq(
    'correcting a multiple choice by hand is refused',
    (
      await api(sessions.teacher, `/api/quizzes/${quizId}/manual-grading`, {
        method: 'POST',
        body: JSON.stringify({ attemptId, grades: [{ questionId: mcQuestion.id, isCorrect: true }] }),
      })
    ).status,
    400,
  );

  console.log('--- result visibility ---');
  const result = await api(sessions.student, `/api/quizzes/${quizId}/result`);
  eq('student result', result.status, 200);
  eq('official percentage', result.body?.data?.official?.percentage, 100);
  ok(
    'answers stay hidden while showCorrectAnswers is off',
    result.body?.data?.revealAnswers === false && result.body?.data?.breakdown === null,
  );

  console.log('--- archive preserves history ---');
  eq(
    'reassigning the same student keeps the row',
    (
      await api(sessions.teacher, `/api/quizzes/${quizId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ studentIds: [studentId], courseWide: false }),
      })
    ).status,
    200,
  );
  eq(
    'archive',
    (await api(sessions.teacher, `/api/quizzes/${quizId}/archive`, { method: 'POST' })).status,
    200,
  );
  ok(
    'archived quiz leaves the student list',
    !(await api(sessions.student, '/api/quizzes')).body?.data?.quizzes?.some((entry) => entry.id === quizId),
  );
  eq('student cannot open an archived quiz', (await api(sessions.student, `/api/quizzes/${quizId}`)).status, 404);
  eq(
    'result history survives archiving',
    (await api(sessions.student, `/api/quizzes/${quizId}/result`)).status,
    200,
  );
  eq(
    'teacher results survive archiving',
    (await api(sessions.teacher, `/api/quizzes/${quizId}/results`)).status,
    200,
  );
  eq(
    'archived quiz cannot be edited',
    (await api(sessions.teacher, `/api/quizzes/${quizId}`, { method: 'PUT', body: JSON.stringify(draftPayload({ courseId })) })).status,
    409,
  );

  console.log('--- deletion rules ---');
  eq(
    'published or archived quizzes cannot be deleted',
    (await api(sessions.teacher, `/api/quizzes/${quizId}`, { method: 'DELETE' })).status,
    409,
  );

  // ---------------------------------------------------------------
  console.log('--- multiple attempts and the AVERAGE policy ---');
  const multi = (
    await api(sessions.teacher, '/api/quizzes', {
      method: 'POST',
      body: JSON.stringify(
        draftPayload({
          courseId,
          title: `${TITLE} MULTI`,
          maxAttempts: 2,
          gradingPolicy: 'AVERAGE',
          showCorrectAnswers: true,
          questions: [draftPayload().questions[0]],
        }),
      ),
    })
  ).body?.data?.quiz;
  ok('second quiz created', Boolean(multi?.id), JSON.stringify(multi ?? {}).slice(0, 120));
  createdQuizIds.push(multi.id);

  await api(sessions.teacher, `/api/quizzes/${multi.id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ studentIds: [studentId] }),
  });
  eq('publish multi-attempt quiz', (await api(sessions.teacher, `/api/quizzes/${multi.id}/publish`, { method: 'POST' })).status, 200);

  const multiIntro = await api(sessions.student, `/api/quizzes/${multi.id}`);
  const multiQuestion = multiIntro.body?.data?.quiz?.questions?.[0];
  const rightOption = multiQuestion.options.find((option) => option.text === '4');
  const leftOption = multiQuestion.options.find((option) => option.text === '3');

  const firstRun = (
    await api(sessions.student, `/api/quizzes/${multi.id}/attempts`, { method: 'POST' })
  ).body?.data?.attempt;
  await api(sessions.student, `/api/quizzes/${multi.id}/attempts/${firstRun.id}/answers`, {
    method: 'PUT',
    body: JSON.stringify({ questionId: multiQuestion.id, selectedOptionId: leftOption.id }),
  });
  const firstSubmit = await api(
    sessions.student,
    `/api/quizzes/${multi.id}/attempts/${firstRun.id}/submit`,
    { method: 'POST' },
  );
  eq('first attempt graded', firstSubmit.body?.data?.attempt?.percentage, 0);

  // the quiz reads as finished for the only student, but their allowance is 2
  const statusAfterFirst = (
    await api(sessions.teacher, `/api/quizzes/${multi.id}/results`)
  ).body?.data?.quiz?.status;
  eq('still open while attempts remain', statusAfterFirst, 'AVAILABLE');

  const secondRun = await api(sessions.student, `/api/quizzes/${multi.id}/attempts`, {
    method: 'POST',
  });
  eq('second attempt is allowed', secondRun.status, 200);
  eq('attempt number increments', secondRun.body?.data?.attempt?.attemptNumber, 2);

  await api(sessions.student, `/api/quizzes/${multi.id}/attempts/${secondRun.body.data.attempt.id}/answers`, {
    method: 'PUT',
    body: JSON.stringify({ questionId: multiQuestion.id, selectedOptionId: rightOption.id }),
  });
  await api(sessions.student, `/api/quizzes/${multi.id}/attempts/${secondRun.body.data.attempt.id}/submit`, {
    method: 'POST',
  });

  const multiResult = await api(sessions.student, `/api/quizzes/${multi.id}/result`);
  eq('AVERAGE official percentage', multiResult.body?.data?.official?.percentage, 50);
  eq('AVERAGE official points', multiResult.body?.data?.official?.scorePoints, 1.5);
  eq('both attempts recorded', multiResult.body?.data?.attempts?.length, 2);
  eq('allowance spent', multiResult.body?.data?.attemptsRemaining, 0);
  ok(
    'answer key revealed once nobody can continue',
    multiResult.body?.data?.revealAnswers === true && Array.isArray(multiResult.body?.data?.breakdown),
  );

  eq(
    'no third attempt',
    (await api(sessions.student, `/api/quizzes/${multi.id}/attempts`, { method: 'POST' })).status,
    409,
  );

  console.log('--- time expiry is swept server side ---');
  const timed = (
    await api(sessions.teacher, '/api/quizzes', {
      method: 'POST',
      body: JSON.stringify(
        draftPayload({ courseId, title: `${TITLE} TIMED`, durationMin: 30, questions: [draftPayload().questions[0]] }),
      ),
    })
  ).body?.data?.quiz;
  createdQuizIds.push(timed.id);
  await api(sessions.teacher, `/api/quizzes/${timed.id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ studentIds: [studentId] }),
  });
  await api(sessions.teacher, `/api/quizzes/${timed.id}/publish`, { method: 'POST' });

  const timedIntro = await api(sessions.student, `/api/quizzes/${timed.id}`);
  const timedQuestion = timedIntro.body?.data?.quiz?.questions?.[0];
  const timedRun = (
    await api(sessions.student, `/api/quizzes/${timed.id}/attempts`, { method: 'POST' })
  ).body?.data?.attempt;
  ok('attempt carries a deadline', Boolean(timedRun.expiresAt));

  await api(sessions.student, `/api/quizzes/${timed.id}/attempts/${timedRun.id}/answers`, {
    method: 'PUT',
    body: JSON.stringify({
      questionId: timedQuestion.id,
      selectedOptionId: timedQuestion.options.find((option) => option.text === '4').id,
    }),
  });

  // move the deadline into the past instead of waiting half an hour
  const { PrismaClient: Cli } = await import('@prisma/client');
  const clock = new Cli();
  await clock.quizAttempt.update({
    where: { id: timedRun.id },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  });
  await clock.$disconnect();

  const swept = await api(sessions.student, `/api/quizzes/${timed.id}/attempts`);
  ok('sweeper closed the expired attempt', swept.body?.data?.closedAttempts?.includes(timedRun.id));

  const timedResult = await api(sessions.student, `/api/quizzes/${timed.id}/result`);
  eq('expired attempt was graded', timedResult.body?.data?.official?.percentage, 100);
  eq('no new attempt after the deadline', (await api(sessions.student, `/api/quizzes/${timed.id}/attempts`, { method: 'POST' })).status, 409);

  console.log('--- archiving a running attempt ---');
  const live = (
    await api(sessions.teacher, '/api/quizzes', {
      method: 'POST',
      body: JSON.stringify(draftPayload({ courseId, title: `${TITLE} ARCHIVE` })),
    })
  ).body?.data?.quiz;
  createdQuizIds.push(live.id);
  await api(sessions.teacher, `/api/quizzes/${live.id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ studentIds: [studentId] }),
  });
  await api(sessions.teacher, `/api/quizzes/${live.id}/publish`, { method: 'POST' });
  const liveIntro = await api(sessions.student, `/api/quizzes/${live.id}`);
  const liveQuestion = liveIntro.body?.data?.quiz?.questions?.[0];
  const liveRun = (
    await api(sessions.student, `/api/quizzes/${live.id}/attempts`, { method: 'POST' })
  ).body?.data?.attempt;
  await api(sessions.student, `/api/quizzes/${live.id}/attempts/${liveRun.id}/answers`, {
    method: 'PUT',
    body: JSON.stringify({
      questionId: liveQuestion.id,
      selectedOptionId: liveQuestion.options.find((option) => option.text === '4').id,
    }),
  });

  const archived = await api(sessions.teacher, `/api/quizzes/${live.id}/archive`, { method: 'POST' });
  eq('archive a quiz with a running attempt', archived.status, 200);
  eq('archive reports the closed attempt', archived.body?.data?.closedAttempts, 1);

  const archiveResult = await api(sessions.student, `/api/quizzes/${live.id}/result`);
  // only the multiple choice was answered: 3 of 10 points, and the free text is
  // counted as unanswered rather than silently marked wrong
  eq('archived attempt is graded, not left open', archiveResult.body?.data?.attempts?.[0]?.status, 'GRADED');
  eq('archived attempt scored what was answered', archiveResult.body?.data?.official?.percentage, 30);
  eq('unanswered text is counted apart', archiveResult.body?.data?.attempts?.[0]?.unansweredCount, 1);

  console.log('=== CLEANUP ===');
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  let removedAttempts = 0;
  for (const id of createdQuizIds) {
    const rows = await prisma.quizAttempt.findMany({ where: { quizId: id }, select: { id: true } });
    const attemptIds = rows.map((row) => row.id);
    removedAttempts += attemptIds.length;

    if (attemptIds.length > 0) {
      const answers = await prisma.quizAnswer.findMany({
        where: { attemptId: { in: attemptIds } },
        select: { id: true },
      });
      await prisma.quizAnswer.deleteMany({ where: { id: { in: answers.map((row) => row.id) } } });
      await prisma.quizAttempt.deleteMany({ where: { id: { in: attemptIds } } });
    }

    await prisma.quizAssignment.deleteMany({ where: { quizId: id } });
    await prisma.quizQuestion.deleteMany({ where: { quizId: id } });
    await prisma.quiz.deleteMany({ where: { id } });
  }
  console.log(`  removed ${createdQuizIds.length} quiz(es) + ${removedAttempts} attempt(s)`);

  // pictures this run uploaded, and only those
  const { unlink } = await import('node:fs/promises');
  const path = await import('node:path');
  let removedFiles = 0;
  for (const key of uploadedFiles) {
    const safe = path.normalize(key).replace(/^([/\\]|\.\.)+/, '');
    await unlink(path.join(process.cwd(), 'public', 'uploads', safe)).then(
      () => {
        removedFiles += 1;
      },
      () => undefined,
    );
  }
  console.log(`  removed ${removedFiles} uploaded picture(s)`);

  // notifications created by publishing this run, and only those
  const removedNotifications = await prisma.notification.deleteMany({
    where: { title: 'اختبار جديد', message: { contains: TITLE } },
  });
  console.log(`  removed ${removedNotifications.count} publish notification(s)`);

  const removedTokens = await prisma.refreshToken.deleteMany({
    where: { token: { in: [...createdRefreshTokens] } },
  });
  console.log(`  removed ${removedTokens.count} refresh token(s) from this run`);
  await prisma.$disconnect();

  const left = await fetch(`${BASE}/api/quizzes`, { headers: { cookie: sessions.teacher } });
  const remaining = (await left.json())?.data?.quizzes?.some((row) => row.title.startsWith(TITLE));
  ok('no quiz left behind', !remaining);

  console.log('');
  if (failures > 0) {
    console.log(`QUIZ E2E FAILED: ${failures} check(s)`);
    process.exitCode = 1;
  } else {
    console.log('QUIZ E2E PASSED');
  }
}

main().catch((e) => {
  console.error(e);
  console.log(`QUIZ E2E ERRORED after ${failures} failed check(s)`);
  process.exitCode = 1;
});

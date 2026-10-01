/** Client-facing quiz shapes, kept separate from the Prisma models on purpose:
 *  these describe exactly what the API is allowed to send to the browser. */

export type GradingPolicy = 'LAST_ATTEMPT' | 'BEST_ATTEMPT' | 'AVERAGE';

export type QuizStatusName =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'AVAILABLE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'ARCHIVED';

export type AttemptState = 'IN_PROGRESS' | 'SUBMITTED' | 'PENDING_REVIEW' | 'GRADED';

export type StudentOption = {
  id: string;
  text: string;
  imageUrl: string | null;
  order: number;
};

export type TeacherOption = StudentOption & { isCorrect: boolean };

export type RevealedOption = StudentOption & { isCorrect: boolean | null };

export type StudentQuestion = {
  id: string;
  type: 'MULTIPLE_CHOICE' | 'TEXT';
  text: string;
  imageUrl: string | null;
  points: number;
  order: number;
  isRequired: boolean;
  options: StudentOption[];
};

export type TeacherQuestion = {
  id: string;
  type: 'MULTIPLE_CHOICE' | 'TEXT';
  text: string;
  imageUrl: string | null;
  points: number;
  order: number;
  isRequired: boolean;
  requiresManualGrading: boolean;
  modelAnswer: string | null;
  matchValue: string | null;
  matchMode: 'EXACT' | 'CONTAINS' | null;
  options: TeacherOption[];
};

export type QuizCourse = { id: string; title: string };

export type AssignedStudent = { id: string; name: string; email: string };

export type CandidateStudent = AssignedStudent;
export type GradedAnswer = {
  questionId: string;
  selectedOptionId: string | null;
  textAnswer: string | null;
  isCorrect: boolean | null;
  pointsAwarded: number | null;
  feedback: string | null;
  answeredAt: string;
};

export type GradedQuestion = {
  id: string;
  type: 'MULTIPLE_CHOICE' | 'TEXT';
  text: string;
  imageUrl: string | null;
  points: number;
  order: number;
  requiresManualGrading: boolean;
  modelAnswer: string | null;
  options: RevealedOption[];
  answers: GradedAnswer[];
};

export type AttemptSummary = {
  id: string;
  attemptNumber: number;
  status: AttemptState;
  startedAt: string;
  submittedAt: string | null;
  durationSec: number;
  scorePoints: number;
  maxPoints: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  percentage: number;
  requiresManualGrading: boolean;
  isFinal?: boolean;
  breakdown?: GradedQuestion[];
};

/** row in the teacher's quiz list */
export type TeacherQuizRow = {
  id: string;
  title: string;
  description: string | null;
  status: QuizStatusName;
  storedStatus: QuizStatusName;
  totalPoints: number;
  durationMin: number;
  maxAttempts: number;
  gradingPolicy: GradingPolicy;
  showCorrectAnswers: boolean;
  allowNavigation: boolean;
  shuffleQuestions: boolean;
  opensAt: string | null;
  closesAt: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  attemptCount: number;
  pendingReviewCount: number;
  course: QuizCourse;
  questionCount: number;
  assignedCount: number;
  students: AssignedStudent[];
};

/** full payload behind the teacher editor */
export type TeacherQuizDetail = TeacherQuizRow & {
  questions: TeacherQuestion[];
};

export type ResultsRow = {
  studentId: string;
  name: string;
  email: string;
  attemptsUsed: number;
  attemptsRemaining: number;
  state: 'NOT_STARTED' | 'IN_PROGRESS' | 'PENDING_REVIEW' | 'COMPLETED';
  finalAttemptId: string | null;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  scorePoints: number;
  maxPoints: number;
  percentage: number;
  durationSec: number;
  averagePercentage: number;
};

export type ResultsSummary = {
  assigned: number;
  completed: number;
  inProgress: number;
  pendingReview: number;
  notStarted: number;
  averagePercentage: number;
  highestPercentage: number;
};

export type ResultsOverview = {
  quiz: {
    id: string;
    title: string;
    status: QuizStatusName;
    totalPoints: number;
    maxAttempts: number;
    gradingPolicy: GradingPolicy;
    questionCount: number;
  };
  summary: ResultsSummary;
  rows: ResultsRow[];
};

export type StudentDetail = {
  quiz: ResultsOverview['quiz'];
  student: { id: string; name: string; email: string };
  attempts: AttemptSummary[];
  averagePercentage: number;
};

/** row in the student's own quiz list */
export type AssignedQuizRow = {
  id: string;
  title: string;
  description: string | null;
  status: QuizStatusName;
  durationMin: number;
  maxAttempts: number;
  gradingPolicy: GradingPolicy;
  showCorrectAnswers: boolean;
  totalPoints: number;
  questionCount: number;
  opensAt: string | null;
  closesAt: string | null;
  assignedAt: string;
  course: QuizCourse;
  attemptsUsed: number;
  attemptsRemaining: number;
  hasOpenAttempt: boolean;
  openAttemptId: string | null;
};

export type StudentQuizIntro = {
  id: string;
  title: string;
  description: string | null;
  status: QuizStatusName;
  durationMin: number;
  maxAttempts: number;
  totalPoints: number;
  allowNavigation: boolean;
  shuffleQuestions: boolean;
  opensAt: string | null;
  closesAt: string | null;
  course: QuizCourse;
  questions: StudentQuestion[];
};

export type SavedAnswer = { selectedOptionId: string | null; textAnswer: string | null };

export type AttemptMeta = {
  id: string;
  attemptNumber: number;
  status: AttemptState;
  startedAt: string;
  expiresAt: string | null;
  quizId?: string;
  title: string;
  durationMin: number;
  totalPoints: number;
  allowNavigation: boolean;
  showCorrectAnswers?: boolean;
};

export type AttemptPayload = {
  attempt: AttemptMeta;
  questions: StudentQuestion[];
  savedAnswers: Record<string, SavedAnswer>;
};

export type StudentOfficialResult = {
  attemptId: string;
  attemptNumber: number;
  scorePoints: number;
  maxPoints: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  percentage: number;
  durationSec: number;
  averagePercentage: number;
  submittedAt: string | null;
  requiresManualGrading?: boolean;
};

export type StudentResult = {
  quiz: {
    id: string;
    title: string;
    description: string | null;
    status: QuizStatusName;
    totalPoints: number;
    maxAttempts: number;
    gradingPolicy: GradingPolicy;
    showCorrectAnswers: boolean;
    closesAt: string | null;
  };
  attempts: AttemptSummary[];
  attemptsUsed: number;
  attemptsRemaining: number;
  revealAnswers: boolean;
  official: StudentOfficialResult | null;
  breakdown: GradedQuestion[] | null;
};

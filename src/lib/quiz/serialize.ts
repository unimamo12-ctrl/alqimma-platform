import type { QuestionOption, QuizQuestion, QuizAttempt, QuizAnswer } from '@prisma/client';

/**
 * Everything a student is ever allowed to see about a question.
 *
 * This is an allow-list on purpose: `isCorrect`, `modelAnswer`, `matchValue`
 * and `matchMode` are never spread through, so adding a column to the schema
 * cannot accidentally leak an answer to the frontend.
 */
export type StudentQuestion = {
  id: string;
  type: string;
  text: string;
  imageUrl: string | null;
  points: number;
  order: number;
  isRequired: boolean;
  options: { id: string; text: string; imageUrl: string | null; order: number }[];
};

export function toStudentQuestion(
  question: QuizQuestion & { options: QuestionOption[] },
): StudentQuestion {
  return {
    id: question.id,
    type: question.type,
    text: question.text,
    imageUrl: question.imageUrl,
    points: question.points,
    order: question.order,
    isRequired: question.isRequired,
    options: [...question.options]
      .sort((a, b) => a.order - b.order)
      .map((option) => ({
        id: option.id,
        text: option.text,
        imageUrl: option.imageUrl,
        order: option.order,
      })),
  };
}

/** Teacher/admin view: everything, including the answer key. */
export function toTeacherQuestion(
  question: QuizQuestion & { options: QuestionOption[] },
) {
  return {
    id: question.id,
    type: question.type,
    text: question.text,
    imageUrl: question.imageUrl,
    points: question.points,
    order: question.order,
    isRequired: question.isRequired,
    requiresManualGrading: question.requiresManualGrading,
    modelAnswer: question.modelAnswer,
    matchValue: question.matchValue,
    matchMode: question.matchMode,
    options: [...question.options]
      .sort((a, b) => a.order - b.order)
      .map((option) => ({
        id: option.id,
        text: option.text,
        imageUrl: option.imageUrl,
        order: option.order,
        isCorrect: option.isCorrect,
      })),
  };
}

/**
 * A question as it is attached to a graded attempt. `canShowAnswers` gates the
 * answer key: the student only ever sees correct answers once the teacher
 * allows it AND no other student can still be answering.
 */
export function toGradedQuestion(
  question: QuizQuestion & { options: QuestionOption[] },
  answers: QuizAnswer[],
  canShowAnswers: boolean,
) {
  const options = [...question.options].sort((a, b) => a.order - b.order);

  return {
    id: question.id,
    type: question.type,
    text: question.text,
    imageUrl: question.imageUrl,
    points: question.points,
    order: question.order,
    requiresManualGrading: question.requiresManualGrading,
    modelAnswer: canShowAnswers ? question.modelAnswer : null,
    options: options.map((option) => ({
      id: option.id,
      text: option.text,
      imageUrl: option.imageUrl,
      order: option.order,
      isCorrect: canShowAnswers ? option.isCorrect : null,
    })),
    answers: answers.map((answer) => ({
      questionId: answer.questionId,
      selectedOptionId: answer.selectedOptionId,
      textAnswer: answer.textAnswer,
      isCorrect: answer.isCorrect,
      pointsAwarded: answer.pointsAwarded,
      feedback: answer.feedback,
      answeredAt: answer.answeredAt,
    })),
  };
}

/** Compact attempt row for teacher dashboards and student attempt history. */
export function toAttemptSummary(attempt: QuizAttempt) {
  return {
    id: attempt.id,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    durationSec: attempt.durationSec,
    scorePoints: attempt.scorePoints,
    maxPoints: attempt.maxPoints,
    correctCount: attempt.correctCount,
    wrongCount: attempt.wrongCount,
    unansweredCount: attempt.unansweredCount,
    percentage: attempt.percentage,
    requiresManualGrading: attempt.requiresManualGrading,
  };
}

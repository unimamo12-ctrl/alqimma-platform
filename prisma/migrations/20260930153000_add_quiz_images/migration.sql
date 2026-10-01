-- Add optional pictures to quiz questions and to their options.
-- A question or an option may now stand on its image alone, with empty text.

ALTER TABLE "quiz_questions"
  ADD COLUMN "imageUrl" TEXT;

ALTER TABLE "question_options"
  ADD COLUMN "imageUrl" TEXT;

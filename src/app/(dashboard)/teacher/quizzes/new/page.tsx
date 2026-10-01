'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { TeacherShell } from '../../_components/shell';
import { QuizEditorForm } from '../_components/quiz-editor';
import { useQuizEditor } from '../_components/use-quiz-editor';

export default function NewQuizPage() {
  const router = useRouter();
  const editor = useQuizEditor();

  return (
    <TeacherShell>
      <div className="mb-6">
        <Link href="/teacher/quizzes" className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300">
          ← الاختبارات
        </Link>
        <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100 mt-2">اختبار جديد</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400">
          يُحفظ كمسودة. لن يراه أي تلميذ حتى تنشره.
        </p>
      </div>

      {editor.loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
        </div>
      ) : (
        <QuizEditorForm
          editor={editor}
          locked={false}
        />
      )}

      {editor.message && !editor.issues.length && (
        <button
          onClick={() => router.push('/teacher/quizzes')}
          className="mt-6 px-4 py-2 rounded-xl bg-green-600 text-white text-sm"
        >
          العودة إلى قائمة الاختبارات
        </button>
      )}
    </TeacherShell>
  );
}

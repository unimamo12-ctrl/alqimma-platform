'use client';

import { QUESTION_TYPE_LABELS, type QuizEditor } from './use-quiz-editor';
import { ImagePicker } from './image-picker';

export function QuizEditorForm({
  editor,
  locked,
  submitLabel,
}: {
  editor: QuizEditor;
  locked?: boolean;
  submitLabel?: string;
}) {
  const {
    form,
    setField,
    questions,
    addQuestion,
    removeQuestion,
    moveQuestion,
    updateQuestion,
    courses,
    students,
    selected,
    setSelected,
    courseWide,
    setCourseWide,
    totalPoints,
    issues,
    message,
    saving,
    save,
  } = editor;

  return (
    <div className="space-y-6">
      {/* ---- general settings ---- */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-slate-100">إعدادات الاختبار</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">الدورة</span>
            <select
              value={form.courseId}
              disabled={locked}
              onChange={(e) => setField('courseId', e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm"
            >
              <option value="">— اختر الدورة —</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">العنوان</span>
            <input
              value={form.title}
              disabled={locked}
              onChange={(e) => setField('title', e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm"
              placeholder="مثال: اختبار الوحدة الثانية"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">الوصف</span>
            <textarea
              value={form.description}
              disabled={locked}
              onChange={(e) => setField('description', e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">المدة (دقيقة)</span>
            <input
              type="number"
              min={0}
              max={600}
              value={form.durationMin}
              disabled={locked}
              onChange={(e) => setField('durationMin', Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm"
            />
            <span className="text-xs text-gray-400 dark:text-slate-500">0 = بلا وقت محدد</span>
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">عدد المحاولات</span>
            <input
              type="number"
              min={1}
              max={10}
              value={form.maxAttempts}
              disabled={locked}
              onChange={(e) => setField('maxAttempts', Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              أساس اعتماد النتيجة
            </span>
            <select
              value={form.gradingPolicy}
              disabled={locked}
              onChange={(e) =>
                setField('gradingPolicy', e.target.value as typeof form.gradingPolicy)
              }
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm"
            >
              <option value="LAST_ATTEMPT">آخر محاولة</option>
              <option value="BEST_ATTEMPT">أعلى نتيجة</option>
              <option value="AVERAGE">متوسط المحاولات</option>
            </select>
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">يبدأ في</span>
            <input
              type="datetime-local"
              value={form.opensAt}
              disabled={locked}
              onChange={(e) => setField('opensAt', e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ينتهي في</span>
            <input
              type="datetime-local"
              value={form.closesAt}
              disabled={locked}
              onChange={(e) => setField('closesAt', e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-slate-800">
          <Toggle
            label="السماح للتنقل بين الأسئلة"
            checked={form.allowNavigation}
            disabled={locked}
            onChange={(v) => setField('allowNavigation', v)}
          />
          <Toggle
            label="ترتيب عشوائي للأسئلة"
            checked={form.shuffleQuestions}
            disabled={locked}
            onChange={(v) => setField('shuffleQuestions', v)}
          />
          <Toggle
            label="إظهار الإجابات الصحيحة في صفحة النتيجة"
            hint="تُعرض فقط بعد إغلاق نافذة الاختبار، حتى لا تُكشف لباقي التلاميذ."
            checked={form.showCorrectAnswers}
            disabled={locked}
            onChange={(v) => setField('showCorrectAnswers', v)}
          />
        </div>
      </section>

      {/* ---- questions ---- */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 dark:text-slate-100">
            الأسئلة <span className="text-sm text-gray-500 dark:text-slate-400">({questions.length})</span>
          </h2>
          <span className="text-sm text-gray-600 dark:text-slate-400">مجموع النقاط: {totalPoints}</span>
        </div>

        {questions.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-slate-400 py-6 text-center">لا توجد أسئلة بعد.</p>
        )}

        {questions.map((question, index) => (
          <div key={question.id ?? index} className="border border-gray-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm text-gray-700 dark:text-slate-300">السؤال {index + 1}</span>
              {!locked && (
                <div className="flex items-center gap-1">
                  <IconButton label="أعلى" onClick={() => moveQuestion(index, -1)} disabled={index === 0}>
                    ↑
                  </IconButton>
                  <IconButton
                    label="أسفل"
                    onClick={() => moveQuestion(index, 1)}
                    disabled={index === questions.length - 1}
                  >
                    ↓
                  </IconButton>
                  <IconButton label="حذف" onClick={() => removeQuestion(index)} danger>
                    ✕
                  </IconButton>
                </div>
              )}
            </div>

            <select
              value={question.type}
              disabled={locked}
              onChange={(e) =>
                updateQuestion(index, {
                  type: e.target.value as typeof question.type,
                  options:
                    e.target.value === 'TEXT'
                      ? []
                      : question.options.length
                        ? question.options
                        : [
                            { text: '', imageUrl: '', isCorrect: true },
                            { text: '', imageUrl: '', isCorrect: false },
                          ],
                })
              }
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm"
            >
              <option value="MULTIPLE_CHOICE">{QUESTION_TYPE_LABELS.MULTIPLE_CHOICE}</option>
              <option value="TEXT">{QUESTION_TYPE_LABELS.TEXT}</option>
            </select>

            <textarea
              value={question.text}
              disabled={locked}
              onChange={(e) => updateQuestion(index, { text: e.target.value })}
              rows={2}
              placeholder="نص السؤال (يمكن تركه فارغًا إذا أرفقت صورة)"
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm"
            />

            {!locked && (
              <ImagePicker
                value={question.imageUrl}
                onChange={(url) =>
                  updateQuestion(index, { imageUrl: url ?? '' })
                }
                label="رفع صورة السؤال"
              />
            )}

            {question.type === 'MULTIPLE_CHOICE' ? (
              <div className="space-y-2">
                {question.options.map((option, optionIndex) => (
                  <div key={optionIndex} className="space-y-2 rounded-lg border border-gray-100 dark:border-slate-800 p-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-${question.id ?? index}`}
                        checked={option.isCorrect}
                        disabled={locked}
                        onChange={() =>
                          updateQuestion(index, {
                            options: question.options.map((o, i) => ({ ...o, isCorrect: i === optionIndex })),
                          })
                        }
                        className="shrink-0"
                        title="الإجابة الصحيحة"
                      />
                      <input
                        value={option.text}
                        disabled={locked}
                        onChange={(e) =>
                          updateQuestion(index, {
                            options: question.options.map((o, i) =>
                              i === optionIndex ? { ...o, text: e.target.value } : o,
                            ),
                          })
                        }
                        placeholder={`الخيار ${optionIndex + 1} (نص أو صورة)`}
                        className="flex-1 rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm"
                      />
                      {!locked && question.options.length > 2 && (
                        <IconButton
                          label="حذف الخيار"
                          danger
                          onClick={() =>
                            updateQuestion(index, {
                              options: question.options.filter((_, i) => i !== optionIndex),
                            })
                          }
                        >
                          ✕
                        </IconButton>
                      )}
                    </div>

                    {!locked && (
                      <ImagePicker
                        value={option.imageUrl}
                        onChange={(url) =>
                          updateQuestion(index, {
                            options: question.options.map((o, i) =>
                              i === optionIndex ? { ...o, imageUrl: url ?? '' } : o,
                            ),
                          })
                        }
                        label="صورة الخيار"
                      />
                    )}
                  </div>
                ))}
                {!locked && (
                  <button
                    type="button"
                    onClick={() =>
                      updateQuestion(index, {
                        options: [...question.options, { text: '', imageUrl: '', isCorrect: false }],
                      })
                    }
                    className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                  >
                    + إضافة خيار
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Toggle
                  label="تصحيح يدوي"
                  hint="عند التفعيل تبقى النتيجة معلّقة حتى يصحح الأستاذ الإجابة."
                  checked={question.requiresManualGrading}
                  disabled={locked}
                  onChange={(v) => updateQuestion(index, { requiresManualGrading: v })}
                />
                {!question.requiresManualGrading && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={question.matchValue}
                      disabled={locked}
                      onChange={(e) => updateQuestion(index, { matchValue: e.target.value })}
                      placeholder="الإجابة الصحيحة للتصحيح الآلي"
                      className="rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm"
                    />
                    <select
                      value={question.matchMode}
                      disabled={locked}
                      onChange={(e) =>
                        updateQuestion(index, { matchMode: e.target.value as 'EXACT' | 'CONTAINS' })
                      }
                      className="rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm"
                    >
                      <option value="EXACT">مطابقة تامة</option>
                      <option value="CONTAINS">احتواء</option>
                    </select>
                  </div>
                )}
                <input
                  value={question.modelAnswer}
                  disabled={locked}
                  onChange={(e) => updateQuestion(index, { modelAnswer: e.target.value })}
                  placeholder="إجابة نموذجية (تظهر للأستاذ، وللتلميذ فقط إذا سمحت)"
                  className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm"
                />
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="block text-xs text-gray-600 dark:text-slate-400 mb-1">النقاط</span>
                <input
                  type="number"
                  min={0}
                  value={question.points}
                  disabled={locked}
                  onChange={(e) => updateQuestion(index, { points: Number(e.target.value) })}
                  className="w-full rounded-lg border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm"
                />
              </label>
              <Toggle
                label="سؤال إجباري"
                checked={question.isRequired}
                disabled={locked}
                onChange={(v) => updateQuestion(index, { isRequired: v })}
              />
            </div>
          </div>
        ))}

        {!locked && (
          <button
            type="button"
            onClick={addQuestion}
            className="w-full rounded-xl border border-dashed border-gray-300 dark:border-slate-600 py-3 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
          >
            + إضافة سؤال
          </button>
        )}
      </section>

      {/* ---- assignment ---- */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-3">
        <h2 className="font-semibold text-gray-900 dark:text-slate-100">إسناد إلى التلاميذ</h2>

        <Toggle
          label="إسناد إلى كل تلميذ مسجل في الدورة"
          checked={courseWide}
          disabled={locked}
          onChange={setCourseWide}
        />

        {!courseWide && (
          <div className="space-y-2">
            {students.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-slate-400">اختر دورة أولًا لعرض تلاميذها.</p>
            )}
            {students.map((student) => (
              <label key={student.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={locked}
                  checked={selected.includes(student.id)}
                  onChange={(e) =>
                    setSelected((prev) =>
                      e.target.checked
                        ? [...prev, student.id]
                        : prev.filter((id) => id !== student.id),
                    )
                  }
                />
                <span className="text-gray-800 dark:text-slate-200">{student.name}</span>
                <span className="text-xs text-gray-400 dark:text-slate-500">{student.email}</span>
              </label>
            ))}
          </div>
        )}

        {courseWide && students.length > 0 && (
          <p className="text-sm text-gray-500 dark:text-slate-400">
            سيُسند إلى {students.length} تلميذ مسجل في هذه الدورة.
          </p>
        )}
      </section>

      {/* ---- validation + save ---- */}
      {issues.length > 0 && (
        <div className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-4">
          <p className="text-sm font-medium text-red-800 mb-1">يوجد أخطاء:</p>
          <ul className="list-disc list-inside text-sm text-red-700 dark:text-red-300 space-y-0.5">
            {issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'جارٍ الحفظ…' : (submitLabel ?? 'حفظ كمسودة')}
        </button>
        {message && <span className="text-sm text-green-700 dark:text-emerald-300">{message}</span>}
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 shrink-0"
      />
      <span>
        <span className="text-gray-800 dark:text-slate-200">{label}</span>
        {hint && <span className="block text-xs text-gray-400 dark:text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

function IconButton({
  children,
  onClick,
  disabled,
  danger,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`w-7 h-7 rounded-lg text-xs border disabled:opacity-30${
        danger
          ? 'text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10'
          : 'text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-900/60'
      }`}
    >
      {children}
    </button>
  );
}

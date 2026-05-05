import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { EmptyState, SectionHeading, StatusPill } from "../components/Ui";
import { useAuth } from "../contexts/AuthContext";
import { api, ApiError } from "../lib/api";
import { getAdminApiErrorMessage, isValidAdminSlug } from "../lib/adminErrors";
import type {
  AdminClinicalCaseDetails,
  AdminClinicalCaseFact,
  AdminClinicalCaseListItem,
  AdminClinicalCaseQuizQuestion,
  AdminClinicalCaseWriteInput,
  Faculty,
  Topic,
} from "../types/api";

type EditorMode = "create" | "edit" | null;

interface CaseFactDraft {
  label: string;
  value: string;
  tone: string;
}

interface CaseQuizOptionDraft {
  label: string;
  text: string;
}

interface CaseQuizQuestionDraft {
  id: string;
  prompt: string;
  correctOptionLabel: string;
  explanation: string;
  hint: string;
  options: CaseQuizOptionDraft[];
}

interface CaseDraft {
  slug: string;
  facultyId: string;
  topicId: string;
  title: string;
  subtitle: string;
  difficulty: string;
  durationMinutes: string;
  summary: string;
  patientSummary: string;
  focusPointsText: string;
  examTargetsText: string;
  discussionQuestionsText: string;
  quizQuestions: CaseQuizQuestionDraft[];
  clinicalFacts: CaseFactDraft[];
}

const CASE_QUIZ_QUESTION_COUNT = 12;

function createEmptyFactDraft(): CaseFactDraft {
  return {
    label: "",
    value: "",
    tone: "",
  };
}

function createEmptyQuizQuestionDraft(index = 1): CaseQuizQuestionDraft {
  return {
    id: `case-question-${index}`,
    prompt: "",
    correctOptionLabel: "A",
    explanation: "",
    hint: "",
    options: [
      { label: "A", text: "" },
      { label: "B", text: "" },
      { label: "C", text: "" },
      { label: "D", text: "" },
    ],
  };
}

function createEmptyQuizQuestionDrafts() {
  return Array.from({ length: CASE_QUIZ_QUESTION_COUNT }, (_, index) => createEmptyQuizQuestionDraft(index + 1));
}

function createEmptyDraft(facultyId = "", topicId = ""): CaseDraft {
  return {
    slug: "",
    facultyId,
    topicId,
    title: "",
    subtitle: "",
    difficulty: "Средний приоритет",
    durationMinutes: "15",
    summary: "",
    patientSummary: "",
    focusPointsText: "",
    examTargetsText: "",
    discussionQuestionsText: "",
    quizQuestions: createEmptyQuizQuestionDrafts(),
    clinicalFacts: [createEmptyFactDraft(), createEmptyFactDraft()],
  };
}

function buildDraftFromCase(clinicalCase: AdminClinicalCaseDetails, faculties: Faculty[]): CaseDraft {
  const matchedFaculty = faculties.find((faculty) => faculty.code === clinicalCase.faculty_code);

  return {
    slug: clinicalCase.slug,
    facultyId: matchedFaculty ? String(matchedFaculty.id) : "",
    topicId: clinicalCase.topic_id ? String(clinicalCase.topic_id) : "",
    title: clinicalCase.title,
    subtitle: clinicalCase.subtitle ?? "",
    difficulty: clinicalCase.difficulty,
    durationMinutes: String(clinicalCase.duration_minutes),
    summary: clinicalCase.summary,
    patientSummary: clinicalCase.patient_summary,
    focusPointsText: clinicalCase.focus_points.join("\n"),
    examTargetsText: clinicalCase.exam_targets.join("\n"),
    discussionQuestionsText: clinicalCase.discussion_questions.join("\n"),
    quizQuestions:
      clinicalCase.quiz_questions.length > 0
        ? clinicalCase.quiz_questions.map((question) => ({
            id: question.id,
            prompt: question.prompt,
            correctOptionLabel: question.correct_option_label,
            explanation: question.explanation,
            hint: question.hint ?? "",
            options: question.options.map((option) => ({
              label: option.label,
              text: option.text,
            })),
          }))
        : createEmptyQuizQuestionDrafts(),
    clinicalFacts:
      clinicalCase.clinical_facts.length > 0
        ? clinicalCase.clinical_facts.map((fact) => ({
            label: fact.label,
            value: fact.value,
            tone: fact.tone ?? "",
          }))
        : [createEmptyFactDraft()],
  };
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function AdminCasesPage() {
  const { token } = useAuth();
  const [cases, setCases] = useState<AdminClinicalCaseListItem[]>([]);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [topicsByFaculty, setTopicsByFaculty] = useState<Record<number, Topic[]>>({});
  const [search, setSearch] = useState("");
  const [facultyFilterId, setFacultyFilterId] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [editorSlug, setEditorSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState<CaseDraft>(() => createEmptyDraft());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editorLoading, setEditorLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const deferredSearch = useDeferredValue(search);

  const filteredCases = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return cases.filter((item) => {
      if (facultyFilterId) {
        const matchedFaculty = faculties.find((faculty) => faculty.id === Number(facultyFilterId));

        if (!matchedFaculty || item.faculty_code !== matchedFaculty.code) {
          return false;
        }
      }

      if (!query) {
        return true;
      }

      const haystack = `${item.title} ${item.topic_name} ${item.section_name} ${item.summary}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [cases, deferredSearch, faculties, facultyFilterId]);

  const editorTopics = useMemo(
    () => (draft.facultyId ? topicsByFaculty[Number(draft.facultyId)] ?? [] : []),
    [draft.facultyId, topicsByFaculty],
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);

    void Promise.all([api.listAdminCases(token), api.listFaculties(token)])
      .then(([caseItems, facultyItems]) => {
        setCases(caseItems);
        setFaculties(facultyItems);
      })
      .catch((exception) => {
        setError(exception instanceof ApiError ? exception.message : "Не удалось загрузить административный каталог кейсов");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token, refreshTick]);

  useEffect(() => {
    if (!token || !draft.facultyId) {
      return;
    }

    const facultyId = Number(draft.facultyId);

    if (topicsByFaculty[facultyId]) {
      return;
    }

    void api
      .listTopics(token, facultyId)
      .then((topics) => {
        setTopicsByFaculty((currentValue) => ({ ...currentValue, [facultyId]: topics }));
      })
      .catch((exception) => {
        setError(exception instanceof ApiError ? exception.message : "Не удалось загрузить темы для кейса");
      });
  }, [draft.facultyId, token, topicsByFaculty]);

  async function loadTopicsForFaculty(facultyId: number) {
    if (!token) {
      return [];
    }

    if (topicsByFaculty[facultyId]) {
      return topicsByFaculty[facultyId];
    }

    const topics = await api.listTopics(token, facultyId);
    setTopicsByFaculty((currentValue) => ({ ...currentValue, [facultyId]: topics }));
    return topics;
  }

  function handleDraftChange<K extends keyof CaseDraft>(key: K, value: CaseDraft[K]) {
    setDraft((currentValue) => ({ ...currentValue, [key]: value }));
  }

  function handleFactChange(index: number, key: keyof CaseFactDraft, value: string) {
    setDraft((currentValue) => ({
      ...currentValue,
      clinicalFacts: currentValue.clinicalFacts.map((fact, factIndex) =>
        factIndex === index ? { ...fact, [key]: value } : fact,
      ),
    }));
  }

  function handleQuizQuestionChange(index: number, key: keyof Omit<CaseQuizQuestionDraft, "options">, value: string) {
    setDraft((currentValue) => ({
      ...currentValue,
      quizQuestions: currentValue.quizQuestions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, [key]: value } : question,
      ),
    }));
  }

  function handleQuizOptionChange(questionIndex: number, optionIndex: number, key: keyof CaseQuizOptionDraft, value: string) {
    setDraft((currentValue) => ({
      ...currentValue,
      quizQuestions: currentValue.quizQuestions.map((question, currentQuestionIndex) =>
        currentQuestionIndex === questionIndex
          ? {
              ...question,
              options: question.options.map((option, currentOptionIndex) =>
                currentOptionIndex === optionIndex ? { ...option, [key]: value } : option,
              ),
            }
          : question,
      ),
    }));
  }

  async function handleCreateCase() {
    setError(null);
    setNotice(null);

    const nextFacultyId = facultyFilterId;

    if (nextFacultyId) {
      try {
        await loadTopicsForFaculty(Number(nextFacultyId));
      } catch (exception) {
        setError(exception instanceof ApiError ? exception.message : "Не удалось подготовить темы для нового кейса");
      }
    }

    setEditorMode("create");
    setEditorSlug(null);
    setDraft(createEmptyDraft(nextFacultyId));
  }

  async function handleEditCase(slug: string) {
    if (!token) {
      return;
    }

    setEditorMode("edit");
    setEditorSlug(slug);
    setEditorLoading(true);
    setError(null);
    setNotice(null);

    try {
      const clinicalCase = await api.getAdminCase(token, slug);
      const matchedFaculty = faculties.find((faculty) => faculty.code === clinicalCase.faculty_code);

      if (matchedFaculty) {
        await loadTopicsForFaculty(matchedFaculty.id);
      }

      setDraft(buildDraftFromCase(clinicalCase, faculties));
    } catch (exception) {
      setError(exception instanceof ApiError ? exception.message : "Не удалось открыть кейс для редактирования");
    } finally {
      setEditorLoading(false);
    }
  }

  function buildPayload(): AdminClinicalCaseWriteInput | null {
    const normalizedSlug = draft.slug.trim().toLowerCase();

    if (!normalizedSlug) {
      setError("Укажи код кейса");
      return null;
    }

    if (!isValidAdminSlug(normalizedSlug)) {
      setError("Код кейса должен содержать только строчные латинские буквы, цифры и дефис");
      return null;
    }

    if (cases.some((item) => item.slug === normalizedSlug && item.slug !== editorSlug)) {
      setError("Кейс с таким кодом уже существует");
      return null;
    }

    if (!draft.topicId) {
      setError("Выбери тему кейса");
      return null;
    }

    if (!draft.title.trim()) {
      setError("Название кейса не должно быть пустым");
      return null;
    }

    if (!draft.summary.trim() || !draft.patientSummary.trim()) {
      setError("Заполни краткое описание и клиническую вводную");
      return null;
    }

    const durationMinutes = Number(draft.durationMinutes);

    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      setError("Укажи корректную длительность в минутах");
      return null;
    }

    const clinicalFacts: AdminClinicalCaseFact[] = [];
    const quizQuestions: AdminClinicalCaseQuizQuestion[] = [];

    for (const fact of draft.clinicalFacts) {
      const normalizedLabel = fact.label.trim();
      const normalizedValue = fact.value.trim();
      const normalizedTone = fact.tone.trim();

      if (!normalizedLabel && !normalizedValue && !normalizedTone) {
        continue;
      }

      if (!normalizedLabel || !normalizedValue) {
        setError("У фактов кейса должны быть заполнены и метка, и значение");
        return null;
      }

      clinicalFacts.push({
        label: normalizedLabel,
        value: normalizedValue,
        tone: normalizedTone || null,
      });
    }

    for (const [questionIndex, question] of draft.quizQuestions.entries()) {
      const normalizedId = question.id.trim().toLowerCase();
      const normalizedPrompt = question.prompt.trim();
      const normalizedExplanation = question.explanation.trim();
      const normalizedHint = question.hint.trim();
      const normalizedCorrectOptionLabel = question.correctOptionLabel.trim().toUpperCase();
      const options = question.options
        .map((option) => ({
          label: option.label.trim().toUpperCase(),
          text: option.text.trim(),
        }))
        .filter((option) => option.label || option.text);

      if (!normalizedId || !normalizedPrompt || !normalizedExplanation) {
        setError(`Заполни id, вопрос и объяснение для quiz-вопроса ${questionIndex + 1}`);
        return null;
      }

      if (options.length < 2) {
        setError(`У quiz-вопроса ${questionIndex + 1} должно быть минимум два варианта ответа`);
        return null;
      }

      if (options.some((option) => !/^[A-Z]$/.test(option.label) || !option.text)) {
        setError(`У всех вариантов quiz-вопроса ${questionIndex + 1} должны быть метка A-Z и текст`);
        return null;
      }

      const optionLabels = options.map((option) => option.label);

      if (optionLabels.length !== new Set(optionLabels).size) {
        setError(`Метки вариантов quiz-вопроса ${questionIndex + 1} должны быть уникальными`);
        return null;
      }

      if (!optionLabels.includes(normalizedCorrectOptionLabel)) {
        setError(`Правильный вариант quiz-вопроса ${questionIndex + 1} должен совпадать с одной из меток`);
        return null;
      }

      quizQuestions.push({
        id: normalizedId,
        prompt: normalizedPrompt,
        options,
        correct_option_label: normalizedCorrectOptionLabel,
        explanation: normalizedExplanation,
        hint: normalizedHint || null,
      });
    }

    if (quizQuestions.length !== CASE_QUIZ_QUESTION_COUNT) {
      setError(`Кейс должен содержать ровно ${CASE_QUIZ_QUESTION_COUNT} quiz-вопросов`);
      return null;
    }

    return {
      slug: normalizedSlug,
      topic_id: Number(draft.topicId),
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim() || null,
      difficulty: draft.difficulty.trim(),
      duration_minutes: durationMinutes,
      summary: draft.summary.trim(),
      patient_summary: draft.patientSummary.trim(),
      focus_points: splitLines(draft.focusPointsText),
      exam_targets: splitLines(draft.examTargetsText),
      discussion_questions: splitLines(draft.discussionQuestionsText),
      quiz_questions: quizQuestions,
      clinical_facts: clinicalFacts,
    };
  }

  async function handleSaveCase() {
    if (!token || !editorMode) {
      return;
    }

    const payload = buildPayload();

    if (!payload) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const savedCase =
        editorMode === "edit" && editorSlug
          ? await api.updateAdminCase(token, editorSlug, payload)
          : await api.createAdminCase(token, payload);

      setEditorMode("edit");
      setEditorSlug(savedCase.slug);
      setDraft(buildDraftFromCase(savedCase, faculties));
      setNotice(editorMode === "edit" ? "Кейс обновлен" : "Кейс создан");
      setRefreshTick((currentValue) => currentValue + 1);
    } catch (exception) {
      setError(
        getAdminApiErrorMessage(exception, "Не удалось сохранить кейс", {
          conflictMessage: "Кейс с таким кодом уже существует",
        }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteCase(slug: string) {
    if (!token) {
      return;
    }

    if (!window.confirm("Удалить кейс из внешнего каталога?")) {
      return;
    }

    setDeleting(true);
    setDeletingSlug(slug);
    setError(null);
    setNotice(null);

    try {
      await api.deleteAdminCase(token, slug);

      if (editorSlug === slug) {
        setEditorMode(null);
        setEditorSlug(null);
        setDraft(createEmptyDraft());
      }

      setNotice("Кейс удален из внешнего каталога");
      setRefreshTick((currentValue) => currentValue + 1);
    } catch (exception) {
      setError(getAdminApiErrorMessage(exception, "Не удалось удалить кейс"));
    } finally {
      setDeleting(false);
      setDeletingSlug(null);
    }
  }

  const totalDuration = filteredCases.reduce((sum, clinicalCase) => sum + clinicalCase.duration_minutes, 0);
  const averageDuration = filteredCases.length > 0 ? Math.round(totalDuration / filteredCases.length) : 0;
  const visibleFacultyCount = new Set(filteredCases.map((clinicalCase) => clinicalCase.faculty_code)).size;

  return (
    <div className="page-shell admin-page" data-testid="admin-cases-page">
      <section className="masthead">
        <div>
          <div className="page-kicker">Управление сценариями</div>
          <h1 className="page-title">
            Клинические <em>кейсы</em>
          </h1>
          <p className="page-subtitle">
            Создание и редактирование клинических сценариев для этапа кейсов. Контент сохраняется в систему и сразу
            доступен в учебном интерфейсе.
          </p>
        </div>
        <div className="toolbar-row">
          <label className="search-field">
            <span>Поиск кейса</span>
            <input onChange={(event) => setSearch(event.target.value)} placeholder="Название, тема или раздел" value={search} />
          </label>
          <label className="field compact-field">
            <span>Факультет</span>
            <select onChange={(event) => setFacultyFilterId(event.target.value)} value={facultyFilterId}>
              <option value="">Все факультеты</option>
              {faculties.map((faculty) => (
                <option key={faculty.id} value={faculty.id}>
                  {faculty.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-p" data-testid="admin-case-create" onClick={handleCreateCase} type="button">
            Новый кейс
          </button>
        </div>
      </section>

      {error ? <div className="notice danger show" data-testid="admin-case-error">{error}</div> : null}
      {notice ? <div className="notice success show" data-testid="admin-case-notice">{notice}</div> : null}

      <div className="stats-strip">
        <article className="stat-card c-accent">
          <div className="stat-card-val">{cases.length}</div>
          <div className="stat-card-lbl">кейсов всего</div>
        </article>
        <article className="stat-card c-green">
          <div className="stat-card-val">{filteredCases.length}</div>
          <div className="stat-card-lbl">в текущей выборке</div>
        </article>
        <article className="stat-card c-gold">
          <div className="stat-card-val">{visibleFacultyCount}</div>
          <div className="stat-card-lbl">факультетов</div>
        </article>
        <article className="stat-card c-blue">
          <div className="stat-card-val">{averageDuration}</div>
          <div className="stat-card-lbl">минут в среднем</div>
        </article>
      </div>

      <div className="editorial-grid">
        <div className="col-main">
          <section>
            <div className="sec-lbl">Каталог кейсов</div>
            <div className="admin-question-count">{loading ? "Загрузка кейсов" : `${filteredCases.length} кейсов`}</div>
            {loading ? (
              <div className="stack-section">
                <div className="skeleton-card tall" />
                <div className="skeleton-card tall" />
              </div>
            ) : filteredCases.length > 0 ? (
              <div className="admin-list" data-testid="admin-case-list">
                {filteredCases.map((clinicalCase) => (
                  <article
                    className={`admin-card${editorSlug === clinicalCase.slug ? " editing" : ""}`}
                    data-testid={`admin-case-card-${clinicalCase.slug}`}
                    key={clinicalCase.slug}
                  >
                    <div className="admin-card-head">
                      <div>
                        <div className="admin-card-title">{clinicalCase.title}</div>
                        <div className="admin-card-meta">
                          {clinicalCase.faculty_name || clinicalCase.faculty_code} · {clinicalCase.section_name} · {clinicalCase.topic_name}
                        </div>
                      </div>
                      <div className="admin-card-badges">
                        <StatusPill label={clinicalCase.difficulty} size="compact" tone="warm" />
                        <StatusPill label={`${clinicalCase.duration_minutes} мин`} size="compact" tone="default" />
                        <StatusPill label={`${clinicalCase.quiz_questions_count} quiz`} size="compact" tone="accent" />
                      </div>
                    </div>
                    {clinicalCase.subtitle ? <div className="case-admin-subtitle">{clinicalCase.subtitle}</div> : null}
                    <p className="admin-card-text">{clinicalCase.summary}</p>
                    <div className="admin-card-actions">
                      <button className="btn btn-o btn-sm" onClick={() => handleEditCase(clinicalCase.slug)} type="button">
                        {editorSlug === clinicalCase.slug ? "Открыт" : "Редактировать"}
                      </button>
                      <button
                        className="btn btn-g btn-xs admin-card-delete"
                        disabled={deleting && deletingSlug === clinicalCase.slug}
                        onClick={() => handleDeleteCase(clinicalCase.slug)}
                        type="button"
                      >
                        {deleting && deletingSlug === clinicalCase.slug ? "Удаляем..." : "Удалить"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="Кейсы не найдены" description="Список кейсов пуст или текущий фильтр ничего не показал." />
            )}
          </section>
        </div>

        <aside className="col-side">
          <section>
            <div className="sec-lbl">Редактор кейса</div>
            {editorMode ? (
              <article className="form-panel panel-stack" data-testid="admin-case-editor">
                {editorLoading ? (
                  <div className="skeleton-card tall" />
                ) : (
                  <>
                    <div className="editor-header">
                      <div>
                        <div className="editor-mode-label">{editorMode === "edit" ? "Редактирование" : "Создание"}</div>
                        <div className="editor-title">{editorMode === "edit" ? `Кейс ${editorSlug}` : "Новый кейс"}</div>
                        <div className="panel-meta">Кейс сохраняется в систему и сразу попадает в студенческий интерфейс.</div>
                      </div>
                      {editorMode === "edit" && editorSlug ? (
                        <button
                          className="btn btn-xs btn-danger"
                          data-testid="admin-case-delete"
                          disabled={deleting && deletingSlug === editorSlug}
                          onClick={() => handleDeleteCase(editorSlug)}
                          type="button"
                        >
                          {deleting && deletingSlug === editorSlug ? "Удаляем..." : "Удалить"}
                        </button>
                      ) : null}
                    </div>

                    <div className="form-row">
                      <label className="field">
                        <span>Факультет</span>
                        <select
                          data-testid="admin-case-faculty"
                          onChange={(event) =>
                            setDraft((currentValue) => ({
                              ...currentValue,
                              facultyId: event.target.value,
                              topicId: "",
                            }))
                          }
                          value={draft.facultyId}
                        >
                          <option value="">Выбери факультет</option>
                          {faculties.map((faculty) => (
                            <option key={faculty.id} value={faculty.id}>
                              {faculty.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="field">
                        <span>Тема</span>
                        <select
                          data-testid="admin-case-topic"
                          disabled={!draft.facultyId}
                          onChange={(event) => handleDraftChange("topicId", event.target.value)}
                          value={draft.topicId}
                        >
                          <option value="">Выбери тему</option>
                          {editorTopics.map((topic) => (
                            <option key={topic.id} value={topic.id}>
                              {topic.section_name} · {topic.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="form-row">
                      <label className="field">
                        <span>Код кейса</span>
                        <input
                          data-testid="admin-case-slug"
                          onChange={(event) => handleDraftChange("slug", event.target.value)}
                          placeholder="ostryy-koronarnyy-sindrom"
                          value={draft.slug}
                        />
                      </label>

                      <label className="field">
                        <span>Длительность</span>
                        <input
                          min="1"
                          onChange={(event) => handleDraftChange("durationMinutes", event.target.value)}
                          type="number"
                          value={draft.durationMinutes}
                        />
                      </label>
                    </div>

                    <div className="form-row">
                      <label className="field">
                        <span>Название</span>
                        <input
                          data-testid="admin-case-title"
                          onChange={(event) => handleDraftChange("title", event.target.value)}
                          placeholder="Название кейса"
                          value={draft.title}
                        />
                      </label>

                      <label className="field">
                        <span>Сложность</span>
                        <input
                          onChange={(event) => handleDraftChange("difficulty", event.target.value)}
                          placeholder="Например, Средний приоритет"
                          value={draft.difficulty}
                        />
                      </label>
                    </div>

                    <label className="field">
                      <span>Подзаголовок</span>
                      <input
                        onChange={(event) => handleDraftChange("subtitle", event.target.value)}
                        placeholder="Короткий подзаголовок кейса"
                        value={draft.subtitle}
                      />
                    </label>

                    <label className="field">
                      <span>Краткое описание</span>
                      <textarea
                        data-testid="admin-case-summary"
                        onChange={(event) => handleDraftChange("summary", event.target.value)}
                        placeholder="Краткое содержание кейса"
                        rows={4}
                        value={draft.summary}
                      />
                    </label>

                    <label className="field">
                      <span>Клиническая вводная</span>
                      <textarea
                        data-testid="admin-case-patient-summary"
                        onChange={(event) => handleDraftChange("patientSummary", event.target.value)}
                        placeholder="Описание пациента и стартовой ситуации"
                        rows={5}
                        value={draft.patientSummary}
                      />
                    </label>

                    <label className="field">
                      <span>Ключевые действия</span>
                      <textarea
                        onChange={(event) => handleDraftChange("focusPointsText", event.target.value)}
                        placeholder="Каждый пункт с новой строки"
                        rows={4}
                        value={draft.focusPointsText}
                      />
                    </label>

                    <label className="field">
                      <span>Цели аккредитации</span>
                      <textarea
                        onChange={(event) => handleDraftChange("examTargetsText", event.target.value)}
                        placeholder="Каждый пункт с новой строки"
                        rows={4}
                        value={draft.examTargetsText}
                      />
                    </label>

                    <label className="field">
                      <span>Вопросы для самопроверки</span>
                      <textarea
                        onChange={(event) => handleDraftChange("discussionQuestionsText", event.target.value)}
                        placeholder="Каждый вопрос с новой строки"
                        rows={4}
                        value={draft.discussionQuestionsText}
                      />
                    </label>

                    <div className="fact-editor-list">
                      <SectionHeading>Проверочные quiz-вопросы</SectionHeading>
                      <div className="panel-meta">Для каждого кейса нужно ровно {CASE_QUIZ_QUESTION_COUNT} вопросов.</div>
                      {draft.quizQuestions.map((question, questionIndex) => (
                        <article className="fact-editor-row" key={`${questionIndex}-${question.id}`}>
                          <div className="form-row">
                            <label className="field">
                              <span>Id вопроса</span>
                              <input
                                data-testid={`admin-case-question-${questionIndex}-id`}
                                onChange={(event) => handleQuizQuestionChange(questionIndex, "id", event.target.value)}
                                placeholder="diagnosis-step"
                                value={question.id}
                              />
                            </label>
                            <label className="field">
                              <span>Правильная метка</span>
                              <input
                                data-testid={`admin-case-question-${questionIndex}-correct-option`}
                                maxLength={1}
                                onChange={(event) => handleQuizQuestionChange(questionIndex, "correctOptionLabel", event.target.value)}
                                placeholder="A"
                                value={question.correctOptionLabel}
                              />
                            </label>
                          </div>
                          <label className="field">
                            <span>Вопрос</span>
                            <textarea
                              data-testid={`admin-case-question-${questionIndex}-prompt`}
                              onChange={(event) => handleQuizQuestionChange(questionIndex, "prompt", event.target.value)}
                              rows={3}
                              value={question.prompt}
                            />
                          </label>
                          <label className="field">
                            <span>Подсказка</span>
                            <textarea
                              data-testid={`admin-case-question-${questionIndex}-hint`}
                              onChange={(event) => handleQuizQuestionChange(questionIndex, "hint", event.target.value)}
                              rows={2}
                              value={question.hint}
                            />
                          </label>
                          <div className="quiz-option-grid">
                            {question.options.map((option, optionIndex) => (
                              <div className="form-row" key={`${questionIndex}-${optionIndex}`}>
                                <label className="field compact-field">
                                  <span>Метка</span>
                                  <input
                                    data-testid={`admin-case-question-${questionIndex}-option-${optionIndex}-label`}
                                    maxLength={1}
                                    onChange={(event) => handleQuizOptionChange(questionIndex, optionIndex, "label", event.target.value)}
                                    value={option.label}
                                  />
                                </label>
                                <label className="field">
                                  <span>Вариант ответа</span>
                                  <input
                                    data-testid={`admin-case-question-${questionIndex}-option-${optionIndex}-text`}
                                    onChange={(event) => handleQuizOptionChange(questionIndex, optionIndex, "text", event.target.value)}
                                    value={option.text}
                                  />
                                </label>
                              </div>
                            ))}
                          </div>
                          <label className="field">
                            <span>Объяснение</span>
                            <textarea
                              data-testid={`admin-case-question-${questionIndex}-explanation`}
                              onChange={(event) => handleQuizQuestionChange(questionIndex, "explanation", event.target.value)}
                              rows={3}
                              value={question.explanation}
                            />
                          </label>
                          <button
                            className="text-action"
                            disabled={draft.quizQuestions.length <= CASE_QUIZ_QUESTION_COUNT}
                            onClick={() =>
                              setDraft((currentValue) => ({
                                ...currentValue,
                                quizQuestions: currentValue.quizQuestions.filter((_, currentQuestionIndex) => currentQuestionIndex !== questionIndex),
                              }))
                            }
                            type="button"
                          >
                            Удалить quiz-вопрос
                          </button>
                        </article>
                      ))}
                    </div>

                    <button
                      className="cta-secondary"
                      disabled={draft.quizQuestions.length >= CASE_QUIZ_QUESTION_COUNT}
                      onClick={() =>
                        setDraft((currentValue) => ({
                          ...currentValue,
                          quizQuestions: [...currentValue.quizQuestions, createEmptyQuizQuestionDraft(currentValue.quizQuestions.length + 1)],
                        }))
                      }
                      type="button"
                    >
                      Добавить quiz-вопрос
                    </button>

                    <div className="fact-editor-list">
                      {draft.clinicalFacts.map((fact, index) => (
                        <article className="fact-editor-row" key={`${index}-${fact.label}-${fact.value}`}>
                          <div className="fact-editor-grid">
                            <label className="field">
                              <span>Метка</span>
                              <input
                                onChange={(event) => handleFactChange(index, "label", event.target.value)}
                                placeholder="Например, АД"
                                value={fact.label}
                              />
                            </label>
                            <label className="field">
                              <span>Значение</span>
                              <input
                                onChange={(event) => handleFactChange(index, "value", event.target.value)}
                                placeholder="Например, 150/95 мм рт. ст."
                                value={fact.value}
                              />
                            </label>
                            <label className="field">
                              <span>Тон</span>
                              <input
                                onChange={(event) => handleFactChange(index, "tone", event.target.value)}
                                placeholder="Необязательно"
                                value={fact.tone}
                              />
                            </label>
                          </div>
                          <button
                            className="text-action"
                            disabled={draft.clinicalFacts.length === 1}
                            onClick={() =>
                              setDraft((currentValue) => ({
                                ...currentValue,
                                clinicalFacts: currentValue.clinicalFacts.filter((_, factIndex) => factIndex !== index),
                              }))
                            }
                            type="button"
                          >
                            Удалить факт
                          </button>
                        </article>
                      ))}
                    </div>

                    <button
                      className="cta-secondary"
                      onClick={() =>
                        setDraft((currentValue) => ({
                          ...currentValue,
                          clinicalFacts: [...currentValue.clinicalFacts, createEmptyFactDraft()],
                        }))
                      }
                      type="button"
                    >
                      Добавить факт
                    </button>

                    <div className="action-row">
                      <button className="cta-primary" data-testid="admin-case-save" disabled={submitting} onClick={handleSaveCase} type="button">
                        {submitting ? "Сохраняем..." : editorMode === "edit" ? "Сохранить кейс" : "Создать кейс"}
                      </button>
                      <button
                        className="cta-secondary"
                        onClick={() => {
                          setEditorMode(null);
                          setEditorSlug(null);
                          setDraft(createEmptyDraft());
                        }}
                        type="button"
                      >
                        Закрыть редактор
                      </button>
                    </div>
                  </>
                )}
              </article>
            ) : (
              <div className="note-card">
                <strong>Редактор пока закрыт</strong>
                <p>Открой существующий кейс или создай новый, чтобы редактировать внешний сценарный контент системы.</p>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

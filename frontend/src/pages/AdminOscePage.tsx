import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { EmptyState, SectionHeading, StatusPill } from "../components/Ui";
import { useAuth } from "../contexts/AuthContext";
import { api, ApiError } from "../lib/api";
import { getAdminApiErrorMessage, isValidAdminItemId, isValidAdminOptionLabel, isValidAdminSlug } from "../lib/adminErrors";
import type {
  AdminOsceChecklistItem,
  AdminOsceOptionItem,
  AdminOsceQuestionItem,
  AdminOsceStationDetails,
  AdminOsceStationListItem,
  AdminOsceStationWriteInput,
  Faculty,
  Topic,
} from "../types/api";

type EditorMode = "create" | "edit" | null;

interface ChecklistDraft {
  id: string;
  title: string;
  description: string;
  critical: boolean;
}

interface OptionDraft {
  label: string;
  text: string;
}

interface QuestionDraft {
  id: string;
  prompt: string;
  correctOptionLabel: string;
  explanation: string;
  options: OptionDraft[];
}

interface StationDraft {
  slug: string;
  facultyId: string;
  topicId: string;
  title: string;
  subtitle: string;
  skillLevel: string;
  durationMinutes: string;
  maxScore: string;
  summary: string;
  checklistItems: ChecklistDraft[];
  quizQuestions: QuestionDraft[];
}

function createEmptyChecklistDraft(): ChecklistDraft {
  return { id: "", title: "", description: "", critical: false };
}

function createDefaultOptions(): OptionDraft[] {
  return ["A", "B", "C", "D"].map((label) => ({ label, text: "" }));
}

function createEmptyQuestionDraft(): QuestionDraft {
  return {
    id: "",
    prompt: "",
    correctOptionLabel: "A",
    explanation: "",
    options: createDefaultOptions(),
  };
}

function createEmptyDraft(facultyId = "", topicId = ""): StationDraft {
  return {
    slug: "",
    facultyId,
    topicId,
    title: "",
    subtitle: "",
    skillLevel: "Стандартная станция",
    durationMinutes: "10",
    maxScore: "20",
    summary: "",
    checklistItems: [createEmptyChecklistDraft(), createEmptyChecklistDraft()],
    quizQuestions: [createEmptyQuestionDraft()],
  };
}

function buildDraftFromStation(station: AdminOsceStationDetails, faculties: Faculty[]): StationDraft {
  const matchedFaculty = faculties.find((faculty) => faculty.code === station.faculty_code);

  return {
    slug: station.slug,
    facultyId: matchedFaculty ? String(matchedFaculty.id) : "",
    topicId: station.topic_id ? String(station.topic_id) : "",
    title: station.title,
    subtitle: station.subtitle ?? "",
    skillLevel: station.skill_level,
    durationMinutes: String(station.duration_minutes),
    maxScore: String(station.max_score),
    summary: station.summary,
    checklistItems:
      station.checklist_items.length > 0
        ? station.checklist_items.map((item) => ({
            id: item.id,
            title: item.title,
            description: item.description,
            critical: item.critical,
          }))
        : [createEmptyChecklistDraft()],
    quizQuestions:
      station.quiz_questions.length > 0
        ? station.quiz_questions.map((question) => ({
            id: question.id,
            prompt: question.prompt,
            correctOptionLabel: question.correct_option_label,
            explanation: question.explanation,
            options: question.options.map((option) => ({ label: option.label, text: option.text })),
          }))
        : [createEmptyQuestionDraft()],
  };
}

export function AdminOscePage() {
  const { token } = useAuth();
  const [stations, setStations] = useState<AdminOsceStationListItem[]>([]);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [topicsByFaculty, setTopicsByFaculty] = useState<Record<number, Topic[]>>({});
  const [search, setSearch] = useState("");
  const [facultyFilterId, setFacultyFilterId] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [editorSlug, setEditorSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState<StationDraft>(() => createEmptyDraft());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editorLoading, setEditorLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const deferredSearch = useDeferredValue(search);

  const filteredStations = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return stations.filter((item) => {
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
  }, [deferredSearch, faculties, facultyFilterId, stations]);

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

    void Promise.all([api.listAdminOsceStations(token), api.listFaculties(token)])
      .then(([stationItems, facultyItems]) => {
        setStations(stationItems);
        setFaculties(facultyItems);
      })
      .catch((exception) => {
        setError(exception instanceof ApiError ? exception.message : "Не удалось загрузить административный каталог ОСКЭ");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [refreshTick, token]);

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
        setError(exception instanceof ApiError ? exception.message : "Не удалось загрузить темы для станции");
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

  function handleDraftChange<K extends keyof StationDraft>(key: K, value: StationDraft[K]) {
    setDraft((currentValue) => ({ ...currentValue, [key]: value }));
  }

  function handleChecklistChange(index: number, key: keyof ChecklistDraft, value: string | boolean) {
    setDraft((currentValue) => ({
      ...currentValue,
      checklistItems: currentValue.checklistItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    }));
  }

  function handleQuestionChange(index: number, key: keyof QuestionDraft, value: string) {
    setDraft((currentValue) => ({
      ...currentValue,
      quizQuestions: currentValue.quizQuestions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, [key]: value } : question,
      ),
    }));
  }

  function handleQuestionOptionChange(questionIndex: number, optionIndex: number, key: keyof OptionDraft, value: string) {
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

  async function handleCreateStation() {
    setError(null);
    setNotice(null);

    const nextFacultyId = facultyFilterId;

    if (nextFacultyId) {
      try {
        await loadTopicsForFaculty(Number(nextFacultyId));
      } catch (exception) {
        setError(exception instanceof ApiError ? exception.message : "Не удалось подготовить темы для новой станции");
      }
    }

    setEditorMode("create");
    setEditorSlug(null);
    setDraft(createEmptyDraft(nextFacultyId));
  }

  async function handleEditStation(slug: string) {
    if (!token) {
      return;
    }

    setEditorMode("edit");
    setEditorSlug(slug);
    setEditorLoading(true);
    setError(null);
    setNotice(null);

    try {
      const station = await api.getAdminOsceStation(token, slug);
      const matchedFaculty = faculties.find((faculty) => faculty.code === station.faculty_code);

      if (matchedFaculty) {
        await loadTopicsForFaculty(matchedFaculty.id);
      }

      setDraft(buildDraftFromStation(station, faculties));
    } catch (exception) {
      setError(exception instanceof ApiError ? exception.message : "Не удалось открыть станцию для редактирования");
    } finally {
      setEditorLoading(false);
    }
  }

  function buildPayload(): AdminOsceStationWriteInput | null {
    const normalizedSlug = draft.slug.trim().toLowerCase();

    if (!normalizedSlug) {
      setError("Укажи код станции");
      return null;
    }

    if (!isValidAdminSlug(normalizedSlug)) {
      setError("Код станции должен содержать только строчные латинские буквы, цифры и дефис");
      return null;
    }

    if (stations.some((item) => item.slug === normalizedSlug && item.slug !== editorSlug)) {
      setError("Станция с таким кодом уже существует");
      return null;
    }

    if (!draft.topicId) {
      setError("Выбери тему станции");
      return null;
    }

    if (!draft.title.trim()) {
      setError("Название станции не должно быть пустым");
      return null;
    }

    if (!draft.summary.trim()) {
      setError("Заполни краткое описание станции");
      return null;
    }

    const durationMinutes = Number(draft.durationMinutes);
    const maxScore = Number(draft.maxScore);

    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      setError("Укажи корректную длительность станции");
      return null;
    }

    if (!Number.isInteger(maxScore) || maxScore <= 0) {
      setError("Укажи корректный максимальный балл");
      return null;
    }

    const checklistItems: AdminOsceChecklistItem[] = [];
    const checklistIds = new Set<string>();

    for (const item of draft.checklistItems) {
      const normalizedId = item.id.trim().toLowerCase();
      const normalizedTitle = item.title.trim();
      const normalizedDescription = item.description.trim();

      if (!normalizedId && !normalizedTitle && !normalizedDescription) {
        continue;
      }

      if (!normalizedId || !normalizedTitle || !normalizedDescription) {
        setError("У каждого пункта чек-листа должны быть код, название и описание");
        return null;
      }

      if (!isValidAdminItemId(normalizedId)) {
        setError("Коды пунктов чек-листа должны содержать только строчные латинские буквы, цифры и дефис");
        return null;
      }

      if (checklistIds.has(normalizedId)) {
        setError("Коды пунктов чек-листа должны быть уникальными");
        return null;
      }

      checklistIds.add(normalizedId);
      checklistItems.push({
        id: normalizedId,
        title: normalizedTitle,
        description: normalizedDescription,
        critical: item.critical,
      });
    }

    if (checklistItems.length === 0) {
      setError("Добавь хотя бы один пункт чек-листа");
      return null;
    }

    const quizQuestions: AdminOsceQuestionItem[] = [];
    const questionIds = new Set<string>();

    for (const question of draft.quizQuestions) {
      const normalizedQuestionId = question.id.trim().toLowerCase();
      const normalizedPrompt = question.prompt.trim();
      const normalizedExplanation = question.explanation.trim();
      const normalizedCorrectOptionLabel = question.correctOptionLabel.trim().toUpperCase();

      if (!normalizedQuestionId && !normalizedPrompt && !normalizedExplanation) {
        continue;
      }

      if (!normalizedQuestionId || !normalizedPrompt || !normalizedExplanation) {
        setError("У каждого вопроса должны быть код, формулировка и объяснение");
        return null;
      }

      if (!isValidAdminItemId(normalizedQuestionId)) {
        setError("Коды вопросов мини-теста должны содержать только строчные латинские буквы, цифры и дефис");
        return null;
      }

      if (!isValidAdminOptionLabel(normalizedCorrectOptionLabel)) {
        setError("Правильный вариант должен быть одной латинской буквой");
        return null;
      }

      if (questionIds.has(normalizedQuestionId)) {
        setError("Коды вопросов мини-теста должны быть уникальными");
        return null;
      }

      questionIds.add(normalizedQuestionId);

      const options: AdminOsceOptionItem[] = [];
      const optionLabels = new Set<string>();

      for (const option of question.options) {
        const normalizedLabel = option.label.trim().toUpperCase();
        const normalizedText = option.text.trim();

        if (!normalizedLabel && !normalizedText) {
          continue;
        }

        if (!normalizedLabel || !normalizedText) {
          setError("У каждого варианта ответа должны быть метка и текст");
          return null;
        }

        if (!isValidAdminOptionLabel(normalizedLabel)) {
          setError("Метка варианта ответа должна быть одной латинской буквой");
          return null;
        }

        if (optionLabels.has(normalizedLabel)) {
          setError("Метки вариантов ответа внутри одного вопроса должны быть уникальными");
          return null;
        }

        optionLabels.add(normalizedLabel);
        options.push({
          label: normalizedLabel,
          text: normalizedText,
        });
      }

      if (options.length < 2) {
        setError("У каждого вопроса должно быть минимум два варианта ответа");
        return null;
      }

      if (!optionLabels.has(normalizedCorrectOptionLabel)) {
        setError("Правильный вариант должен совпадать с одной из меток ответа");
        return null;
      }

      quizQuestions.push({
        id: normalizedQuestionId,
        prompt: normalizedPrompt,
        options,
        correct_option_label: normalizedCorrectOptionLabel,
        explanation: normalizedExplanation,
      });
    }

    if (quizQuestions.length === 0) {
      setError("Добавь хотя бы один вопрос мини-теста");
      return null;
    }

    return {
      slug: normalizedSlug,
      topic_id: Number(draft.topicId),
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim() || null,
      skill_level: draft.skillLevel.trim(),
      duration_minutes: durationMinutes,
      max_score: maxScore,
      summary: draft.summary.trim(),
      checklist_items: checklistItems,
      quiz_questions: quizQuestions,
    };
  }

  async function handleSaveStation() {
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
      const savedStation =
        editorMode === "edit" && editorSlug
          ? await api.updateAdminOsceStation(token, editorSlug, payload)
          : await api.createAdminOsceStation(token, payload);

      setEditorMode("edit");
      setEditorSlug(savedStation.slug);
      setDraft(buildDraftFromStation(savedStation, faculties));
      setNotice(editorMode === "edit" ? "Станция обновлена" : "Станция создана");
      setRefreshTick((currentValue) => currentValue + 1);
    } catch (exception) {
      setError(
        getAdminApiErrorMessage(exception, "Не удалось сохранить станцию", {
          conflictMessage: "Станция с таким кодом уже существует",
        }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteStation(slug: string) {
    if (!token) {
      return;
    }

    if (!window.confirm("Удалить станцию ОСКЭ из внешнего каталога?")) {
      return;
    }

    setDeleting(true);
    setDeletingSlug(slug);
    setError(null);
    setNotice(null);

    try {
      await api.deleteAdminOsceStation(token, slug);

      if (editorSlug === slug) {
        setEditorMode(null);
        setEditorSlug(null);
        setDraft(createEmptyDraft());
      }

      setNotice("Станция удалена из внешнего каталога");
      setRefreshTick((currentValue) => currentValue + 1);
    } catch (exception) {
      setError(getAdminApiErrorMessage(exception, "Не удалось удалить станцию"));
    } finally {
      setDeleting(false);
      setDeletingSlug(null);
    }
  }

  const checklistItemCount = filteredStations.reduce((sum, station) => sum + station.checklist_items_count, 0);
  const quizQuestionCount = filteredStations.reduce((sum, station) => sum + station.quiz_questions_count, 0);
  const averageMaxScore =
    filteredStations.length > 0
      ? Math.round(filteredStations.reduce((sum, station) => sum + station.max_score, 0) / filteredStations.length)
      : 0;

  return (
    <div className="page-shell admin-page" data-testid="admin-osce-page">
      <section className="masthead">
        <div>
          <div className="page-kicker">Управление станциями</div>
          <h1 className="page-title">
            Станции <em>ОСКЭ</em>
          </h1>
          <p className="page-subtitle">
            Создание станций, чек-листов и мини-тестов для практического этапа. Контент сохраняется в систему и сразу
            доступен студентам.
          </p>
        </div>
        <div className="toolbar-row">
          <label className="search-field">
            <span>Поиск станции</span>
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
          <button className="btn btn-p" data-testid="admin-osce-create" onClick={handleCreateStation} type="button">
            Новая станция
          </button>
        </div>
      </section>

      {error ? <div className="notice danger show" data-testid="admin-osce-error">{error}</div> : null}
      {notice ? <div className="notice success show" data-testid="admin-osce-notice">{notice}</div> : null}

      <div className="stats-strip">
        <article className="stat-card c-accent">
          <div className="stat-card-val">{stations.length}</div>
          <div className="stat-card-lbl">станций всего</div>
        </article>
        <article className="stat-card c-green">
          <div className="stat-card-val">{checklistItemCount}</div>
          <div className="stat-card-lbl">пунктов чек-листа</div>
        </article>
        <article className="stat-card c-gold">
          <div className="stat-card-val">{quizQuestionCount}</div>
          <div className="stat-card-lbl">вопросов мини-теста</div>
        </article>
        <article className="stat-card c-blue">
          <div className="stat-card-val">{averageMaxScore}</div>
          <div className="stat-card-lbl">средний максимум</div>
        </article>
      </div>

      <div className="editorial-grid">
        <div className="col-main">
          <section>
            <div className="sec-lbl">Каталог станций</div>
            <div className="admin-question-count">{loading ? "Загрузка станций" : `${filteredStations.length} станций`}</div>
            {loading ? (
              <div className="stack-section">
                <div className="skeleton-card tall" />
                <div className="skeleton-card tall" />
              </div>
            ) : filteredStations.length > 0 ? (
              <div className="admin-list" data-testid="admin-osce-list">
                {filteredStations.map((station) => (
                  <article
                    className={`admin-card${editorSlug === station.slug ? " editing" : ""}`}
                    data-testid={`admin-osce-card-${station.slug}`}
                    key={station.slug}
                  >
                    <div className="admin-card-head">
                      <div>
                        <div className="admin-card-title">{station.title}</div>
                        <div className="admin-card-meta">
                          {station.faculty_name || station.faculty_code} · {station.section_name} · {station.topic_name}
                        </div>
                      </div>
                      <div className="admin-card-badges">
                        <StatusPill label={station.skill_level} size="compact" tone="warm" />
                        <StatusPill label={`${station.max_score} баллов`} size="compact" tone="default" />
                      </div>
                    </div>
                    {station.subtitle ? <div className="case-admin-subtitle">{station.subtitle}</div> : null}
                    <p className="admin-card-text">{station.summary}</p>
                    <div className="admin-card-meta">
                      {station.checklist_items_count} пунктов · {station.quiz_questions_count} вопросов · {station.duration_minutes} мин
                    </div>
                    <div className="admin-card-actions">
                      <button className="btn btn-o btn-sm" onClick={() => handleEditStation(station.slug)} type="button">
                        {editorSlug === station.slug ? "Открыт" : "Редактировать"}
                      </button>
                      <button
                        className="btn btn-g btn-xs admin-card-delete"
                        disabled={deleting && deletingSlug === station.slug}
                        onClick={() => handleDeleteStation(station.slug)}
                        type="button"
                      >
                        {deleting && deletingSlug === station.slug ? "Удаляем..." : "Удалить"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="Станции не найдены" description="Список станций ОСКЭ пуст или текущий фильтр ничего не показал." />
            )}
          </section>
        </div>

        <aside className="col-side">
          <section>
            <div className="sec-lbl">Редактор станции</div>
            {editorMode ? (
              <article className="form-panel panel-stack" data-testid="admin-osce-editor">
                {editorLoading ? (
                  <div className="skeleton-card tall" />
                ) : (
                  <>
                    <div className="editor-header">
                      <div>
                        <div className="editor-mode-label">{editorMode === "edit" ? "Редактирование" : "Создание"}</div>
                        <div className="editor-title">{editorMode === "edit" ? `Станция ${editorSlug}` : "Новая станция"}</div>
                        <div className="panel-meta">Станция сохраняется в систему и сразу доступна студентам.</div>
                      </div>
                      {editorMode === "edit" && editorSlug ? (
                        <button
                          className="btn btn-xs btn-danger"
                          data-testid="admin-osce-delete"
                          disabled={deleting && deletingSlug === editorSlug}
                          onClick={() => handleDeleteStation(editorSlug)}
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
                          data-testid="admin-osce-faculty"
                          onChange={(event) =>
                            setDraft((currentValue) => ({ ...currentValue, facultyId: event.target.value, topicId: "" }))
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
                          disabled={!draft.facultyId}
                          data-testid="admin-osce-topic"
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
                        <span>Код станции</span>
                        <input data-testid="admin-osce-slug" onChange={(event) => handleDraftChange("slug", event.target.value)} placeholder="bazovaya-reanimatsiya" value={draft.slug} />
                      </label>
                      <label className="field">
                        <span>Уровень станции</span>
                        <input
                          onChange={(event) => handleDraftChange("skillLevel", event.target.value)}
                          placeholder="Стандартная станция"
                          value={draft.skillLevel}
                        />
                      </label>
                    </div>

                    <div className="form-row">
                      <label className="field">
                        <span>Название</span>
                        <input
                          data-testid="admin-osce-title"
                          onChange={(event) => handleDraftChange("title", event.target.value)}
                          placeholder="Название станции"
                          value={draft.title}
                        />
                      </label>
                      <label className="field">
                        <span>Подзаголовок</span>
                        <input onChange={(event) => handleDraftChange("subtitle", event.target.value)} placeholder="Короткий подзаголовок" value={draft.subtitle} />
                      </label>
                    </div>

                    <div className="form-row">
                      <label className="field">
                        <span>Длительность</span>
                        <input min="1" onChange={(event) => handleDraftChange("durationMinutes", event.target.value)} type="number" value={draft.durationMinutes} />
                      </label>
                      <label className="field">
                        <span>Максимальный балл</span>
                        <input min="1" onChange={(event) => handleDraftChange("maxScore", event.target.value)} type="number" value={draft.maxScore} />
                      </label>
                    </div>

                    <label className="field">
                      <span>Краткое описание</span>
                      <textarea
                        data-testid="admin-osce-summary"
                        onChange={(event) => handleDraftChange("summary", event.target.value)}
                        placeholder="Краткое содержание станции"
                        rows={4}
                        value={draft.summary}
                      />
                    </label>

                    <div className="panel-stack">
                      <SectionHeading>Чек-лист</SectionHeading>
                      <div className="osce-editor-list">
                        {draft.checklistItems.map((item, index) => (
                          <article className="fact-editor-row" key={`${index}-${item.id}-${item.title}`}>
                            <div className="form-row">
                              <label className="field">
                                <span>Код пункта</span>
                                <input
                                  data-testid={`admin-osce-checklist-${index}-id`}
                                  onChange={(event) => handleChecklistChange(index, "id", event.target.value)}
                                  placeholder="bezopasnost-sceny"
                                  value={item.id}
                                />
                              </label>
                              <label className="field">
                                <span>Название</span>
                                <input
                                  data-testid={`admin-osce-checklist-${index}-title`}
                                  onChange={(event) => handleChecklistChange(index, "title", event.target.value)}
                                  placeholder="Название пункта"
                                  value={item.title}
                                />
                              </label>
                            </div>
                            <label className="field">
                              <span>Описание</span>
                              <textarea
                                data-testid={`admin-osce-checklist-${index}-description`}
                                onChange={(event) => handleChecklistChange(index, "description", event.target.value)}
                                placeholder="Как правильно выполнять этот шаг"
                                rows={3}
                                value={item.description}
                              />
                            </label>
                            <label className="check-toggle">
                              <input
                                checked={item.critical}
                                onChange={(event) => handleChecklistChange(index, "critical", event.target.checked)}
                                type="checkbox"
                              />
                              <span>Критически важный пункт</span>
                            </label>
                            <button
                              className="text-action"
                              disabled={draft.checklistItems.length === 1}
                              onClick={() =>
                                setDraft((currentValue) => ({
                                  ...currentValue,
                                  checklistItems: currentValue.checklistItems.filter((_, itemIndex) => itemIndex !== index),
                                }))
                              }
                              type="button"
                            >
                              Удалить пункт
                            </button>
                          </article>
                        ))}
                      </div>
                      <button
                        className="cta-secondary"
                        onClick={() =>
                          setDraft((currentValue) => ({
                            ...currentValue,
                            checklistItems: [...currentValue.checklistItems, createEmptyChecklistDraft()],
                          }))
                        }
                        type="button"
                      >
                        Добавить пункт чек-листа
                      </button>
                    </div>

                    <div className="panel-stack">
                      <SectionHeading>Мини-тест</SectionHeading>
                      <div className="osce-editor-list">
                        {draft.quizQuestions.map((question, questionIndex) => (
                          <article className="option-editor selected" key={`${questionIndex}-${question.id}-${question.prompt}`}>
                            <div className="option-editor-head">
                              <div className="editor-title">Вопрос {questionIndex + 1}</div>
                              <button
                                className="text-action"
                                disabled={draft.quizQuestions.length === 1}
                                onClick={() =>
                                  setDraft((currentValue) => ({
                                    ...currentValue,
                                    quizQuestions: currentValue.quizQuestions.filter(
                                      (_, currentQuestionIndex) => currentQuestionIndex !== questionIndex,
                                    ),
                                  }))
                                }
                                type="button"
                              >
                                Удалить вопрос
                              </button>
                            </div>

                            <div className="option-editor-body">
                              <div className="form-row">
                                <label className="field">
                                  <span>Код вопроса</span>
                                  <input
                                    data-testid={`admin-osce-question-${questionIndex}-id`}
                                    onChange={(event) => handleQuestionChange(questionIndex, "id", event.target.value)}
                                    placeholder="chastota-kompressiy"
                                    value={question.id}
                                  />
                                </label>
                                <label className="field">
                                  <span>Правильный вариант</span>
                                  <input
                                    onChange={(event) => handleQuestionChange(questionIndex, "correctOptionLabel", event.target.value)}
                                    placeholder="A"
                                    value={question.correctOptionLabel}
                                  />
                                </label>
                              </div>

                              <label className="field">
                                <span>Формулировка</span>
                                <textarea
                                  data-testid={`admin-osce-question-${questionIndex}-prompt`}
                                  onChange={(event) => handleQuestionChange(questionIndex, "prompt", event.target.value)}
                                  placeholder="Текст вопроса"
                                  rows={3}
                                  value={question.prompt}
                                />
                              </label>

                              <div className="quiz-option-grid">
                                {question.options.map((option, optionIndex) => (
                                  <article className="fact-editor-row" key={`${questionIndex}-${optionIndex}-${option.label}`}>
                                    <div className="form-row">
                                      <label className="field">
                                        <span>Метка</span>
                                        <input
                                          onChange={(event) =>
                                            handleQuestionOptionChange(questionIndex, optionIndex, "label", event.target.value)
                                          }
                                          placeholder="A"
                                          value={option.label}
                                        />
                                      </label>
                                      <label className="field">
                                        <span>Текст ответа</span>
                                        <input
                                          data-testid={`admin-osce-question-${questionIndex}-option-${optionIndex}-text`}
                                          onChange={(event) =>
                                            handleQuestionOptionChange(questionIndex, optionIndex, "text", event.target.value)
                                          }
                                          placeholder="Текст варианта"
                                          value={option.text}
                                        />
                                      </label>
                                    </div>
                                    <button
                                      className="text-action"
                                      disabled={question.options.length === 2}
                                      onClick={() =>
                                        setDraft((currentValue) => ({
                                          ...currentValue,
                                          quizQuestions: currentValue.quizQuestions.map((currentQuestion, currentQuestionIndex) =>
                                            currentQuestionIndex === questionIndex
                                              ? {
                                                  ...currentQuestion,
                                                  options: currentQuestion.options.filter(
                                                    (_, currentOptionIndex) => currentOptionIndex !== optionIndex,
                                                  ),
                                                }
                                              : currentQuestion,
                                          ),
                                        }))
                                      }
                                      type="button"
                                    >
                                      Удалить вариант
                                    </button>
                                  </article>
                                ))}
                              </div>

                              <button
                                className="cta-secondary"
                                onClick={() =>
                                  setDraft((currentValue) => ({
                                    ...currentValue,
                                    quizQuestions: currentValue.quizQuestions.map((currentQuestion, currentQuestionIndex) =>
                                      currentQuestionIndex === questionIndex
                                        ? {
                                            ...currentQuestion,
                                            options: [...currentQuestion.options, { label: "", text: "" }],
                                          }
                                        : currentQuestion,
                                    ),
                                  }))
                                }
                                type="button"
                              >
                                Добавить вариант ответа
                              </button>

                              <label className="field">
                                <span>Объяснение</span>
                                <textarea
                                  data-testid={`admin-osce-question-${questionIndex}-explanation`}
                                  onChange={(event) => handleQuestionChange(questionIndex, "explanation", event.target.value)}
                                  placeholder="Пояснение к правильному ответу"
                                  rows={3}
                                  value={question.explanation}
                                />
                              </label>
                            </div>
                          </article>
                        ))}
                      </div>
                      <button
                        className="cta-secondary"
                        onClick={() =>
                          setDraft((currentValue) => ({
                            ...currentValue,
                            quizQuestions: [...currentValue.quizQuestions, createEmptyQuestionDraft()],
                          }))
                        }
                        type="button"
                      >
                        Добавить вопрос мини-теста
                      </button>
                    </div>

                    <div className="action-row">
                      <button className="cta-primary" data-testid="admin-osce-save" disabled={submitting} onClick={handleSaveStation} type="button">
                        {submitting ? "Сохраняем..." : editorMode === "edit" ? "Сохранить станцию" : "Создать станцию"}
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
                <p>Открой существующую станцию или создай новую, чтобы редактировать внешний контент ОСКЭ.</p>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

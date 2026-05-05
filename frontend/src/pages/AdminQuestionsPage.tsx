import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { AdminRecordCard } from "../components/AdminRecordCard";
import { Button } from "../components/Button";
import { EmptyStateCard } from "../components/EmptyStateCard";
import { FormCard } from "../components/FormCard";
import { InfoNoteCard } from "../components/InfoNoteCard";
import { MetaLabel } from "../components/MetaLabel";
import { MetricCard } from "../components/MetricCard";
import { NoticeBanner } from "../components/NoticeBanner";
import { PageFrame } from "../components/PageFrame";
import { PageHeader } from "../components/PageHeader";
import { SearchField } from "../components/SearchField";
import { SectionTitle } from "../components/SectionTitle";
import { SelectField } from "../components/SelectField";
import { SegmentedTabs } from "../components/SegmentedTabs";
import { SkeletonBlock } from "../components/SkeletonBlock";
import { StatusBadge } from "../components/StatusBadge";
import { TextAreaField } from "../components/TextAreaField";
import { EmptyState, SectionHeading, StatusPill } from "../components/Ui";
import { Wrapper } from "../components/Wrapper";
import { useAuth } from "../contexts/AuthContext";
import { api, ApiError } from "../lib/api";
import { getAdminApiErrorMessage } from "../lib/adminErrors";
import type {
  AdminQuestionDetails,
  AdminQuestionListItem,
  AdminQuestionListResponse,
  AdminQuestionWriteInput,
  Faculty,
  ImportFileItem,
  QuestionImportResult,
  QuestionImportValidationResult,
  Topic,
} from "../types/api";

type FilterMode = "all" | "active" | "inactive";
type EditorMode = "create" | "edit" | null;

const OPTION_LABELS = ["A", "B", "C", "D", "E"] as const;

type OptionLabel = (typeof OPTION_LABELS)[number];

interface EditorOptionDraft {
  label: OptionLabel;
  text: string;
  explanation: string;
}

interface QuestionDraft {
  facultyId: string;
  topicId: string;
  difficulty: string;
  text: string;
  explanation: string;
  isActive: boolean;
  correctLabel: OptionLabel;
  answerOptions: EditorOptionDraft[];
}

function createEmptyDraft(facultyId = "", topicId = ""): QuestionDraft {
  return {
    facultyId,
    topicId,
    difficulty: "medium",
    text: "",
    explanation: "",
    isActive: true,
    correctLabel: "A",
    answerOptions: OPTION_LABELS.map((label) => ({
      label,
      text: "",
      explanation: "",
    })),
  };
}

function buildDraftFromQuestion(question: AdminQuestionDetails): QuestionDraft {
  const correctLabel =
    question.answer_options.find((answerOption) => answerOption.is_correct)?.label.toUpperCase() ?? "A";

  return {
    facultyId: question.faculty_id ? String(question.faculty_id) : "",
    topicId: question.topic_id ? String(question.topic_id) : "",
    difficulty: question.difficulty,
    text: question.text,
    explanation: question.explanation ?? "",
    isActive: question.is_active,
    correctLabel: OPTION_LABELS.includes(correctLabel as OptionLabel) ? (correctLabel as OptionLabel) : "A",
    answerOptions: OPTION_LABELS.map((label) => {
      const currentOption = question.answer_options.find((item) => item.label.toUpperCase() === label);

      return {
        label,
        text: currentOption?.text ?? "",
        explanation: currentOption?.explanation ?? "",
      };
    }),
  };
}

function buildListItemFromQuestion(question: AdminQuestionDetails): AdminQuestionListItem {
  return {
    id: question.id,
    faculty_id: question.faculty_id,
    faculty_name: question.faculty_name,
    section_id: question.section_id,
    section_name: question.section_name,
    topic_id: question.topic_id,
    topic_name: question.topic_name,
    text: question.text,
    difficulty: question.difficulty,
    is_active: question.is_active,
    answer_option_count: question.answer_options.length,
  };
}

function formatImportFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} Б`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} КБ`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function difficultyLabel(value: string): string {
  if (value === "hard") {
    return "Сложный";
  }

  if (value === "easy") {
    return "Легкий";
  }

  return "Средний";
}

function difficultyTone(value: string): "accent" | "green" | "warm" {
  if (value === "hard") {
    return "accent";
  }

  if (value === "easy") {
    return "green";
  }

  return "warm";
}

export function AdminQuestionsPage() {
  const { token } = useAuth();
  const [data, setData] = useState<AdminQuestionListResponse | null>(null);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [topicsByFaculty, setTopicsByFaculty] = useState<Record<number, Topic[]>>({});
  const [importFiles, setImportFiles] = useState<ImportFileItem[]>([]);
  const [selectedImportFile, setSelectedImportFile] = useState("");
  const [importResult, setImportResult] = useState<QuestionImportResult | null>(null);
  const [importValidation, setImportValidation] = useState<QuestionImportValidationResult | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [facultyFilterId, setFacultyFilterId] = useState("");
  const [topicFilterId, setTopicFilterId] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [editorQuestionId, setEditorQuestionId] = useState<number | null>(null);
  const [draft, setDraft] = useState<QuestionDraft>(() => createEmptyDraft());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editorLoading, setEditorLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validatingImport, setValidatingImport] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [busyQuestionId, setBusyQuestionId] = useState<number | null>(null);
  const [deletingQuestionId, setDeletingQuestionId] = useState<number | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const deferredSearch = useDeferredValue(search);

  const filteredTopics = useMemo(
    () => (facultyFilterId ? topicsByFaculty[Number(facultyFilterId)] ?? [] : []),
    [facultyFilterId, topicsByFaculty],
  );
  const editorTopics = useMemo(
    () => (draft.facultyId ? topicsByFaculty[Number(draft.facultyId)] ?? [] : []),
    [draft.facultyId, topicsByFaculty],
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    let isActive = true;

    void Promise.all([api.listFaculties(token), api.listImportFiles(token)])
      .then(([facultyItems, importFileItems]) => {
        if (!isActive) {
          return;
        }

        setFaculties(facultyItems);
        setImportFiles(importFileItems);
      })
      .catch((exception) => {
        if (!isActive) {
          return;
        }

        setError(exception instanceof ApiError ? exception.message : "Не удалось загрузить административные данные");
      });

    return () => {
      isActive = false;
    };
  }, [token, refreshTick]);

  useEffect(() => {
    if (!selectedImportFile && importFiles.length > 0) {
      setSelectedImportFile(importFiles[0].file_name);
      return;
    }

    if (selectedImportFile && !importFiles.some((file) => file.file_name === selectedImportFile) && importFiles.length > 0) {
      setSelectedImportFile(importFiles[0].file_name);
    }
  }, [importFiles, selectedImportFile]);

  useEffect(() => {
    setImportValidation(null);
    setImportResult(null);
  }, [selectedImportFile]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const facultyId = Number(facultyFilterId);

    if (!facultyFilterId || topicsByFaculty[facultyId]) {
      return;
    }

    let isActive = true;

    void api
      .listTopics(token, facultyId)
      .then((topics) => {
        if (!isActive) {
          return;
        }

        setTopicsByFaculty((currentValue) => ({ ...currentValue, [facultyId]: topics }));
      })
      .catch((exception) => {
        if (!isActive) {
          return;
        }

        setError(exception instanceof ApiError ? exception.message : "Не удалось загрузить темы для фильтра");
      });

    return () => {
      isActive = false;
    };
  }, [facultyFilterId, token, topicsByFaculty]);

  useEffect(() => {
    if (!token || !editorMode) {
      return;
    }

    const facultyId = Number(draft.facultyId);

    if (!draft.facultyId || topicsByFaculty[facultyId]) {
      return;
    }

    let isActive = true;

    void api
      .listTopics(token, facultyId)
      .then((topics) => {
        if (!isActive) {
          return;
        }

        setTopicsByFaculty((currentValue) => ({ ...currentValue, [facultyId]: topics }));
      })
      .catch((exception) => {
        if (!isActive) {
          return;
        }

        setError(exception instanceof ApiError ? exception.message : "Не удалось загрузить темы для редактора");
      });

    return () => {
      isActive = false;
    };
  }, [draft.facultyId, editorMode, token, topicsByFaculty]);

  useEffect(() => {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);

    const isActive = filter === "all" ? null : filter === "active";

    void api
      .listAdminQuestions(token, {
        faculty_id: facultyFilterId ? Number(facultyFilterId) : null,
        topic_id: topicFilterId ? Number(topicFilterId) : null,
        search: deferredSearch.trim() || undefined,
        is_active: isActive,
        limit: 100,
      })
      .then(setData)
      .catch((exception) => {
        setError(exception instanceof ApiError ? exception.message : "Не удалось загрузить банк вопросов");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token, filter, facultyFilterId, topicFilterId, deferredSearch, refreshTick]);

  async function loadTopicsForFaculty(facultyId: number, forceRefresh = false) {
    if (!token) {
      return [];
    }

    if (!forceRefresh && topicsByFaculty[facultyId]) {
      return topicsByFaculty[facultyId];
    }

    const topics = await api.listTopics(token, facultyId);
    setTopicsByFaculty((currentValue) => ({ ...currentValue, [facultyId]: topics }));
    return topics;
  }

  async function handleCreateQuestion() {
    setNotice(null);
    setImportResult(null);
    setError(null);

    const nextFacultyId = facultyFilterId;
    const nextTopicId = topicFilterId;

    if (nextFacultyId) {
      try {
        await loadTopicsForFaculty(Number(nextFacultyId));
      } catch (exception) {
        setError(exception instanceof ApiError ? exception.message : "Не удалось подготовить список тем");
      }
    }

    setEditorMode("create");
    setEditorQuestionId(null);
    setDraft(createEmptyDraft(nextFacultyId, nextTopicId));
  }

  async function handleEditQuestion(questionId: number) {
    if (!token) {
      return;
    }

    setEditorMode("edit");
    setEditorQuestionId(questionId);
    setEditorLoading(true);
    setNotice(null);
    setImportResult(null);
    setError(null);

    try {
      const question = await api.getAdminQuestion(token, questionId);

      if (question.faculty_id) {
        await loadTopicsForFaculty(question.faculty_id);
      }

      setDraft(buildDraftFromQuestion(question));
    } catch (exception) {
      setError(exception instanceof ApiError ? exception.message : "Не удалось открыть вопрос для редактирования");
    } finally {
      setEditorLoading(false);
    }
  }

  function handleDraftChange<K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) {
    setDraft((currentValue) => ({ ...currentValue, [key]: value }));
  }

  function handleOptionChange(index: number, key: keyof EditorOptionDraft, value: string) {
    setDraft((currentValue) => ({
      ...currentValue,
      answerOptions: currentValue.answerOptions.map((option, optionIndex) =>
        optionIndex === index ? { ...option, [key]: value } : option,
      ),
    }));
  }

  function buildQuestionPayload(): AdminQuestionWriteInput | null {
    if (!draft.topicId) {
      setError("Выбери тему для вопроса");
      return null;
    }

    if (!draft.text.trim()) {
      setError("Текст вопроса не должен быть пустым");
      return null;
    }

    if (draft.answerOptions.some((option) => !option.text.trim())) {
      setError("Заполни текст для всех вариантов ответа");
      return null;
    }

    return {
      topic_id: Number(draft.topicId),
      text: draft.text.trim(),
      difficulty: draft.difficulty,
      explanation: draft.explanation.trim() || null,
      is_active: draft.isActive,
      answer_options: draft.answerOptions.map((option) => ({
        label: option.label,
        text: option.text.trim(),
        is_correct: option.label === draft.correctLabel,
        explanation: option.explanation.trim() || null,
      })),
    };
  }

  async function handleSaveQuestion() {
    if (!token || !editorMode) {
      return;
    }

    const payload = buildQuestionPayload();

    if (!payload) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const savedQuestion =
        editorMode === "edit" && editorQuestionId !== null
          ? await api.updateAdminQuestion(token, editorQuestionId, payload)
          : await api.createAdminQuestion(token, payload);

      if (savedQuestion.faculty_id) {
        await loadTopicsForFaculty(savedQuestion.faculty_id, true);
      }

      setEditorMode("edit");
      setEditorQuestionId(savedQuestion.id);
      setDraft(buildDraftFromQuestion(savedQuestion));
      setNotice(editorMode === "edit" ? "Вопрос обновлен" : "Вопрос создан");
      setRefreshTick((currentValue) => currentValue + 1);
    } catch (exception) {
      setError(
        getAdminApiErrorMessage(exception, "Не удалось сохранить вопрос", {
          conflictMessage: "В этой теме уже есть вопрос с таким текстом",
        }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  function replaceQuestionInList(question: AdminQuestionDetails) {
    const listItem = buildListItemFromQuestion(question);

    setData((currentValue) => {
      if (!currentValue) {
        return currentValue;
      }

      const shouldStayVisible =
        filter === "all" ||
        (filter === "active" && listItem.is_active) ||
        (filter === "inactive" && !listItem.is_active);
      const itemExists = currentValue.items.some((item) => item.id === listItem.id);
      const nextItems = shouldStayVisible
        ? itemExists
          ? currentValue.items.map((item) => (item.id === listItem.id ? listItem : item))
          : [listItem, ...currentValue.items]
        : currentValue.items.filter((item) => item.id !== listItem.id);

      return {
        ...currentValue,
        items: nextItems,
        total:
          itemExists === shouldStayVisible
            ? currentValue.total
            : Math.max(currentValue.total + (shouldStayVisible ? 1 : -1), 0),
      };
    });
  }

  function removeQuestionFromList(questionId: number) {
    setData((currentValue) => {
      if (!currentValue) {
        return currentValue;
      }

      const itemExists = currentValue.items.some((item) => item.id === questionId);

      return {
        ...currentValue,
        items: currentValue.items.filter((item) => item.id !== questionId),
        total: itemExists ? Math.max(currentValue.total - 1, 0) : currentValue.total,
      };
    });
  }

  async function handleDeactivateQuestion(questionId: number) {
    if (!token) {
      return;
    }

    setBusyQuestionId(questionId);
    setError(null);
    setNotice(null);

    try {
      const question = await api.deactivateAdminQuestion(token, questionId);

      if (editorQuestionId === questionId) {
        setDraft(buildDraftFromQuestion(question));
      }

      replaceQuestionInList(question);
      setNotice("Вопрос скрыт из активного банка");
      setRefreshTick((currentValue) => currentValue + 1);
    } catch (exception) {
      setError(getAdminApiErrorMessage(exception, "Не удалось скрыть вопрос"));
    } finally {
      setBusyQuestionId(null);
    }
  }

  async function handleActivateQuestion(questionId: number) {
    if (!token) {
      return;
    }

    setBusyQuestionId(questionId);
    setError(null);
    setNotice(null);

    try {
      const question = await api.activateAdminQuestion(token, questionId);

      if (editorQuestionId === questionId) {
        setDraft(buildDraftFromQuestion(question));
      }

      replaceQuestionInList(question);
      setNotice("Вопрос возвращен в активный банк");
      setRefreshTick((currentValue) => currentValue + 1);
    } catch (exception) {
      setError(getAdminApiErrorMessage(exception, "Не удалось вернуть вопрос"));
    } finally {
      setBusyQuestionId(null);
    }
  }

  async function handleDeleteQuestion(questionId: number) {
    if (!token) {
      return;
    }

    if (!window.confirm("Удалить вопрос из базы? Это действие нельзя отменить.")) {
      return;
    }

    setDeletingQuestionId(questionId);
    setError(null);
    setNotice(null);

    try {
      await api.deleteAdminQuestion(token, questionId);

      if (editorQuestionId === questionId) {
        setEditorMode(null);
        setEditorQuestionId(null);
        setDraft(createEmptyDraft());
      }

      removeQuestionFromList(questionId);
      setNotice("Вопрос удален из базы");
      setRefreshTick((currentValue) => currentValue + 1);
    } catch (exception) {
      setError(getAdminApiErrorMessage(exception, "Не удалось удалить вопрос"));
    } finally {
      setDeletingQuestionId(null);
    }
  }

  async function handleValidateImportFile() {
    if (!token || !selectedImportFile) {
      return;
    }

    setValidatingImport(true);
    setError(null);
    setNotice(null);
    setImportResult(null);

    try {
      const result = await api.validateQuestionImport(token, { file_name: selectedImportFile });
      setImportValidation(result);
      setNotice(
        result.can_import
          ? `Файл проверен: ${result.valid_row_count} строк готово к импорту`
          : `В файле найдено ошибок: ${result.issue_count}`,
      );
    } catch (exception) {
      setError(exception instanceof ApiError ? exception.message : "Не удалось проверить файл импорта");
    } finally {
      setValidatingImport(false);
    }
  }

  async function handleImportQuestions() {
    if (!token || !selectedImportFile) {
      return;
    }

    setImporting(true);
    setError(null);
    setNotice(null);

    try {
      const result = await api.importQuestions(token, { file_name: selectedImportFile });
      setImportResult(result);
      setImportValidation(null);
      setTopicsByFaculty({});
      setNotice(`Импорт выполнен: ${result.file_name}`);
      setRefreshTick((currentValue) => currentValue + 1);
    } catch (exception) {
      setError(exception instanceof ApiError ? exception.message : "Не удалось импортировать вопросы");
    } finally {
      setImporting(false);
    }
  }

  const visibleQuestions = data?.items ?? [];
  const activeQuestionCount = visibleQuestions.filter((question) => question.is_active).length;
  const hiddenQuestionCount = visibleQuestions.length - activeQuestionCount;
  const visibleTopicCount = new Set(visibleQuestions.map((question) => question.topic_name).filter(Boolean)).size;
  const resultCountLabel = data ? `${data.total} вопросов` : "Загрузка вопросов";

  return (
    <div className="page-shell admin-page" data-testid="admin-questions-page">
      <section className="masthead">
        <div>
          <div className="page-kicker">Управление контентом</div>
          <h1 className="page-title">
            Банк <em>вопросов</em>
          </h1>
          <p className="page-subtitle">
            Создание, редактирование и управление активностью тестовых вопросов. Также доступен импорт из файлов с вопросами.
          </p>
        </div>
        <div className="toolbar-row">
          <label className="search-field">
            <span>Поиск по тексту</span>
            <input onChange={(event) => setSearch(event.target.value)} placeholder="Введите фрагмент вопроса" value={search} />
          </label>
          <label className="field compact-field">
            <span>Факультет</span>
            <select
              onChange={(event) => {
                setFacultyFilterId(event.target.value);
                setTopicFilterId("");
              }}
              value={facultyFilterId}
            >
              <option value="">Все факультеты</option>
              {faculties.map((faculty) => (
                <option key={faculty.id} value={faculty.id}>
                  {faculty.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field compact-field">
            <span>Тема</span>
            <select
              disabled={!facultyFilterId}
              onChange={(event) => setTopicFilterId(event.target.value)}
              value={topicFilterId}
            >
              <option value="">Все темы</option>
              {filteredTopics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
          </label>
          <div className="filter-tabs">
            {[
              { key: "all", label: "Все" },
              { key: "active", label: "Активные" },
              { key: "inactive", label: "Скрытые" },
            ].map((item) => (
              <button
                className={`ftab${filter === item.key ? " on" : ""}`}
                key={item.key}
                onClick={() => setFilter(item.key as FilterMode)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
          <button className="btn btn-p" data-testid="admin-question-create" onClick={handleCreateQuestion} type="button">
            Новый вопрос
          </button>
        </div>
      </section>

      {error ? <div className="notice danger show" data-testid="admin-question-error">{error}</div> : null}
      {notice ? <div className="notice success show" data-testid="admin-question-notice">{notice}</div> : null}

      <div className="stats-strip">
        <article className="stat-card c-accent">
          <div className="stat-card-val">{data?.total ?? "..."}</div>
          <div className="stat-card-lbl">в текущей выборке</div>
        </article>
        <article className="stat-card c-green">
          <div className="stat-card-val">{activeQuestionCount}</div>
          <div className="stat-card-lbl">активных</div>
        </article>
        <article className="stat-card c-gold">
          <div className="stat-card-val">{hiddenQuestionCount}</div>
          <div className="stat-card-lbl">скрытых</div>
        </article>
        <article className="stat-card c-blue">
          <div className="stat-card-val">{visibleTopicCount}</div>
          <div className="stat-card-lbl">тем в выборке</div>
        </article>
      </div>

      <section className="import-panel">
        <button className="import-panel-head" onClick={() => setImportOpen((currentValue) => !currentValue)} type="button">
          <span className="import-panel-title">Импорт файла в банк вопросов</span>
          <span className={`import-chevron${importOpen ? " open" : ""}`}>⌄</span>
        </button>
        <div className={`import-body${importOpen ? " show" : ""}`}>
          <div className="panel-meta">
            Система читает внешние файлы с вопросами из каталога `C:\MedAccData\imports`, а не из репозитория проекта.
          </div>
          {importFiles.length > 0 ? (
            <div className="file-list">
              {importFiles.map((file) => (
                <button
                  className={`file-row${selectedImportFile === file.file_name ? " selected" : ""}`}
                  disabled={importing}
                  key={file.file_name}
                  onClick={() => setSelectedImportFile(file.file_name)}
                  type="button"
                >
                  <span className="file-icon">ФАЙЛ</span>
                  <span className="file-name">{file.file_name}</span>
                  <span className="file-size">{formatImportFileSize(file.size_bytes)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="note-card">
              <strong>Файлы не найдены</strong>
              <p>Положи файл с вопросами в каталог импорта, затем обнови страницу.</p>
            </div>
          )}
          <button
            className="btn btn-o"
            disabled={importFiles.length === 0 || !selectedImportFile || importing || validatingImport}
            onClick={handleValidateImportFile}
            type="button"
          >
            {validatingImport ? "Проверяем..." : "Проверить файл"}
          </button>
          <button
            className="btn btn-p"
            disabled={
              importFiles.length === 0 ||
              !selectedImportFile ||
              importing ||
              validatingImport ||
              importValidation?.can_import === false
            }
            onClick={handleImportQuestions}
            type="button"
          >
            {importing ? "Импортируем..." : "Импортировать вопросы"}
          </button>
          {importValidation ? (
            <div className={`import-validation${importValidation.can_import ? " ok" : " bad"}`}>
              <div className="import-validation-head">
                <strong>{importValidation.can_import ? "Файл готов к импорту" : "Файл требует правки"}</strong>
                <span>
                  {importValidation.valid_row_count} / {importValidation.row_count} строк валидны
                </span>
              </div>
              <div className="import-result">
                <article className="import-score">
                  <div className="import-score-n">{importValidation.row_count}</div>
                  <div className="import-score-l">строк</div>
                </article>
                <article className="import-score">
                  <div className="import-score-n">{importValidation.faculties.length}</div>
                  <div className="import-score-l">факультетов</div>
                </article>
                <article className="import-score">
                  <div className="import-score-n">{importValidation.section_count}</div>
                  <div className="import-score-l">разделов</div>
                </article>
                <article className="import-score">
                  <div className="import-score-n">{importValidation.topic_count}</div>
                  <div className="import-score-l">тем</div>
                </article>
              </div>
              {Object.keys(importValidation.difficulty_counts).length > 0 ? (
                <div className="import-difficulty-row">
                  {Object.entries(importValidation.difficulty_counts).map(([difficulty, count]) => (
                    <span key={difficulty}>
                      {difficultyLabel(difficulty)}: {count}
                    </span>
                  ))}
                </div>
              ) : null}
              {importValidation.issues.length > 0 ? (
                <div className="import-issues">
                  {importValidation.issues.map((issue, index) => (
                    <div className="import-issue" key={`${issue.row_number ?? "file"}-${index}`}>
                      <span>{issue.row_number ? `Строка ${issue.row_number}` : "Файл"}</span>
                      <p>{issue.message}</p>
                    </div>
                  ))}
                  {importValidation.issue_count > importValidation.issues.length ? (
                    <div className="panel-meta">Показаны первые {importValidation.issues.length} ошибок из {importValidation.issue_count}</div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {importResult ? (
            <div className="import-result">
              <article className="import-score">
                <div className="import-score-n">{importResult.created_questions}</div>
                <div className="import-score-l">новых вопросов</div>
              </article>
              <article className="import-score">
                <div className="import-score-n">{importResult.updated_questions}</div>
                <div className="import-score-l">обновлено</div>
              </article>
              <article className="import-score">
                <div className="import-score-n">{importResult.created_sections}</div>
                <div className="import-score-l">разделов</div>
              </article>
              <article className="import-score">
                <div className="import-score-n">{importResult.created_topics}</div>
                <div className="import-score-l">тем</div>
              </article>
            </div>
          ) : null}
        </div>
      </section>

      <div className="editorial-grid">
        <div className="col-main">
          <section>
            <div className="sec-lbl">Содержимое</div>
            <div className="admin-question-count">{resultCountLabel}</div>
            {loading ? (
              <div className="stack-section">
                <div className="skeleton-card tall" />
                <div className="skeleton-card tall" />
              </div>
            ) : data && data.items.length > 0 ? (
              <div className="admin-list" data-testid="admin-question-list">
                {data.items.map((question) => (
                  <article
                    className={`admin-card${editorQuestionId === question.id ? " editing" : ""}${question.is_active ? "" : " is-hidden"}`}
                    data-testid={`admin-question-card-${question.id}`}
                    key={question.id}
                  >
                    <div className="admin-card-head">
                      <div>
                        <div className="admin-card-title">
                          <span className="admin-card-title-label">Тема</span>
                          {question.topic_name || "Без темы"}
                        </div>
                        <div className="admin-card-meta">
                          {question.faculty_name || "Без факультета"} · {question.section_name || "Без раздела"} ·{" "}
                          {question.answer_option_count} вариантов
                        </div>
                      </div>
                      <div className="admin-card-badges">
                        <StatusPill
                          label={question.is_active ? "Активен" : "Скрыт"}
                          size="compact"
                          tone={question.is_active ? "green" : "default"}
                        />
                        <StatusPill label={difficultyLabel(question.difficulty)} size="compact" tone={difficultyTone(question.difficulty)} />
                      </div>
                    </div>
                    <p className="admin-card-text">
                      <span className="admin-card-text-label">Вопрос</span>
                      {question.text}
                    </p>
                    <div className="admin-card-actions">
                      <button className="btn btn-o btn-sm" onClick={() => handleEditQuestion(question.id)} type="button">
                        {editorQuestionId === question.id ? "Открыт" : "Редактировать"}
                      </button>
                      <button
                        className="btn btn-g btn-sm"
                        disabled={busyQuestionId === question.id}
                        onClick={() =>
                          question.is_active ? handleDeactivateQuestion(question.id) : handleActivateQuestion(question.id)
                        }
                        type="button"
                      >
                        {busyQuestionId === question.id
                          ? question.is_active
                            ? "Скрываем..."
                            : "Возвращаем..."
                          : question.is_active
                            ? "Скрыть"
                            : "Вернуть"}
                      </button>
                      <button
                        className="btn btn-g btn-xs admin-card-delete"
                        data-testid={`admin-question-delete-${question.id}`}
                        disabled={deletingQuestionId === question.id || busyQuestionId === question.id}
                        onClick={() => handleDeleteQuestion(question.id)}
                        type="button"
                      >
                        {deletingQuestionId === question.id ? "Удаляем..." : "Удалить"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                description="Вопросы еще не загружены или текущий фильтр ничего не нашел."
                title="Банк вопросов пуст"
              />
            )}
          </section>
        </div>

        <aside className="col-side">
          <section>
            <div className="sec-lbl">Редактор вопроса</div>
            {editorMode ? (
              <article className="form-panel panel-stack" data-testid="admin-question-editor">
                {editorLoading ? (
                  <div className="skeleton-card tall" />
                ) : (
                  <>
                    <div className="editor-header">
                      <div>
                        <div className="editor-mode-label">{editorMode === "edit" ? "Редактирование" : "Создание"}</div>
                        <div className="editor-title">
                          {editorMode === "edit" ? `Редактирование #${editorQuestionId}` : "Новый вопрос"}
                        </div>
                        <div className="panel-meta">
                          Вопросы создаются на уровне темы. Активность можно менять прямо из формы.
                        </div>
                      </div>
                      {editorMode === "edit" && editorQuestionId !== null ? (
                        <div className="editor-header-actions">
                          <button
                            className="text-action"
                            data-testid="admin-question-deactivate"
                            disabled={busyQuestionId === editorQuestionId}
                            onClick={() =>
                              draft.isActive
                                ? handleDeactivateQuestion(editorQuestionId)
                                : handleActivateQuestion(editorQuestionId)
                            }
                            type="button"
                          >
                            {busyQuestionId === editorQuestionId
                              ? draft.isActive
                                ? "Скрываем..."
                                : "Возвращаем..."
                              : draft.isActive
                                ? "Скрыть"
                                : "Вернуть"}
                          </button>
                          <button
                            className="btn btn-xs btn-danger"
                            data-testid="admin-question-delete"
                            disabled={deletingQuestionId === editorQuestionId || busyQuestionId === editorQuestionId}
                            onClick={() => handleDeleteQuestion(editorQuestionId)}
                            type="button"
                          >
                            {deletingQuestionId === editorQuestionId ? "Удаляем..." : "Удалить"}
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <div className="form-row">
                      <label className="field">
                        <span>Факультет</span>
                        <select data-testid="admin-question-faculty"
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
                        <select data-testid="admin-question-topic"
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
                        <span>Сложность</span>
                        <select onChange={(event) => handleDraftChange("difficulty", event.target.value)} value={draft.difficulty}>
                          <option value="easy">Легкий</option>
                          <option value="medium">Средний</option>
                          <option value="hard">Сложный</option>
                        </select>
                      </label>

                      <label className="field">
                        <span>Статус</span>
                        <select
                          onChange={(event) => handleDraftChange("isActive", event.target.value === "true")}
                          value={String(draft.isActive)}
                        >
                          <option value="true">Активен</option>
                          <option value="false">Скрыт</option>
                        </select>
                      </label>
                    </div>

                    <label className="field">
                      <span>Текст вопроса</span>
                      <textarea
                        data-testid="admin-question-text"
                        onChange={(event) => handleDraftChange("text", event.target.value)}
                        placeholder="Введите полный текст вопроса"
                        rows={5}
                        value={draft.text}
                      />
                    </label>

                    <label className="field">
                      <span>Общее объяснение</span>
                      <textarea
                        onChange={(event) => handleDraftChange("explanation", event.target.value)}
                        placeholder="При необходимости добавь пояснение к вопросу"
                        rows={4}
                        value={draft.explanation}
                      />
                    </label>

                    <div className="option-editor-list">
                      {draft.answerOptions.map((option, index) => (
                        <article className={`option-editor${draft.correctLabel === option.label ? " selected" : ""}`} key={option.label}>
                          <div className="option-editor-head">
                            <div className="option-editor-label">Вариант {option.label}</div>
                            <button
                              className={`option-select${draft.correctLabel === option.label ? " active" : ""}`}
                              data-testid={`admin-question-correct-${option.label}`}
                              onClick={() => handleDraftChange("correctLabel", option.label)}
                              type="button"
                            >
                              {draft.correctLabel === option.label ? "Правильный" : "Сделать правильным"}
                            </button>
                          </div>
                          <div className="option-editor-body">
                            <label className="field">
                              <span>Текст ответа</span>
                              <textarea
                                data-testid={`admin-question-option-${option.label}-text`}
                                onChange={(event) => handleOptionChange(index, "text", event.target.value)}
                                placeholder={`Текст варианта ${option.label}`}
                                rows={3}
                                value={option.text}
                              />
                            </label>
                            <label className="field">
                              <span>Пояснение к варианту</span>
                              <textarea
                                onChange={(event) => handleOptionChange(index, "explanation", event.target.value)}
                                placeholder="Необязательно"
                                rows={2}
                                value={option.explanation}
                              />
                            </label>
                          </div>
                        </article>
                      ))}
                    </div>

                    <div className="action-row">
                      <button
                        className="cta-primary"
                        data-testid="admin-question-save"
                        disabled={submitting}
                        onClick={handleSaveQuestion}
                        type="button"
                      >
                        {submitting ? "Сохраняем..." : editorMode === "edit" ? "Сохранить изменения" : "Создать вопрос"}
                      </button>
                      <button
                        className="cta-secondary"
                        onClick={() => {
                          setEditorMode(null);
                          setEditorQuestionId(null);
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
                <p>Открой существующий вопрос или создай новый, чтобы вручную наполнять банк прямо из интерфейса.</p>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { CasesChrome } from "./CasesChrome";
import styles from "./CasesExperience.module.css";
import { useAuth } from "../contexts/AuthContext";
import { api, ApiError, isAbortError } from "../lib/api";
import { buildAccreditationReturnRoute } from "../lib/session";
import type {
  ClinicalCaseAttemptStartResponse,
  ClinicalCaseCompletionResponse,
  ClinicalCaseDetail,
  ClinicalCaseListItem,
} from "../types/api";

type NoticeTone = "success" | "danger";
type PassageMode = "study" | "exam";

interface CaseStageText {
  title: string;
  type: "text";
  content: string;
}

interface CaseStageQuestion {
  title: string;
  type: "question";
  questionId?: string;
  question: string;
  options: Array<string | { label: string; text: string }>;
  correct?: number;
  explanation?: string;
  hint?: string;
}

type CaseStage = CaseStageText | CaseStageQuestion;

const CASE_EXAM_SIM_CASE_COUNT = 2;
const CASE_EXAM_STAGE_TOTAL_QUESTIONS = 24;
const ACCREDITATION_PASS_PERCENT = 70;
const CASE_MASTERY_PERCENT = 85;

interface CaseItem {
  id: number;
  slug: string;
  title: string;
  section: string;
  difficulty: string;
  duration: number;
  subtitle: string;
  desc: string;
  progress: number;
  status: "strong" | "medium" | "weak" | "new";
  topicId: number | null;
  focusPoints?: string[];
  examTargets?: string[];
  stages: CaseStage[];
}

interface CaseExamSimulationResult {
  caseItem: CaseItem;
  result: ClinicalCaseCompletionResponse;
}

interface CaseExamSimulationRun {
  cases: CaseItem[];
  index: number;
  results: CaseExamSimulationResult[];
  finished: boolean;
}

function setRipplePosition(event: MouseEvent<HTMLElement>) {
  const element = event.currentTarget;
  const rect = element.getBoundingClientRect();
  const x = (((event.clientX - rect.left) / rect.width) * 100).toFixed(1);
  const y = (((event.clientY - rect.top) / rect.height) * 100).toFixed(1);
  element.style.setProperty("--rx", `${x}%`);
  element.style.setProperty("--ry", `${y}%`);
}

function parseSlugList(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => /^[a-z0-9][a-z0-9-]*$/.test(item));
}

function selectCaseByTopic(cases: CaseItem[], topicId: number | null, plannedTaskId: number | null) {
  if (topicId === null) {
    return null;
  }

  const topicCases = cases.filter((item) => item.topicId === topicId);

  if (topicCases.length === 0) {
    return null;
  }

  const stableIndex = plannedTaskId !== null ? Math.abs(plannedTaskId - 1) % topicCases.length : 0;
  return topicCases[stableIndex];
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7.25" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16.2 16.2 4.05 4.05" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="m7 7 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m17 7-10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ArrowIcon({ size = 12 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M5 12h13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m12 6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowLeftIcon({ size = 12 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M19 12H6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m12 6-6 6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EmptyStateIcon() {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M6.5 6.25h11A2.25 2.25 0 0 1 19.75 8.5v8A2.25 2.25 0 0 1 17.5 18.75h-11A2.25 2.25 0 0 1 4.25 16.5v-8A2.25 2.25 0 0 1 6.5 6.25Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 6.25V5a1.75 1.75 0 0 1 1.75-1.75h2.5A1.75 1.75 0 0 1 15 5v1.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.25 11h7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.25 14.75h4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CaseDescriptionIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="4" width="14" height="16" rx="2.25" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 8.5h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.5 12.5h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.5 16.5h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function KeyAspectsIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="m7.25 8.25 1.6 1.6 3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 8.5h3.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m7.25 15.25 1.6 1.6 3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 15.5h3.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 10.5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 7.75h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function TimerIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="13" r="7.25" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9.5 3.75h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 8.5V13l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HintIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M8.75 17.25h6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9.5 20h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.25 11.25a3.75 3.75 0 1 1 6.85 2.12c-.73 1.05-1.1 1.45-1.1 2.13h-4c0-.68-.38-1.08-1.12-2.13a3.73 3.73 0 0 1-.63-2.12Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function AccuracyTone(status: CaseItem["status"]) {
  if (status === "weak") {
    return "weak";
  }

  if (status === "medium") {
    return "medium";
  }

  return "strong";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderHtmlList(items: string[]): string {
  if (items.length === 0) {
    return "";
  }

  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

const CASE_OPENING_TITLES = [
  "Первичная оценка",
  "Данные пациента",
  "Вводные по случаю",
  "Разбор обращения",
  "Исходные данные",
  "Прием пациента",
];

const CASE_OPENING_LABELS = ["Пациент", "Вводные", "Основание", "Контекст", "Данные"];

function isCaseDetail(item: ClinicalCaseListItem | ClinicalCaseDetail): item is ClinicalCaseDetail {
  return "patient_summary" in item;
}

function stableIndex(value: string, modulo: number): number {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) % modulo;
  }

  return hash;
}

function buildOpeningCopy(item: ClinicalCaseListItem | ClinicalCaseDetail): { title: string; label: string } {
  const key = item.slug || item.title;

  return {
    title: CASE_OPENING_TITLES[stableIndex(key, CASE_OPENING_TITLES.length)],
    label: CASE_OPENING_LABELS[stableIndex(`${key}:label`, CASE_OPENING_LABELS.length)],
  };
}

function buildCaseStages(item: ClinicalCaseListItem | ClinicalCaseDetail): CaseStage[] {
  const patientSummary = isCaseDetail(item) ? item.patient_summary : item.summary;
  const facts = isCaseDetail(item) ? item.clinical_facts : [];
  const openingCopy = buildOpeningCopy(item);

  const factsHtml =
    facts.length > 0
      ? `<div class="patient-grid">${facts
          .map(
            (fact) =>
              `<div class="pblock"><div class="plabel">${escapeHtml(fact.label)}</div><div class="pvalue">${escapeHtml(
                fact.value,
              )}</div></div>`,
          )
          .join("")}</div>`
      : "";

  const stages: CaseStage[] = [
    {
      title: openingCopy.title,
      type: "text",
      content: `${factsHtml}<div class="ctext"><strong>${openingCopy.label}:</strong> ${escapeHtml(patientSummary)}</div>`,
    },
    {
      title: "Что нужно отработать",
      type: "text",
      content: `<div class="ctext"><strong>Фокус:</strong>${renderHtmlList(item.focus_points)}<strong>Цели:</strong>${renderHtmlList(
        item.exam_targets,
      )}</div>`,
    },
  ];

  const quizQuestions = isCaseDetail(item) ? item.quiz_questions : [];

  quizQuestions.forEach((question, index) => {
    stages.push({
      title: `Решение ${index + 1}`,
      type: "question",
      questionId: question.id,
      question: question.prompt,
      options: question.options,
      hint: question.hint ?? item.focus_points[index] ?? undefined,
    });
  });

  return stages;
}

function mapApiCaseToCaseItem(item: ClinicalCaseListItem | ClinicalCaseDetail, index: number): CaseItem {
  return {
    id: index + 1,
    slug: item.slug,
    title: item.title,
    section: item.topic_name,
    difficulty: item.difficulty,
    duration: item.duration_minutes,
    subtitle: item.subtitle ?? item.topic_name,
    desc: item.summary,
    progress: 0,
    status: "new",
    topicId: item.topic_id,
    focusPoints: item.focus_points,
    examTargets: item.exam_targets,
    stages: buildCaseStages(item),
  };
}

function mergeCaseItemWithDetail(caseItem: CaseItem, detail: ClinicalCaseDetail): CaseItem {
  return {
    ...caseItem,
    title: detail.title,
    section: detail.topic_name,
    difficulty: detail.difficulty,
    duration: detail.duration_minutes,
    subtitle: detail.subtitle ?? detail.topic_name,
    desc: detail.summary,
    topicId: detail.topic_id,
    focusPoints: detail.focus_points,
    examTargets: detail.exam_targets,
    stages: buildCaseStages(detail),
  };
}

function buildCaseCompletionAnswers(caseItem: CaseItem, selectedAnswers: Record<number, number>) {
  return caseItem.stages.flatMap((stage, stageIndex) => {
    if (stage.type !== "question" || !stage.questionId) {
      return [];
    }

    const selectedOptionIndex = selectedAnswers[stageIndex];

    if (selectedOptionIndex === undefined) {
      return [];
    }

    const selectedOption = stage.options[selectedOptionIndex];
    const selectedOptionLabel = getCaseOptionLabel(selectedOption, selectedOptionIndex);

    return [{ question_id: stage.questionId, selected_option_label: selectedOptionLabel }];
  });
}

function getCaseOptionLabel(option: string | { label: string; text: string }, index: number) {
  return typeof option === "string" ? String(index) : option.label;
}

function getCaseOptionText(option: string | { label: string; text: string }) {
  return typeof option === "string" ? option : option.text;
}

function getCaseOptionTextByLabel(
  options: Array<string | { label: string; text: string }>,
  label: string | null | undefined,
) {
  if (!label) {
    return null;
  }

  const matchedOption = options.find((option, index) => getCaseOptionLabel(option, index) === label);
  return matchedOption ? getCaseOptionText(matchedOption) : null;
}

function countCaseQuestions(caseItem: CaseItem) {
  return caseItem.stages.filter((stage) => stage.type === "question" && stage.questionId).length;
}

function hasCaseDetail(caseItem: CaseItem) {
  return countCaseQuestions(caseItem) > 0;
}

export function CasesExperience() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<CaseItem | null>(null);
  const [topicFilter, setTopicFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [currentMode, setCurrentMode] = useState<PassageMode>("study");
  const [passageMode, setPassageMode] = useState<PassageMode>("study");
  const [currentStage, setCurrentStage] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [hintsShown, setHintsShown] = useState<Record<number, boolean>>({});
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [passageDurationSeconds, setPassageDurationSeconds] = useState(0);
  const [notice, setNotice] = useState<{ message: string; tone: NoticeTone } | null>(null);
  const [completionResult, setCompletionResult] = useState<ClinicalCaseCompletionResponse | null>(null);
  const [completionReporting, setCompletionReporting] = useState(false);
  const [caseExamRun, setCaseExamRun] = useState<CaseExamSimulationRun | null>(null);
  const [caseExamPreparing, setCaseExamPreparing] = useState(false);
  const [caseExamSummaryOpen, setCaseExamSummaryOpen] = useState(false);
  const [caseExamReviewOpen, setCaseExamReviewOpen] = useState(false);
  const [caseActionLoadingSlug, setCaseActionLoadingSlug] = useState<string | null>(null);
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [passageOpen, setPassageOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [caseReviewOpen, setCaseReviewOpen] = useState(false);
  const [patientDataOpen, setPatientDataOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  const timerRef = useRef<number | null>(null);
  const finishTimeoutRef = useRef<number | null>(null);
  const routeLaunchKeyRef = useRef("");
  const completionReportedRef = useRef(false);
  const caseExamRunRef = useRef<CaseExamSimulationRun | null>(null);
  const activeCaseAttemptRef = useRef<ClinicalCaseAttemptStartResponse | null>(null);

  const filteredCases = useMemo(() => {
    const query = search.trim().toLowerCase();

    return cases.filter((item) => {
      const matchSearch = !query || `${item.title} ${item.section} ${item.desc}`.toLowerCase().includes(query);
      const matchFilter = topicFilter === "all" || item.section === topicFilter;
      return matchSearch && matchFilter;
    });
  }, [cases, search, topicFilter]);
  const topics = useMemo(() => ["all", ...Array.from(new Set(cases.map((item) => item.section)))], [cases]);
  const routedCaseSlug = searchParams.get("slug")?.trim() ?? "";
  const routedTopicIdValue = searchParams.get("topicId");
  const routedTopicId =
    routedTopicIdValue && /^\d+$/.test(routedTopicIdValue) ? Number(routedTopicIdValue) : null;
  const routedPlannedTaskIdValue = searchParams.get("plannedTaskId");
  const routedPlannedTaskId =
    routedPlannedTaskIdValue && /^\d+$/.test(routedPlannedTaskIdValue) ? Number(routedPlannedTaskIdValue) : null;
  const routedSimulationId = searchParams.get("simulationId")?.trim() || null;
  const routedCaseSlugsKey = searchParams.get("caseSlugs") ?? "";
  const routedCaseSlugs = parseSlugList(routedCaseSlugsKey);
  const routedMode = searchParams.get("mode") === "study" ? "study" : "exam";
  const shouldAutostartFromRoute = searchParams.get("autostart") === "1";
  const shouldStartExamRunFromRoute = searchParams.get("examRun") === "1";
  const isStrictCaseRun = Boolean(routedSimulationId);

  const currentStageItem = selectedCase?.stages[currentStage] ?? null;
  const patientDataStage = selectedCase?.stages.find((stage) => stage.type === "text") ?? null;
  const questionStages = useMemo(
    () => selectedCase?.stages.filter((stage): stage is CaseStageQuestion => stage.type === "question") ?? [],
    [selectedCase],
  );
  const selectedCaseActionLoading = selectedCase !== null && caseActionLoadingSlug === selectedCase.slug;

  function returnToAccreditationCenter() {
    navigate(
      buildAccreditationReturnRoute({
        plannedTaskId: routedPlannedTaskId,
        simulationId: routedSimulationId,
        stage: "case_stage",
      }),
    );
  }

  useEffect(() => {
    caseExamRunRef.current = caseExamRun;
  }, [caseExamRun]);

  useEffect(() => {
    if (!token) {
      setCases([]);
      setCasesLoading(false);
      return;
    }

    const controller = new AbortController();

    setCasesLoading(true);
    setCasesError(null);

    api
      .listCases(token, controller.signal)
      .then((items) => {
        setCases(items.map(mapApiCaseToCaseItem));
      })
      .catch((exception: unknown) => {
        if (isAbortError(exception) || controller.signal.aborted) {
          return;
        }

        setCases([]);
        setCasesError(exception instanceof ApiError ? exception.message : "Не удалось загрузить кейсы из базы");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCasesLoading(false);
        }
      });

    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    if (!selectedCase) {
      return;
    }

    if (!filteredCases.some((item) => item.id === selectedCase.id)) {
      setSelectedCase(null);
    }
  }, [filteredCases, selectedCase]);

  useEffect(() => {
    if (selectedCase || filteredCases.length === 0) {
      return;
    }

    setSelectedCase(filteredCases[0]);
  }, [filteredCases, selectedCase]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const routeKey = searchParams.toString();

    if (!routeKey || routeLaunchKeyRef.current === routeKey || cases.length === 0) {
      return () => {
        active = false;
        controller.abort();
      };
    }

    const assignedFirstCase =
      routedCaseSlugs.length > 0 ? cases.find((item) => item.slug === routedCaseSlugs[0]) ?? null : null;
    const matchedCase =
      assignedFirstCase ??
      cases.find((item) => item.slug === routedCaseSlug) ??
      selectCaseByTopic(cases, routedTopicId, routedPlannedTaskId) ??
      (shouldAutostartFromRoute || shouldStartExamRunFromRoute ? cases[0] ?? null : null) ??
      null;

    if (matchedCase) {
      setSelectedCase(matchedCase);

      if (shouldStartExamRunFromRoute) {
        routeLaunchKeyRef.current = routeKey;
        void startCaseExamSimulation(matchedCase)
          .then(() => {
            if (!active) {
              return;
            }

            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete("examRun");
            setSearchParams(nextParams, { replace: true });
          })
          .catch((exception: unknown) => {
            if (!active || isAbortError(exception)) {
              return;
            }

            const message = exception instanceof ApiError ? exception.message : "Не удалось подготовить этап пробной аккредитации";
            showNotice(message, "danger");
          });

        return () => {
          active = false;
          controller.abort();
        };
      }

      if (shouldAutostartFromRoute) {
        routeLaunchKeyRef.current = routeKey;
        setCaseActionLoadingSlug(matchedCase.slug);
        void ensureCaseDetail(matchedCase, controller.signal)
          .then(async (detailedCase) => {
            if (!active) {
              return;
            }

            await launchPassage(detailedCase, routedMode);

            const nextParams = new URLSearchParams(searchParams);
            nextParams.delete("autostart");
            setSearchParams(nextParams, { replace: true });
          })
          .catch((exception: unknown) => {
            if (!active || isAbortError(exception)) {
              return;
            }

            const message = exception instanceof ApiError ? exception.message : "Не удалось подготовить кейс";
            showNotice(message, "danger");
          })
          .finally(() => {
            if (active) {
              setCaseActionLoadingSlug((current) => (current === matchedCase.slug ? null : current));
            }
          });
      }
    }

    routeLaunchKeyRef.current = routeKey;
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    cases,
    routedCaseSlugsKey,
    routedCaseSlug,
    routedMode,
    routedPlannedTaskId,
    routedTopicId,
    searchParams,
    setSearchParams,
    shouldAutostartFromRoute,
    shouldStartExamRunFromRoute,
  ]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setNotice(null);
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const shouldLock = startModalOpen || passageOpen || aiOpen || closeConfirmOpen;

    if (!shouldLock) {
      return;
    }

    const { body, documentElement } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

    body.style.overflow = "hidden";

    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [aiOpen, closeConfirmOpen, passageOpen, startModalOpen]);

  useEffect(() => {
    return () => {
      clearTimer();
      clearFinishTimeout();
    };
  }, []);

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function clearFinishTimeout() {
    if (finishTimeoutRef.current !== null) {
      window.clearTimeout(finishTimeoutRef.current);
      finishTimeoutRef.current = null;
    }
  }

  async function ensureCaseDetail(caseItem: CaseItem, signal?: AbortSignal): Promise<CaseItem> {
    if (!token || hasCaseDetail(caseItem)) {
      return caseItem;
    }

    const detail = await api.getCase(token, caseItem.slug, signal);
    const detailedCase = mergeCaseItemWithDetail(caseItem, detail);
    setCases((current) => current.map((item) => (item.slug === detailedCase.slug ? detailedCase : item)));
    setSelectedCase((current) => (current?.slug === detailedCase.slug ? detailedCase : current));
    return detailedCase;
  }

  function showNotice(message: string, tone: NoticeTone = "success") {
    setNotice({ message, tone });
  }

  function startTimer(mode: PassageMode, durationSeconds: number) {
    clearTimer();
    clearFinishTimeout();
    setTimerSeconds(mode === "exam" ? durationSeconds : 0);

    timerRef.current = window.setInterval(() => {
      setTimerSeconds((previous) => {
        if (mode !== "exam") {
          return previous + 1;
        }

        if (previous <= 1) {
          clearTimer();
          showNotice("Время истекло! Завершаем кейс.", "danger");
          finishTimeoutRef.current = window.setTimeout(() => {
            showAiResult();
          }, 1500);
          return 0;
        }

        return previous - 1;
      });
    }, 1000);
  }

  async function reportCaseCompletion(caseItem: CaseItem): Promise<ClinicalCaseCompletionResponse | null> {
    if (!token) {
      return null;
    }

    const activeAttempt = activeCaseAttemptRef.current;

    if (!activeAttempt || activeAttempt.case_slug !== caseItem.slug) {
      showNotice("Серверная попытка кейса не найдена. Начните кейс заново.", "danger");
      return null;
    }

    const studyMinutes = Math.max(Math.ceil(Math.max(elapsedSeconds, 0) / 60), 1);
    const answers = buildCaseCompletionAnswers(caseItem, selectedAnswers);

    setCompletionReporting(true);

    try {
      const result = await api.completeCase(token, {
        attempt_id: activeAttempt.attempt_id,
        slug: caseItem.slug,
        topic_id: caseItem.topicId,
        study_minutes: studyMinutes,
        planned_task_id: routedPlannedTaskId,
        simulation_id: routedSimulationId,
        answers,
      });

      activeCaseAttemptRef.current = null;
      setCompletionResult(result);

      if (result.task_completed) {
        showNotice("Кейс завершён, план обновлён.");
      }

      return result;
    } catch (exception) {
      const message = exception instanceof ApiError ? exception.message : "Не удалось проверить ответы";
      completionReportedRef.current = false;
      activeCaseAttemptRef.current = null;
      setCompletionResult(null);
      setAiOpen(false);
      showNotice(`Не удалось завершить кейс: ${message}`, "danger");
      return null;
    } finally {
      setCompletionReporting(false);
    }
  }

  async function startCaseExamSimulation(seedCase?: CaseItem | null) {
    if (!token || caseExamPreparing || casesLoading) {
      return;
    }

    const seedSlug = seedCase?.slug ?? selectedCase?.slug;
    const assignedCases = routedCaseSlugs
      .map((slug) => cases.find((item) => item.slug === slug) ?? null)
      .filter((item): item is CaseItem => item !== null);
    const uniqueCandidates = assignedCases.length > 0
      ? assignedCases
      : [
          ...(seedCase ? [seedCase] : selectedCase ? [selectedCase] : []),
          ...filteredCases.filter((item) => item.slug !== seedSlug),
          ...cases.filter((item) => item.slug !== seedSlug && !filteredCases.some((filtered) => filtered.slug === item.slug)),
        ];
    const simulationCases: CaseItem[] = [];

    setCaseExamPreparing(true);

    try {
      if (routedCaseSlugs.length > 0 && assignedCases.length !== routedCaseSlugs.length) {
        showNotice("Не удалось найти все кейсы, назначенные системой для этой пробной аккредитации.", "danger");
        return;
      }

      for (const caseItem of uniqueCandidates) {
        const detailedCase = await ensureCaseDetail(caseItem);

        if (countCaseQuestions(detailedCase) > 0) {
          simulationCases.push(detailedCase);
        }

        if (simulationCases.length >= CASE_EXAM_SIM_CASE_COUNT) {
          break;
        }
      }

      if (simulationCases.length < CASE_EXAM_SIM_CASE_COUNT) {
        showNotice("Для пробной аккредитации нужно минимум 2 кейса с проверочными вопросами.", "danger");
        return;
      }

      setCaseExamSummaryOpen(false);
      setCaseExamReviewOpen(false);
      setCaseExamRun({
        cases: simulationCases,
        index: 0,
        results: [],
        finished: false,
      });
      await launchPassage(simulationCases[0]!, "exam");
      showNotice("Пробная аккредитация: 2 кейса подряд, порог 70%.");
    } catch (exception) {
      if (isAbortError(exception)) {
        return;
      }

      const message = exception instanceof ApiError ? exception.message : "Не удалось подготовить пробную аккредитацию";
      showNotice(message, "danger");
    } finally {
      setCaseExamPreparing(false);
    }
  }

  function openStartModal() {
    if (!selectedCase || selectedCaseActionLoading) {
      return;
    }

    setCurrentMode(routedSimulationId ? "exam" : "study");
    setStartModalOpen(true);
  }

  function closeStartModal() {
    if (selectedCaseActionLoading) {
      return;
    }

    setStartModalOpen(false);
  }

  async function launchPassage(caseItem: CaseItem, mode: PassageMode) {
    if (!token) {
      return;
    }

    const passageModeValue = routedSimulationId ? "exam" : mode;

    if (countCaseQuestions(caseItem) === 0) {
      showNotice("В кейсе нет проверочных вопросов. Попросите администратора дополнить кейс.", "danger");
      return;
    }

    const attempt = await api.startCaseAttempt(token, caseItem.slug, {
      topic_id: caseItem.topicId,
      planned_task_id: routedPlannedTaskId,
      simulation_id: routedSimulationId,
      mode: passageModeValue,
    });

    activeCaseAttemptRef.current = attempt;
    completionReportedRef.current = false;
    setSelectedCase(caseItem);
    setCurrentMode(passageModeValue);
    setPassageMode(passageModeValue);
    setCurrentStage(0);
    setSelectedAnswers({});
    setHintsShown({});
    setCompletionResult(null);
    setCompletionReporting(false);
    setStartModalOpen(false);
    setAiOpen(false);
    setCaseReviewOpen(false);
    setPatientDataOpen(false);
    setPassageOpen(true);
    setPassageDurationSeconds(passageModeValue === "exam" ? attempt.duration_seconds : 0);
    startTimer(passageModeValue, attempt.duration_seconds);
  }

  async function startPassage(nextMode?: PassageMode) {
    if (!selectedCase) {
      return;
    }

    const loadingSlug = selectedCase.slug;
    setCaseActionLoadingSlug(loadingSlug);

    try {
      const detailedCase = await ensureCaseDetail(selectedCase);
      await launchPassage(detailedCase, routedSimulationId ? "exam" : nextMode ?? currentMode);
    } catch (exception) {
      if (isAbortError(exception)) {
        return;
      }

      const message = exception instanceof ApiError ? exception.message : "Не удалось подготовить кейс";
      showNotice(message, "danger");
    } finally {
      setCaseActionLoadingSlug((current) => (current === loadingSlug ? null : current));
    }
  }

  function closePassage() {
    clearTimer();
    clearFinishTimeout();
    activeCaseAttemptRef.current = null;
    completionReportedRef.current = false;
    setCaseExamRun(null);
    setCaseExamReviewOpen(false);
    setPassageOpen(false);
    setAiOpen(false);
    setCaseReviewOpen(false);
    setPatientDataOpen(false);
    setCloseConfirmOpen(false);
    setPassageDurationSeconds(0);
    setCompletionResult(null);
    setCompletionReporting(false);

    if (isStrictCaseRun) {
      returnToAccreditationCenter();
    }
  }

  function requestClosePassage() {
    if (!isStrictCaseRun && completionResult === null) {
      setCloseConfirmOpen(true);
      return;
    }

    closePassage();
  }

  function showAiResult() {
    clearTimer();
    clearFinishTimeout();

    const activeCaseExamRun = caseExamRunRef.current;

    if (activeCaseExamRun && !activeCaseExamRun.finished) {
      if (!completionReportedRef.current) {
        completionReportedRef.current = true;
        void finishCaseExamStep();
      }

      return;
    }

    if (selectedCase && !completionReportedRef.current) {
      completionReportedRef.current = true;
      void reportCaseCompletion(selectedCase);
    }

    setAiOpen(true);
    setCaseReviewOpen(false);
  }

  function openCaseReviewPage() {
    clearTimer();
    clearFinishTimeout();
    setPassageOpen(false);
    setAiOpen(false);
    setPatientDataOpen(false);
    setCaseReviewOpen(true);
  }

  function backToCaseResult() {
    setCaseReviewOpen(false);
    setAiOpen(true);
  }

  async function finishCaseExamStep() {
    const activeCaseExamRun = caseExamRunRef.current;

    if (!selectedCase || !activeCaseExamRun) {
      return;
    }

    const result = await reportCaseCompletion(selectedCase);

    if (!result) {
      return;
    }

    const nextResults = [...activeCaseExamRun.results, { caseItem: selectedCase, result }];
    const nextIndex = activeCaseExamRun.index + 1;

    if (nextIndex < activeCaseExamRun.cases.length) {
      const nextCase = activeCaseExamRun.cases[nextIndex]!;
      setCaseExamRun({
        ...activeCaseExamRun,
        index: nextIndex,
        results: nextResults,
      });
      await launchPassage(nextCase, "exam");
      showNotice(`Кейс ${nextIndex} завершён. Следующий кейс открыт.`);
      return;
    }

    clearTimer();
    clearFinishTimeout();
    setPassageOpen(false);
    setAiOpen(false);
    setCaseReviewOpen(false);
    setPatientDataOpen(false);
    setCompletionResult(null);
    setCompletionReporting(false);
    setCaseExamRun({
      ...activeCaseExamRun,
      results: nextResults,
      finished: true,
    });
    setCaseExamReviewOpen(false);
    setCaseExamSummaryOpen(true);
  }

  function closeAi() {
    clearTimer();
    clearFinishTimeout();
    activeCaseAttemptRef.current = null;
    setAiOpen(false);
    setPassageOpen(false);
    setCaseReviewOpen(false);
    setPatientDataOpen(false);
    setPassageDurationSeconds(0);
    setCompletionResult(null);
    setCompletionReporting(false);

    if (isStrictCaseRun) {
      returnToAccreditationCenter();
    }
  }

  function closeCaseExamSummary() {
    setCaseExamSummaryOpen(false);
    setCaseExamReviewOpen(false);
    setCaseExamRun(null);

    if (isStrictCaseRun) {
      returnToAccreditationCenter();
    }
  }

  function retryCase() {
    if (isStrictCaseRun) {
      returnToAccreditationCenter();
      return;
    }

    closeAi();
    void startPassage(passageMode);
  }

  function selectAnswer(optionIndex: number) {
    setSelectedAnswers((previous) => ({
      ...previous,
      [currentStage]: optionIndex,
    }));
  }

  function toggleHint(stageIndex: number) {
    setHintsShown((previous) => ({
      ...previous,
      [stageIndex]: !previous[stageIndex],
    }));
  }

  function nextStep() {
    if (!selectedCase) {
      return;
    }

    if (currentStageItem?.type === "question" && selectedAnswers[currentStage] === undefined) {
      showNotice("Выберите ответ перед переходом дальше.", "danger");
      return;
    }

    if (currentStage < selectedCase.stages.length - 1) {
      setCurrentStage((previous) => previous + 1);
      return;
    }

    showAiResult();
  }

  function prevStep() {
    if (currentStage > 0) {
      setCurrentStage((previous) => previous - 1);
    }
  }

  const correctAnswers = completionResult?.correct_answers ?? 0;
  const totalResultQuestions = completionResult?.total_questions ?? questionStages.length;
  const accuracyPercent = completionResult ? Math.round(completionResult.accuracy_percent) : 0;
  const caseFeedbackByQuestionId = useMemo(
    () => new Map((completionResult?.feedback ?? []).map((item) => [item.question_id, item] as const)),
    [completionResult],
  );
  const elapsedSeconds =
    passageMode === "exam" && passageDurationSeconds > 0
      ? passageDurationSeconds - timerSeconds
      : timerSeconds;
  const elapsedMinutesValue = Math.floor(Math.max(elapsedSeconds, 0) / 60);
  const elapsedSecondsValue = Math.max(elapsedSeconds, 0) % 60;
  const timerMinutes = Math.floor(timerSeconds / 60);
  const timerSecondsValue = timerSeconds % 60;
  const timerDisplay = `${String(timerMinutes).padStart(2, "0")}:${String(timerSecondsValue).padStart(2, "0")}`;
  const timerToneClass =
    passageMode === "exam" ? (timerSeconds <= 60 ? styles.crit : timerSeconds <= 300 ? styles.warn : "") : "";
  const caseExamResults = caseExamRun?.results ?? [];
  const caseExamCorrect = caseExamResults.reduce((sum, item) => sum + item.result.correct_answers, 0);
  const caseExamTotal = caseExamResults.reduce((sum, item) => sum + item.result.total_questions, 0);
  const caseExamPercent = caseExamTotal > 0 ? Math.round((caseExamCorrect / caseExamTotal) * 100) : 0;
  const caseExamEachCasePassed = caseExamResults.every(
    (item) => item.result.accuracy_percent >= ACCREDITATION_PASS_PERCENT,
  );
  const caseExamPassed =
    caseExamResults.length >= CASE_EXAM_SIM_CASE_COUNT &&
    caseExamTotal >= CASE_EXAM_STAGE_TOTAL_QUESTIONS &&
    caseExamPercent >= ACCREDITATION_PASS_PERCENT &&
    caseExamEachCasePassed;
  const caseExamStatusLabel = caseExamPassed
    ? "Порог 70% пройден"
    : caseExamTotal < CASE_EXAM_STAGE_TOTAL_QUESTIONS
      ? "Недостаточно вопросов"
      : caseExamEachCasePassed
        ? "Порог 70% не достигнут"
        : "Есть кейс ниже 70%";
  const caseResultPassed = accuracyPercent >= ACCREDITATION_PASS_PERCENT;
  const caseResultMastered = accuracyPercent >= CASE_MASTERY_PERCENT;
  const caseResultToneColor = caseResultMastered ? "var(--green)" : caseResultPassed ? "var(--gold)" : "var(--accent)";
  const caseRingCircumference = 2 * Math.PI * 58;
  const caseRingOffset = caseRingCircumference * (1 - Math.max(0, Math.min(accuracyPercent, 100)) / 100);
  const caseExamRingOffset = caseRingCircumference * (1 - Math.max(0, Math.min(caseExamPercent, 100)) / 100);
  const strictCaseStageIdle = isStrictCaseRun && !passageOpen && !aiOpen && !caseReviewOpen && !caseExamSummaryOpen;
  const strictCaseStagePreparing = strictCaseStageIdle && (shouldStartExamRunFromRoute || caseExamPreparing || casesLoading);

  return (
    <CasesChrome activeKey="cases">
      <main className={styles.shell} data-testid="cases-page">
        {notice ? (
          <div className={`${styles.notice} ${styles.show} ${styles[notice.tone]}`.trim()}>
            <InfoIcon />
            <span>{notice.message}</span>
            <button className={styles["notice-x"]} onClick={() => setNotice(null)} type="button">
              &#10005;
            </button>
          </div>
        ) : null}
        {casesError ? (
          <div className={`${styles.notice} ${styles.show} ${styles.danger}`.trim()}>
            <InfoIcon />
            <span>{casesError}</span>
            <button className={styles["notice-x"]} onClick={() => setCasesError(null)} type="button">
              &#10005;
            </button>
          </div>
        ) : null}

        {caseReviewOpen ? (
          <div className={`${styles.screen} ${styles.active}`.trim()} data-testid="cases-review-page">
            <div className={styles["case-review-page"]}>
              <div className={styles["review-page-head"]}>
                <div className={styles["ai-kicker"]}>Подробный разбор</div>
                <div className={styles["ai-title"]}>{selectedCase?.title ?? "Клинический кейс"}</div>
                <div className={styles["review-page-sub"]}>
                  Точность {accuracyPercent}% · {correctAnswers} из {totalResultQuestions} верных · Время{" "}
                  {String(elapsedMinutesValue).padStart(2, "0")}:{String(elapsedSecondsValue).padStart(2, "0")}
                </div>
              </div>

              <div className={styles["ai-score"]}>
                <svg className={styles["ai-ring"]} viewBox="0 0 72 72">
                  <circle cx="36" cy="36" r="30" fill="none" stroke="var(--ink-10)" strokeWidth="6" />
                  <circle
                    cx="36"
                    cy="36"
                    r="30"
                    fill="none"
                    stroke={caseResultToneColor}
                    strokeWidth="6"
                    strokeDasharray={`${(accuracyPercent / 100) * 2 * Math.PI * 30} ${2 * Math.PI * 30}`}
                    strokeLinecap="round"
                    transform="rotate(-90 36 36)"
                    style={{ transition: "stroke-dasharray 1s ease" }}
                  />
                </svg>

                <div className={styles["ai-score-info"]}>
                  <div className={styles["ai-score-title"]}>
                    {caseResultMastered ? "Кейс освоен" : caseResultPassed ? "Кейс пройден" : "Кейс стоит повторить"}
                  </div>
                  <div className={styles["ai-score-sub"]}>
                    {correctAnswers} из {totalResultQuestions} верных · Точность {accuracyPercent}% · Время{" "}
                    {String(elapsedMinutesValue).padStart(2, "0")}:{String(elapsedSecondsValue).padStart(2, "0")}
                  </div>
                </div>
              </div>

              <div className={styles["ai-section"]}>
                <div className={styles["ai-sec-title"]}>Подробный разбор</div>
                {selectedCase?.stages.map((stage, stageIndex) =>
                  stage.type === "question" ? (
                    (() => {
                      const feedback = stage.questionId ? caseFeedbackByQuestionId.get(stage.questionId) : undefined;
                      const selectedIndex = selectedAnswers[stageIndex];
                      const selectedOption = selectedIndex !== undefined ? stage.options[selectedIndex] : undefined;

                      return (
                        <div
                          className={`${styles["ai-feedback"]} ${feedback?.is_correct ? styles.good : styles.bad}`.trim()}
                          key={`${stage.title}-${stageIndex}`}
                        >
                          <strong>Этап: {stage.title}</strong>
                          <br />
                          Ваш ответ: {feedback?.selected_option_label ?? (selectedOption ? getCaseOptionLabel(selectedOption, selectedIndex ?? 0) : "Не отвечено")}
                          <br />
                          {feedback && !feedback.is_correct ? (
                            <>
                              Правильный ответ: {feedback.correct_option_label}
                              <br />
                            </>
                          ) : null}
                          {feedback?.explanation ?? "Разбор появится после проверки ответов."}
                        </div>
                      );
                    })()
                  ) : null,
                )}
              </div>

              <div className={styles["ai-section"]}>
                <div className={styles["ai-sec-title"]}>Рекомендации</div>
                <div className={`${styles["ai-feedback"]} ${styles.neutral}`.trim()}>
                  {caseResultMastered
                    ? "Кейс освоен: клиническая логика устойчиво ведет к правильным решениям. Можно переходить к более сложным кейсам."
                    : caseResultPassed
                      ? "Порог 70% пройден. Разберите ошибки, чтобы добрать результат до освоения 85%."
                      : "Рекомендуется внимательнее изучить тему. Повторите теоретический материал и пройдите кейс повторно."}
                </div>
              </div>

              <div className={styles["case-review-actions"]}>
                <button className={`${styles.btn} ${styles["btn-o"]}`.trim()} onClick={backToCaseResult} type="button">
                  К результату
                </button>
                <button className={`${styles.btn} ${styles["btn-o"]}`.trim()} onClick={closeAi} type="button">
                  Закрыть
                </button>
                <button className={`${styles.btn} ${styles["btn-p"]}`.trim()} onClick={retryCase} onMouseDown={setRipplePosition} type="button">
                  <span className={styles["btn-rip"]} />
                  {isStrictCaseRun ? "В аккредитацию" : "Пройти ещё раз"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {!caseReviewOpen && strictCaseStageIdle ? (
          <div className={`${styles.screen} ${styles.active}`.trim()} data-testid="cases-accreditation-stage">
            <div className={styles["empty-state"]}>
              <div className={styles["empty-icon"]}>
                <InfoIcon />
              </div>
              <h2 className={styles["empty-title"]}>
                {strictCaseStagePreparing ? "Готовим кейсы пробной аккредитации" : "Этап открывается из аккредитационного центра"}
              </h2>
              <p className={styles["empty-desc"]}>
                {strictCaseStagePreparing
                  ? "Система сама подбирает назначенные ситуационные задачи и сейчас откроет первый кейс."
                  : "Чтобы не перепутать пробную аккредитацию с обычной тренировкой, вернитесь в аккредитационный центр и запустите этап оттуда."}
              </p>
              {!strictCaseStagePreparing ? (
                <button className={`${styles.btn} ${styles["btn-p"]}`.trim()} onClick={returnToAccreditationCenter} type="button">
                  В аккредитацию
                </button>
              ) : null}
            </div>
          </div>
        ) : !caseReviewOpen ? (
        <div className={`${styles.screen} ${styles.active}`.trim()}>
          <div className={styles.ph}>
            <div className={styles["ph-kicker"]}>Первичная аккредитация · II этап</div>
            <div className={styles["ph-row"]}>
              <div>
                <h1 className={styles["ph-title"]}>
                  Клинические кейсы
                  <br />
                  <em>и сценарии приёма</em>
                </h1>
                <p className={styles["ph-sub"]}>Интерактивные клинические сценарии с автоматической проверкой и подробным разбором решений.</p>
              </div>

              <div className={styles["search-box"]}>
                <span className={styles["search-icon"]}>
                  <SearchIcon />
                </span>
                <input
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Поиск кейса"
                  type="text"
                  value={search}
                />
                <button
                  aria-label="Clear search"
                  className={`${styles["search-clear"]} ${search.length > 0 ? styles.show : ""}`.trim()}
                  onClick={() => setSearch("")}
                  type="button"
                >
                  <CloseIcon size={12} />
                </button>
              </div>
            </div>
          </div>

          <div className={styles["filter-bar"]}>
            <button
              className={`${styles["filter-reset"]} ${topicFilter === "all" ? styles.active : ""}`.trim()}
              onClick={() => setTopicFilter("all")}
              type="button"
            >
              Все кейсы
            </button>

            <select
              className={styles["topic-select"]}
              onChange={(event) => setTopicFilter(event.target.value)}
              value={topicFilter}
            >
              <option value="all">Темы</option>
              {topics
                .filter((topic) => topic !== "all")
                .map((topic) => (
                  <option key={topic} value={topic}>
                    {topic}
                  </option>
                ))}
            </select>
          </div>

          <div className={styles["layout-grid"]}>
            <aside className={styles["sidebar-panel"]}>
              <div className={styles["panel-head"]}>
                <span className={styles["panel-title"]}>Каталог кейсов</span>
                <span className={styles["panel-badge"]}>{casesLoading ? "..." : filteredCases.length}</span>
              </div>

              <div className={styles["cases-list"]}>
                {filteredCases.length > 0 ? (
                  filteredCases.map((item, index) => {
                    const progressTone = AccuracyTone(item.status);

                    return (
                      <button
                        className={`${styles["case-item"]} ${selectedCase?.id === item.id ? styles.active : ""}`.trim()}
                        data-testid={`case-item-${item.slug}`}
                        key={item.id}
                        onClick={() => setSelectedCase(item)}
                        style={{ animationDelay: `${index * 40}ms` } as CSSProperties}
                        type="button"
                      >
                        <div className={styles["case-item-top"]}>
                          <h4 className={styles["case-item-title"]}>{item.title}</h4>
                        </div>

                        <div className={styles["case-item-meta"]}>
                          <span className={`${styles["case-tag"]} ${styles.diff}`.trim()}>{item.difficulty}</span>
                        </div>

                        <div className={styles["case-item-desc"]} title={item.desc}>{item.desc}</div>

                        <div className={styles["case-item-foot"]}>
                          <div className={styles["case-prog"]}>
                            <div className={styles["case-prog-bar"]}>
                              <div className={`${styles["case-prog-fill"]} ${styles[progressTone]}`.trim()} style={{ width: `${item.progress}%` }} />
                            </div>
                            <span className={styles["case-prog-pct"]}>{item.progress}%</span>
                          </div>
                          <span className={styles["case-arrow"]}>
                            <ArrowIcon size={16} />
                          </span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className={styles["list-empty"]}>
                    {casesLoading ? "Загружаем кейсы из базы..." : "Кейсы не найдены"}
                  </div>
                )}
              </div>
            </aside>

            <main className={styles["main-content"]}>
              {selectedCase ? (
                <div className={styles["case-detail"]}>
                  <div className={styles["detail-head"]}>
                    <div className={styles["detail-badges"]}>
                      <span className={`${styles.dbadge} ${styles.section}`.trim()}>{selectedCase.section}</span>
                      <span className={`${styles.dbadge} ${styles.diff}`.trim()}>{selectedCase.difficulty}</span>
                    </div>
                    <h2 className={styles["detail-title"]}>{selectedCase.title}</h2>
                    <p className={styles["detail-sub"]}>{selectedCase.subtitle}</p>
                  </div>

                  <div className={styles["detail-body"]}>
                    <div className={styles["detail-section"]}>
                      <div className={styles["dsec-header"]}>
                        <div className={`${styles["dsec-icon"]} ${styles["dsec-document"]}`.trim()}>
                          <CaseDescriptionIcon />
                        </div>
                        <span className={styles["dsec-title"]}>Описание</span>
                      </div>
                      <div className={styles["dsec-content"]}>
                        <p className={styles.ctext}>{selectedCase.desc}</p>
                      </div>
                    </div>

                    <div className={styles["detail-section"]}>
                      <div className={styles["dsec-header"]}>
                        <div className={`${styles["dsec-icon"]} ${styles["dsec-focus"]}`.trim()}>
                          <KeyAspectsIcon />
                        </div>
                        <span className={styles["dsec-title"]}>Ключевые аспекты</span>
                      </div>
                      <div className={styles["dsec-content"]}>
                        <div className={styles["focus-items"]}>
                          {(selectedCase.focusPoints && selectedCase.focusPoints.length > 0
                            ? selectedCase.focusPoints
                            : ["Диагностика", "Диф. диагноз", "Тактика", "Препараты"]
                          ).map((focusItem) => (
                            <span className={styles["focus-it"]} key={focusItem}>
                              {focusItem}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className={styles["detail-actions"]}>
                      <button
                        className={`${styles.btn} ${styles["btn-p"]}`.trim()}
                        data-testid="cases-open-start-modal"
                        disabled={selectedCaseActionLoading}
                        onClick={openStartModal}
                        onMouseDown={setRipplePosition}
                        type="button"
                      >
                        <span className={styles["btn-rip"]} />
                        Начать прохождение
                        <span className={styles["btn-arr"]}>
                          <ArrowIcon />
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={styles["empty-state"]}>
                  <div className={styles["empty-icon"]}>
                    <EmptyStateIcon />
                  </div>
                  <h3 className={styles["empty-title"]}>Выберите клинический кейс</h3>
                  <p className={styles["empty-desc"]}>Выберите кейс из списка слева для интерактивного прохождения с автоматической проверкой</p>
                </div>
              )}
            </main>
          </div>
        </div>
        ) : null}
      </main>

      <div
        className={`${styles["modal-ov"]} ${startModalOpen ? styles.active : ""}`.trim()}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeStartModal();
          }
        }}
        role="presentation"
      >
        <div className={styles.modal} data-testid="cases-start-modal">
          <div className={styles["modal-hd"]}>
            <div className={styles["modal-t"]}>Начать прохождение</div>
            <button className={styles["modal-x"]} onClick={closeStartModal} type="button">
              <CloseIcon />
            </button>
          </div>

          <div className={styles["modal-bd"]}>
            <p className={styles["modal-desc"]}>Выберите режим прохождения клинического сценария. После завершения — автоматическая проверка и подробный разбор.</p>

            <div className={styles["mode-opts"]}>
              {!routedSimulationId ? (
                <button
                  className={`${styles["mode-opt"]} ${currentMode === "study" ? styles.active : ""}`.trim()}
                  disabled={selectedCaseActionLoading}
                  onClick={() => setCurrentMode("study")}
                  type="button"
                >
                  <div className={styles["mode-radio"]}>
                    <div className={styles["mode-rdot"]} />
                  </div>
                  <div>
                    <div className={styles["mode-name"]}>Учебный режим</div>
                    <div className={styles["mode-hint"]}>Подсказки на каждом этапе, разбор сразу после ответа, объяснение правильного выбора.</div>
                  </div>
                </button>
              ) : null}

              <button
                className={`${styles["mode-opt"]} ${currentMode === "exam" ? styles.active : ""}`.trim()}
                disabled={selectedCaseActionLoading}
                onClick={() => setCurrentMode("exam")}
                type="button"
              >
                <div className={styles["mode-radio"]}>
                  <div className={styles["mode-rdot"]} />
                </div>
                <div>
                  <div className={styles["mode-name"]}>{routedSimulationId ? "Этап пробной аккредитации" : "Контроль без подсказок"}</div>
                  <div className={styles["mode-hint"]}>
                    {routedSimulationId
                      ? "Кейс идет в протокол пробной аккредитации. Оценка и разбор появятся после завершения."
                      : "Учебная проверка без подсказок. Оценка и разбор только после завершения кейса."}
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div className={styles["modal-ft"]}>
            <button className={`${styles.btn} ${styles["btn-o"]}`.trim()} disabled={selectedCaseActionLoading} onClick={closeStartModal} type="button">
              Отмена
            </button>
            <button
              className={`${styles.btn} ${styles["btn-p"]}`.trim()}
              data-testid="cases-confirm-start"
              disabled={selectedCaseActionLoading}
              onClick={() => startPassage(currentMode)}
              onMouseDown={setRipplePosition}
              type="button"
            >
              <span className={styles["btn-rip"]} />
              Начать
              <span className={styles["btn-arr"]}>
                <ArrowIcon />
              </span>
            </button>
          </div>
        </div>
      </div>

      <div
        className={`${styles["passage-overlay"]} ${passageOpen ? styles.active : ""}`.trim()}
        data-testid="cases-passage"
      >
          <div className={styles["passage-hd"]}>
          <div className={styles["passage-title"]}>
            {caseExamRun && !caseExamRun.finished
              ? `Кейс ${caseExamRun.index + 1} из ${caseExamRun.cases.length}: ${selectedCase?.title ?? ""}`
              : selectedCase?.title}
          </div>

          <div className={styles["passage-prog"]}>
            <span className={styles["passage-step"]}>
              Этап <span>{selectedCase ? currentStage + 1 : 1}</span> из <span>{selectedCase?.stages.length ?? 1}</span>
            </span>
            <div className={styles["passage-bar"]}>
              <div className={styles["passage-fill"]} style={{ width: `${selectedCase ? ((currentStage + 1) / selectedCase.stages.length) * 100 : 0}%` }} />
            </div>
          </div>

          <div className={`${styles["passage-timer"]} ${timerToneClass}`.trim()} data-testid="cases-passage-timer">
            <TimerIcon />
            <span data-testid="cases-passage-timer-value">{timerDisplay}</span>
          </div>

          <button className={styles["passage-close"]} onClick={requestClosePassage} type="button">
            <CloseIcon size={16} />
          </button>
        </div>

        <div className={styles["passage-body"]}>
          <div className={styles["passage-wrap"]}>
            {currentStageItem ? (
              <div className={`${styles["passage-stage"]} ${styles.active}`.trim()}>
                <div className={styles["stage-num"]}>
                  Этап {currentStage + 1} из {selectedCase?.stages.length}
                </div>
                <h2 className={styles["stage-title"]}>{currentStageItem.title}</h2>

                {currentStageItem.type === "text" ? (
                  <div className={styles["stage-text"]} dangerouslySetInnerHTML={{ __html: currentStageItem.content }} />
                ) : (
                  <div className={styles.qblock}>
                    <div className={styles["q-tools"]}>
                      <button
                        className={styles["patient-data-btn"]}
                        data-testid="cases-open-patient-data"
                        onClick={() => setPatientDataOpen(true)}
                        type="button"
                      >
                        <CaseDescriptionIcon />
                        Исходные данные
                      </button>
                    </div>

                    <div className={styles.qtext}>{currentStageItem.question}</div>

                    <div className={styles.opts}>
                      {currentStageItem.options.map((option, optionIndex) => {
                        const optionLabel = getCaseOptionLabel(option, optionIndex);

                        return (
                          <button
                            className={`${styles.opt} ${selectedAnswers[currentStage] === optionIndex ? styles.sel : ""}`.trim()}
                            data-testid={`cases-option-${optionLabel}`}
                            key={optionLabel}
                            onClick={() => selectAnswer(optionIndex)}
                            type="button"
                          >
                            <div className={styles["opt-dot"]} />
                            <div className={styles["opt-txt"]}>{getCaseOptionText(option)}</div>
                          </button>
                        );
                      })}
                    </div>

                    {passageMode === "study" ? (
                      <>
                        <button className={styles["hint-btn"]} onClick={() => toggleHint(currentStage)} type="button">
                          <HintIcon />
                          {hintsShown[currentStage] ? "Скрыть подсказку" : "Показать подсказку"}
                        </button>
                        <div className={`${styles["hint-box"]} ${hintsShown[currentStage] ? styles.show : ""}`.trim()}>
                          {currentStageItem.hint ?? "Подумайте о ключевых симптомах и лабораторных показателях."}
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className={styles["passage-ft"]}>
          <button className={`${styles.btn} ${styles["btn-o"]}`.trim()} onClick={prevStep} type="button">
            <ArrowLeftIcon size={14} /> Назад
          </button>

          <div className={styles["passage-nav"]}>
            <button
              className={`${styles.btn} ${styles["btn-p"]}`.trim()}
              data-testid="cases-next-step"
              onClick={nextStep}
              onMouseDown={setRipplePosition}
              type="button"
            >
              <span className={styles["btn-rip"]} />
              {selectedCase && currentStage === selectedCase.stages.length - 1
                ? caseExamRun && !caseExamRun.finished
                  ? caseExamRun.index < caseExamRun.cases.length - 1
                    ? "Завершить кейс и перейти дальше"
                    : "Завершить этап"
                  : "Завершить и получить разбор"
                : "Далее"}
              <span className={styles["btn-arr"]}>
                <ArrowIcon />
              </span>
            </button>
          </div>
        </div>
      </div>

      <div
        className={`${styles["modal-ov"]} ${closeConfirmOpen ? styles.active : ""}`.trim()}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setCloseConfirmOpen(false);
          }
        }}
        role="presentation"
      >
        {closeConfirmOpen ? (
          <div className={`${styles.modal} ${styles["confirm-modal"]}`.trim()}>
            <div className={styles["confirm-body"]}>
              <div className={styles["confirm-icon"]}>
                <InfoIcon />
              </div>
              <div className={styles["confirm-title"]}>Завершить сейчас?</div>
              <p className={styles["confirm-desc"]}>
                Незавершённый кейс не сохранится. Ответы, таймер и текущий прогресс будут потеряны.
              </p>
              <div className={styles["confirm-actions"]}>
                <button className={`${styles.btn} ${styles["btn-o"]}`.trim()} onClick={() => setCloseConfirmOpen(false)} type="button">
                  Продолжить
                </button>
                <button className={`${styles.btn} ${styles["btn-danger"]}`.trim()} onClick={closePassage} type="button">
                  Да, завершить
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div
        className={`${styles["modal-ov"]} ${patientDataOpen ? styles.active : ""}`.trim()}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setPatientDataOpen(false);
          }
        }}
        role="presentation"
      >
        <div className={`${styles.modal} ${styles["patient-data-modal"]}`.trim()} data-testid="cases-patient-data-modal">
          <div className={styles["modal-hd"]}>
            <div>
              <div className={styles["modal-kicker"]}>Клинические вводные</div>
              <div className={styles["modal-t"]}>Исходные данные</div>
            </div>
            <button className={styles["modal-x"]} onClick={() => setPatientDataOpen(false)} type="button">
              <CloseIcon />
            </button>
          </div>

          <div className={styles["modal-bd"]}>
            {patientDataStage && patientDataStage.type === "text" ? (
              <div
                className={`${styles["stage-text"]} ${styles["patient-data-content"]}`.trim()}
                dangerouslySetInnerHTML={{ __html: patientDataStage.content }}
              />
            ) : (
              <p className={styles["modal-desc"]}>{selectedCase?.desc ?? "Исходные данные кейса пока недоступны."}</p>
            )}
          </div>

          <div className={styles["modal-ft"]}>
            <button className={`${styles.btn} ${styles["btn-p"]}`.trim()} onClick={() => setPatientDataOpen(false)} type="button">
              Вернуться к вопросу
            </button>
          </div>
        </div>
      </div>

      <div
        className={`${styles["ai-overlay"]} ${caseExamSummaryOpen ? styles.active : ""}`.trim()}
        data-testid="cases-exam-simulation-result"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeCaseExamSummary();
          }
        }}
        role="presentation"
      >
        <div className={`${styles["ai-card"]} ${caseExamReviewOpen ? styles["stage-review-card"] : styles["result-card"]}`.trim()}>
          <div className={styles["ai-head"]}>
            <div className={styles["ai-heading"]}>
              <div className={styles["ai-kicker"]}>Пробная аккредитация</div>
              <div className={styles["ai-title"]}>{caseExamPassed ? "Ситуационные задачи сданы" : "Ситуационные задачи не сданы"}</div>
            </div>
            <button className={styles["ai-close"]} onClick={closeCaseExamSummary} type="button">
              <CloseIcon />
            </button>
          </div>

          <div className={styles["ai-body"]}>
            {!caseExamReviewOpen ? (
              <>
                <div className={styles["result-summary"]}>
                  <div className={styles["result-ring-wrap"]}>
                    <svg height="138" viewBox="0 0 138 138" width="138">
                      <circle cx="69" cy="69" fill="none" r="58" stroke="var(--rule)" strokeWidth="9" />
                      <circle
                        cx="69"
                        cy="69"
                        r="58"
                        fill="none"
                        stroke={caseExamPassed ? "var(--green)" : "var(--accent)"}
                        strokeDasharray={caseRingCircumference}
                        strokeDashoffset={caseExamRingOffset}
                        strokeLinecap="round"
                        strokeWidth="9"
                        transform="rotate(-90 69 69)"
                      />
                    </svg>
                    <div className={styles["result-ring-inner"]}>
                      <div className={styles["result-ring-value"]}>{caseExamPercent}%</div>
                      <div className={styles["result-ring-label"]}>Итог</div>
                    </div>
                  </div>

                  <div className={styles["result-title"]}>{caseExamPassed ? "Ситуационные задачи сданы!" : "Этап требует повторения"}</div>
                  <div className={styles["result-desc"]}>
                    {caseExamPassed
                      ? "Порог 70% пройден. Результат этапа пробной аккредитации сохранён."
                      : "Для зачёта нужны оба назначенных кейса, минимум 24 вопроса и 70%+ в каждом кейсе."}
                  </div>

                  <div className={styles["result-stats"]}>
                    <div className={styles["result-stat"]}>
                      <div className={styles["result-stat-value"]}>
                        {caseExamCorrect}/{caseExamTotal}
                      </div>
                      <div className={styles["result-stat-label"]}>Ответы</div>
                    </div>
                    <div className={styles["result-stat-divider"]} />
                    <div className={styles["result-stat"]}>
                      <div className={styles["result-stat-value"]}>{caseExamResults.length}</div>
                      <div className={styles["result-stat-label"]}>Кейсы</div>
                    </div>
                  </div>
                </div>

                <div className={styles["ai-score"]}>
                  <svg className={styles["ai-ring"]} viewBox="0 0 72 72">
                    <circle cx="36" cy="36" r="30" fill="none" stroke="var(--ink-10)" strokeWidth="6" />
                    <circle
                      cx="36"
                      cy="36"
                      r="30"
                      fill="none"
                      stroke={caseExamPassed ? "var(--green)" : "var(--accent)"}
                      strokeWidth="6"
                      strokeDasharray={`${(caseExamPercent / 100) * 2 * Math.PI * 30} ${2 * Math.PI * 30}`}
                      strokeLinecap="round"
                      transform="rotate(-90 36 36)"
                    />
                  </svg>

                  <div className={styles["ai-score-info"]}>
                    <div className={styles["ai-score-title"]}>{caseExamStatusLabel}</div>
                    <div className={styles["ai-score-sub"]}>
                      {caseExamCorrect} из {caseExamTotal} верных · Итог {caseExamPercent}%
                    </div>
                  </div>
                </div>

                <div className={styles["ai-section"]}>
                  <div className={styles["ai-sec-title"]}>Кейсы этапа</div>
                  {caseExamResults.map((item, index) => (
                    <div
                      className={`${styles["ai-feedback"]} ${
                        item.result.accuracy_percent >= ACCREDITATION_PASS_PERCENT ? styles.good : styles.bad
                      }`.trim()}
                      key={item.caseItem.slug}
                    >
                      <strong>
                        Кейс {index + 1}: {item.caseItem.title}
                      </strong>
                      <br />
                      {item.result.correct_answers} из {item.result.total_questions} верных · {Math.round(item.result.accuracy_percent)}%
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className={styles["stage-review-summary"]}>
                  <strong>Полный разбор кейсового этапа</strong>
                  <span>
                    {caseExamCorrect} из {caseExamTotal} верных · итог {caseExamPercent}% · {caseExamStatusLabel}
                  </span>
                </div>

                <div className={styles["stage-review-list"]}>
                  {caseExamResults.map((item, index) => {
                    const feedbackByQuestionId = new Map(item.result.feedback.map((feedback) => [feedback.question_id, feedback] as const));
                    const questionStages = item.caseItem.stages.filter((stage): stage is CaseStageQuestion => stage.type === "question");

                    return (
                      <section className={styles["stage-review-group"]} key={item.caseItem.slug}>
                        <div className={styles["stage-review-head"]}>
                          <div>
                            <div className={styles["stage-review-kicker"]}>Кейс {index + 1}</div>
                            <h3>{item.caseItem.title}</h3>
                          </div>
                          <span
                            className={`${styles["stage-review-score"]} ${
                              item.result.accuracy_percent >= ACCREDITATION_PASS_PERCENT ? styles.good : styles.bad
                            }`.trim()}
                          >
                            {Math.round(item.result.accuracy_percent)}%
                          </span>
                        </div>

                        {questionStages.map((stage) => {
                          const feedback = stage.questionId ? feedbackByQuestionId.get(stage.questionId) : undefined;
                          const selectedText = getCaseOptionTextByLabel(stage.options, feedback?.selected_option_label);
                          const correctText = getCaseOptionTextByLabel(stage.options, feedback?.correct_option_label);

                          return (
                            <div
                              className={`${styles["stage-review-item"]} ${
                                feedback?.is_correct ? styles.good : styles.bad
                              }`.trim()}
                              key={stage.questionId ?? stage.title}
                            >
                              <div className={styles["stage-review-question"]}>{stage.question}</div>
                              <div className={styles["stage-review-answer"]}>
                                <strong>Ваш ответ:</strong>{" "}
                                {feedback?.selected_option_label ?? "Не отвечено"}
                                {selectedText ? ` — ${selectedText}` : ""}
                              </div>
                              {feedback && !feedback.is_correct ? (
                                <div className={styles["stage-review-answer"]}>
                                  <strong>Правильно:</strong> {feedback.correct_option_label}
                                  {correctText ? ` — ${correctText}` : ""}
                                </div>
                              ) : null}
                              <p>{feedback?.explanation ?? stage.explanation ?? "Разбор по вопросу не найден."}</p>
                            </div>
                          );
                        })}
                      </section>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className={styles["ai-acts"]}>
            {caseExamReviewOpen ? (
              <button className={`${styles.btn} ${styles["btn-o"]}`.trim()} onClick={() => setCaseExamReviewOpen(false)} type="button">
                К результату
              </button>
            ) : (
              <button className={`${styles.btn} ${styles["btn-p"]}`.trim()} onClick={() => setCaseExamReviewOpen(true)} type="button">
                Посмотреть разбор
              </button>
            )}
            <button className={`${styles.btn} ${caseExamReviewOpen ? styles["btn-p"] : styles["btn-o"]}`.trim()} onClick={closeCaseExamSummary} type="button">
              {isStrictCaseRun ? "В аккредитацию" : "Закрыть"}
            </button>
          </div>
        </div>
      </div>

      <div
        className={`${styles["ai-overlay"]} ${aiOpen ? styles.active : ""}`.trim()}
        data-testid="cases-ai-result"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeAi();
          }
        }}
        role="presentation"
      >
        <div className={`${styles["ai-card"]} ${styles["result-card"]}`.trim()}>
          <div className={styles["ai-head"]}>
            <div className={styles["ai-heading"]}>
              <div className={styles["ai-kicker"]}>Проверка завершена</div>
              <div className={styles["ai-title"]}>Разбор кейса</div>
            </div>
            <button className={styles["ai-close"]} onClick={closeAi} type="button">
              <CloseIcon />
            </button>
          </div>

          <div className={styles["ai-body"]}>
            {!caseReviewOpen ? (
            <div className={styles["result-summary"]}>
              <div className={styles["result-ring-wrap"]}>
                <svg height="138" viewBox="0 0 138 138" width="138">
                  <circle cx="69" cy="69" fill="none" r="58" stroke="var(--rule)" strokeWidth="9" />
                  <circle
                    cx="69"
                    cy="69"
                    r="58"
                    fill="none"
                    stroke={caseResultToneColor}
                    strokeDasharray={caseRingCircumference}
                    strokeDashoffset={caseRingOffset}
                    strokeLinecap="round"
                    strokeWidth="9"
                    transform="rotate(-90 69 69)"
                    style={{ transition: "stroke-dashoffset 1s ease" }}
                  />
                </svg>
                <div className={styles["result-ring-inner"]}>
                  <div className={styles["result-ring-value"]}>{accuracyPercent}%</div>
                  <div className={styles["result-ring-label"]}>Итог</div>
                </div>
              </div>

              <div className={styles["result-title"]}>
                {completionReporting && !completionResult
                  ? "Проверяем ответы"
                  : caseResultMastered
                    ? "Кейс освоен!"
                    : caseResultPassed
                      ? "Кейс пройден"
                    : "Кейс стоит повторить"}
              </div>
              <div className={styles["result-desc"]}>
                {completionReporting && !completionResult
                  ? "Подождите несколько секунд: система сохраняет ответы и готовит подробный разбор."
                  : caseResultMastered
                    ? "Порог освоения 85% пройден. Разбор поможет закрепить сильные клинические решения."
                    : caseResultPassed
                      ? "Порог 70% пройден. Разбор поможет добрать клиническую логику до освоения 85%."
                    : "В ответах есть слабые места. Разбор покажет, где клиническая логика ушла в сторону."}
              </div>

              <div className={styles["result-stats"]}>
                <div className={styles["result-stat"]}>
                  <div className={styles["result-stat-value"]}>
                    {correctAnswers}/{totalResultQuestions}
                  </div>
                  <div className={styles["result-stat-label"]}>Ответы</div>
                </div>
                <div className={styles["result-stat-divider"]} />
                <div className={styles["result-stat"]}>
                  <div className={styles["result-stat-value"]}>
                    {String(elapsedMinutesValue).padStart(2, "0")}:{String(elapsedSecondsValue).padStart(2, "0")}
                  </div>
                  <div className={styles["result-stat-label"]}>Время</div>
                </div>
              </div>

              <button
                className={`${styles.btn} ${styles["btn-p"]} ${styles["result-primary"]}`.trim()}
                disabled={completionReporting && !completionResult}
                onClick={openCaseReviewPage}
                type="button"
              >
                Посмотреть разбор
              </button>
              <button className={`${styles.btn} ${styles["btn-o"]} ${styles["result-primary"]}`.trim()} onClick={closeAi} type="button">
                {isStrictCaseRun ? "В аккредитацию" : "Закрыть"}
              </button>
            </div>
            ) : null}
          </div>
        </div>
      </div>
    </CasesChrome>
  );
}

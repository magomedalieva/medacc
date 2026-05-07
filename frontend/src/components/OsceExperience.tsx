import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { api, ApiError, isAbortError } from "../lib/api";
import { buildAccreditationReturnRoute } from "../lib/session";
import type {
  ExamSimulation,
  OsceAttemptHistoryItem,
  OsceAttemptStartResponse,
  OsceAttemptSubmitResponse,
  OsceStationDetail,
  OsceStationListItem,
} from "../types/api";
import { OsceChrome } from "./OsceChrome";
import styles from "./OsceExperience.module.css";

type SortMode = "status" | "score" | "alpha" | "att";
type StepId = "overview" | "checklist" | "quiz" | "results";
type StationStatus = "in_progress" | "mastered" | "not_started";
type NoticeTone = "ok" | "err";

const OSCE_EXAM_SIM_STATION_COUNT = 5;
const ACCREDITATION_PASS_PERCENT = 70;

interface ChecklistItem {
  id: string;
  t: string;
  d: string;
  crit: boolean;
}

interface QuizOption {
  l: string;
  t: string;
}

interface QuizQuestion {
  id: string;
  t: string;
  opts: QuizOption[];
  ok?: string;
  expl?: string;
}

interface AttemptItem {
  id: string;
  date: string;
  total: number;
  cl: number;
  q: number;
  pts: number;
  cl_d: number;
  cl_t: number;
  q_ok: number;
  q_t: number;
}

interface StationItem {
  slug: string;
  title: string;
  subtitle: string;
  summary: string;
  section: string;
  topic: string;
  skill: string;
  dur: number;
  max: number;
  status: StationStatus;
  best_pct: number | null;
  best_pts: number | null;
  att_n: number;
  cl: ChecklistItem[];
  quiz: QuizQuestion[];
  atts: AttemptItem[];
}

interface ResultFeedback {
  id: string;
  t: string;
  ok: boolean;
  correct: string;
  yours: string;
  expl: string;
}

interface AttemptResult {
  total: number;
  cl: number;
  q: number;
  pts: number;
  historical?: boolean;
  checked: string[];
  cl_d: number;
  cl_t: number;
  q_ok: number;
  q_t: number;
  fb: ResultFeedback[];
}

interface OsceExamSimulationResult {
  station: StationItem;
  result: AttemptResult;
}

interface OsceExamSimulationRun {
  stations: StationItem[];
  index: number;
  results: OsceExamSimulationResult[];
  finished: boolean;
}

interface StrictOsceStageResult {
  slug: string;
  scorePercent: number | null;
  passed: boolean | null;
}

interface StrictOsceStageProgress {
  attemptedSlugs: Set<string>;
  stationResults: Map<string, StrictOsceStageResult>;
}

function normalizeStationStatus(status: string): StationStatus {
  if (status === "mastered") {
    return "mastered";
  }

  if (status === "in_progress") {
    return "in_progress";
  }

  return "not_started";
}

function formatAttemptDate(submittedAt: string): string {
  const parsed = new Date(submittedAt);

  if (Number.isNaN(parsed.getTime())) {
    return submittedAt;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
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

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
    .filter((item) => /^[a-z0-9][a-z0-9-]*$/.test(item));
}

function parsePercent(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, value));
}

function parseBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function getOsceStage(simulation: ExamSimulation | null | undefined) {
  return simulation?.stages.find((stage) => stage.key === "osce") ?? null;
}

function extractStrictOsceProgress(simulation: ExamSimulation | null | undefined): StrictOsceStageProgress {
  const stage = getOsceStage(simulation);
  const details = stage?.details ?? {};
  const attemptedSlugs = new Set(parseStringArray(details.attempted_station_slugs));
  const stationResults = new Map<string, StrictOsceStageResult>();
  const rawResults = Array.isArray(details.station_results) ? details.station_results : [];

  rawResults.forEach((rawResult) => {
    if (!rawResult || typeof rawResult !== "object") {
      return;
    }

    const payload = rawResult as Record<string, unknown>;
    const slug = typeof payload.slug === "string" ? payload.slug.trim().toLowerCase() : "";

    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      return;
    }

    stationResults.set(slug, {
      slug,
      scorePercent: parsePercent(payload.score_percent),
      passed: parseBoolean(payload.passed),
    });
  });

  return { attemptedSlugs, stationResults };
}

function mapAttemptHistoryItem(attempt: OsceAttemptHistoryItem): AttemptItem {
  return {
    id: attempt.id,
    date: formatAttemptDate(attempt.submitted_at),
    total: attempt.total_score_percent,
    cl: attempt.checklist_score_percent,
    q: attempt.quiz_score_percent,
    pts: attempt.score_points,
    cl_d: attempt.checklist_completed_count,
    cl_t: attempt.checklist_total_count,
    q_ok: attempt.quiz_correct_answers,
    q_t: attempt.quiz_total_questions,
  };
}

function mapStationListItem(station: OsceStationListItem): StationItem {
  return {
    slug: station.slug,
    title: station.title,
    subtitle: station.subtitle ?? "",
    summary: station.summary,
    section: station.section_name,
    topic: station.topic_name,
    skill: station.skill_level,
    dur: station.duration_minutes,
    max: station.max_score,
    status: normalizeStationStatus(station.status),
    best_pct: station.best_score_percent,
    best_pts: station.best_score_points,
    att_n: station.attempts_count,
    cl: [],
    quiz: [],
    atts: [],
  };
}

function mapStationDetail(station: OsceStationDetail): StationItem {
  return {
    ...mapStationListItem(station),
    cl: station.checklist_items.map((item) => ({
      id: item.id,
      t: item.title,
      d: item.description,
      crit: item.critical,
    })),
    quiz: station.quiz_questions.map((question) => ({
      id: question.id,
      t: question.prompt,
      opts: question.options.map((option) => ({
        l: option.label,
        t: option.text,
      })),
    })),
    atts: [...station.attempts]
      .sort((left, right) => new Date(right.submitted_at).getTime() - new Date(left.submitted_at).getTime())
      .map(mapAttemptHistoryItem),
  };
}

function mergeStationCollections(current: StationItem[], incoming: StationItem[]): StationItem[] {
  const currentBySlug = new Map(current.map((station) => [station.slug, station]));

  return incoming.map((station) => {
    const existing = currentBySlug.get(station.slug);

    if (!existing) {
      return station;
    }

    return {
      ...station,
      cl: existing.cl.length ? existing.cl : station.cl,
      quiz: existing.quiz.length ? existing.quiz : station.quiz,
      atts: existing.atts.length ? existing.atts : station.atts,
    };
  });
}

function upsertStation(current: StationItem[], nextStation: StationItem): StationItem[] {
  const existingIndex = current.findIndex((station) => station.slug === nextStation.slug);

  if (existingIndex === -1) {
    return [...current, nextStation];
  }

  return current.map((station, index) => (index === existingIndex ? { ...station, ...nextStation } : station));
}

function buildAttemptResult(
  response: OsceAttemptSubmitResponse,
  station: StationItem,
  selectedAnswers: Record<string, string>,
  checkedItems: string[],
): AttemptResult {
  const questionTitleById = new Map(station.quiz.map((question) => [question.id, question.t]));

  return {
    total: response.total_score_percent,
    cl: response.checklist_score_percent,
    q: response.quiz_score_percent,
    pts: response.score_points,
    checked: [...checkedItems],
    cl_d: response.checklist_completed_count,
    cl_t: response.checklist_total_count,
    q_ok: response.quiz_correct_answers,
    q_t: response.quiz_total_questions,
    fb: response.quiz_feedback.map((feedback) => ({
      id: feedback.question_id,
      t: questionTitleById.get(feedback.question_id) ?? feedback.question_id,
      ok: feedback.is_correct,
      correct: feedback.correct_option_label,
      yours: selectedAnswers[feedback.question_id] ?? "",
      expl: feedback.explanation,
    })),
  };
}

function buildHistoricalAttemptResult(station: StationItem, stageResult: StrictOsceStageResult | null): AttemptResult {
  const scorePercent = stageResult?.scorePercent ?? station.atts[0]?.total ?? 0;
  const matchingAttempt =
    station.atts.find((attempt) => Math.abs(attempt.total - scorePercent) < 0.5) ??
    station.atts[0] ??
    null;

  return {
    total: scorePercent,
    cl: matchingAttempt?.cl ?? scorePercent,
    q: matchingAttempt?.q ?? scorePercent,
    pts: matchingAttempt?.pts ?? 0,
    historical: true,
    checked: [],
    cl_d: matchingAttempt?.cl_d ?? 0,
    cl_t: matchingAttempt?.cl_t ?? station.cl.length,
    q_ok: matchingAttempt?.q_ok ?? 0,
    q_t: matchingAttempt?.q_t ?? station.quiz.length,
    fb: [],
  };
}

function buildAttemptItemFromSubmitResponse(response: OsceAttemptSubmitResponse): AttemptItem {
  return {
    id: response.id,
    date: formatAttemptDate(response.submitted_at),
    total: response.total_score_percent,
    cl: response.checklist_score_percent,
    q: response.quiz_score_percent,
    pts: response.score_points,
    cl_d: response.checklist_completed_count,
    cl_t: response.checklist_total_count,
    q_ok: response.quiz_correct_answers,
    q_t: response.quiz_total_questions,
  };
}

function applyAttemptToStation(station: StationItem, nextAttempt: AttemptItem): StationItem {
  const nextBestPct = station.best_pct == null || nextAttempt.total > station.best_pct ? nextAttempt.total : station.best_pct;
  const nextBestPts = station.best_pct == null || nextAttempt.total > station.best_pct ? nextAttempt.pts : station.best_pts;

  return {
    ...station,
    atts: [nextAttempt, ...station.atts],
    att_n: station.att_n + 1,
    best_pct: nextBestPct,
    best_pts: nextBestPts,
    status: nextBestPct != null && nextBestPct >= 85 ? "mastered" : "in_progress",
  };
}

function cx(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10 10l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 4.5v3M7 9v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function TimerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8.5" r="5.25" stroke="currentColor" strokeWidth="1.35" />
      <path d="M6.25 2.25h3.5M8 8.5V5.75M8 8.5l2 1.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.35" />
    </svg>
  );
}

function CloseIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 13 13" fill="none">
      <path d="M2 2l9 9M11 2l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ArrowIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <path
        d="M1.5 6h9M7 2.5l3.5 3.5L7 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XMarkIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ProgressIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M1 9l3-3 2 2 4-5" stroke="var(--ink-40)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EmptyIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M16 16l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ResultEmptyIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M11 7v6M11 15v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="11" cy="11" r="9" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M1.5 6A4.5 4.5 0 1 1 3 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M1.5 3v3h3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function pct(value: number | null) {
  return value != null ? `${Math.round(value)}%` : "—";
}

function tone(status: StationStatus) {
  if (status === "mastered") {
    return "green";
  }

  if (status === "in_progress") {
    return "warm";
  }

  return "default";
}

function lbl(status: StationStatus) {
  if (status === "mastered") {
    return "Освоено";
  }

  if (status === "in_progress") {
    return "В процессе";
  }

  return "Не начато";
}

function attTone(value: number) {
  if (value >= 85) {
    return "green";
  }

  if (value >= ACCREDITATION_PASS_PERCENT) {
    return "warm";
  }

  return "accent";
}

function attemptsDecl(value: number) {
  if (value === 1) {
    return "попытка";
  }

  if (value >= 2 && value <= 4) {
    return "попытки";
  }

  return "попыток";
}

export function OsceExperience() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { slug: routeSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [stations, setStations] = useState<StationItem[]>([]);
  const [search, setSearch] = useState("");
  const [topicFilter, setTopicFilter] = useState("all");
  const [sort] = useState<SortMode>("status");
  const [activeStationSlug, setActiveStationSlug] = useState<string | null>(null);
  const [stationOverlayOpen, setStationOverlayOpen] = useState(false);
  const [step, setStep] = useState<StepId>("overview");
  const [checked, setChecked] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastRes, setLastRes] = useState<AttemptResult | null>(null);
  const [activeOsceAttempt, setActiveOsceAttempt] = useState<OsceAttemptStartResponse | null>(null);
  const [osceTimerSeconds, setOsceTimerSeconds] = useState(0);
  const [successOpen, setSuccessOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [osceExamRun, setOsceExamRun] = useState<OsceExamSimulationRun | null>(null);
  const [osceExamPreparing, setOsceExamPreparing] = useState(false);
  const [osceExamSummaryOpen, setOsceExamSummaryOpen] = useState(false);
  const [osceExamReviewOpen, setOsceExamReviewOpen] = useState(false);
  const [stationGuideOpen, setStationGuideOpen] = useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: NoticeTone } | null>(null);
  const [stationsLoading, setStationsLoading] = useState(true);
  const [stationDetailLoading, setStationDetailLoading] = useState(false);
  const successRingCircumference = 2 * Math.PI * 58;

  const closeTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const osceTimerRef = useRef<number | null>(null);
  const activeOsceAttemptRef = useRef<OsceAttemptStartResponse | null>(null);
  const routeExamRunKeyRef = useRef("");
  const modalBodyRef = useRef<HTMLDivElement | null>(null);
  const [successArcOffset, setSuccessArcOffset] = useState(successRingCircumference);
  const routedPlannedTaskIdValue = searchParams.get("plannedTaskId");
  const routedPlannedTaskId =
    routedPlannedTaskIdValue && /^\d+$/.test(routedPlannedTaskIdValue) ? Number(routedPlannedTaskIdValue) : null;
  const routedSimulationId = searchParams.get("simulationId")?.trim() || null;
  const routedStationSlug = searchParams.get("stationSlug")?.trim() || null;
  const routedStationSlugsKey = searchParams.get("stationSlugs") ?? "";
  const routedStationSlugs = parseSlugList(routedStationSlugsKey);
  const shouldStartExamRunFromRoute = searchParams.get("examRun") === "1";
  const isStrictOsceRun = Boolean(routedSimulationId);
  const isStationRoute = Boolean(routeSlug);
  const stationOverlayVisible = stationOverlayOpen || isStationRoute;
  const stationPageMode =
    step !== "overview" && (isStationRoute || (stationOverlayOpen && osceExamRun !== null && !osceExamRun.finished));

  const currentStation = useMemo(
    () => {
      if (!activeStationSlug) {
        return null;
      }

      return (
        stations.find((stationItem) => stationItem.slug === activeStationSlug) ??
        osceExamRun?.stations.find((stationItem) => stationItem.slug === activeStationSlug) ??
        null
      );
    },
    [activeStationSlug, osceExamRun?.stations, stations],
  );
  const stationActionLoading = stationDetailLoading || !currentStation;

  const filteredStations = useMemo(() => {
    const query = search.trim().toLowerCase();
    const items = stations.filter((stationItem) => {
      const matchesSection = topicFilter === "all" || stationItem.topic === topicFilter;
      const matchesSearch =
        !query || `${stationItem.title}${stationItem.section}${stationItem.skill}${stationItem.summary}`.toLowerCase().includes(query);
      return matchesSection && matchesSearch;
    });

    items.sort((left, right) => {
      if (sort === "status") {
        const order = ["in_progress", "not_started", "mastered"];
        return order.indexOf(left.status) - order.indexOf(right.status);
      }

      if (sort === "score") {
        return (right.best_pct ?? 0) - (left.best_pct ?? 0);
      }

      if (sort === "att") {
        return right.att_n - left.att_n;
      }

      return left.title.localeCompare(right.title, "ru");
    });

    return items;
  }, [search, sort, stations, topicFilter]);

  const topics = useMemo(() => {
    const values = ["all", ...Array.from(new Set(stations.map((stationItem) => stationItem.topic)))];
    return values.map((value) => ({
      value,
      count: value === "all" ? stations.length : stations.filter((stationItem) => stationItem.topic === value).length,
    }));
  }, [stations]);

  const checklistProgress = currentStation ? Math.round((checked.length / currentStation.cl.length) * 100) || 0 : 0;
  const allQuizQuestionsAnswered = currentStation ? currentStation.quiz.every((question) => Boolean(answers[question.id])) : false;
  const latestAttempt = lastRes ?? currentStation?.atts[0] ?? null;
  const canOpenResults = submitted && lastRes !== null;
  const feedbackByQuestionId = useMemo(
    () => new Map((lastRes?.fb ?? []).map((feedback) => [feedback.id, feedback])),
    [lastRes],
  );

  useEffect(() => {
    if (!token) {
      setStations([]);
      setStationsLoading(false);
      return;
    }

    const controller = new AbortController();

    setStationsLoading(true);

    void api
      .listOsceStations(token, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }

        setStations((currentValue) => mergeStationCollections(currentValue, response.map(mapStationListItem)));
      })
      .catch((error) => {
        if (isAbortError(error)) {
          return;
        }

        setStations([]);
        setNotice({
          message: error instanceof ApiError ? error.message : "Не удалось загрузить станции ОСКЭ",
          tone: "err",
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setStationsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [token]);

  useEffect(() => {
    if (!shouldStartExamRunFromRoute || stations.length === 0 || stationsLoading || osceExamPreparing) {
      return;
    }

    const routeKey = searchParams.toString();

    if (routeExamRunKeyRef.current === routeKey) {
      return;
    }

    routeExamRunKeyRef.current = routeKey;

    void startOsceExamSimulation(routedStationSlug)
      .catch((error: unknown) => {
        if (isAbortError(error)) {
          return;
        }

        setNotice({
          message: error instanceof ApiError ? error.message : "Не удалось подготовить этап ОСКЭ для пробной аккредитации",
          tone: "err",
        });
      })
      .finally(() => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("examRun");
        setSearchParams(nextParams, { replace: true });
      });
  }, [
    osceExamPreparing,
    routedStationSlug,
    routedStationSlugsKey,
    searchParams,
    setSearchParams,
    shouldStartExamRunFromRoute,
    stations.length,
    stationsLoading,
  ]);

  useEffect(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (routeSlug) {
      if (!token) {
        return;
      }

      const controller = new AbortController();
      setActiveStationSlug(routeSlug);
      setChecked([]);
      setAnswers({});
      setExpanded(null);
      setSubmitted(false);
      setSubmitting(false);
      setLastRes(null);
      resetOsceAttempt();
      setStep("overview");
      setSuccessOpen(false);
      setConfirmOpen(false);
      setStationDetailLoading(true);
      window.requestAnimationFrame(() => {
        setStationOverlayOpen(true);
      });

      void api
        .getOsceStation(token, routeSlug, controller.signal)
        .then((station) => {
          if (controller.signal.aborted) {
            return;
          }

          setStations((currentValue) => upsertStation(currentValue, mapStationDetail(station)));
        })
        .catch((error) => {
          if (isAbortError(error)) {
            return;
          }

          setNotice({
            message: error instanceof ApiError ? error.message : "Не удалось открыть станцию ОСКЭ",
            tone: "err",
          });
          navigate(isStrictOsceRun ? buildAccreditationCenterPath() : buildListPath(), { replace: true });
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setStationDetailLoading(false);
          }
        });

      return () => {
        controller.abort();
      };
    }

    setStationOverlayOpen(false);
    resetOsceAttempt();
    closeTimerRef.current = window.setTimeout(() => {
      setActiveStationSlug(null);
      setChecked([]);
      setAnswers({});
      setExpanded(null);
      setSubmitted(false);
      setSubmitting(false);
      setLastRes(null);
      setStep("overview");
      setStationDetailLoading(false);
    }, 320);
  }, [navigate, routeSlug, token]);

  useEffect(() => {
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }

    if (notice) {
      noticeTimerRef.current = window.setTimeout(() => {
        setNotice(null);
      }, 5000);
    }

    return () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, [notice]);

  useEffect(() => {
    const shouldLockScroll = (stationOverlayVisible && !stationPageMode) || successOpen || confirmOpen || osceExamSummaryOpen;
    document.body.style.overflow = shouldLockScroll ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [confirmOpen, osceExamSummaryOpen, stationOverlayVisible, stationPageMode, successOpen]);

  useEffect(() => {
    document.title = "MedAcc — ОСКЭ";
  }, []);

  useEffect(() => {
    activeOsceAttemptRef.current = activeOsceAttempt;
  }, [activeOsceAttempt]);

  useEffect(() => {
    return () => {
      clearOsceTimer();
    };
  }, []);

  useEffect(() => {
    if (modalBodyRef.current) {
      modalBodyRef.current.scrollTop = 0;
    }

    if (stationPageMode) {
      window.scrollTo({ top: 0 });
    }
  }, [activeStationSlug, stationPageMode, step]);

  useEffect(() => {
    if (!successOpen || !lastRes) {
      setSuccessArcOffset(successRingCircumference);
      return;
    }

    const targetOffset = successRingCircumference * (1 - lastRes.total / 100);
    setSuccessArcOffset(successRingCircumference);
    const timerId = window.setTimeout(() => {
      setSuccessArcOffset(targetOffset);
    }, 80);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [lastRes, successOpen, successRingCircumference]);

  function clearOsceTimer() {
    if (osceTimerRef.current !== null) {
      window.clearInterval(osceTimerRef.current);
      osceTimerRef.current = null;
    }
  }

  function resetOsceAttempt() {
    clearOsceTimer();
    activeOsceAttemptRef.current = null;
    setActiveOsceAttempt(null);
    setOsceTimerSeconds(0);
  }

  function startOsceTimer(durationSeconds: number, strict: boolean) {
    clearOsceTimer();
    setOsceTimerSeconds(strict ? durationSeconds : 0);

    osceTimerRef.current = window.setInterval(() => {
      setOsceTimerSeconds((previous) => {
        if (!strict) {
          return previous + 1;
        }

        if (previous <= 1) {
          clearOsceTimer();
          setNotice({
            message: "Время серверной попытки ОСКЭ истекло. Начните станцию заново.",
            tone: "err",
          });
          return 0;
        }

        return previous - 1;
      });
    }, 1000);
  }

  async function ensureOsceAttemptStarted(): Promise<OsceAttemptStartResponse | null> {
    if (!token || !currentStation) {
      return null;
    }

    const currentAttempt = activeOsceAttemptRef.current;

    if (currentAttempt?.station_slug === currentStation.slug && (!isStrictOsceRun || osceTimerSeconds > 0)) {
      return currentAttempt;
    }

    try {
      const attempt = await api.startOsceAttempt(token, currentStation.slug, {
        planned_task_id: routedPlannedTaskId,
        simulation_id: routedSimulationId,
      });
      activeOsceAttemptRef.current = attempt;
      setActiveOsceAttempt(attempt);
      startOsceTimer(attempt.duration_seconds, isStrictOsceRun);
      return attempt;
    } catch (error) {
      setNotice({
        message: error instanceof ApiError ? error.message : "Не удалось начать серверную попытку ОСКЭ",
        tone: "err",
      });
      return null;
    }
  }

  function closeNotice() {
    setNotice(null);
  }

  function buildAccreditationCenterPath() {
    return buildAccreditationReturnRoute({
      plannedTaskId: routedPlannedTaskId,
      simulationId: routedSimulationId,
      stage: "osce_stage",
    });
  }

  function returnToAccreditationCenter() {
    navigate(buildAccreditationCenterPath());
  }

  function buildListPath() {
    const params = new URLSearchParams();
    const basePath = isStrictOsceRun ? "/app/accreditation/osce" : "/app/osce";

    if (routedPlannedTaskId !== null) {
      params.set("plannedTaskId", String(routedPlannedTaskId));
    }

    if (routedSimulationId) {
      params.set("simulationId", routedSimulationId);
    }

    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  }

  function buildStationPath(stationSlug: string) {
    const params = new URLSearchParams();
    const basePath = isStrictOsceRun ? "/app/accreditation/osce" : "/app/osce";

    if (routedPlannedTaskId !== null) {
      params.set("plannedTaskId", String(routedPlannedTaskId));
    }

    if (routedSimulationId) {
      params.set("simulationId", routedSimulationId);
    }

    const query = params.toString();
    return query ? `${basePath}/${stationSlug}?${query}` : `${basePath}/${stationSlug}`;
  }

  function openStation(stationSlug: string) {
    navigate(buildStationPath(stationSlug));
  }

  function openStationInPlace(station: StationItem) {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    setStations((currentValue) => upsertStation(currentValue, station));
    setActiveStationSlug(station.slug);
    setChecked([]);
    setAnswers({});
    setExpanded(null);
    setSubmitted(false);
    setSubmitting(false);
    setLastRes(null);
    resetOsceAttempt();
    setStep("overview");
    setSuccessOpen(false);
    setConfirmOpen(false);
    setStationOverlayOpen(true);
  }

  async function ensureStationDetail(station: StationItem): Promise<StationItem> {
    if (!token) {
      throw new Error("Нет активной сессии");
    }

    if (station.cl.length > 0 || station.quiz.length > 0) {
      return station;
    }

    const detail = await api.getOsceStation(token, station.slug);
    const detailedStation = mapStationDetail(detail);
    setStations((currentValue) => upsertStation(currentValue, detailedStation));
    return detailedStation;
  }

  async function loadStrictOsceStageProgress(): Promise<StrictOsceStageProgress> {
    if (!token || !routedSimulationId) {
      return {
        attemptedSlugs: new Set(),
        stationResults: new Map(),
      };
    }

    const simulations = await api.listExamSimulations(token);
    const simulation = simulations.find((item) => item.id === routedSimulationId) ?? null;

    return extractStrictOsceProgress(simulation);
  }

  async function startOsceExamSimulation(seedStationSlug?: string | null) {
    if (!token || osceExamPreparing || stationsLoading) {
      return;
    }

    const seedStation = seedStationSlug ? stations.find((station) => station.slug === seedStationSlug) ?? null : null;
    const candidates = [
      ...(seedStation ? [seedStation] : []),
      ...filteredStations.filter((station) => station.slug !== seedStation?.slug),
      ...stations.filter(
        (station) =>
          station.slug !== seedStation?.slug &&
          !filteredStations.some((filtered) => filtered.slug === station.slug),
      ),
    ];
    const simulationStations: StationItem[] = [];

    setOsceExamPreparing(true);

    try {
      const strictStageProgress = isStrictOsceRun
        ? await loadStrictOsceStageProgress()
        : {
            attemptedSlugs: new Set<string>(),
            stationResults: new Map<string, StrictOsceStageResult>(),
          };
      const assignedStations = routedStationSlugs
        .map((slug) => stations.find((station) => station.slug === slug) ?? null)
        .filter((station): station is StationItem => station !== null);
      const stationCandidates = assignedStations.length > 0 ? assignedStations : candidates;

      if (routedStationSlugs.length > 0 && assignedStations.length !== routedStationSlugs.length) {
        setNotice({
          message: "Не удалось найти все станции, назначенные системой для этой пробной аккредитации.",
          tone: "err",
        });
        return;
      }

      for (const station of stationCandidates) {
        const detailedStation = await ensureStationDetail(station);

        if (detailedStation.cl.length > 0 && detailedStation.quiz.length > 0) {
          simulationStations.push(detailedStation);
        }

        if (simulationStations.length >= OSCE_EXAM_SIM_STATION_COUNT) {
          break;
        }
      }

      if (simulationStations.length < OSCE_EXAM_SIM_STATION_COUNT) {
        setNotice({
          message: "Для пробной аккредитации нужно минимум 5 станций с чек-листом и тестом.",
          tone: "err",
        });
        return;
      }

      const completedResults = simulationStations
        .filter((station) => strictStageProgress.attemptedSlugs.has(station.slug))
        .map((station) => ({
          station,
          result: buildHistoricalAttemptResult(station, strictStageProgress.stationResults.get(station.slug) ?? null),
        }));
      const nextStationIndex = simulationStations.findIndex((station) => !strictStageProgress.attemptedSlugs.has(station.slug));

      setOsceExamSummaryOpen(false);
      setOsceExamReviewOpen(false);
      setOsceExamRun({
        stations: simulationStations,
        index: nextStationIndex === -1 ? simulationStations.length : nextStationIndex,
        results: completedResults,
        finished: nextStationIndex === -1,
      });

      if (nextStationIndex === -1) {
        setStationOverlayOpen(false);
        setOsceExamSummaryOpen(true);
        return;
      }

      openStationInPlace(simulationStations[nextStationIndex]!);
    } catch (error) {
      setNotice({
        message: error instanceof ApiError ? error.message : "Не удалось подготовить этап ОСКЭ",
        tone: "err",
      });
    } finally {
      setOsceExamPreparing(false);
    }
  }

  async function goStep(nextStep: StepId) {
    if (nextStep === "results" && !canOpenResults) {
      setNotice({
        message: "Результаты появятся после завершения станции.",
        tone: "err",
      });
      return;
    }

    if ((nextStep === "checklist" || nextStep === "quiz") && !submitted) {
      const attempt = await ensureOsceAttemptStarted();

      if (!attempt) {
        return;
      }
    }

    setStep(nextStep);
  }

  function closeSuccess() {
    setSuccessOpen(false);
  }

  function closeSuccessAndReturn() {
    setSuccessOpen(false);

    if (isStrictOsceRun) {
      returnToAccreditationCenter();
    }
  }

  function closeConfirm() {
    setConfirmOpen(false);
  }

  function tryClose() {
    const learningStationInProgress = !isStrictOsceRun && !submitted && (step !== "overview" || activeOsceAttemptRef.current !== null);
    const hasUnsavedProgress = !submitted && (checked.length > 0 || Object.keys(answers).length > 0);

    if (learningStationInProgress || hasUnsavedProgress) {
      setConfirmOpen(true);
      return;
    }

    doClose();
  }

  function doClose() {
    setSuccessOpen(false);
    setConfirmOpen(false);
    setOsceExamRun(null);
    setOsceExamReviewOpen(false);
    resetOsceAttempt();

    if (isStrictOsceRun) {
      returnToAccreditationCenter();
      return;
    }

    navigate(buildListPath());
  }

  function forceClose() {
    closeConfirm();
    doClose();
  }

  function toggleCheck(id: string) {
    setChecked((currentValue) =>
      currentValue.includes(id) ? currentValue.filter((value) => value !== id) : [...currentValue, id],
    );
  }

  function toggleExpand(id: string) {
    setExpanded((currentValue) => (currentValue === id ? null : id));
  }

  function checkAll() {
    setChecked(currentStation ? currentStation.cl.map((item) => item.id) : []);
  }

  function clearAll() {
    setChecked([]);
  }

  function pickQ(questionId: string, label: string) {
    if (submitted) {
      return;
    }

    setAnswers((currentValue) => ({
      ...currentValue,
      [questionId]: label,
    }));
  }

  async function submitAttempt() {
    if (!token || !currentStation || submitted || !allQuizQuestionsAnswered) {
      return;
    }

    const attempt = activeOsceAttemptRef.current ?? (await ensureOsceAttemptStarted());

    if (!attempt || attempt.station_slug !== currentStation.slug) {
      return;
    }

    setSubmitting(true);

    try {
      const response = await api.submitOsceAttempt(token, currentStation.slug, {
        attempt_id: attempt.attempt_id,
        checklist_item_ids: checked,
        quiz_answers: currentStation.quiz.map((question) => ({
          question_id: question.id,
          selected_option_label: answers[question.id] ?? "",
        })),
        planned_task_id: routedPlannedTaskId,
      });
      const result = buildAttemptResult(response, currentStation, answers, checked);
      const nextAttempt = buildAttemptItemFromSubmitResponse(response);

      const feedbackById = new Map(
        response.quiz_feedback.map((feedback) => [feedback.question_id, feedback] as const),
      );

      setStations((currentValue) =>
        currentValue.map((stationItem) => {
          if (stationItem.slug !== currentStation.slug) {
            return stationItem;
          }

          return {
            ...applyAttemptToStation(stationItem, nextAttempt),
            quiz: stationItem.quiz.map((question) => {
              const feedback = feedbackById.get(question.id);

              if (!feedback) {
                return question;
              }

              return {
                ...question,
                ok: feedback.correct_option_label,
                expl: feedback.explanation,
              };
            }),
          };
        }),
      );
      resetOsceAttempt();
      setSubmitted(true);
      setLastRes(result);
      if (osceExamRun && !osceExamRun.finished) {
        const nextResults = [...osceExamRun.results, { station: currentStation, result }];
        const nextIndex = osceExamRun.index + 1;

        if (nextIndex < osceExamRun.stations.length) {
          const nextStation = osceExamRun.stations[nextIndex]!;
          setOsceExamRun({
            ...osceExamRun,
            index: nextIndex,
            results: nextResults,
          });
          openStationInPlace(nextStation);
          setNotice({
            message: `Станция ${nextIndex} завершена. Следующая станция открыта.`,
            tone: "ok",
          });
          return;
        }

        setStationOverlayOpen(false);
        setOsceExamReviewOpen(false);
        setOsceExamRun({
          ...osceExamRun,
          results: nextResults,
          finished: true,
        });
        setOsceExamSummaryOpen(true);
        return;
      }

      setSuccessOpen(true);
    } catch (error) {
      setNotice({
        message: error instanceof ApiError ? error.message : "Не удалось сохранить попытку ОСКЭ",
        tone: "err",
      });
    } finally {
      setSubmitting(false);
    }

  }

  function afterSuccess() {
    closeSuccess();
    void goStep("results");
  }

  function closeOsceExamSummary() {
    setOsceExamSummaryOpen(false);
    setOsceExamReviewOpen(false);
    setOsceExamRun(null);

    if (isStrictOsceRun) {
      returnToAccreditationCenter();
    }
  }

  function restartStation() {
    setChecked([]);
    setAnswers({});
    setExpanded(null);
    setSubmitted(false);
    setSubmitting(false);
    setLastRes(null);
    resetOsceAttempt();
    void goStep("checklist");
  }

  function stepButtonClass(stepName: StepId, currentIndex: number, buttonIndex: number) {
    return cx(
      styles["step-btn"],
      currentIndex === buttonIndex && styles.on,
      buttonIndex < currentIndex && styles.done,
      stepName === "results" && !canOpenResults && styles.locked,
    );
  }

  const stepOrder: StepId[] = ["overview", "checklist", "quiz", "results"];
  const stepIndex = stepOrder.indexOf(step);
  const osceExamResults = osceExamRun?.results ?? [];
  const osceExamPassed =
    osceExamResults.length === OSCE_EXAM_SIM_STATION_COUNT &&
    osceExamResults.every((item) => item.result.total >= ACCREDITATION_PASS_PERCENT);
  const osceExamAverage =
    osceExamResults.length > 0
      ? Math.round(osceExamResults.reduce((sum, item) => sum + item.result.total, 0) / osceExamResults.length)
      : 0;
  const osceTimerMinutes = Math.floor(osceTimerSeconds / 60);
  const osceTimerSecondsValue = osceTimerSeconds % 60;
  const osceTimerDisplay = `${String(osceTimerMinutes).padStart(2, "0")}:${String(osceTimerSecondsValue).padStart(2, "0")}`;
  const osceTimerTone =
    isStrictOsceRun && activeOsceAttempt
      ? osceTimerSeconds <= 60
        ? "crit"
        : osceTimerSeconds <= 300
          ? "warn"
          : "strict"
      : "study";
  const osceTimerLabel = isStrictOsceRun ? "Осталось" : "Учебное время";
  const osceTimerHint = isStrictOsceRun
    ? "Строгий этап"
    : currentStation
      ? `Рекомендовано ${currentStation.dur} мин`
      : "Без жёсткого лимита";
  const strictOsceStageIdle = isStrictOsceRun && !stationOverlayVisible && !successOpen && !confirmOpen && !osceExamSummaryOpen;
  const strictOsceStagePreparing = strictOsceStageIdle && (shouldStartExamRunFromRoute || osceExamPreparing || stationsLoading);

  return (
    <OsceChrome>
      <div
        className={cx(styles.page, stationPageMode && styles["station-page-shell"])}
        data-loading-station-detail={stationDetailLoading ? "true" : "false"}
        data-loading-stations={stationsLoading ? "true" : "false"}
        data-testid="osce-page"
      >
        {stationPageMode && notice ? (
          <div className={cx(styles.gnotice, styles.show, styles["station-notice"], notice.tone === "err" ? styles.err : styles.ok)} id="gnotice">
            <InfoIcon />
            <span>{notice.message}</span>
            <button className={styles["gn-x"]} onClick={closeNotice} type="button">
              x
            </button>
          </div>
        ) : null}

      {!stationPageMode ? (
      <main className={styles.shell}>
        {notice ? (
          <div className={cx(styles.gnotice, styles.show, notice.tone === "err" ? styles.err : styles.ok)} id="gnotice">
            <InfoIcon />
            <span>{notice.message}</span>
            <button className={styles["gn-x"]} onClick={closeNotice} type="button">
              ✕
            </button>
          </div>
        ) : null}

        {strictOsceStageIdle ? (
          <div className={styles["empty-state"]} data-testid="osce-accreditation-stage">
            <div className={styles["empty-icon"]}>
              <InfoIcon />
            </div>
            <div className={styles["empty-title"]}>
              {strictOsceStagePreparing ? "Готовим ОСКЭ пробной аккредитации" : "Этап открывается из аккредитационного центра"}
            </div>
            <div className={styles["empty-desc"]}>
              {strictOsceStagePreparing
                ? "Система сама подбирает назначенные станции и сейчас откроет первую станцию."
                : "Чтобы не перепутать пробную аккредитацию с обычной тренировкой, вернитесь в аккредитационный центр и запустите этап оттуда."}
            </div>
            {!strictOsceStagePreparing ? (
              <button className={cx(styles.btn, styles["btn-p"])} onClick={returnToAccreditationCenter} type="button">
                В аккредитацию
              </button>
            ) : null}
          </div>
        ) : (
        <>
        <div className={styles.ph}>
          <div className={styles["ph-kicker"]}>Первичная аккредитация · III этап</div>
          <div className={styles["ph-row"]}>
            <div>
              <h1 className={styles["ph-title"]}>
                ОСКЭ
                <br />
                <em>практические станции</em>
              </h1>
              <p className={styles["ph-sub"]}>Каждая станция — это чек-лист навыка и короткий тест по теории.</p>
            </div>

            <div className={styles["search-wrap"]}>
              <SearchIcon />
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Поиск станции..."
                type="text"
                value={search}
              />
            </div>
          </div>
        </div>

        <div className={styles["catalog-layout"]}>
          <div>
            <div className={styles["filter-row"]}>
              <button
                className={cx(styles["filter-reset"], topicFilter === "all" && styles.on)}
                onClick={() => setTopicFilter("all")}
                type="button"
              >
                Все станции
              </button>

              <select
                className={styles["topic-select"]}
                onChange={(event) => setTopicFilter(event.target.value)}
                value={topicFilter}
              >
                <option value="all">Темы</option>
                {topics
                  .filter((item) => item.value !== "all")
                  .map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.value}
                    </option>
                  ))}
              </select>
            </div>

            <div id="station-list">
              {filteredStations.length ? (
                filteredStations.map((stationItem, index) => {
                  const stationTone = tone(stationItem.status);
                  const barClass =
                    stationTone === "green" ? styles["pf-green"] : stationTone === "warm" ? styles["pf-gold"] : styles["pf-accent"];
                  const scoreColor =
                    stationTone === "green" ? "var(--green)" : stationTone === "warm" ? "var(--gold)" : "var(--accent)";
                  const sideColor =
                    stationTone === "green" ? "var(--green)" : stationTone === "warm" ? "var(--gold)" : "var(--rule)";
                  const style = {
                    "--stc": sideColor,
                    animationDelay: `${index * 45}ms`,
                  } as CSSProperties;

                  return (
                    <button className={styles["st-card"]} key={stationItem.slug} onClick={() => openStation(stationItem.slug)} style={style} type="button">
                      <div className={styles["st-card-inner"]}>
                        <div className={styles["sc-top"]}>
                          <div className={styles["sc-title"]}>{stationItem.title}</div>
                          <div className={styles["sc-right"]}>
                            <span className={cx(styles.badge, styles[`b-${stationTone}`])}>{lbl(stationItem.status)}</span>
                          </div>
                        </div>

                        <div className={styles["sc-meta"]}>
                          {stationItem.section} · {stationItem.skill}
                        </div>
                        <div className={styles["sc-summary"]}>{stationItem.summary}</div>

                        {stationItem.best_pct != null ? (
                          <div className={styles["sc-progress"]}>
                            <div className={styles["sc-prog-row"]}>
                              <div className={styles["sc-prog-lbl"]}>Лучший результат</div>
                              <div className={styles["sc-prog-val"]} style={{ color: scoreColor }}>
                                {pct(stationItem.best_pct)}
                              </div>
                            </div>
                            <div className={styles["prog-track"]}>
                              <div className={cx(styles["prog-fill"], barClass)} style={{ width: `${stationItem.best_pct}%` }} />
                            </div>
                          </div>
                        ) : null}

                        <div className={styles["sc-foot"]}>
                          <span className={styles["sc-go"]}>
                            Открыть <ArrowIcon />
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className={styles["empty-state"]}>
                  <div className={styles["empty-icon"]}>
                    <EmptyIcon />
                  </div>
                  <div className={styles["empty-title"]}>Не найдено</div>
                  <div className={styles["empty-desc"]}>{search.trim() ? "Попробуйте другой запрос." : "В разделе пока нет станций."}</div>
                </div>
              )}
            </div>
          </div>

          <div className={styles.sidebar}>
            <div className={styles["about-card"]}>
              <button
                aria-expanded={stationGuideOpen}
                className={styles["about-card-head"]}
                onClick={() => setStationGuideOpen((current) => !current)}
                type="button"
              >
                <InfoIcon />
                <div className={styles["about-card-label"]}>Как проходить станцию</div>
                <span className={cx(styles["about-toggle"], stationGuideOpen && styles.open)}>
                  <ArrowIcon />
                </span>
              </button>

              <div className={cx(styles["about-collapse"], stationGuideOpen && styles.open)}>
                <div className={styles["about-body"]}>
                  <div className={styles["about-step"]}>
                    <div className={cx(styles["about-num"], styles.n1)}>1</div>
                    <div>
                      <div className={styles["about-step-title"]}>Чек-лист</div>
                      <div className={styles["about-step-desc"]}>Отмечай действия, которые умеешь выполнять уверенно. Критические пункты — самые важные.</div>
                    </div>
                  </div>

                  <div className={styles["about-step"]}>
                    <div className={cx(styles["about-num"], styles.n2)}>2</div>
                    <div>
                      <div className={styles["about-step-title"]}>Тест по теории</div>
                      <div className={styles["about-step-desc"]}>Несколько вопросов по технике выполнения навыка. После каждого ответа — объяснение.</div>
                    </div>
                  </div>

                  <div className={styles["about-step"]}>
                    <div className={cx(styles["about-num"], styles.n3)}>3</div>
                    <div>
                      <div className={styles["about-step-title"]}>Итог и разбор</div>
                      <div className={styles["about-step-desc"]}>Итог считается как 60% чек-лист + 40% тест. Каждая попытка сохраняется в истории.</div>
                    </div>
                  </div>
                </div>

                <div className={styles["about-divider"]} />
                <div className={styles["about-footer"]}>
                  Порог освоения — <strong>85%</strong>. При его достижении станция отмечается как освоенная.
                </div>
              </div>
            </div>

            <div className={styles["snap-card"]}>
              <div className={styles["snap-head"]}>
                <ProgressIcon />
                <div className={styles["snap-head-lbl"]}>Прогресс по разделам</div>
              </div>

              {Array.from(new Set(stations.map((stationItem) => stationItem.section))).map((sectionName) => {
                const sectionStations = stations.filter((stationItem) => stationItem.section === sectionName);
                const completed = sectionStations.filter((stationItem) => stationItem.status === "mastered").length;
                const progress = Math.round((completed / sectionStations.length) * 100);
                const background = progress === 100 ? "var(--green)" : progress > 0 ? "var(--gold)" : "var(--ink-15)";

                return (
                  <div className={styles["snap-row"]} key={sectionName}>
                    <div className={styles["snap-row-top"]}>
                      <div className={styles["snap-row-name"]}>{sectionName}</div>
                      <div className={styles["snap-row-cnt"]}>
                        {completed}/{sectionStations.length} освоено
                      </div>
                    </div>
                    <div className={styles["prog-track"]}>
                      <div className={styles["prog-fill"]} style={{ width: `${progress}%`, background }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        </>
        )}
      </main>
      ) : null}

      <div
        className={cx(styles.ov, stationPageMode && styles["station-route"], stationOverlayVisible && styles.show)}
        id="ov-station"
        onClick={(event) => {
          if (!stationPageMode && event.target === event.currentTarget) {
            tryClose();
          }
        }}
        role="presentation"
      >
        <div className={styles.modal} data-testid={stationPageMode ? "osce-station-page" : "osce-station-modal"}>
          <div className={styles["modal-drag"]} />
          <div className={styles["modal-head"]}>
            <div className={styles["mh-info"]}>
              <div className={styles["mh-kicker"]}>
                {currentStation ? `${currentStation.section} · ${currentStation.skill}` : "Станция ОСКЭ"}
              </div>
              <div className={styles["mh-title"]}>
                {osceExamRun && !osceExamRun.finished
                  ? `Станция ${osceExamRun.index + 1} из ${osceExamRun.stations.length}: ${currentStation?.title ?? "Название"}`
                  : currentStation?.title ?? "Название"}
              </div>
              <div className={styles["mh-sub"]}>{currentStation?.subtitle ?? ""}</div>
            </div>
            {activeOsceAttempt ? (
              <div className={cx(styles["mh-timer"], styles[osceTimerTone])} data-testid="osce-attempt-timer">
                <div className={styles["mh-timer-icon"]}>
                  <TimerIcon />
                </div>
                <div>
                  <div className={styles["mh-timer-label"]}>{osceTimerLabel}</div>
                  <div className={styles["mh-timer-value"]}>{osceTimerDisplay}</div>
                  <div className={styles["mh-timer-hint"]}>{osceTimerHint}</div>
                </div>
              </div>
            ) : null}
            <button className={styles["modal-close"]} onClick={tryClose} type="button">
              <CloseIcon />
            </button>
          </div>

          <div className={styles["step-bar"]} id="step-bar">
            <button className={stepButtonClass("overview", stepIndex, 0)} data-step="overview" onClick={() => void goStep("overview")} type="button">
              <div className={styles["step-num"]}>1</div>
              <div className={styles["step-lbl"]}>Обзор</div>
            </button>
            <div className={styles["step-sep"]} />
            <button className={stepButtonClass("checklist", stepIndex, 1)} data-step="checklist" onClick={() => void goStep("checklist")} type="button">
              <div className={styles["step-num"]}>2</div>
              <div className={styles["step-lbl"]}>Чек-лист</div>
            </button>
            <div className={styles["step-sep"]} />
            <button className={stepButtonClass("quiz", stepIndex, 2)} data-step="quiz" onClick={() => void goStep("quiz")} type="button">
              <div className={styles["step-num"]}>3</div>
              <div className={styles["step-lbl"]}>Тест</div>
            </button>
            <div className={styles["step-sep"]} />
            <button
              aria-disabled={!canOpenResults}
              className={stepButtonClass("results", stepIndex, 3)}
              data-step="results"
              disabled={!canOpenResults}
              onClick={() => void goStep("results")}
              type="button"
            >
              <div className={styles["step-num"]}>4</div>
              <div className={styles["step-lbl"]}>Результаты</div>
            </button>
          </div>

          <div className={styles["modal-body"]} id="modal-body" ref={modalBodyRef}>
            <div className={cx(styles.mpanel, step === "overview" && styles.on)} id="p-overview">
              {currentStation ? (
                <>
                  <div className={styles["ov-qs"]} id="ov-qs">
                    <div className={styles["ov-qs-col"]}>
                      <div className={styles["ov-qs-lbl"]}>Раздел</div>
                      <div className={styles["ov-qs-val"]}>{currentStation.section}</div>
                    </div>
                    <div className={styles["ov-qs-col"]}>
                      <div className={styles["ov-qs-lbl"]}>Уровень</div>
                      <div className={styles["ov-qs-val"]}>{currentStation.skill}</div>
                    </div>
                    <div className={styles["ov-qs-col"]}>
                      <div className={styles["ov-qs-lbl"]}>Время</div>
                      <div className={styles["ov-qs-val"]}>{currentStation.dur} мин</div>
                    </div>
                    <div className={styles["ov-qs-col"]}>
                      <div className={styles["ov-qs-lbl"]}>Макс. балл</div>
                      <div className={styles["ov-qs-val"]}>{currentStation.max}</div>
                    </div>
                    <div className={styles["ov-qs-col"]}>
                      <div className={styles["ov-qs-lbl"]}>Статус</div>
                      <div className={styles["ov-qs-val"]}>
                        <span className={cx(styles.badge, styles[`b-${tone(currentStation.status)}`])}>{lbl(currentStation.status)}</span>
                      </div>
                    </div>
                  </div>

                  {currentStation.best_pct != null ? (
                    <div className={styles["best-box"]}>
                      <div className={styles["best-ring"]}>
                        <svg height="96" viewBox="0 0 96 96" width="96">
                          <circle cx="48" cy="48" fill="none" r="40" stroke="var(--rule)" strokeWidth="7" />
                          <circle
                            cx="48"
                            cy="48"
                            fill="none"
                            r="40"
                            stroke={attTone(currentStation.best_pct) === "green" ? "var(--green)" : attTone(currentStation.best_pct) === "warm" ? "var(--gold)" : "var(--accent)"}
                            strokeDasharray={2 * Math.PI * 40}
                            strokeDashoffset={(2 * Math.PI * 40) * (1 - currentStation.best_pct / 100)}
                            strokeLinecap="round"
                            strokeWidth="7"
                            transform="rotate(-90 48 48)"
                          />
                        </svg>
                        <div className={styles["best-ring-inner"]}>
                          <div className={styles["best-ring-val"]}>{pct(currentStation.best_pct)}</div>
                          <div className={styles["best-ring-lbl"]}>Лучший</div>
                        </div>
                      </div>

                      <div className={styles["best-info"]}>
                        <div className={styles["best-title"]}>Лучший результат</div>
                        <div className={styles["best-sub"]}>
                          {currentStation.att_n} {attemptsDecl(currentStation.att_n)}
                        </div>
                        <div className={styles["prog-track"]} style={{ maxWidth: "210px" }}>
                          <div
                            className={styles["prog-fill"]}
                            style={{
                              width: `${currentStation.best_pct}%`,
                              background:
                                attTone(currentStation.best_pct) === "green"
                                  ? "var(--green)"
                                  : attTone(currentStation.best_pct) === "warm"
                                    ? "var(--gold)"
                                    : "var(--accent)",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={styles["ov-best-empty"]}>Попыток пока не было — начни с чек-листа</div>
                  )}

                  <div className={styles.stitle}>История попыток</div>
                  <div id="ov-atts">
                    {currentStation.atts.length ? (
                      currentStation.atts.map((attempt) => (
                        <div className={styles["att-row"]} key={attempt.id}>
                          <div>
                            <div className={styles["att-date"]}>{attempt.date}</div>
                            <div className={styles["att-sub"]}>
                              Чек-лист {pct(attempt.cl)} · Тест {pct(attempt.q)}
                            </div>
                          </div>
                          <div className={styles["att-m"]}>
                            <div className={styles["att-mv"]}>{pct(attempt.total)}</div>
                            <div className={styles["att-ml"]}>Итог</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className={styles["ov-atts-empty"]}>История появится после первого прохождения</div>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            <div className={cx(styles.mpanel, step === "checklist" && styles.on)} id="p-checklist">
              {currentStation ? (
                <>
                  <div className={styles["cl-progress-bar"]}>
                    <div className={styles["cl-pb-head"]}>
                      <div className={styles["cl-pb-title"]}>Отмечено пунктов</div>
                      <div className={styles["cl-pb-det"]} id="cl-det">
                        {checked.length} / {currentStation.cl.length}
                      </div>
                    </div>
                    <div className={styles["cl-track"]}>
                      <div
                        className={styles["cl-fill"]}
                        id="cl-fill"
                        style={{
                          width: `${checklistProgress}%`,
                          background:
                            checklistProgress === 100
                              ? "linear-gradient(90deg,var(--green),rgba(26,92,62,.3))"
                              : checklistProgress > 60
                                ? "linear-gradient(90deg,var(--gold),rgba(138,109,46,.3))"
                                : "linear-gradient(90deg,var(--accent),rgba(185,28,58,.3))",
                        }}
                      />
                    </div>
                    <div className={styles["cl-hint"]} id="cl-hint">
                      {checklistProgress === 100
                        ? "✓ Все пункты отмечены"
                        : checklistProgress === 0
                          ? "Отмечай пункты, которые умеешь выполнять уверенно"
                          : `Отмечено ${checked.length} из ${currentStation.cl.length}`}
                    </div>
                  </div>

                  <div id="cl-items">
                    {currentStation.cl.map((item) => {
                      const isChecked = checked.includes(item.id);
                      const isExpanded = expanded === item.id;

                      return (
                        <div
                          className={cx(styles["cl-item"], isChecked && styles.checked, item.crit && styles.critical, isExpanded && styles["cl-open"])}
                          id={`cli-${item.id}`}
                          key={item.id}
                        >
                          <button
                            className={styles["cl-row"]}
                            data-testid={`osce-checklist-${item.id}`}
                            onClick={() => toggleCheck(item.id)}
                            type="button"
                          >
                            <div className={styles["cl-cb"]}>
                              <div className={styles["cl-cb-mark"]}>
                                {isChecked ? (
                                  <svg height="14" viewBox="0 0 14 14" width="14" fill="none">
                                    <path d="M2.5 7l3.5 3.5 6-6.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                ) : null}
                              </div>
                            </div>

                            <div className={styles["cl-text"]}>{item.t}</div>

                            <div className={styles["cl-tags"]}>
                              {item.crit ? <span className={styles["cl-crit-tag"]}>Ключевой</span> : null}
                              {item.d ? (
                                <span
                                  className={styles["cl-expand-btn"]}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleExpand(item.id);
                                  }}
                                  role="button"
                                  tabIndex={0}
                                >
                                  <svg height="11" viewBox="0 0 11 11" width="11" fill="none">
                                    <path d="M2 4l3.5 3.5L9 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </span>
                              ) : null}
                            </div>
                          </button>

                          {item.d ? (
                            <div className={styles["cl-desc-wrap"]}>
                              <div className={styles["cl-desc"]}>{item.d}</div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <div className={styles["cl-actions"]}>
                    <button className={cx(styles.btn, styles["btn-o"], styles["btn-sm"])} onClick={checkAll} type="button">
                      Отметить все
                    </button>
                    <button className={cx(styles.btn, styles["btn-o"], styles["btn-sm"])} onClick={clearAll} type="button">
                      Очистить
                    </button>
                  </div>
                </>
              ) : null}
            </div>

            <div className={cx(styles.mpanel, step === "quiz" && styles.on)} id="p-quiz">
              {currentStation ? (
                <>
                  <div className={styles["quiz-header"]}>
                    <div className={styles["quiz-dots"]} id="quiz-dots">
                      {currentStation.quiz.map((question) => {
                        const feedback = feedbackByQuestionId.get(question.id);

                        return (
                          <div
                            className={cx(
                              styles.qdot,
                              submitted ? (feedback?.ok ? styles.ok : styles.err) : answers[question.id] && styles.ans,
                            )}
                            key={question.id}
                          />
                        );
                      })}
                    </div>
                    <div className={styles["quiz-prog-lbl"]} id="quiz-prog-lbl">
                      {Object.keys(answers).length} / {currentStation.quiz.length} ответов
                    </div>
                  </div>

                  <div id="quiz-qs">
                    {currentStation.quiz.map((question, index) => {
                      const feedback = feedbackByQuestionId.get(question.id);
                      const selected = answers[question.id];
                      const correctOptionLabel = feedback?.correct ?? null;

                      return (
                        <div className={styles["quiz-card"]} key={question.id}>
                          <div className={styles["quiz-card-head"]}>
                            <div className={styles["quiz-num"]}>
                              Вопрос {index + 1} из {currentStation.quiz.length}
                            </div>
                            <div className={styles["quiz-text"]}>{question.t}</div>
                          </div>

                          <div className={styles["quiz-opts"]}>
                            {question.opts.map((option) => {
                              const optionClass = cx(
                                styles.qopt,
                                submitted && styles["qo-dis"],
                                !submitted && selected === option.l && styles.sel,
                                submitted && option.l === correctOptionLabel && styles.ok,
                                submitted && option.l !== correctOptionLabel && option.l === selected && styles.err,
                              );

                              return (
                                <button
                                  className={optionClass}
                                  data-testid={`osce-quiz-${question.id}-${option.l}`}
                                  key={option.l}
                                  onClick={() => pickQ(question.id, option.l)}
                                  type="button"
                                >
                                  <div className={styles["qo-letter"]}>{option.l}</div>
                                  <div className={styles["qo-text"]}>{option.t}</div>
                                  {submitted && option.l === correctOptionLabel ? (
                                    <div className={cx(styles["qo-icon"], styles.ok, styles.show)}>
                                      <CheckIcon />
                                    </div>
                                  ) : null}
                                  {submitted && option.l !== correctOptionLabel && option.l === selected ? (
                                    <div className={cx(styles["qo-icon"], styles.err, styles.show)}>
                                      <XMarkIcon />
                                    </div>
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>

                          {submitted && feedback ? (
                            <div className={styles["quiz-expl"]}>
                              <div
                                className={styles["quiz-expl-label"]}
                                style={{ color: feedback.ok ? "var(--green)" : "var(--accent)" }}
                              >
                                {selected === question.ok ? "Верно" : `Правильный ответ: ${question.ok}`}
                              </div>
                              {question.expl}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>

            <div className={cx(styles.mpanel, step === "results" && styles.on)} id="p-results">
              {currentStation ? (
                <div data-testid="osce-results" id="results-inner">
                  {latestAttempt ? (
                    <>
                      <div className={styles["res-hero"]}>
                        <div className={styles["res-ring-wrap"]}>
                          <svg height="116" viewBox="0 0 116 116" width="116">
                            <circle cx="58" cy="58" fill="none" r="50" stroke="var(--rule)" strokeWidth="8" />
                            <circle
                              cx="58"
                              cy="58"
                              fill="none"
                              r="50"
                              stroke={attTone(latestAttempt.total) === "green" ? "var(--green)" : attTone(latestAttempt.total) === "warm" ? "var(--gold)" : "var(--accent)"}
                              strokeDasharray={2 * Math.PI * 50}
                              strokeDashoffset={(2 * Math.PI * 50) * (1 - latestAttempt.total / 100)}
                              strokeLinecap="round"
                              strokeWidth="8"
                              transform="rotate(-90 58 58)"
                            />
                          </svg>
                          <div className={styles["res-ring-inner"]}>
                            <div className={styles["res-ring-val"]}>{pct(latestAttempt.total)}</div>
                            <div className={styles["res-ring-lbl"]}>Итог</div>
                          </div>
                        </div>

                        <div className={styles["res-info"]}>
                          <div
                            className={cx(
                              styles["res-verdict"],
                              latestAttempt.total >= 85
                                ? styles["rv-pass"]
                                : latestAttempt.total >= ACCREDITATION_PASS_PERCENT
                                  ? styles["rv-ok"]
                                  : styles["rv-fail"],
                            )}
                          >
                            {latestAttempt.total >= 85 ? "✓ Освоено" : latestAttempt.total >= ACCREDITATION_PASS_PERCENT ? "Зачтено" : "Нужно повторить"}
                          </div>
                          <div className={styles["res-title"]}>
                            {latestAttempt.total >= 85 ? "Станция освоена" : latestAttempt.total >= ACCREDITATION_PASS_PERCENT ? "Порог 70% пройден" : "Есть над чем работать"}
                          </div>
                          <div className={styles["res-desc"]}>
                            Чек-лист {pct(latestAttempt.cl)} · Тест {pct(latestAttempt.q)}
                            <br />
                            {latestAttempt.cl_d} из {latestAttempt.cl_t} пунктов · {latestAttempt.q_ok} из {latestAttempt.q_t} вопросов
                          </div>
                        </div>
                      </div>

                      <div className={styles["res-metrics"]}>
                        <div className={styles["res-m"]}>
                          <div className={styles["res-m-lbl"]}>Итого</div>
                          <div className={styles["res-m-val"]}>{pct(latestAttempt.total)}</div>
                        </div>
                        <div className={styles["res-m"]}>
                          <div className={styles["res-m-lbl"]}>Чек-лист</div>
                          <div className={styles["res-m-val"]}>{pct(latestAttempt.cl)}</div>
                        </div>
                        <div className={styles["res-m"]}>
                          <div className={styles["res-m-lbl"]}>Тест</div>
                          <div className={styles["res-m-val"]}>{pct(latestAttempt.q)}</div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className={styles["empty-state"]} style={{ marginBottom: "22px" }}>
                      <div className={styles["empty-icon"]}>
                        <ResultEmptyIcon />
                      </div>
                      <div className={styles["empty-title"]}>Попыток нет</div>
                      <div className={styles["empty-desc"]}>Пройди чек-лист и тест, чтобы сохранить первую попытку.</div>
                    </div>
                  )}

                  {lastRes?.fb ? (
                    <>
                      <div className={styles.stitle} style={{ marginBottom: "16px" }}>
                        Разбор теста
                      </div>
                      {lastRes.fb.map((feedback) => (
                        <div className={cx(styles["fb-item"], feedback.ok ? styles["fb-ok"] : styles["fb-err"])} key={feedback.id}>
                          <div className={styles["fb-head"]}>
                            <div className={styles["fb-hico"]}>{feedback.ok ? <CheckIcon /> : <XMarkIcon />}</div>
                            <div className={styles["fb-htitle"]}>{feedback.t}</div>
                            <span className={cx(styles.badge, styles["fb-badge"], feedback.ok ? styles["b-green"] : styles["b-accent"])}>
                              {feedback.ok ? "Верно" : `Верно: ${feedback.correct}`}
                            </span>
                          </div>
                          <div className={styles["fb-body"]}>{feedback.expl}</div>
                        </div>
                      ))}
                    </>
                  ) : null}

                  {currentStation.atts.length ? (
                    <>
                      <div className={styles.stitle} style={{ marginTop: "24px", marginBottom: "14px" }}>
                        Все попытки
                      </div>
                      {currentStation.atts.map((attempt) => (
                        <div className={styles["att-row"]} key={attempt.id}>
                          <div>
                            <div className={styles["att-date"]}>{attempt.date}</div>
                            <div className={styles["att-sub"]}>
                              Чек-лист {pct(attempt.cl)} · Тест {pct(attempt.q)}
                            </div>
                          </div>
                          <div className={styles["att-m"]}>
                            <div className={styles["att-mv"]}>{pct(attempt.total)}</div>
                            <div className={styles["att-ml"]}>Итог</div>
                          </div>
                        </div>
                      ))}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className={styles["modal-foot"]} id="modal-foot">
            {step === "overview" ? (
              <>
                <button className={cx(styles.btn, styles["btn-o"], styles["footer-secondary"])} onClick={tryClose} type="button">
                  Закрыть
                </button>
                <button
                  className={cx(styles.btn, styles["btn-p"], styles["footer-primary"])}
                  data-testid="osce-start-checklist"
                  disabled={stationActionLoading}
                  onClick={() => void goStep("checklist")}
                  type="button"
                >
                  {stationActionLoading ? "Загружаем..." : "Начать чек-лист"} <ArrowIcon />
                </button>
              </>
            ) : null}

            {step === "checklist" ? (
              <>
                <button className={cx(styles.btn, styles["btn-o"], styles["footer-secondary"])} onClick={() => void goStep("overview")} type="button">
                  Назад
                </button>
                <button
                  className={cx(styles.btn, styles["btn-p"], styles["footer-primary"])}
                  data-testid="osce-open-quiz"
                  onClick={() => void goStep("quiz")}
                  type="button"
                >
                  Перейти к тесту <ArrowIcon />
                </button>
              </>
            ) : null}

            {step === "quiz" ? (
              <>
                <button className={cx(styles.btn, styles["btn-o"], styles["footer-secondary"])} onClick={() => void goStep("checklist")} type="button">
                  К чек-листу
                </button>
                <button
                  className={cx(styles.btn, styles["btn-p"], styles["footer-primary"])}
                  data-testid="osce-submit-attempt"
                  disabled={!allQuizQuestionsAnswered || submitted || submitting}
                  id="btn-sub"
                  onClick={submitAttempt}
                  type="button"
                >
                  {submitting ? <div className={styles.spinner} /> : null}
                  {submitting
                    ? ""
                    : osceExamRun && !osceExamRun.finished
                      ? osceExamRun.index < osceExamRun.stations.length - 1
                        ? "Завершить и перейти дальше "
                        : "Завершить этап "
                      : "Завершить станцию "}
                  {!submitting ? <ArrowIcon /> : null}
                </button>
              </>
            ) : null}

            {step === "results" ? (
              <>
                <button className={cx(styles.btn, styles["btn-o"], styles["footer-secondary"])} onClick={doClose} type="button">
                  Закрыть
                </button>
                <button className={cx(styles.btn, styles["btn-p"], styles.g, styles["footer-primary"])} onClick={restartStation} type="button">
                  <RetryIcon /> Повторить
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={cx(styles.ov, successOpen && styles.show)}
        id="ov-success"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeSuccessAndReturn();
          }
        }}
        role="presentation"
      >
        <div className={cx(styles.modal, styles["modal-sm"])} data-testid="osce-success-modal">
          <div className={styles["modal-drag"]} />
          <div className={styles["success-inner"]} id="success-inner">
            {lastRes ? (
              <>
                <div className={styles["success-ring-wrap"]}>
                  <svg height="138" viewBox="0 0 138 138" width="138">
                    <circle cx="69" cy="69" fill="none" r="58" stroke="var(--rule)" strokeWidth="9" />
                    <circle
                      cx="69"
                      cy="69"
                      fill="none"
                      r="58"
                      stroke={lastRes.total >= 85 ? "var(--green)" : lastRes.total >= ACCREDITATION_PASS_PERCENT ? "var(--gold)" : "var(--accent)"}
                      strokeDasharray={successRingCircumference}
                      strokeDashoffset={successArcOffset}
                      strokeLinecap="round"
                      strokeWidth="9"
                      transform="rotate(-90 69 69)"
                      style={{ transition: "stroke-dashoffset 1s var(--ease)" }}
                    />
                  </svg>
                  <div className={styles["success-ring-inner"]}>
                    <div className={styles["success-big"]}>{pct(lastRes.total)}</div>
                    <div className={styles["success-sub-lbl"]}>Итог</div>
                  </div>
                </div>

                <div className={styles["success-title"]}>
                  {lastRes.total >= 85 ? "Станция освоена!" : lastRes.total >= ACCREDITATION_PASS_PERCENT ? "Станция зачтена" : "Есть над чем работать"}
                </div>

                <div className={styles["success-desc"]}>
                  {lastRes.total >= 85
                    ? "Поздравляем — порог 85% пройден. Станция отмечена как освоенная."
                    : lastRes.total >= ACCREDITATION_PASS_PERCENT
                      ? "Порог 70% пройден. До освоения осталось добрать до 85%."
                      : "Порог 70% не достигнут. Повтори чек-лист и попробуй снова."}
                </div>

                <div className={styles["success-stats"]}>
                  <div className={styles["ss-item"]}>
                    <div className={styles["ss-val"]}>
                      {lastRes.cl_d}/{lastRes.cl_t}
                    </div>
                    <div className={styles["ss-lbl"]}>Чек-лист</div>
                  </div>
                  <div className={styles["ss-divider"]} />
                  <div className={styles["ss-item"]}>
                    <div className={styles["ss-val"]}>
                      {lastRes.q_ok}/{lastRes.q_t}
                    </div>
                    <div className={styles["ss-lbl"]}>Тест</div>
                  </div>
                </div>

                <button
                  className={cx(styles.btn, styles["btn-p"], styles["btn-full"])}
                  data-testid="osce-open-results"
                  onClick={afterSuccess}
                  type="button"
                >
                  Посмотреть разбор
                </button>
                <button className={cx(styles.btn, styles["btn-o"], styles["btn-full"])} onClick={closeSuccessAndReturn} type="button">
                  {isStrictOsceRun ? "В аккредитацию" : "Закрыть"}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={cx(styles.ov, osceExamSummaryOpen && styles.show)}
        data-testid="osce-exam-simulation-result"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeOsceExamSummary();
          }
        }}
        role="presentation"
      >
        <div className={cx(styles.modal, styles["modal-sm"], osceExamReviewOpen && styles["stage-review-modal"])}>
          <div className={styles["modal-drag"]} />
          <div className={cx(styles["success-inner"], osceExamReviewOpen && styles["stage-review-inner"])}>
            {!osceExamReviewOpen ? (
              <>
                <div className={styles["success-ring-wrap"]}>
                  <svg height="138" viewBox="0 0 138 138" width="138">
                    <circle cx="69" cy="69" fill="none" r="58" stroke="var(--rule)" strokeWidth="9" />
                    <circle
                      cx="69"
                      cy="69"
                      fill="none"
                      r="58"
                      stroke={osceExamPassed ? "var(--green)" : "var(--accent)"}
                      strokeDasharray={successRingCircumference}
                      strokeDashoffset={successRingCircumference * (1 - osceExamAverage / 100)}
                      strokeLinecap="round"
                      strokeWidth="9"
                      transform="rotate(-90 69 69)"
                    />
                  </svg>
                  <div className={styles["success-ring-inner"]}>
                    <div className={styles["success-big"]}>{osceExamAverage}%</div>
                    <div className={styles["success-sub-lbl"]}>Средний</div>
                  </div>
                </div>

                <div className={styles["success-title"]}>{osceExamPassed ? "Практический этап сдан" : "Практический этап не сдан"}</div>
                <div className={styles["success-desc"]}>
                  Для зачёта каждая из 5 станций должна быть на 70% или выше.
                </div>

                <div className={styles["exam-result-list"]}>
                  {osceExamResults.map((item, index) => (
                    <div className={styles["exam-result-row"]} key={item.station.slug}>
                      <div>
                        <div className={styles["exam-result-title"]}>
                          {index + 1}. {item.station.title}
                        </div>
                        <div className={styles["exam-result-meta"]}>
                          Чек-лист {pct(item.result.cl)} · Тест {pct(item.result.q)}
                        </div>
                      </div>
                      <div
                        className={cx(
                          styles["exam-result-score"],
                          item.result.total >= ACCREDITATION_PASS_PERCENT ? styles.ok : styles.err,
                        )}
                      >
                        {pct(item.result.total)}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  className={cx(styles.btn, styles["btn-p"], styles["btn-full"])}
                  onClick={() => setOsceExamReviewOpen(true)}
                  type="button"
                >
                  Посмотреть разбор
                </button>
                <button
                  className={cx(styles.btn, styles["btn-o"], styles["btn-full"])}
                  onClick={closeOsceExamSummary}
                  type="button"
                >
                  {isStrictOsceRun ? "В аккредитацию" : "Закрыть"}
                </button>
              </>
            ) : (
              <>
                <div className={styles["stage-review-head"]}>
                  <div>
                    <div className={styles["success-sub-lbl"]}>Пробная аккредитация</div>
                    <div className={styles["success-title"]}>Разбор практического этапа</div>
                    <div className={styles["success-desc"]}>
                      Средний результат {osceExamAverage}%. Для зачёта каждая станция должна быть на 70% или выше.
                    </div>
                  </div>
                </div>

                <div className={styles["stage-review-list"]}>
                  {osceExamResults.map((item, index) => {
                    const checkedItems = new Set(item.result.checked);

                    return (
                      <section className={styles["stage-review-group"]} key={item.station.slug}>
                        <div className={styles["stage-review-row"]}>
                          <div>
                            <div className={styles["exam-result-meta"]}>Станция {index + 1}</div>
                            <div className={styles["exam-result-title"]}>{item.station.title}</div>
                            <div className={styles["exam-result-meta"]}>
                              Чек-лист {pct(item.result.cl)} · Тест {pct(item.result.q)} · Баллы {item.result.pts}
                            </div>
                          </div>
                          <div
                            className={cx(
                              styles["exam-result-score"],
                              item.result.total >= ACCREDITATION_PASS_PERCENT ? styles.ok : styles.err,
                            )}
                          >
                            {pct(item.result.total)}
                          </div>
                        </div>

                        {item.result.historical ? (
                          <div className={styles["stage-review-block"]}>
                            <div className={styles.stitle}>Сохраненный итог</div>
                            <div className={styles["exam-result-meta"]}>
                              Станция уже завершена в этой пробной аккредитации. Здесь показан итоговый балл, чтобы этап можно было продолжить без повтора.
                            </div>
                          </div>
                        ) : (
                          <>
                        <div className={styles["stage-review-block"]}>
                          <div className={styles.stitle}>Чек-лист</div>
                          {item.station.cl.map((checkItem) => {
                            const completed = checkedItems.has(checkItem.id);

                            return (
                              <div
                                className={cx(
                                  styles["check-review-row"],
                                  completed ? styles.ok : styles.err,
                                  checkItem.crit && styles.critical,
                                )}
                                key={checkItem.id}
                              >
                                <span>{completed ? <CheckIcon /> : <XMarkIcon />}</span>
                                <div>
                                  <strong>{checkItem.t}</strong>
                                  <p>{checkItem.d}</p>
                                  {checkItem.crit ? <small>Критический пункт</small> : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className={styles["stage-review-block"]}>
                          <div className={styles.stitle}>Тест станции</div>
                          {item.result.fb.map((feedback) => (
                            <div className={cx(styles["fb-item"], feedback.ok ? styles["fb-ok"] : styles["fb-err"])} key={feedback.id}>
                              <div className={styles["fb-head"]}>
                                <div className={styles["fb-hico"]}>{feedback.ok ? <CheckIcon /> : <XMarkIcon />}</div>
                                <div className={styles["fb-htitle"]}>{feedback.t}</div>
                                <span className={cx(styles.badge, styles["fb-badge"], feedback.ok ? styles["b-green"] : styles["b-accent"])}>
                                  {feedback.ok ? "Верно" : `Верно: ${feedback.correct}`}
                                </span>
                              </div>
                              <div className={styles["fb-body"]}>
                                {!feedback.ok ? (
                                  <div className={styles["fb-answer-line"]}>Ваш ответ: {feedback.yours || "Не выбран"}</div>
                                ) : null}
                                {feedback.expl}
                              </div>
                            </div>
                          ))}
                        </div>
                          </>
                        )}
                      </section>
                    );
                  })}
                </div>

                <button className={cx(styles.btn, styles["btn-o"], styles["btn-full"])} onClick={() => setOsceExamReviewOpen(false)} type="button">
                  К результату
                </button>
                <button className={cx(styles.btn, styles["btn-p"], styles["btn-full"])} onClick={closeOsceExamSummary} type="button">
                  {isStrictOsceRun ? "В аккредитацию" : "Закрыть"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div
        className={cx(styles.ov, confirmOpen && styles.show)}
        id="ov-confirm"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeConfirm();
          }
        }}
        role="presentation"
      >
        <div className={cx(styles.modal, styles["modal-sm"])}>
          <div className={styles["modal-drag"]} />
          <div className={styles["confirm-inner"]}>
            <div className={styles["conf-ico"]}>
              <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
                <path d="M13 9v7M13 18v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <circle cx="13" cy="13" r="11" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </div>
            <div className={styles["conf-title"]}>Завершить сейчас?</div>
            <p className={styles["conf-desc"]}>Незавершённая станция не сохранится. Прогресс чек-листа и ответы будут потеряны.</p>
            <div className={styles["conf-acts"]}>
              <button className={cx(styles.btn, styles["btn-o"])} onClick={closeConfirm} style={{ flex: 1 }} type="button">
                Продолжить
              </button>
              <button className={cx(styles.btn, styles["btn-danger"])} onClick={forceClose} style={{ flex: 1 }} type="button">
                Да, завершить
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </OsceChrome>
  );
}

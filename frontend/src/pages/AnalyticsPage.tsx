import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { useAuth } from "../contexts/AuthContext";
import { api, ApiError, isAbortError } from "../lib/api";
import { formatDate, formatShortDate, percentage } from "../lib/format";
import type {
  ClinicalCaseAttemptAnalytics,
  ClinicalCaseAttemptReviewAnalytics,
  ClinicalCaseListItem,
  ExamStageProtocol,
  OsceStationListItem,
  OsceStationReviewAnalytics,
  ReadinessSummary,
  ReadinessTrack,
  RepeatingQuestionErrorAnalytics,
  TopicAnalytics,
  TopicQuestionErrorAnalytics,
} from "../types/api";
import styles from "./AnalyticsPage.module.css";

interface AnalyticsState {
  readiness: ReadinessSummary;
  topics: TopicAnalytics[];
  cases: ClinicalCaseListItem[];
  osceStations: OsceStationListItem[];
  caseAttempts: ClinicalCaseAttemptAnalytics[];
  repeatingErrors: RepeatingQuestionErrorAnalytics[];
}

type AnalyticsTab = "overview" | "tests" | "cases" | "osce";
type Tone = "default" | "accent" | "green" | "warm";
type IconProps = { className?: string };
type DeficitTone = "norm" | "risk" | "critical";
type ReadinessMetricKey =
  | "coverage_percent"
  | "freshness_percent"
  | "consistency_percent"
  | "volume_percent"
  | "momentum_percent";

type ReadinessMetric = {
  key: ReadinessMetricKey;
  label: string;
  tooltip: string;
  modalLabel: string;
  description: string;
  action: string;
};

const TRAINING_PASS_PERCENT = 70;
const TRAINING_MASTERY_PERCENT = 85;

type RepeatingErrorGroup = {
  key: string;
  topicId: number | null;
  title: string;
  errors: RepeatingQuestionErrorAnalytics[];
  totalIncorrectAnswers: number;
};

type CaseTopicFocus = {
  key: string;
  topicId: number | null;
  topicName: string;
  sectionName: string | null;
  cases: ClinicalCaseListItem[];
  attempts: ClinicalCaseAttemptAnalytics[];
  attemptsCount: number;
  incorrectAnswers: number;
  averageAccuracy: number | null;
  worstAccuracy: number | null;
  selectedCase: ClinicalCaseListItem | null;
  selectedAttempt: ClinicalCaseAttemptAnalytics | null;
};

type CaseDrilldownItem = {
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  difficulty: string | null;
  durationMinutes: number | null;
  focusPoints: string[];
  examTargets: string[];
  caseItem: ClinicalCaseListItem | null;
  attempts: ClinicalCaseAttemptAnalytics[];
  selectedAttempt: ClinicalCaseAttemptAnalytics | null;
};

type OsceTopicFocus = {
  key: string;
  topicName: string;
  sectionName: string;
  stations: OsceStationListItem[];
  stationsCount: number;
  attemptedStationsCount: number;
  attentionStationsCount: number;
  attemptsCount: number;
  status: string;
  focusScorePercent: number | null;
  selectedStation: OsceStationListItem;
};

type ModalState =
  | { kind: "overview-readiness" }
  | { kind: "overview-deficit"; metric: ReadinessMetric; track: ReadinessTrack }
  | { kind: "overview-protocol"; stage: ExamStageProtocol }
  | { kind: "repeating-error-group"; group: RepeatingErrorGroup }
  | { kind: "test-question"; topic: TopicAnalytics; error: TopicQuestionErrorAnalytics; index: number }
  | { kind: "topic"; topic: TopicAnalytics }
  | { kind: "error"; error: RepeatingQuestionErrorAnalytics }
  | { kind: "case"; attempt: ClinicalCaseAttemptAnalytics }
  | { kind: "osce"; station: OsceStationListItem };

const analyticsTabs: AnalyticsTab[] = ["overview", "tests", "cases", "osce"];

function normalizeAnalyticsTab(value: string | null): AnalyticsTab {
  return analyticsTabs.includes(value as AnalyticsTab) ? (value as AnalyticsTab) : "overview";
}
const DEFICIT_METRICS: ReadinessMetric[] = [
  {
    key: "coverage_percent",
    label: "Покрытие",
    tooltip: "Какая часть обязательного материала уже пройдена.",
    modalLabel: "Покрытие материала",
    description: "Какая часть обязательных тем, заданий или станций уже была затронута в этом этапе.",
    action: "Добрать непокрытые темы и задания.",
  },
  {
    key: "freshness_percent",
    label: "Свежесть",
    tooltip: "Насколько недавно была практика по этому этапу.",
    modalLabel: "Свежесть практики",
    description: "Насколько недавно была практика: старые попытки слабее подтверждают текущую учебную готовность.",
    action: "Вернуться к давно не повторенным темам.",
  },
  {
    key: "consistency_percent",
    label: "Стабильность",
    tooltip: "Насколько ровно держится результат.",
    modalLabel: "Стабильность результата",
    description: "Насколько ровно держится результат и не повторяются ли одни и те же ошибки.",
    action: "Разобрать повторяющиеся ошибки и закрепить результат.",
  },
  {
    key: "volume_percent",
    label: "Практика",
    tooltip: "Достаточно ли тренировочных попыток.",
    modalLabel: "Объем практики",
    description: "Достаточно ли попыток и тренировочных действий для уверенной оценки этапа.",
    action: "Добавить попытки в этом формате подготовки.",
  },
  {
    key: "momentum_percent",
    label: "Динамика",
    tooltip: "Растут ли результаты и активность.",
    modalLabel: "Динамика подготовки",
    description: "Куда движется подготовка: результаты и активность растут, стоят на месте или проседают.",
    action: "Сделать короткую серию заданий и проверить, пошел ли рост.",
  },
];

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function pluralRu(value: number, forms: [string, string, string]): string {
  const absoluteValue = Math.abs(value);
  const remainder100 = absoluteValue % 100;
  const remainder10 = absoluteValue % 10;

  if (remainder100 >= 11 && remainder100 <= 14) {
    return forms[2];
  }

  if (remainder10 === 1) {
    return forms[0];
  }

  if (remainder10 >= 2 && remainder10 <= 4) {
    return forms[1];
  }

  return forms[2];
}

function reviewQuestionCountLabel(count: number): string {
  return `${count} ${pluralRu(count, ["вопрос требует", "вопроса требуют", "вопросов требуют"])} разбора`;
}

function InfoIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

type ProtocolStageVisualKey = "tests" | "cases" | "osce" | "default";

function protocolStageVisualKey(stageKey: string): ProtocolStageVisualKey {
  const normalized = stageKey.toLocaleLowerCase("ru");

  if (normalized.includes("test")) {
    return "tests";
  }

  if (normalized.includes("case")) {
    return "cases";
  }

  if (normalized.includes("osce")) {
    return "osce";
  }

  return "default";
}

function TestStageIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M7 3.5h7.5l3 3v14H7z" />
      <path d="M14.5 3.5v3h3" />
      <path d="M9.5 10.1h.01" />
      <path d="M12 10.1h3.2" />
      <path d="M9.5 14h.01" />
      <path d="M12 14h3.2" />
      <path d="M9.5 17.8h.01" />
      <path d="M12 17.8h2.4" />
    </svg>
  );
}

function CaseStageIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M4.5 8.1h5l1.4 1.7h8.6v8.1a2.1 2.1 0 0 1-2.1 2.1H6.6a2.1 2.1 0 0 1-2.1-2.1z" />
      <path d="M7.4 8.1V6.3a1.8 1.8 0 0 1 1.8-1.8h5.6a1.8 1.8 0 0 1 1.8 1.8v1.8" />
      <path d="M12 12.1v4.8" />
      <path d="M9.6 14.5h4.8" />
    </svg>
  );
}

function OsceStageIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M8.5 4.5h7" />
      <path d="M9.2 3.5h5.6v3.2H9.2z" />
      <path d="M6.5 5.8h11v14.7h-11z" />
      <path d="m9.1 11 1.3 1.3 2.4-2.7" />
      <path d="M14.2 11.1h1.3" />
      <path d="m9.1 16 1.3 1.3 2.4-2.7" />
      <path d="M14.2 16.1h1.3" />
    </svg>
  );
}

function ProtocolDefaultStageIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M7 3.5h7l3 3V20.5H7z" />
      <path d="M14 3.5v3h3" />
      <path d="M9.5 11h5" />
      <path d="M9.5 14h5" />
      <path d="M9.5 17h3.5" />
    </svg>
  );
}

function ProtocolStageIcon({ stageKey }: { stageKey: string }) {
  const visualKey = protocolStageVisualKey(stageKey);

  if (visualKey === "tests") {
    return <TestStageIcon />;
  }

  if (visualKey === "cases") {
    return <CaseStageIcon />;
  }

  if (visualKey === "osce") {
    return <OsceStageIcon />;
  }

  return <ProtocolDefaultStageIcon />;
}

function CheckIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.2 2.2 2.3 4.8-5" />
    </svg>
  );
}

function WarningIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M12 4 21 19H3z" />
      <path d="M12 9v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

function RepeatIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M17 2.8 20.2 6 17 9.2" />
      <path d="M4 11V9a3 3 0 0 1 3-3h13" />
      <path d="M7 21.2 3.8 18 7 14.8" />
      <path d="M20 13v2a3 3 0 0 1-3 3H4" />
    </svg>
  );
}

function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function PulseIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M3 13h4l2-6 4 12 2-6h6" />
    </svg>
  );
}

function HeartPulseIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M19.2 5.5a5 5 0 0 0-7.2.4 5 5 0 0 0-7.2-.4 5.3 5.3 0 0 0 0 7.5L12 20l7.2-7a5.3 5.3 0 0 0 0-7.5Z" />
      <path d="M3 12h4l1.5-3 3 6 2-4h3.5" />
    </svg>
  );
}

function LungsIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M12 4v9" />
      <path d="M12 8c-2.4.7-4 2.7-4.8 5.8L6 18.4c-.4 1.4-2.4 1.2-2.6-.3-.5-4.9.7-8.8 3.6-11.4" />
      <path d="M12 8c2.4.7 4 2.7 4.8 5.8l1.2 4.6c.4 1.4 2.4 1.2 2.6-.3.5-4.9-.7-8.8-3.6-11.4" />
      <path d="M9 13c1.2-.8 2.2-1 3-1" />
      <path d="M15 13c-1.2-.8-2.2-1-3-1" />
    </svg>
  );
}

function StomachIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M10 3c2.2 2.2 1.8 5.2.3 7.5-1.2 1.9-3.1 3-2.5 5.7.5 2.4 2.7 4.1 5.2 3.8 3.1-.4 5.1-3.5 4.5-6.5-.5-2.7-2.5-3.9-4.6-5" />
      <path d="M14.5 4.5c-.4 2.1.7 3.2 2.3 4.1" />
      <path d="M8.2 16.4c2.4 1.1 5.4.6 7.2-1.1" />
    </svg>
  );
}

function BrainIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M8.5 6.2A3 3 0 0 1 12 4a3 3 0 0 1 3.5 2.2 3.2 3.2 0 0 1 3 3.3 3 3 0 0 1 1 5.5 3.4 3.4 0 0 1-3.4 4.4H8a3.4 3.4 0 0 1-3.4-4.4 3 3 0 0 1 1-5.5 3.2 3.2 0 0 1 2.9-3.3Z" />
      <path d="M12 4v16" />
      <path d="M8.5 9.5c1.4 0 2.4.7 3.5 1.8" />
      <path d="M15.5 9.5c-1.4 0-2.4.7-3.5 1.8" />
      <path d="M8 15c1.3-.2 2.5.2 4 1.4" />
      <path d="M16 15c-1.3-.2-2.5.2-4 1.4" />
    </svg>
  );
}

function DropIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />
      <path d="M9 15a3 3 0 0 0 3 3" />
    </svg>
  );
}

function ShieldIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M12 3 19 6v5.2c0 4.4-2.8 7.7-7 9.8-4.2-2.1-7-5.4-7-9.8V6z" />
      <path d="M12 7v9" />
      <path d="M8.5 11.5h7" />
    </svg>
  );
}

function GenericTopicIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="6" />
      <path d="M12 2.5v3" />
      <path d="M12 18.5v3" />
      <path d="M2.5 12h3" />
      <path d="M18.5 12h3" />
    </svg>
  );
}

function CloseIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="m7 7 10 10" />
      <path d="m17 7-10 10" />
    </svg>
  );
}

function toDisplayDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`);
  }

  return new Date(value);
}

function readinessTone(status: string): Tone {
  if (status === "ready") {
    return "green";
  }

  if (status === "building") {
    return "warm";
  }

  return "accent";
}

function readinessLabel(status: string): string {
  if (status === "ready") {
    return "Готов";
  }

  if (status === "building") {
    return "В работе";
  }

  return "Риск";
}

function topicTone(status: string): Tone {
  if (status === "not_started" || status === "new") {
    return "default";
  }

  if (status === "weak") {
    return "accent";
  }

  if (status === "medium") {
    return "warm";
  }

  return "green";
}

function topicLabel(status: string): string {
  if (status === "not_started" || status === "new") {
    return "Не начато";
  }

  if (status === "weak") {
    return "Нужно повторить";
  }

  if (status === "medium") {
    return "Зачтено";
  }

  return "Освоено";
}

function accuracyTone(accuracyPercent: number): Tone {
  if (accuracyPercent >= TRAINING_MASTERY_PERCENT) {
    return "green";
  }

  if (accuracyPercent >= TRAINING_PASS_PERCENT) {
    return "warm";
  }

  return "accent";
}

function repeatingErrorTone(incorrectAnswers: number, accuracyPercent: number): Tone {
  if (incorrectAnswers >= 3 || accuracyPercent < 40) {
    return "accent";
  }

  if (incorrectAnswers >= 2 || accuracyPercent < 60) {
    return "warm";
  }

  return "default";
}

function repeatingErrorLabel(incorrectAnswers: number): string {
  if (incorrectAnswers >= 3) {
    return "Повторяется";
  }

  return "Разобрать";
}

function caseTone(accuracyPercent: number): Tone {
  return accuracyTone(accuracyPercent);
}

function caseLabel(accuracyPercent: number): string {
  if (accuracyPercent >= TRAINING_MASTERY_PERCENT) {
    return "Освоено";
  }

  if (accuracyPercent >= TRAINING_PASS_PERCENT) {
    return "Зачтено";
  }

  return "Риск";
}

function osceTone(status: string): Tone {
  if (status === "mastered") {
    return "green";
  }

  if (status === "in_progress") {
    return "warm";
  }

  return "default";
}

function osceLabel(status: string): string {
  if (status === "mastered") {
    return "Освоено";
  }

  if (status === "in_progress") {
    return "В работе";
  }

  return "Не начато";
}

function difficultyLabel(difficulty: string): string {
  if (difficulty === "hard") {
    return "Сложный";
  }

  if (difficulty === "medium") {
    return "Средний";
  }

  return "Базовый";
}

function toneColor(tone: Tone): string {
  if (tone === "green") {
    return "var(--green)";
  }

  if (tone === "warm") {
    return "var(--gold)";
  }

  if (tone === "accent") {
    return "var(--accent)";
  }

  return "var(--ink-40)";
}

function trackShortLabel(track: ReadinessTrack): string {
  if (track.key === "tests") {
    return "Тесты";
  }

  if (track.key === "cases") {
    return "Кейсы";
  }

  if (track.key === "osce") {
    return "ОСКЭ";
  }

  return track.label;
}

function trackColor(track: ReadinessTrack): string {
  if (track.key === "cases") {
    return "var(--gold)";
  }

  if (track.key === "osce") {
    return "var(--accent)";
  }

  return "var(--ink-40)";
}

function trackTab(track: ReadinessTrack): AnalyticsTab {
  if (track.key === "cases") {
    return "cases";
  }

  if (track.key === "osce") {
    return "osce";
  }

  return "tests";
}

function metricValue(track: ReadinessTrack, metric: ReadinessMetric): number {
  return track[metric.key];
}

function deficitTone(value: number): DeficitTone {
  if (value >= 78) {
    return "norm";
  }

  if (value >= 50) {
    return "risk";
  }

  return "critical";
}

function deficitToneLabel(tone: DeficitTone): string {
  if (tone === "norm") {
    return "Норма";
  }

  if (tone === "risk") {
    return "Риск";
  }

  return "Критично";
}

function worstMetricForTrack(track: ReadinessTrack): ReadinessMetric {
  return DEFICIT_METRICS.reduce((worstMetric, metric) =>
    metricValue(track, metric) < metricValue(track, worstMetric) ? metric : worstMetric,
  );
}

function protocolTone(status: string): Tone {
  if (status === "passed") {
    return "green";
  }

  if (status === "failed") {
    return "accent";
  }

  return "warm";
}

function ProtocolStatusIcon({ status }: { status: string }) {
  if (status === "passed") {
    return <CheckIcon />;
  }

  if (status === "failed") {
    return <RepeatIcon />;
  }

  return <WarningIcon />;
}

function topicIcon(topic: TopicAnalytics) {
  const normalized = `${topic.topic_name} ${topic.section_name}`.toLocaleLowerCase("ru");

  if (normalized.includes("кардио") || normalized.includes("серд")) {
    return <HeartPulseIcon />;
  }

  if (normalized.includes("пульмон") || normalized.includes("дых") || normalized.includes("лёг") || normalized.includes("лег")) {
    return <LungsIcon />;
  }

  if (normalized.includes("гастро") || normalized.includes("желуд") || normalized.includes("киш")) {
    return <StomachIcon />;
  }

  if (normalized.includes("невро") || normalized.includes("мозг")) {
    return <BrainIcon />;
  }

  if (normalized.includes("эндокрин") || normalized.includes("кров")) {
    return <DropIcon />;
  }

  if (normalized.includes("инфек") || normalized.includes("иммун")) {
    return <ShieldIcon />;
  }

  return <GenericTopicIcon />;
}

function topicRiskTone(topic: TopicAnalytics): "normal" | "risk" | "critical" {
  if (topic.status === "not_started" || topic.answered_questions === 0) {
    return "normal";
  }

  if (topic.status === "weak" || topic.accuracy_percent < 55 || topic.repeated_question_struggles >= 3) {
    return "critical";
  }

  if (topic.status === "medium" || topic.accuracy_percent < 70 || topic.repeated_question_struggles > 0) {
    return "risk";
  }

  return "normal";
}

function questionTone(index: number, topic: TopicAnalytics, errors: TopicQuestionErrorAnalytics[]) {
  const error = errors[index] ?? null;

  if (error) {
    return error.incorrect_answers >= 2 ? "error" : "risk";
  }

  const inferredIncorrectCount = Math.max(errors.length, topic.answered_questions - topic.correct_answers);

  if (index < inferredIncorrectCount) {
    return "error";
  }

  return "empty";
}

function hasTestTopicSignal(topic: TopicAnalytics): boolean {
  return topic.answered_questions > 0 || topic.test_incorrect_answers > 0 || topic.repeated_question_struggles > 0;
}

function tabLabel(tab: AnalyticsTab): string {
  if (tab === "overview") {
    return "Обзор";
  }

  if (tab === "tests") {
    return "Тесты";
  }

  if (tab === "cases") {
    return "Кейсы";
  }

  return "ОСКЭ";
}

function compareTopics(left: TopicAnalytics, right: TopicAnalytics): number {
  const leftHardAccuracy = left.hard_question_accuracy_percent ?? 101;
  const rightHardAccuracy = right.hard_question_accuracy_percent ?? 101;
  const leftHasSignal = hasTestTopicSignal(left);
  const rightHasSignal = hasTestTopicSignal(right);

  return (
    Number(rightHasSignal) - Number(leftHasSignal) ||
    topicPriority(left.status) - topicPriority(right.status) ||
    right.repeated_question_struggles - left.repeated_question_struggles ||
    left.accuracy_percent - right.accuracy_percent ||
    leftHardAccuracy - rightHardAccuracy ||
    right.answered_questions - left.answered_questions ||
    left.topic_name.localeCompare(right.topic_name, "ru")
  );
}

function compareCaseAttempts(left: ClinicalCaseAttemptAnalytics, right: ClinicalCaseAttemptAnalytics): number {
  return (
    left.accuracy_percent - right.accuracy_percent ||
    toDisplayDate(right.submitted_at).getTime() - toDisplayDate(left.submitted_at).getTime()
  );
}

function compareCaseDrilldownItems(left: CaseDrilldownItem, right: CaseDrilldownItem): number {
  const leftHasAttempt = left.selectedAttempt !== null;
  const rightHasAttempt = right.selectedAttempt !== null;
  const leftAccuracy = left.selectedAttempt?.accuracy_percent ?? 101;
  const rightAccuracy = right.selectedAttempt?.accuracy_percent ?? 101;

  return (
    Number(rightHasAttempt) - Number(leftHasAttempt) ||
    leftAccuracy - rightAccuracy ||
    right.attempts.length - left.attempts.length ||
    left.title.localeCompare(right.title, "ru")
  );
}

function compareCaseTopicFocus(left: CaseTopicFocus, right: CaseTopicFocus): number {
  const leftHasAttempts = left.attemptsCount > 0;
  const rightHasAttempts = right.attemptsCount > 0;
  const leftWorstAccuracy = left.worstAccuracy ?? 101;
  const rightWorstAccuracy = right.worstAccuracy ?? 101;

  return (
    Number(rightHasAttempts) - Number(leftHasAttempts) ||
    leftWorstAccuracy - rightWorstAccuracy ||
    right.incorrectAnswers - left.incorrectAnswers ||
    right.cases.length - left.cases.length ||
    right.attemptsCount - left.attemptsCount ||
    left.topicName.localeCompare(right.topicName, "ru")
  );
}

function buildCaseDrilldownItems(group: CaseTopicFocus): CaseDrilldownItem[] {
  const itemsBySlug = new Map<string, CaseDrilldownItem>();

  for (const caseItem of group.cases) {
    itemsBySlug.set(caseItem.slug, {
      slug: caseItem.slug,
      title: caseItem.title,
      subtitle: caseItem.subtitle,
      summary: caseItem.summary,
      difficulty: caseItem.difficulty,
      durationMinutes: caseItem.duration_minutes,
      focusPoints: caseItem.focus_points,
      examTargets: caseItem.exam_targets,
      caseItem,
      attempts: [],
      selectedAttempt: null,
    });
  }

  for (const attempt of group.attempts) {
    const currentItem = itemsBySlug.get(attempt.case_slug);

    if (currentItem) {
      currentItem.attempts.push(attempt);
      continue;
    }

    itemsBySlug.set(attempt.case_slug, {
      slug: attempt.case_slug,
      title: attempt.case_title,
      subtitle: null,
      summary: null,
      difficulty: null,
      durationMinutes: null,
      focusPoints: [],
      examTargets: [],
      caseItem: null,
      attempts: [attempt],
      selectedAttempt: null,
    });
  }

  return Array.from(itemsBySlug.values())
    .map((item) => {
      const attempts = [...item.attempts].sort(compareCaseAttempts);

      return {
        ...item,
        attempts,
        selectedAttempt: attempts[0] ?? null,
      };
    })
    .sort(compareCaseDrilldownItems);
}

function compareOsceStations(left: OsceStationListItem, right: OsceStationListItem): number {
  return (
    oscePriority(left.status) - oscePriority(right.status) ||
    (left.best_score_percent ?? -1) - (right.best_score_percent ?? -1) ||
    left.title.localeCompare(right.title, "ru")
  );
}

function compareOsceTopicFocus(left: OsceTopicFocus, right: OsceTopicFocus): number {
  return (
    oscePriority(left.status) - oscePriority(right.status) ||
    (left.focusScorePercent ?? -1) - (right.focusScorePercent ?? -1) ||
    right.attentionStationsCount - left.attentionStationsCount ||
    left.topicName.localeCompare(right.topicName, "ru")
  );
}

function topicPriority(status: string): number {
  if (status === "weak") {
    return 0;
  }

  if (status === "medium") {
    return 1;
  }

  if (status === "strong") {
    return 2;
  }

  if (status === "not_started" || status === "new") {
    return 3;
  }

  return 2;
}

function oscePriority(status: string): number {
  if (status === "in_progress") {
    return 0;
  }

  if (status === "not_started") {
    return 1;
  }

  return 2;
}

function buildTopicCaption(topic: TopicAnalytics): string {
  if (topic.answered_questions === 0 && topic.case_attempts_count === 0) {
    return [topic.section_name, "не начато"].filter(Boolean).join(" · ");
  }

  const markers = [
    topic.test_incorrect_answers > 0 ? `ошибки ${topic.test_incorrect_answers}` : null,
    topic.repeated_question_struggles > 0 ? `повторы ${topic.repeated_question_struggles}` : null,
    topic.hard_question_accuracy_percent !== null && topic.hard_question_accuracy_percent < TRAINING_MASTERY_PERCENT
      ? "сложные вопросы проседают"
      : null,
    topic.case_attempts_count > 0 ? `кейсы ${topic.case_attempts_count}` : null,
  ]
    .filter(Boolean)
    .slice(0, 2);

  return [topic.section_name, `${topic.answered_questions} отв.`, ...markers].join(" · ");
}

function caseTopicTone(group: CaseTopicFocus): Tone {
  return group.worstAccuracy !== null ? caseTone(group.worstAccuracy) : "default";
}

function buildCaseTopicCaption(group: CaseTopicFocus): string {
  if (group.attemptsCount === 0) {
    return [
      group.sectionName ?? "Клинические кейсы",
      `${group.cases.length} ${pluralRu(group.cases.length, ["кейс", "кейса", "кейсов"])}`,
      "попыток пока нет",
    ].join(" · ");
  }

  return [
    `${group.incorrectAnswers} ${pluralRu(group.incorrectAnswers, ["ошибка", "ошибки", "ошибок"])}`,
  ].join(" · ");
}

function caseDrilldownTone(item: CaseDrilldownItem): Tone {
  return item.selectedAttempt ? caseTone(item.selectedAttempt.accuracy_percent) : "default";
}

function buildCaseDrilldownCaption(item: CaseDrilldownItem): string {
  const attemptsCount = item.attempts.length;
  const details = [
    attemptsCount > 0
      ? `${attemptsCount} ${pluralRu(attemptsCount, ["попытка", "попытки", "попыток"])}`
      : "нет попыток",
    item.selectedAttempt ? `последняя ${formatShortDate(item.selectedAttempt.submitted_at)}` : null,
  ].filter(Boolean);

  return details.join(" · ");
}

function osceTopicTone(group: OsceTopicFocus): Tone {
  if (group.status === "mastered") {
    return "green";
  }

  if (group.status === "in_progress") {
    return "warm";
  }

  return "default";
}

function buildOsceTopicCaption(group: OsceTopicFocus): string {
  const attentionLabel =
    group.attentionStationsCount > 0
      ? `${group.attentionStationsCount} ${pluralRu(group.attentionStationsCount, ["станция требует", "станции требуют", "станций требуют"])} внимания`
      : "все станции освоены";

  return [
    group.sectionName,
    `${group.attemptedStationsCount} ${pluralRu(group.attemptedStationsCount, ["пройденная станция", "пройденные станции", "пройденных станций"])}`,
    attentionLabel,
  ].join(" · ");
}

function buildOsceStationCaption(station: OsceStationListItem): string {
  return [
    station.skill_level,
    `${station.duration_minutes} мин`,
    `${station.attempts_count} ${pluralRu(station.attempts_count, ["попытка", "попытки", "попыток"])}`,
  ].join(" · ");
}

function daysSince(value: string): number {
  const parsed = toDisplayDate(value).getTime();

  if (Number.isNaN(parsed)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.floor((Date.now() - parsed) / (1000 * 60 * 60 * 24));
}

function fillStyle(width: number, color: string): CSSProperties {
  return {
    width: `${Math.max(0, Math.min(100, width))}%`,
    background: color,
  };
}

function Badge({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={styles.badge} data-tone={tone}>
      {label}
    </span>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className={styles.sectionLabel}>{children}</div>;
}

function Surface({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.surface}>
      <div className={styles.surfaceHead}>
        <div className={styles.surfaceTitle}>{title}</div>
        {action ?? (hint ? <div className={styles.surfaceHint}>{hint}</div> : null)}
      </div>
      {children}
    </section>
  );
}

function EmptyBlock({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyTitle}>{title}</div>
      {description ? <div className={styles.emptyDescription}>{description}</div> : null}
      {action ? <div className={styles.emptyActions}>{action}</div> : null}
    </div>
  );
}

function ProgressRing({
  value,
  color,
  size = 60,
  centerValue,
  centerLabel,
}: {
  value: number;
  color: string;
  size?: number;
  centerValue: string;
  centerLabel: string;
}) {
  const safeValue = Math.max(0, Math.min(100, value));
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashArray = `${(safeValue / 100) * circumference} ${circumference}`;
  const center = size / 2;

  return (
    <div className={styles.ringWrap}>
      <svg height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
        <circle
          cx={center}
          cy={center}
          fill="none"
          r={radius}
          stroke="var(--ink-07)"
          strokeWidth="5"
        />
        <circle
          cx={center}
          cy={center}
          fill="none"
          r={radius}
          stroke={color}
          strokeDasharray={dashArray}
          strokeLinecap="round"
          strokeWidth="5"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      <div className={styles.ringInner}>
        <div className={styles.ringValue}>{centerValue}</div>
        <div className={styles.ringLabel}>{centerLabel}</div>
      </div>
    </div>
  );
}

function ModalBar({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className={styles.modalComponent}>
      <div className={styles.modalComponentHead}>
        <span className={styles.modalComponentName}>{label}</span>
        <span className={styles.modalComponentValue} style={{ color }}>
          {percentage(value)}
        </span>
      </div>
      <div className={styles.modalBar}>
        <div className={styles.modalBarFill} style={fillStyle(value, color)} />
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className={styles.loadingGrid}>
      <div className={styles.loadingCard} />
      <div className={styles.loadingCard} />
      <div className={styles.loadingCard} />
      <div className={styles.loadingCardWide} />
    </div>
  );
}

export function AnalyticsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { token } = useAuth();
  const routeTab = normalizeAnalyticsTab(searchParams.get("tab"));
  const [activeTab, setActiveTab] = useState<AnalyticsTab>(routeTab);
  const [selectedTestTopicId, setSelectedTestTopicId] = useState<number | null>(null);
  const [showAllTestTopics, setShowAllTestTopics] = useState(false);
  const [showAllRepeatingErrors, setShowAllRepeatingErrors] = useState(false);
  const [selectedCaseTopicKey, setSelectedCaseTopicKey] = useState<string | null>(null);
  const [showAllCaseTopics, setShowAllCaseTopics] = useState(false);
  const [showAllCasesInTopic, setShowAllCasesInTopic] = useState(false);
  const [showAllCaseRepeats, setShowAllCaseRepeats] = useState(false);
  const [selectedOsceTopicKey, setSelectedOsceTopicKey] = useState<string | null>(null);
  const [showAllOsceTopics, setShowAllOsceTopics] = useState(false);
  const [showAllOsceStations, setShowAllOsceStations] = useState(false);
  const [showAllOsceRepeats, setShowAllOsceRepeats] = useState(false);
  const [state, setState] = useState<AnalyticsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [topicErrorsByTopicId, setTopicErrorsByTopicId] = useState<Record<number, TopicQuestionErrorAnalytics[]>>({});
  const [topicErrorsLoadingTopicId, setTopicErrorsLoadingTopicId] = useState<number | null>(null);
  const [topicErrorsLoadError, setTopicErrorsLoadError] = useState<string | null>(null);
  const [expandedTopicErrorId, setExpandedTopicErrorId] = useState<number | null>(null);
  const [expandedProtocolErrorId, setExpandedProtocolErrorId] = useState<number | null>(null);
  const [protocolTestErrorsLoading, setProtocolTestErrorsLoading] = useState(false);
  const [protocolTestErrorsError, setProtocolTestErrorsError] = useState<string | null>(null);
  const [repeatTopicErrorsPending, setRepeatTopicErrorsPending] = useState(false);
  const [repeatTopicErrorsError, setRepeatTopicErrorsError] = useState<string | null>(null);
  const [caseReviewsByAttemptId, setCaseReviewsByAttemptId] = useState<Record<string, ClinicalCaseAttemptReviewAnalytics>>({});
  const [caseReviewLoadingAttemptId, setCaseReviewLoadingAttemptId] = useState<string | null>(null);
  const [caseReviewLoadError, setCaseReviewLoadError] = useState<string | null>(null);
  const [osceReviewsBySlug, setOsceReviewsBySlug] = useState<Record<string, OsceStationReviewAnalytics>>({});
  const [osceReviewLoadingSlug, setOsceReviewLoadingSlug] = useState<string | null>(null);
  const [osceReviewLoadError, setOsceReviewLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!modal) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModal(null);
      }
    };

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [modal]);

  const activeTopicModal = modal?.kind === "topic" ? modal.topic : null;
  const activeProtocolStage = modal?.kind === "overview-protocol" ? modal.stage : null;
  const activeCaseModal = modal?.kind === "case" ? modal.attempt : null;
  const activeOsceModal = modal?.kind === "osce" ? modal.station : null;
  const activeTopicErrors = activeTopicModal ? topicErrorsByTopicId[activeTopicModal.topic_id] ?? [] : [];
  const activeCaseReview = activeCaseModal ? caseReviewsByAttemptId[activeCaseModal.id] ?? null : null;
  const activeOsceReview = activeOsceModal ? osceReviewsBySlug[activeOsceModal.slug] ?? null : null;
  const isTopicErrorsLoading =
    activeTopicModal !== null && topicErrorsLoadingTopicId === activeTopicModal.topic_id;
  const isCaseReviewLoading = activeCaseModal !== null && caseReviewLoadingAttemptId === activeCaseModal.id;
  const isOsceReviewLoading = activeOsceModal !== null && osceReviewLoadingSlug === activeOsceModal.slug;

  useEffect(() => {
    setActiveTab(routeTab);
  }, [routeTab]);

  useEffect(() => {
    setTopicErrorsLoadError(null);
    setRepeatTopicErrorsError(null);
    setRepeatTopicErrorsPending(false);

    if (activeTopicModal === null) {
      setExpandedTopicErrorId(null);
      return;
    }

    const cachedItems = topicErrorsByTopicId[activeTopicModal.topic_id] ?? [];
    setExpandedTopicErrorId(cachedItems.length > 0 ? cachedItems[0].question_id : null);
  }, [activeTopicModal, topicErrorsByTopicId]);

  async function handleRepeatTopicErrors() {
    if (!token || activeTopicModal === null || activeTopicErrors.length === 0 || repeatTopicErrorsPending) {
      return;
    }

    setRepeatTopicErrorsPending(true);
    setRepeatTopicErrorsError(null);

    try {
      const questionIds = Array.from(new Set(activeTopicErrors.map((item) => item.question_id)));
      const session = await api.startSession(token, {
        topic_id: activeTopicModal.topic_id,
        question_count: questionIds.length,
        mode: "learning",
        question_ids: questionIds,
      });

      setModal(null);
      navigate(`/app/tests/${session.id}`);
    } catch (exception) {
      setRepeatTopicErrorsError(exception instanceof ApiError ? exception.message : "Не удалось запустить повторение ошибок");
    } finally {
      setRepeatTopicErrorsPending(false);
    }
  }

  async function handleRepeatErrorsForTopic(topic: TopicAnalytics, errors: TopicQuestionErrorAnalytics[]) {
    if (!token || errors.length === 0 || repeatTopicErrorsPending) {
      return;
    }

    setRepeatTopicErrorsPending(true);
    setRepeatTopicErrorsError(null);

    try {
      const questionIds = Array.from(new Set(errors.map((item) => item.question_id)));
      const session = await api.startSession(token, {
        topic_id: topic.topic_id,
        question_count: questionIds.length,
        mode: "learning",
        question_ids: questionIds,
      });

      setModal(null);
      navigate(`/app/tests/${session.id}`);
    } catch (exception) {
      setRepeatTopicErrorsError(exception instanceof ApiError ? exception.message : "Не удалось запустить повторение ошибок");
    } finally {
      setRepeatTopicErrorsPending(false);
    }
  }

  async function handleRepeatProtocolTestErrors(errors: TopicQuestionErrorAnalytics[]) {
    if (!token || errors.length === 0 || repeatTopicErrorsPending) {
      return;
    }

    setRepeatTopicErrorsPending(true);
    setRepeatTopicErrorsError(null);

    try {
      const questionIds = Array.from(new Set(errors.map((item) => item.question_id)));
      const session = await api.startSession(token, {
        topic_id: null,
        question_count: questionIds.length,
        mode: "learning",
        question_ids: questionIds,
      });

      setModal(null);
      navigate(`/app/tests/${session.id}`);
    } catch (exception) {
      setRepeatTopicErrorsError(exception instanceof ApiError ? exception.message : "Не удалось запустить повторение ошибок");
    } finally {
      setRepeatTopicErrorsPending(false);
    }
  }

  useEffect(() => {
    if (!token || activeTopicModal === null || topicErrorsByTopicId[activeTopicModal.topic_id]) {
      return;
    }

    const controller = new AbortController();
    const { topic_id: topicId } = activeTopicModal;

    setTopicErrorsLoadingTopicId(topicId);
    setTopicErrorsLoadError(null);

    void api
      .getAnalyticsTopicErrors(token, topicId, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) {
          return;
        }

        setTopicErrorsByTopicId((currentValue) => ({
          ...currentValue,
          [topicId]: items,
        }));

        if (items.length > 0) {
          setExpandedTopicErrorId(items[0].question_id);
        }
      })
      .catch((exception) => {
        if (isAbortError(exception) || controller.signal.aborted) {
          return;
        }

        setTopicErrorsLoadError(exception instanceof ApiError ? exception.message : "Не удалось загрузить разбор ошибок");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setTopicErrorsLoadingTopicId((currentValue) => (currentValue === topicId ? null : currentValue));
        }
      });

    return () => {
      controller.abort();
    };
  }, [activeTopicModal, token, topicErrorsByTopicId]);

  useEffect(() => {
    setOsceReviewLoadError(null);

    if (activeOsceModal === null) {
      return;
    }
  }, [activeOsceModal]);

  useEffect(() => {
    if (!token || activeOsceModal === null || osceReviewsBySlug[activeOsceModal.slug]) {
      return;
    }

    const controller = new AbortController();
    const { slug } = activeOsceModal;

    setOsceReviewLoadingSlug(slug);
    setOsceReviewLoadError(null);

    void api
      .getAnalyticsOsceReview(token, slug, controller.signal)
      .then((review) => {
        if (controller.signal.aborted) {
          return;
        }

        setOsceReviewsBySlug((currentValue) => ({
          ...currentValue,
          [slug]: review,
        }));
      })
      .catch((exception) => {
        if (isAbortError(exception) || controller.signal.aborted) {
          return;
        }

        setOsceReviewLoadError(exception instanceof ApiError ? exception.message : "Не удалось загрузить разбор станции");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setOsceReviewLoadingSlug((currentValue) => (currentValue === slug ? null : currentValue));
        }
      });

    return () => {
      controller.abort();
    };
  }, [activeOsceModal, osceReviewsBySlug, token]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setState(null);
      return;
    }

    const controller = new AbortController();

    setLoading(true);
    setError(null);

    void Promise.all([
      api.getAnalyticsReadiness(token, controller.signal),
      api.getAnalyticsTopics(token, controller.signal),
      api.listCases(token, controller.signal),
      api.listOsceStations(token, controller.signal),
      api.getAnalyticsCases(token, controller.signal),
      api.getAnalyticsRepeatingErrors(token, controller.signal),
    ])
      .then(([readiness, topics, cases, osceStations, caseAttempts, repeatingErrors]) => {
        if (controller.signal.aborted) {
          return;
        }

        setState({ readiness, topics, cases, osceStations, caseAttempts, repeatingErrors });
      })
      .catch((exception) => {
        if (isAbortError(exception) || controller.signal.aborted) {
          return;
        }

        setError(exception instanceof ApiError ? exception.message : "Не удалось загрузить аналитику");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [token]);

  const portalTarget = typeof document !== "undefined" ? document.body : null;

  const testsTrack = useMemo(
    () => state?.readiness.tracks.find((track) => track.key === "tests") ?? null,
    [state?.readiness.tracks],
  );

  const casesTrack = useMemo(
    () => state?.readiness.tracks.find((track) => track.key === "cases") ?? null,
    [state?.readiness.tracks],
  );

  const osceTrack = useMemo(
    () => state?.readiness.tracks.find((track) => track.key === "osce") ?? null,
    [state?.readiness.tracks],
  );

  const testTopics = useMemo(() => {
    return [...(state?.topics ?? [])]
      .sort(compareTopics);
  }, [state?.topics]);

  const testFocusTopics = useMemo(() => {
    return testTopics.filter(hasTestTopicSignal);
  }, [testTopics]);

  const visibleTestTopics = showAllTestTopics ? testFocusTopics : testFocusTopics.slice(0, 5);

  const selectedTestTopic = useMemo(() => {
    return testFocusTopics.find((topic) => topic.topic_id === selectedTestTopicId) ?? testFocusTopics[0] ?? null;
  }, [selectedTestTopicId, testFocusTopics]);

  const protocolTestReviewTopics = useMemo(() => {
    return testTopics
      .filter(
        (topic) =>
          topic.test_incorrect_answers > 0 ||
          topic.repeated_question_struggles > 0 ||
          topic.status === "weak" ||
          (topic.answered_questions > 0 && topic.accuracy_percent < 70),
      )
      .slice(0, 6);
  }, [testTopics]);

  const focusedTopics = useMemo(() => {
    return [...(state?.topics ?? [])]
      .filter((topic) => topic.answered_questions > 0 || topic.case_attempts_count > 0)
      .sort(compareTopics)
      .slice(0, 8);
  }, [state?.topics]);

  const caseTopicFocusItems = useMemo<CaseTopicFocus[]>(() => {
    const groups = new Map<
      string,
      {
        topicId: number | null;
        topicName: string;
        sectionName: string | null;
        cases: ClinicalCaseListItem[];
        attempts: ClinicalCaseAttemptAnalytics[];
      }
    >();

    for (const caseItem of state?.cases ?? []) {
      const key =
        caseItem.topic_id !== null
          ? `topic-${caseItem.topic_id}`
          : `topic-name-${caseItem.topic_name.toLocaleLowerCase("ru")}`;
      const currentGroup = groups.get(key);

      if (currentGroup) {
        currentGroup.cases.push(caseItem);
      } else {
        groups.set(key, {
          topicId: caseItem.topic_id,
          topicName: caseItem.topic_name,
          sectionName: caseItem.section_name,
          cases: [caseItem],
          attempts: [],
        });
      }
    }

    for (const attempt of state?.caseAttempts ?? []) {
      const key =
        attempt.topic_id !== null
          ? `topic-${attempt.topic_id}`
          : attempt.topic_name
            ? `topic-name-${attempt.topic_name.toLocaleLowerCase("ru")}`
            : `case-${attempt.case_slug}`;
      const currentGroup = groups.get(key);

      if (currentGroup) {
        currentGroup.attempts.push(attempt);
      } else {
        groups.set(key, {
          topicId: attempt.topic_id,
          topicName: attempt.topic_name ?? attempt.case_title,
          sectionName: null,
          cases: [],
          attempts: [attempt],
        });
      }
    }

    return Array.from(groups.entries())
      .map(([key, group]) => {
        const sortedAttempts = [...group.attempts].sort(compareCaseAttempts);
        const sortedCases = [...group.cases].sort((left, right) => left.title.localeCompare(right.title, "ru"));
        const selectedAttempt = sortedAttempts[0] ?? null;
        const selectedCase =
          (selectedAttempt ? sortedCases.find((caseItem) => caseItem.slug === selectedAttempt.case_slug) : null) ??
          sortedCases[0] ??
          null;
        const attemptsCount = sortedAttempts.length;
        const selectedAttemptsByCase = new Map<string, ClinicalCaseAttemptAnalytics>();

        for (const attempt of sortedAttempts) {
          if (!selectedAttemptsByCase.has(attempt.case_slug)) {
            selectedAttemptsByCase.set(attempt.case_slug, attempt);
          }
        }

        const incorrectAnswers = Array.from(selectedAttemptsByCase.values()).reduce(
          (sum, attempt) => sum + Math.max(0, attempt.answered_questions - attempt.correct_answers),
          0,
        );
        const averageAccuracy =
          attemptsCount > 0 ? sortedAttempts.reduce((sum, attempt) => sum + attempt.accuracy_percent, 0) / attemptsCount : null;

        return {
          key,
          topicId: group.topicId,
          topicName: group.topicName,
          sectionName: group.sectionName,
          cases: sortedCases,
          attempts: sortedAttempts,
          attemptsCount,
          incorrectAnswers,
          averageAccuracy,
          worstAccuracy: selectedAttempt?.accuracy_percent ?? null,
          selectedCase,
          selectedAttempt,
        };
      })
      .sort(compareCaseTopicFocus);
  }, [state?.caseAttempts, state?.cases]);

  const focusedCaseTopics = useMemo(() => {
    return caseTopicFocusItems.filter((group) => group.worstAccuracy !== null && group.worstAccuracy < TRAINING_MASTERY_PERCENT);
  }, [caseTopicFocusItems]);

  const caseReviewTopics = useMemo(() => {
    return caseTopicFocusItems.filter((group) => group.attemptsCount > 0);
  }, [caseTopicFocusItems]);
  const visibleCaseTopics = showAllCaseTopics ? caseReviewTopics : caseReviewTopics.slice(0, 5);

  const selectedCaseTopic = useMemo(() => {
    return caseReviewTopics.find((group) => group.key === selectedCaseTopicKey) ?? caseReviewTopics[0] ?? null;
  }, [caseReviewTopics, selectedCaseTopicKey]);

  const attemptedCaseItems = useMemo(() => {
    return selectedCaseTopic
      ? buildCaseDrilldownItems(selectedCaseTopic).filter((item) => item.selectedAttempt !== null)
      : [];
  }, [selectedCaseTopic]);

  const visibleAttemptedCaseItems = showAllCasesInTopic ? attemptedCaseItems : attemptedCaseItems.slice(0, 5);

  const caseRepeatGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        title: string;
        topicName: string | null;
        totalRepeats: number;
        attemptsWithErrors: number;
        attempts: ClinicalCaseAttemptAnalytics[];
      }
    >();

    for (const attempt of state?.caseAttempts ?? []) {
      const incorrectAnswers = Math.max(0, attempt.answered_questions - attempt.correct_answers);

      if (incorrectAnswers === 0) {
        continue;
      }

      const currentGroup = groups.get(attempt.case_slug);

      if (currentGroup) {
        currentGroup.totalRepeats += incorrectAnswers;
        currentGroup.attemptsWithErrors += 1;
        currentGroup.attempts.push(attempt);
        continue;
      }

      groups.set(attempt.case_slug, {
        key: attempt.case_slug,
        title: attempt.case_title,
        topicName: attempt.topic_name,
        totalRepeats: incorrectAnswers,
        attemptsWithErrors: 1,
        attempts: [attempt],
      });
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        selectedAttempt: [...group.attempts].sort(compareCaseAttempts)[0],
      }))
      .sort(
        (left, right) =>
          right.totalRepeats - left.totalRepeats ||
          right.attemptsWithErrors - left.attemptsWithErrors ||
          (left.selectedAttempt?.accuracy_percent ?? 101) - (right.selectedAttempt?.accuracy_percent ?? 101) ||
          left.title.localeCompare(right.title, "ru"),
      );
  }, [state?.caseAttempts]);

  const visibleCaseRepeatGroups = showAllCaseRepeats ? caseRepeatGroups : caseRepeatGroups.slice(0, 5);

  const focusedRepeatingErrors = useMemo(() => {
    return [...(state?.repeatingErrors ?? [])]
      .sort(
        (left, right) =>
          right.incorrect_answers - left.incorrect_answers ||
          left.accuracy_percent - right.accuracy_percent ||
          left.question_preview.localeCompare(right.question_preview, "ru"),
      )
      .slice(0, 3);
  }, [state?.repeatingErrors]);

  const repeatingErrorGroups = useMemo<RepeatingErrorGroup[]>(() => {
    const groups = new Map<string, RepeatingErrorGroup>();

    for (const item of state?.repeatingErrors ?? []) {
      const key = item.topic_id !== null ? `topic-${item.topic_id}` : `question-${item.question_id}`;
      const title = item.topic_name ?? item.question_preview;
      const currentGroup = groups.get(key);

      if (currentGroup) {
        currentGroup.errors.push(item);
        currentGroup.totalIncorrectAnswers += item.incorrect_answers;
        continue;
      }

      groups.set(key, {
        key,
        topicId: item.topic_id,
        title,
        errors: [item],
        totalIncorrectAnswers: item.incorrect_answers,
      });
    }

    return Array.from(groups.values()).sort(
      (left, right) =>
        right.totalIncorrectAnswers - left.totalIncorrectAnswers ||
        right.errors.length - left.errors.length ||
        left.title.localeCompare(right.title, "ru"),
    );
  }, [state?.repeatingErrors]);

  const osceTopicFocusItems = useMemo<OsceTopicFocus[]>(() => {
    const groups = new Map<string, OsceStationListItem[]>();

    for (const station of state?.osceStations ?? []) {
      const key = `${station.section_name}::${station.topic_name}`.toLocaleLowerCase("ru");
      const currentGroup = groups.get(key);

      if (currentGroup) {
        currentGroup.push(station);
      } else {
        groups.set(key, [station]);
      }
    }

    return Array.from(groups.entries())
      .map(([key, stations]) => {
        const sortedStations = [...stations].sort(compareOsceStations);
        const attemptedStations = sortedStations.filter((station) => station.attempts_count > 0);
        const attentionStations = sortedStations.filter((station) => station.status !== "mastered");
        const selectedStation =
          attentionStations.find((station) => station.attempts_count > 0) ??
          attemptedStations[0] ??
          attentionStations[0] ??
          sortedStations[0]!;
        const status = sortedStations.every((station) => station.status === "mastered")
          ? "mastered"
          : sortedStations.some((station) => station.status === "in_progress")
            ? "in_progress"
            : "not_started";

        return {
          key,
          topicName: selectedStation.topic_name,
          sectionName: selectedStation.section_name,
          stations: sortedStations,
          stationsCount: sortedStations.length,
          attemptedStationsCount: attemptedStations.length,
          attentionStationsCount: attentionStations.filter((station) => station.attempts_count > 0).length,
          attemptsCount: sortedStations.reduce((sum, station) => sum + station.attempts_count, 0),
          status,
          focusScorePercent: selectedStation.best_score_percent,
          selectedStation,
        };
      })
      .sort(compareOsceTopicFocus);
  }, [state?.osceStations]);

  const osceAttentionTopics = useMemo(() => {
    return osceTopicFocusItems.filter((group) => group.attemptsCount > 0 && group.status !== "mastered");
  }, [osceTopicFocusItems]);

  const osceReviewTopics = useMemo(() => {
    return osceTopicFocusItems.filter((group) => group.attemptsCount > 0);
  }, [osceTopicFocusItems]);
  const visibleOsceTopics = showAllOsceTopics ? osceReviewTopics : osceReviewTopics.slice(0, 5);

  const selectedOsceTopic = useMemo(() => {
    return osceReviewTopics.find((group) => group.key === selectedOsceTopicKey) ?? osceReviewTopics[0] ?? null;
  }, [osceReviewTopics, selectedOsceTopicKey]);

  const attemptedOsceStations = useMemo(() => {
    return selectedOsceTopic?.stations.filter((station) => station.attempts_count > 0) ?? [];
  }, [selectedOsceTopic]);

  const visibleAttemptedOsceStations = showAllOsceStations ? attemptedOsceStations : attemptedOsceStations.slice(0, 5);

  const osceRepeatGroups = useMemo(() => {
    return [...(state?.osceStations ?? [])]
      .filter((station) => station.attempts_count > 0 && station.status !== "mastered")
      .sort(compareOsceStations)
      .map((station) => ({
        key: station.slug,
        title: station.title,
        topicName: station.topic_name,
        totalRepeats: station.attempts_count,
        selectedStation: station,
      }));
  }, [state?.osceStations]);

  const visibleOsceRepeatGroups = showAllOsceRepeats ? osceRepeatGroups : osceRepeatGroups.slice(0, 5);

  const selectedTestTopicErrors = selectedTestTopic ? topicErrorsByTopicId[selectedTestTopic.topic_id] ?? [] : [];
  const selectedTestTopicLoading =
    selectedTestTopic !== null && topicErrorsLoadingTopicId === selectedTestTopic.topic_id;
  const protocolTestErrorItems = useMemo(() => {
    return protocolTestReviewTopics
      .flatMap((topic) =>
        (topicErrorsByTopicId[topic.topic_id] ?? []).map((errorItem) => ({
          topic,
          error: errorItem,
        })),
      )
      .sort(
        (left, right) =>
          right.error.incorrect_answers - left.error.incorrect_answers ||
          left.error.accuracy_percent - right.error.accuracy_percent ||
          left.topic.topic_name.localeCompare(right.topic.topic_name, "ru") ||
          left.error.question_text.localeCompare(right.error.question_text, "ru"),
      )
      .slice(0, 10);
  }, [protocolTestReviewTopics, topicErrorsByTopicId]);
  const protocolCaseReviewAttempts = useMemo(() => {
    return [...(state?.caseAttempts ?? [])]
      .filter((attempt) => attempt.answered_questions > attempt.correct_answers)
      .sort(compareCaseAttempts)
      .slice(0, 6);
  }, [state?.caseAttempts]);
  const protocolOsceReviewStations = useMemo(() => {
    return [...(state?.osceStations ?? [])]
      .filter((station) => station.attempts_count > 0 && station.status !== "mastered")
      .sort(compareOsceStations)
      .slice(0, 6);
  }, [state?.osceStations]);
  const visibleRepeatingErrorGroups = showAllRepeatingErrors
    ? repeatingErrorGroups
    : repeatingErrorGroups.slice(0, 5);

  useEffect(() => {
    if (activeProtocolStage?.key !== "tests") {
      setExpandedProtocolErrorId(null);
      setProtocolTestErrorsError(null);
      setProtocolTestErrorsLoading(false);
      return;
    }

    setExpandedProtocolErrorId((currentValue) =>
      currentValue !== null && protocolTestErrorItems.some((item) => item.error.question_id === currentValue)
        ? currentValue
        : protocolTestErrorItems[0]?.error.question_id ?? null,
    );
  }, [activeProtocolStage?.key, protocolTestErrorItems]);

  useEffect(() => {
    if (activeProtocolStage?.key !== "tests" || !token || protocolTestReviewTopics.length === 0) {
      return;
    }

    const topicsToLoad = protocolTestReviewTopics.filter((topic) => !topicErrorsByTopicId[topic.topic_id]);

    if (topicsToLoad.length === 0) {
      return;
    }

    const controller = new AbortController();
    setProtocolTestErrorsLoading(true);
    setProtocolTestErrorsError(null);

    void Promise.all(
      topicsToLoad.map((topic) =>
        api
          .getAnalyticsTopicErrors(token, topic.topic_id, controller.signal)
          .then((items) => ({ topicId: topic.topic_id, items })),
      ),
    )
      .then((results) => {
        if (controller.signal.aborted) {
          return;
        }

        setTopicErrorsByTopicId((currentValue) => {
          const nextValue = { ...currentValue };

          for (const result of results) {
            nextValue[result.topicId] = result.items;
          }

          return nextValue;
        });

        const firstError = results.flatMap((result) => result.items)[0] ?? null;
        if (firstError) {
          setExpandedProtocolErrorId(firstError.question_id);
        }
      })
      .catch((exception) => {
        if (isAbortError(exception) || controller.signal.aborted) {
          return;
        }

        setProtocolTestErrorsError(exception instanceof ApiError ? exception.message : "Не удалось загрузить ошибки тестового этапа");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setProtocolTestErrorsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [activeProtocolStage?.key, protocolTestReviewTopics, token, topicErrorsByTopicId]);

  useEffect(() => {
    if (testTopics.length === 0) {
      setSelectedTestTopicId(null);
      return;
    }

    if (selectedTestTopicId === null || !testTopics.some((topic) => topic.topic_id === selectedTestTopicId)) {
      setSelectedTestTopicId(testTopics[0].topic_id);
    }
  }, [selectedTestTopicId, testTopics]);

  useEffect(() => {
    if (caseReviewTopics.length === 0) {
      setSelectedCaseTopicKey(null);
      return;
    }

    if (selectedCaseTopicKey === null || !caseReviewTopics.some((group) => group.key === selectedCaseTopicKey)) {
      setSelectedCaseTopicKey(caseReviewTopics[0].key);
    }
  }, [caseReviewTopics, selectedCaseTopicKey]);

  useEffect(() => {
    setShowAllCasesInTopic(false);
  }, [selectedCaseTopicKey]);

  useEffect(() => {
    setCaseReviewLoadError(null);

    if (activeCaseModal === null) {
      setCaseReviewLoadingAttemptId(null);
    }
  }, [activeCaseModal]);

  useEffect(() => {
    if (!token || activeCaseModal === null || caseReviewsByAttemptId[activeCaseModal.id]) {
      return;
    }

    const controller = new AbortController();
    const { id: attemptId } = activeCaseModal;

    setCaseReviewLoadingAttemptId(attemptId);
    setCaseReviewLoadError(null);

    void api
      .getAnalyticsCaseReview(token, attemptId, controller.signal)
      .then((review) => {
        if (controller.signal.aborted) {
          return;
        }

        setCaseReviewsByAttemptId((currentValue) => ({
          ...currentValue,
          [attemptId]: review,
        }));
      })
      .catch((exception) => {
        if (isAbortError(exception) || controller.signal.aborted) {
          return;
        }

        setCaseReviewLoadError(exception instanceof ApiError ? exception.message : "Не удалось загрузить разбор кейса");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCaseReviewLoadingAttemptId((currentValue) => (currentValue === attemptId ? null : currentValue));
        }
      });

    return () => {
      controller.abort();
    };
  }, [activeCaseModal, caseReviewsByAttemptId, token]);

  useEffect(() => {
    if (osceReviewTopics.length === 0) {
      setSelectedOsceTopicKey(null);
      return;
    }

    if (
      selectedOsceTopicKey === null ||
      !osceReviewTopics.some((group) => group.key === selectedOsceTopicKey)
    ) {
      setSelectedOsceTopicKey(osceReviewTopics[0].key);
    }
  }, [osceReviewTopics, selectedOsceTopicKey]);

  useEffect(() => {
    setShowAllOsceStations(false);
  }, [selectedOsceTopicKey]);

  useEffect(() => {
    if (
      activeTab !== "tests" ||
      !token ||
      selectedTestTopic === null ||
      topicErrorsByTopicId[selectedTestTopic.topic_id]
    ) {
      return;
    }

    const controller = new AbortController();
    const { topic_id: topicId } = selectedTestTopic;

    setTopicErrorsLoadingTopicId(topicId);
    setTopicErrorsLoadError(null);

    void api
      .getAnalyticsTopicErrors(token, topicId, controller.signal)
      .then((items) => {
        if (controller.signal.aborted) {
          return;
        }

        setTopicErrorsByTopicId((currentValue) => ({
          ...currentValue,
          [topicId]: items,
        }));
      })
      .catch((exception) => {
        if (isAbortError(exception) || controller.signal.aborted) {
          return;
        }

        setTopicErrorsLoadError(exception instanceof ApiError ? exception.message : "Не удалось загрузить разбор ошибок");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setTopicErrorsLoadingTopicId((currentValue) => (currentValue === topicId ? null : currentValue));
        }
      });

    return () => {
      controller.abort();
    };
  }, [activeTab, selectedTestTopic, token, topicErrorsByTopicId]);

  function handleTabChange(tab: AnalyticsTab) {
    setActiveTab(tab);
    const nextSearchParams = new URLSearchParams(searchParams);
    if (tab === "overview") {
      nextSearchParams.delete("tab");
    } else {
      nextSearchParams.set("tab", tab);
    }
    setSearchParams(nextSearchParams, { replace: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openRepeatingErrorGroup(group: RepeatingErrorGroup) {
    const topic = group.topicId !== null ? state?.topics.find((item) => item.topic_id === group.topicId) ?? null : null;

    if (topic) {
      setSelectedTestTopicId(topic.topic_id);
    }

    setModal({
      kind: "repeating-error-group",
      group: {
        ...group,
        errors: [...group.errors].sort(
          (left, right) =>
            right.incorrect_answers - left.incorrect_answers ||
            left.accuracy_percent - right.accuracy_percent ||
            left.question_preview.localeCompare(right.question_preview, "ru"),
        ),
      },
    });
  }

  function renderTopicRiskLegend() {
    return (
      <div className={styles["tests-legend"]}>
        <span title="Высокий риск: тема просела сильнее всего. Лучше разобрать её первой.">
          <i data-tone="critical" /> Высокий риск
        </span>
        <span title="Риск: есть ошибки или нестабильный результат. Тему стоит повторить.">
          <i data-tone="risk" /> Риск
        </span>
        <span title="Норма: явной просадки нет, срочный разбор не нужен.">
          <i data-tone="normal" /> Норма
        </span>
      </div>
    );
  }

  function renderOverviewPane() {
    if (!state) {
      return null;
    }

    const tracks = state.readiness.tracks;
    const recommendedTrack =
      tracks.find((track) => track.key === state.readiness.recommended_focus_key) ?? tracks[0] ?? null;
    const protocol = state.readiness.exam_protocol;
    const ringTotal = tracks.reduce((sum, track) => sum + Math.max(track.readiness_percent, 0), 0);
    let ringOffset = 0;
    const ringSegments = ringTotal > 0 ? tracks.map((track, index) => {
      const rawLength = (Math.max(track.readiness_percent, 0) / ringTotal) * 100;
      if (rawLength <= 0) {
        return null;
      }
      const visibleLength = Math.max(rawLength - 1.2, 1);
      const segment = (
        <circle
          className={styles["overview-ring-segment"]}
          cx="60"
          cy="60"
          key={track.key}
          pathLength="100"
          r="47"
          stroke={trackColor(track)}
          strokeDasharray={`${visibleLength} ${100 - visibleLength}`}
          strokeDashoffset={-ringOffset}
          style={{ "--segment-delay": `${index * 120}ms` } as CSSProperties}
          transform="rotate(-90 60 60)"
        />
      );
      ringOffset += rawLength;
      return segment;
    }) : [];
    const hasReviewQueue =
      focusedRepeatingErrors.length > 0 ||
      focusedCaseTopics.length > 0 ||
      osceAttentionTopics.length > 0 ||
      focusedTopics.length > 0;
    const overviewQueueItems = [
      ...focusedRepeatingErrors.slice(0, 1).map((item) => ({
        key: `error-${item.question_id}`,
        title: "Повторные ошибки",
        detail: `${item.topic_name ?? "Без темы"} · ошибок ${item.incorrect_answers}`,
        badge: repeatingErrorLabel(item.incorrect_answers),
        tone: repeatingErrorTone(item.incorrect_answers, item.accuracy_percent),
        onOpen: () => setModal({ kind: "error", error: item }),
      })),
      ...focusedCaseTopics.slice(0, 1).map((group) => ({
        key: `case-topic-${group.key}`,
        title: "Тема кейсов",
        detail: `${group.topicName} · ${buildCaseTopicCaption(group)}`,
        badge: group.worstAccuracy !== null ? caseLabel(group.worstAccuracy) : "Не начато",
        tone: caseTopicTone(group),
        onOpen: () => {
          setSelectedCaseTopicKey(group.key);
          handleTabChange("cases");
        },
      })),
      ...osceAttentionTopics.slice(0, 1).map((group) => ({
        key: `osce-topic-${group.key}`,
        title: "Тема ОСКЭ",
        detail: `${group.topicName} · ${buildOsceTopicCaption(group)}`,
        badge: osceLabel(group.status),
        tone: osceTopicTone(group),
        onOpen: () => {
          setSelectedOsceTopicKey(group.key);
          setModal({ kind: "osce", station: group.selectedStation });
        },
      })),
      ...focusedTopics.slice(0, 2).map((topic) => ({
        key: `topic-${topic.topic_id}`,
        title: "Тема в риске",
        detail: `${topic.topic_name} · ${buildTopicCaption(topic)}`,
        badge: topicLabel(topic.status),
        tone: topicTone(topic.status),
        onOpen: () => setModal({ kind: "topic", topic }),
      })),
    ].slice(0, 5);

    return (
      <div className={styles.pane}>
        <div className={styles["overview-grid"]}>
          <section className={styles["overview-card"]}>
            <div className={styles["overview-card-head"]}>
              <div className={styles["overview-card-title"]}>Учебная готовность</div>
              <button aria-label="Подробности учебной готовности" onClick={() => setModal({ kind: "overview-readiness" })} type="button">
                <InfoIcon />
              </button>
            </div>
            <button className={styles["overview-ring-button"]} onClick={() => setModal({ kind: "overview-readiness" })} type="button">
              <svg className={styles["overview-ring"]} viewBox="0 0 120 120">
                <circle className={styles["overview-ring-base"]} cx="60" cy="60" r="47" />
                {ringSegments}
              </svg>
              <span className={styles["overview-ring-center"]}>
                <strong>{Math.round(state.readiness.overall_readiness_percent)}</strong>
                <small>%</small>
              </span>
            </button>
            <div className={styles["overview-legend"]}>
              {tracks.map((track) => (
                <button
                  key={track.key}
                  onClick={() => setModal({ kind: "overview-deficit", metric: worstMetricForTrack(track), track })}
                  type="button"
                >
                  <i style={{ background: trackColor(track) }} />
                  <span>{trackShortLabel(track)}</span>
                  <strong>{Math.round(track.readiness_percent)}%</strong>
                </button>
              ))}
            </div>
            <div className={styles["overview-focus"]}>
              <span>Главный фокус:</span>
              <strong>{recommendedTrack ? trackShortLabel(recommendedTrack) : state.readiness.recommended_focus_label}</strong>
            </div>
          </section>

          <section className={styles["overview-card"]}>
            <div className={styles["overview-card-head"]}>
              <div className={styles["overview-card-title"]}>Карта дефицита</div>
            </div>
            <div className={styles["deficit-map"]}>
              <div />
              {tracks.map((track) => (
                <div className={styles["deficit-track-label"]} key={track.key}>
                  {trackShortLabel(track)}
                </div>
              ))}
              {DEFICIT_METRICS.map((metric) => (
                <Fragment key={metric.key}>
                  <button
                    aria-label={`${metric.label}: ${metric.tooltip}`}
                    className={styles["deficit-row-label"]}
                    title={metric.tooltip}
                    type="button"
                  >
                    {metric.label}
                  </button>
                  {tracks.map((track) => {
                    const value = metricValue(track, metric);
                    const tone = deficitTone(value);

                    return (
                      <button
                        aria-label={`${metric.label}: ${trackShortLabel(track)}, ${percentage(value)}`}
                        className={styles["deficit-dot-button"]}
                        data-tone={tone}
                        key={`${metric.key}-${track.key}`}
                        onClick={() => setModal({ kind: "overview-deficit", metric, track })}
                        type="button"
                      >
                        <span />
                      </button>
                    );
                  })}
                </Fragment>
              ))}
            </div>
            <div className={styles["deficit-legend"]}>
              <span><i data-tone="norm" /> Норма</span>
              <span><i data-tone="risk" /> Риск</span>
              <span><i data-tone="critical" /> Критично</span>
            </div>
          </section>

          <section className={styles["overview-card"]}>
            <div className={styles["overview-card-head"]}>
              <div className={styles["overview-card-title"]}>Протокол пробной аккредитации</div>
              <button
                aria-label="Подробности протокола"
                onClick={() =>
                  protocol.stages[0]
                    ? setModal({ kind: "overview-protocol", stage: protocol.stages.find((stage) => stage.status !== "passed") ?? protocol.stages[0] })
                    : undefined
                }
                type="button"
              >
                <InfoIcon />
              </button>
            </div>
            <div className={styles["protocol-list"]}>
              {protocol.stages.map((stage) => (
                <button
                  className={styles["protocol-row"]}
                  data-tone={protocolTone(stage.status)}
                  key={stage.key}
                  onClick={() => setModal({ kind: "overview-protocol", stage })}
                  type="button"
                >
                  <span className={styles["protocol-doc"]} data-stage={protocolStageVisualKey(stage.key)}>
                    <ProtocolStageIcon stageKey={stage.key} />
                  </span>
                  <span className={styles["protocol-copy"]}>
                    <strong title={stage.label}>{stage.label}</strong>
                    <small title={stage.requirement_label}>{stage.requirement_label}</small>
                  </span>
                  <span className={styles["protocol-rule"]} />
                  <span className={styles["protocol-status"]}>
                    <ProtocolStatusIcon status={stage.status} />
                    {stage.status_label}
                  </span>
                </button>
              ))}
            </div>
            <Link
              className={styles["overview-wide-action"]}
              to="/app/accreditation"
            >
              Пройти пробную аккредитацию <ArrowRightIcon />
            </Link>
          </section>
        </div>

        <section className={styles["overview-queue-card"]}>
          <div className={styles["overview-card-head"]}>
            <div className={styles["overview-card-title"]}>Что разобрать первым</div>
            <span className={styles["overview-card-note"]}>Приоритет планировщика</span>
          </div>
          {hasReviewQueue ? (
            <div className={styles["overview-queue"]}>
              {overviewQueueItems.map((item, index) => (
                <button className={styles["overview-queue-row"]} key={item.key} onClick={item.onOpen} type="button">
                  <span className={styles["overview-queue-index"]}>{index + 1}</span>
                  <span className={styles["overview-queue-main"]}>
                    <strong title={item.title}>{item.title}</strong>
                    <small title={item.detail}>{item.detail}</small>
                  </span>
                  <Badge label={item.badge} tone={item.tone} />
                  <ArrowRightIcon className={styles["overview-arrow"]} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyBlock
              description="Когда появятся повторные ошибки, слабые кейсы или незавершенные станции, они будут собраны здесь."
              title="Очередь разбора пока пустая"
            />
          )}
        </section>

      </div>
    );
  }

  function renderTestsPane(track: ReadinessTrack | null) {
    if (!state || !track) {
      return null;
    }

    const currentTopic = selectedTestTopic;
    const visibleQuestionCount = currentTopic
      ? Math.min(
          Math.max(currentTopic.answered_questions, currentTopic.test_incorrect_answers, selectedTestTopicErrors.length),
          24,
        )
      : 0;
    const incorrectAnswers = currentTopic ? Math.max(0, currentTopic.answered_questions - currentTopic.correct_answers) : 0;

    return (
      <div className={styles.pane}>
        <div className={styles["tests-layout"]}>
          <section className={styles["tests-card"]}>
            <div className={styles["tests-card-head"]}>
              <span className={styles["tests-card-title-stack"]}>
                <strong>Темы в фокусе</strong>
                <small>учебные тесты</small>
              </span>
            </div>
            <div className={styles["tests-topic-list"]}>
              {testFocusTopics.length > 0 ? (
                visibleTestTopics.map((topic) => {
                  const tone = topicRiskTone(topic);
                  const isSelected = currentTopic?.topic_id === topic.topic_id;
                  const topicProgressWidth =
                    topic.accuracy_percent > 0 ? Math.max(4, Math.min(100, topic.accuracy_percent)) : 0;

                  return (
                    <button
                      className={cx(styles["tests-topic-row"], isSelected && styles.selected)}
                      data-tone={tone}
                      key={topic.topic_id}
                      onClick={() => setSelectedTestTopicId(topic.topic_id)}
                      type="button"
                    >
                      <span className={styles["tests-topic-copy"]}>
                        <strong title={topic.topic_name}>{topic.topic_name}</strong>
                        <small title={buildTopicCaption(topic)}>
                          {topic.test_incorrect_answers} {pluralRu(topic.test_incorrect_answers, ["ошибка", "ошибки", "ошибок"])}
                        </small>
                      </span>
                      <span className={styles["tests-topic-progress"]}>
                        <i style={{ width: `${topicProgressWidth}%` }} />
                      </span>
                      <span className={styles["tests-topic-score"]}>{Math.round(topic.accuracy_percent)}%</span>
                      <span className={styles["tests-topic-dot"]} />
                    </button>
                  );
                })
              ) : (
                <EmptyBlock
                  description="Темы появятся после первых тестовых ответов."
                  title="Пока нет тестовых сигналов"
                />
              )}
            </div>
            {testFocusTopics.length > 5 ? (
              <button className={styles["tests-all-topics"]} onClick={() => setShowAllTestTopics((current) => !current)} type="button">
                {showAllTestTopics ? "Свернуть темы" : "Все темы"} <ArrowRightIcon />
              </button>
            ) : null}
            {renderTopicRiskLegend()}
          </section>

          <section className={cx(styles["tests-card"], styles["tests-question-card"])}>
            <div className={styles["tests-card-head"]}>
              <span className={styles["tests-card-title-stack"]}>
                <strong>Вопросы выбранной темы</strong>
                <small title={currentTopic ? currentTopic.topic_name : undefined}>
                  {currentTopic ? currentTopic.topic_name : "выберите тему слева"}
                </small>
              </span>
            </div>
            {currentTopic ? (
              <>
                <div className={styles["tests-stats-strip"]}>
                  <span>
                    <small>В выборке</small>
                    <strong>{currentTopic.answered_questions || visibleQuestionCount}</strong>
                  </span>
                  <span data-tone={incorrectAnswers > 0 ? "accent" : "green"}>
                    <small>Ошибок</small>
                    <strong>{incorrectAnswers}</strong>
                  </span>
                  <span>
                    <small>Зачёт / освоение</small>
                    <strong>70/85%</strong>
                  </span>
                </div>

                <div className={styles["tests-question-grid"]}>
                  {Array.from({ length: visibleQuestionCount }, (_, index) => {
                    const errorItem = selectedTestTopicErrors[index] ?? null;
                    const tone = questionTone(index, currentTopic, selectedTestTopicErrors);

                    return (
                      <button
                        className={styles["tests-question-dot"]}
                        data-tone={tone}
                        disabled={selectedTestTopicLoading && !errorItem}
                        key={`${currentTopic.topic_id}-${index}`}
                        onClick={() => {
                          if (errorItem) {
                            setModal({ kind: "test-question", topic: currentTopic, error: errorItem, index: index + 1 });
                          }
                        }}
                        style={{ "--dot-delay": `${index * 24}ms` } as CSSProperties}
                        type="button"
                      >
                        {index + 1}
                      </button>
                    );
                  })}
                </div>

                <div className={styles["tests-question-legend"]}>
                  <span><i data-tone="error" /> Ошибка</span>
                  <span><i data-tone="risk" /> Сложно / риск</span>
                </div>

              </>
            ) : (
              <EmptyBlock
                description="После тестовых ответов здесь появится карта вопросов по выбранной теме."
                title="Тема пока не выбрана"
              />
            )}
          </section>

          <aside className={styles["tests-side"]}>
            <section className={styles["tests-card"]}>
              <div className={styles["tests-card-head"]}>
                <span className={styles["tests-card-title-stack"]}>
                  <strong>Повторы по всем тестам</strong>
                  <small>учебные тесты, ошибка 2+ раза</small>
                </span>
              </div>
              <div className={styles["tests-error-list"]}>
                {repeatingErrorGroups.length > 0 ? (
                  visibleRepeatingErrorGroups.map((group) => (
                    <button
                      key={group.key}
                      onClick={() => openRepeatingErrorGroup(group)}
                      type="button"
                    >
                      <span title={group.title}>{group.title}</span>
                      <strong>
                        {group.totalIncorrectAnswers} {pluralRu(group.totalIncorrectAnswers, ["повтор", "повтора", "повторов"])}
                      </strong>
                      <ArrowRightIcon />
                    </button>
                  ))
                ) : (
                  <div className={styles.inlineNote}>Повторяющихся ошибок пока нет.</div>
                )}
              </div>
              {repeatingErrorGroups.length > 5 ? (
                <button className={styles["tests-wide-button"]} onClick={() => setShowAllRepeatingErrors((current) => !current)} type="button">
                  {showAllRepeatingErrors ? "Свернуть повторы" : "Все повторы"} <ArrowRightIcon />
                </button>
              ) : null}
            </section>
          </aside>
        </div>
      </div>
    );
  }

  function renderCasesPane() {
    if (!state) {
      return null;
    }

    const currentCaseTopic = selectedCaseTopic;
    const currentCaseItems = attemptedCaseItems;
    const visibleCaseItems = visibleAttemptedCaseItems;
    const currentTopicCaseCount = currentCaseItems.length;

    return (
      <div className={styles.pane}>
        <div className={styles["stage-detail-layout"]}>
          <section className={styles["tests-card"]}>
            <div className={styles["tests-card-head"]}>
              <span className={styles["tests-card-title-stack"]}>
                <strong>Темы в фокусе</strong>
                <small>{focusedCaseTopics.length > 0 ? "кейсы ниже 80% сверху" : "темы с попытками"}</small>
              </span>
            </div>

            <div className={styles["stage-focus-list"]}>
              {caseReviewTopics.length === 0 ? (
                <EmptyBlock
                  action={
                    <Link className={cx(styles.linkButton, styles.linkButtonPrimary)} to="/app/cases">
                      Открыть кейсы
                    </Link>
                  }
                  description="После прохождения кейсов здесь появятся темы и разборы попыток."
                  title="Пройденных кейсов пока нет"
                />
              ) : (
                visibleCaseTopics.map((group) => {
                  const isSelected = currentCaseTopic?.key === group.key;

                  return (
                    <button
                      className={cx(styles["stage-focus-row"], isSelected && styles.selected)}
                      data-tone={caseTopicTone(group)}
                      key={group.key}
                      onClick={() => {
                        setSelectedCaseTopicKey(group.key);
                      }}
                      type="button"
                    >
                      <span className={styles["stage-focus-copy"]}>
                        <strong title={group.topicName}>{group.topicName}</strong>
                        <small title={buildCaseTopicCaption(group)}>{buildCaseTopicCaption(group)}</small>
                      </span>
                      <span className={styles["tests-topic-progress"]}>
                        <i style={{ width: `${Math.max(4, Math.min(100, group.worstAccuracy ?? 0))}%` }} />
                      </span>
                      <span
                        aria-label={
                          group.worstAccuracy !== null
                            ? `Минимальное значение по попыткам темы: ${Math.round(group.worstAccuracy)}%`
                            : "Нет данных по точности"
                        }
                        className={styles["stage-focus-score"]}
                        title={group.worstAccuracy !== null ? "Минимальное значение по попыткам темы" : undefined}
                      >
                        {group.worstAccuracy !== null ? `${Math.round(group.worstAccuracy)}%` : "—"}
                      </span>
                      <span className={styles["tests-topic-dot"]} />
                    </button>
                  );
                })
              )}
            </div>

            {caseReviewTopics.length > 5 ? (
              <button className={styles["tests-all-topics"]} onClick={() => setShowAllCaseTopics((current) => !current)} type="button">
                {showAllCaseTopics ? "Свернуть темы" : "Все темы"} <ArrowRightIcon />
              </button>
            ) : null}
            {renderTopicRiskLegend()}
          </section>

          <section className={cx(styles["tests-card"], styles["tests-question-card"])}>
            <div className={styles["tests-card-head"]}>
              <span className={styles["tests-card-title-stack"]}>
                <strong>Пройденные кейсы</strong>
                <small>
                  {currentCaseTopic
                    ? `${currentTopicCaseCount} ${pluralRu(currentTopicCaseCount, ["кейс", "кейса", "кейсов"])} · ${currentCaseTopic.attemptsCount} ${pluralRu(currentCaseTopic.attemptsCount, ["попытка", "попытки", "попыток"])}`
                    : "выберите тему слева"}
                </small>
              </span>
            </div>

            {currentCaseTopic && currentCaseItems.length > 0 ? (
              <div className={styles.caseWorkspace}>
                <div className={styles.caseRoster}>
                  <div className={styles.caseRosterHead}>
                    <span title={currentCaseTopic.topicName}>{currentCaseTopic.topicName}</span>
                    <strong>{currentTopicCaseCount}</strong>
                  </div>
                  <div className={styles.caseRosterList}>
                    {visibleCaseItems.map((item) => {
                      const attempt = item.selectedAttempt;

                      if (!attempt) {
                        return null;
                      }

                      const incorrectAnswers = Math.max(0, attempt.answered_questions - attempt.correct_answers);

                      return (
                        <button
                          className={styles.caseRosterRow}
                          data-tone={caseDrilldownTone(item)}
                          key={attempt.id}
                          onClick={() => setModal({ kind: "case", attempt })}
                          type="button"
                        >
                          <span className={styles.caseRosterCopy}>
                            <strong title={item.title}>{item.title}</strong>
                            <small title={`${buildCaseDrilldownCaption(item)} · ${incorrectAnswers} ${pluralRu(incorrectAnswers, ["ошибка", "ошибки", "ошибок"])}`}>
                              {buildCaseDrilldownCaption(item)} · {incorrectAnswers}{" "}
                              {pluralRu(incorrectAnswers, ["ошибка", "ошибки", "ошибок"])}
                            </small>
                          </span>
                          <span
                            className={styles.caseRosterScore}
                            title="Показана самая слабая попытка по этому кейсу. Если точность одинаковая, выбрана более новая."
                          >
                            {percentage(attempt.accuracy_percent)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {currentCaseItems.length > 5 ? (
                  <button className={styles["tests-wide-button"]} onClick={() => setShowAllCasesInTopic((current) => !current)} type="button">
                    {showAllCasesInTopic ? "Свернуть кейсы" : "Все кейсы"} <ArrowRightIcon />
                  </button>
                ) : null}
              </div>
            ) : currentCaseTopic ? (
              <EmptyBlock
                description="В этой теме пока нет пройденных кейсов."
                title="Нет попыток по теме"
              />
            ) : (
              <EmptyBlock
                description="После прохождения кейса здесь появится список попыток для разбора."
                title="Тема пока не выбрана"
              />
            )}
          </section>

          <aside className={styles["tests-side"]}>
            <section className={styles["tests-card"]}>
              <div className={styles["tests-card-head"]}>
                <span className={styles["tests-card-title-stack"]}>
                  <strong>Повторы по кейсам</strong>
                  <small>кейсы с ошибочными ответами</small>
                </span>
              </div>
              <div className={styles["tests-error-list"]}>
                {caseRepeatGroups.length > 0 ? (
                  visibleCaseRepeatGroups.map((group) => (
                    <button
                      key={group.key}
                      onClick={() => setModal({ kind: "case", attempt: group.selectedAttempt })}
                      type="button"
                    >
                      <span title={group.title}>{group.title}</span>
                      <strong>
                        {group.totalRepeats} {pluralRu(group.totalRepeats, ["повтор", "повтора", "повторов"])}
                      </strong>
                      <ArrowRightIcon />
                    </button>
                  ))
                ) : (
                  <div className={styles.inlineNote}>Повторов по кейсам пока нет.</div>
                )}
              </div>
              {caseRepeatGroups.length > 5 ? (
                <button className={styles["tests-wide-button"]} onClick={() => setShowAllCaseRepeats((current) => !current)} type="button">
                  {showAllCaseRepeats ? "Свернуть повторы" : "Все повторы"} <ArrowRightIcon />
                </button>
              ) : null}
            </section>
          </aside>
        </div>
      </div>
    );
  }

  function renderOscePane() {
    if (!state) {
      return null;
    }

    const currentOsceTopic = selectedOsceTopic;
    const currentStations = attemptedOsceStations;
    const visibleStations = visibleAttemptedOsceStations;
    const currentStationsCount = currentStations.length;

    return (
      <div className={styles.pane}>
        <div className={styles["stage-detail-layout"]}>
          <section className={styles["tests-card"]}>
            <div className={styles["tests-card-head"]}>
              <span className={styles["tests-card-title-stack"]}>
                <strong>Темы в фокусе</strong>
                <small>{osceAttentionTopics.length > 0 ? "станции требуют внимания" : "темы с попытками"}</small>
              </span>
            </div>

            <div className={styles["stage-focus-list"]}>
              {osceReviewTopics.length === 0 ? (
                <EmptyBlock
                  action={
                    <Link className={cx(styles.linkButton, styles.linkButtonPrimary)} to="/app/osce">
                      Открыть ОСКЭ
                    </Link>
                  }
                  description="После прохождения станций здесь появятся темы и разборы попыток."
                  title="Пройденных станций пока нет"
                />
              ) : (
                visibleOsceTopics.map((group) => {
                  const isSelected = currentOsceTopic?.key === group.key;

                  return (
                    <button
                      className={cx(styles["stage-focus-row"], isSelected && styles.selected)}
                      data-tone={osceTopicTone(group)}
                      key={group.key}
                      onClick={() => setSelectedOsceTopicKey(group.key)}
                      type="button"
                    >
                      <span className={styles["stage-focus-copy"]}>
                        <strong title={group.topicName}>{group.topicName}</strong>
                        <small title={buildOsceTopicCaption(group)}>{buildOsceTopicCaption(group)}</small>
                      </span>
                      <span className={styles["tests-topic-progress"]}>
                        <i style={{ width: `${Math.max(4, Math.min(100, group.focusScorePercent ?? 0))}%` }} />
                      </span>
                      <span className={styles["stage-focus-score"]}>
                        {group.focusScorePercent !== null ? `${Math.round(group.focusScorePercent)}%` : "—"}
                      </span>
                      <span className={styles["tests-topic-dot"]} />
                    </button>
                  );
                })
              )}
            </div>

            {osceReviewTopics.length > 5 ? (
              <button className={styles["tests-all-topics"]} onClick={() => setShowAllOsceTopics((current) => !current)} type="button">
                {showAllOsceTopics ? "Свернуть темы" : "Все темы"} <ArrowRightIcon />
              </button>
            ) : null}
            {renderTopicRiskLegend()}
          </section>

          <section className={cx(styles["tests-card"], styles["tests-question-card"])}>
            <div className={styles["tests-card-head"]}>
              <span className={styles["tests-card-title-stack"]}>
                <strong>Пройденные станции</strong>
                <small>
                  {currentOsceTopic
                    ? `${currentStationsCount} ${pluralRu(currentStationsCount, ["станция", "станции", "станций"])} · ${currentOsceTopic.attemptsCount} ${pluralRu(currentOsceTopic.attemptsCount, ["попытка", "попытки", "попыток"])}`
                    : "выберите тему слева"}
                </small>
              </span>
            </div>

            {currentOsceTopic && currentStations.length > 0 ? (
              <div className={styles.caseWorkspace}>
                <div className={styles.caseRoster}>
                  <div className={styles.caseRosterHead}>
                    <span title={currentOsceTopic.topicName}>{currentOsceTopic.topicName}</span>
                    <strong>{currentStationsCount}</strong>
                  </div>
                  <div className={styles.caseRosterList}>
                    {visibleStations.map((station) => (
                      <button
                        className={styles.caseRosterRow}
                        data-tone={osceTone(station.status)}
                        key={station.slug}
                        onClick={() => setModal({ kind: "osce", station })}
                        type="button"
                      >
                        <span className={styles.caseRosterCopy}>
                          <strong title={station.title}>{station.title}</strong>
                          <small title={buildOsceStationCaption(station)}>{buildOsceStationCaption(station)}</small>
                        </span>
                        <span className={styles.caseRosterScore}>
                          {station.best_score_percent !== null ? percentage(station.best_score_percent) : "—"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                {currentStations.length > 5 ? (
                  <button className={styles["tests-wide-button"]} onClick={() => setShowAllOsceStations((current) => !current)} type="button">
                    {showAllOsceStations ? "Свернуть станции" : "Все станции"} <ArrowRightIcon />
                  </button>
                ) : null}
              </div>
            ) : currentOsceTopic ? (
              <EmptyBlock
                description="В этой теме пока нет пройденных станций."
                title="Нет попыток по теме"
              />
            ) : (
              <EmptyBlock
                description="После прохождения станции здесь появится список попыток для разбора."
                title="Тема пока не выбрана"
              />
            )}
          </section>

          <aside className={styles["tests-side"]}>
            <section className={styles["tests-card"]}>
              <div className={styles["tests-card-head"]}>
                <span className={styles["tests-card-title-stack"]}>
                  <strong>Повторы по ОСКЭ</strong>
                  <small>станции, которые требуют внимания</small>
                </span>
              </div>
              <div className={styles["tests-error-list"]}>
                {osceRepeatGroups.length > 0 ? (
                  visibleOsceRepeatGroups.map((group) => (
                    <button
                      key={group.key}
                      onClick={() => setModal({ kind: "osce", station: group.selectedStation })}
                      type="button"
                    >
                      <span title={group.title}>{group.title}</span>
                      <strong>
                        {group.totalRepeats} {pluralRu(group.totalRepeats, ["повтор", "повтора", "повторов"])}
                      </strong>
                      <ArrowRightIcon />
                    </button>
                  ))
                ) : (
                  <div className={styles.inlineNote}>Повторов по ОСКЭ пока нет.</div>
                )}
              </div>
              {osceRepeatGroups.length > 5 ? (
                <button className={styles["tests-wide-button"]} onClick={() => setShowAllOsceRepeats((current) => !current)} type="button">
                  {showAllOsceRepeats ? "Свернуть повторы" : "Все повторы"} <ArrowRightIcon />
                </button>
              ) : null}
            </section>
          </aside>
        </div>
      </div>
    );
  }

  function renderProtocolTestReview() {
    const loadedTopicCount = protocolTestReviewTopics.filter((topic) => topicErrorsByTopicId[topic.topic_id]).length;
    const isStillLoading = protocolTestErrorsLoading && loadedTopicCount < protocolTestReviewTopics.length;

    return (
      <div className={styles.protocolReviewPanel}>
        <div className={styles.protocolReviewHead}>
          <div>
            <div className={styles.protocolReviewTitle}>Ошибки тестового этапа</div>
            <div className={styles.protocolReviewMeta}>
              {protocolTestReviewTopics.length > 0
                ? `Проверены темы: ${loadedTopicCount}/${protocolTestReviewTopics.length}`
                : "Ошибки появятся после тестовых попыток"}
            </div>
          </div>
          {protocolTestErrorItems.length > 0 ? (
            <Badge
              label={`${protocolTestErrorItems.length} ${pluralRu(protocolTestErrorItems.length, ["вопрос", "вопроса", "вопросов"])}`}
              tone="accent"
            />
          ) : null}
        </div>

        {isStillLoading ? <div className={styles.inlineNote}>Загружаем вопросы, ответы и пояснения...</div> : null}
        {protocolTestErrorsError ? <div className={styles.inlineNote}>{protocolTestErrorsError}</div> : null}

        {!isStillLoading && !protocolTestErrorsError && protocolTestReviewTopics.length === 0 ? (
          <EmptyBlock
            description="Когда в тестовом этапе появятся ошибки, здесь будет список вопросов с вашим ответом, правильным ответом и пояснением."
            title="Ошибок для разбора пока нет"
          />
        ) : null}

        {!isStillLoading && !protocolTestErrorsError && protocolTestReviewTopics.length > 0 && protocolTestErrorItems.length === 0 ? (
          <div className={styles.inlineNote}>По выбранным темам нет сохраненных ошибок с подробным разбором.</div>
        ) : null}

        {protocolTestErrorItems.length > 0 ? (
          <div className={styles.protocolErrorList}>
            {protocolTestErrorItems.map(({ topic, error: errorItem }) => {
              const itemTone = repeatingErrorTone(errorItem.incorrect_answers, errorItem.accuracy_percent);
              const isExpanded = expandedProtocolErrorId === errorItem.question_id;

              return (
                <div className={styles.topicErrorItem} data-tone={itemTone} key={`${topic.topic_id}-${errorItem.question_id}`}>
                  <button
                    className={styles.topicErrorToggle}
                    onClick={() =>
                      setExpandedProtocolErrorId((currentValue) =>
                        currentValue === errorItem.question_id ? null : errorItem.question_id,
                      )
                    }
                    type="button"
                  >
                    <div className={styles.topicErrorToggleMain}>
                      <div className={styles.topicErrorQuestionPreview} title={errorItem.question_text}>{errorItem.question_text}</div>
                      <div className={styles.topicErrorToggleMeta}>
                        <span title={topic.topic_name}>{topic.topic_name}</span>
                        <span>{difficultyLabel(errorItem.difficulty)}</span>
                        <span>{errorItem.incorrect_answers} {pluralRu(errorItem.incorrect_answers, ["ошибка", "ошибки", "ошибок"])}</span>
                      </div>
                    </div>
                    <div className={styles.topicErrorToggleSide}>
                      <span className={styles.topicErrorToggleArrow} data-open={isExpanded}>
                        ⌄
                      </span>
                    </div>
                  </button>

                  {isExpanded ? (
                    <div className={styles.topicErrorDetails}>
                      <div className={styles.topicErrorPromptBlock}>
                        <div className={styles.topicErrorPromptLabel}>Вопрос</div>
                        <div className={styles.topicErrorPrompt}>{errorItem.question_text}</div>
                      </div>

                      <div className={styles.protocolAnswerOptions}>
                        {errorItem.answer_options.map((option) => {
                          const isCorrect = option.label === errorItem.correct_option_label;
                          const isSelected = option.label === errorItem.last_selected_option_label;

                          return (
                            <div
                              className={styles.protocolAnswerOption}
                              data-state={isCorrect ? "correct" : isSelected ? "selected" : "default"}
                              key={`${errorItem.question_id}-${option.label}`}
                            >
                              <strong>{option.label}</strong>
                              <span>{option.text}</span>
                              {isCorrect ? <em>Правильный ответ</em> : isSelected ? <em>Ваш ответ</em> : null}
                            </div>
                          );
                        })}
                      </div>

                      <div className={styles.topicErrorAnswerGrid}>
                        <div className={styles.topicErrorAnswerCard} data-tone="accent">
                          <div className={styles.topicErrorAnswerLabel}>Ваш последний ответ</div>
                          <div className={cx(styles.topicErrorAnswerValue, styles.statValueDim)}>
                            {errorItem.last_selected_option_label && errorItem.last_selected_option_text
                              ? `${errorItem.last_selected_option_label}. ${errorItem.last_selected_option_text}`
                              : "Нет данных"}
                          </div>
                        </div>
                        <div className={styles.topicErrorAnswerCard} data-tone="green">
                          <div className={styles.topicErrorAnswerLabel}>Правильный ответ</div>
                          <div className={styles.topicErrorAnswerValue}>
                            {errorItem.correct_option_label && errorItem.correct_option_text
                              ? `${errorItem.correct_option_label}. ${errorItem.correct_option_text}`
                              : "Не указан"}
                          </div>
                        </div>
                      </div>

                      <div className={styles.topicErrorExplanation}>
                        <div className={styles.topicErrorExplanationLabel}>Пояснение</div>
                        <p>{errorItem.explanation ?? "Пояснение к этому вопросу пока не добавлено."}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {repeatTopicErrorsError ? <div className={styles.inlineNote}>{repeatTopicErrorsError}</div> : null}

        <div className={styles.protocolReviewActions}>
          <button
            className={cx(styles.linkButton, styles.linkButtonPrimary)}
            disabled={protocolTestErrorItems.length === 0 || repeatTopicErrorsPending}
            onClick={() => void handleRepeatProtocolTestErrors(protocolTestErrorItems.map((item) => item.error))}
            type="button"
          >
            {repeatTopicErrorsPending ? "Собираем сессию..." : "Повторить ошибки"}
          </button>
          <button
            className={styles.linkButton}
            onClick={() => {
              setModal(null);
              handleTabChange("tests");
            }}
            type="button"
          >
            Открыть тесты
          </button>
        </div>
      </div>
    );
  }

  function renderProtocolLinkedReview(stage: ExamStageProtocol) {
    if (stage.key === "tests") {
      return renderProtocolTestReview();
    }

    if (stage.key === "cases") {
      return (
        <div className={styles.protocolReviewPanel}>
          <div className={styles.protocolReviewHead}>
            <div>
              <div className={styles.protocolReviewTitle}>Кейсы с ошибками</div>
              <div className={styles.protocolReviewMeta}>Откройте попытку, чтобы увидеть выбранные и правильные ответы.</div>
            </div>
          </div>
          {protocolCaseReviewAttempts.length > 0 ? (
            <div className={styles.protocolReviewRows}>
              {protocolCaseReviewAttempts.map((attempt) => {
                const incorrectAnswers = Math.max(0, attempt.answered_questions - attempt.correct_answers);

                return (
                  <button
                    className={styles.protocolReviewRow}
                    key={attempt.id}
                    onClick={() => setModal({ kind: "case", attempt })}
                    type="button"
                  >
                    <span>
                      <strong title={attempt.case_title}>{attempt.case_title}</strong>
                      <small title={`${attempt.topic_name ?? "Без темы"} · ${incorrectAnswers} ${pluralRu(incorrectAnswers, ["ошибка", "ошибки", "ошибок"])}`}>
                        {attempt.topic_name ?? "Без темы"} · {incorrectAnswers} {pluralRu(incorrectAnswers, ["ошибка", "ошибки", "ошибок"])}
                      </small>
                    </span>
                    <Badge label={percentage(attempt.accuracy_percent)} tone={caseTone(attempt.accuracy_percent)} />
                    <ArrowRightIcon />
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyBlock
              description="После кейсовых попыток с ошибками здесь появится быстрый переход к разбору."
              title="Кейсовых ошибок пока нет"
            />
          )}
        </div>
      );
    }

    if (stage.key === "osce") {
      return (
        <div className={styles.protocolReviewPanel}>
          <div className={styles.protocolReviewHead}>
            <div>
              <div className={styles.protocolReviewTitle}>ОСКЭ-станции для разбора</div>
              <div className={styles.protocolReviewMeta}>Откройте станцию, чтобы увидеть пропущенные чек-листы и ошибки в вопросах.</div>
            </div>
          </div>
          {protocolOsceReviewStations.length > 0 ? (
            <div className={styles.protocolReviewRows}>
              {protocolOsceReviewStations.map((station) => (
                <button
                  className={styles.protocolReviewRow}
                  key={station.slug}
                  onClick={() => setModal({ kind: "osce", station })}
                  type="button"
                >
                  <span>
                    <strong title={station.title}>{station.title}</strong>
                    <small title={`${station.topic_name} · ${station.attempts_count} ${pluralRu(station.attempts_count, ["попытка", "попытки", "попыток"])}`}>
                      {station.topic_name} · {station.attempts_count} {pluralRu(station.attempts_count, ["попытка", "попытки", "попыток"])}
                    </small>
                  </span>
                  <Badge label={osceLabel(station.status)} tone={osceTone(station.status)} />
                  <ArrowRightIcon />
                </button>
              ))}
            </div>
          ) : (
            <EmptyBlock
              description="После ОСКЭ-попыток с ошибками здесь появится быстрый переход к разбору."
              title="ОСКЭ-ошибок пока нет"
            />
          )}
        </div>
      );
    }

    return null;
  }

  function renderModalContent(currentModal: ModalState): {
    stripeColor: string;
    badge: ReactNode;
    title: string;
    body: ReactNode;
    smallTitle?: boolean;
    wide?: boolean;
  } {
    if (currentModal.kind === "overview-readiness") {
      const readiness = state?.readiness;
      const tracks = readiness?.tracks ?? [];
      const focusTrack = readiness
        ? tracks.find((track) => track.key === readiness.recommended_focus_key) ?? tracks[0] ?? null
        : null;

      return {
        stripeColor: "var(--accent)",
        badge: <Badge label="Обзор" tone="accent" />,
        title: "Учебная готовность по этапам",
        wide: true,
        body: (
          <>
            <div className={styles["overview-modal-summary"]}>
              <ProgressRing
                centerLabel="учебный индекс"
                centerValue={readiness ? percentage(readiness.overall_readiness_percent) : "0%"}
                color="var(--accent)"
                size={92}
                value={readiness?.overall_readiness_percent ?? 0}
              />
              <div>
                <div className={styles["overview-modal-kicker"]}>Главный фокус</div>
                <div className={styles["overview-modal-title"]}>{focusTrack ? trackShortLabel(focusTrack) : "Нет данных"}</div>
                <p>{focusTrack?.detail ?? "Аналитика появится после первых учебных действий."}</p>
              </div>
            </div>
            <div className={styles["overview-modal-bars"]}>
              {tracks.map((track) => (
                <ModalBar color={trackColor(track)} key={track.key} label={track.label} value={track.readiness_percent} />
              ))}
            </div>
            <div className={styles.modalActions}>
              {focusTrack ? (
                <button
                  className={cx(styles.linkButton, styles.linkButtonPrimary)}
                  onClick={() => {
                    setModal(null);
                    handleTabChange(trackTab(focusTrack));
                  }}
                  type="button"
                >
                  Открыть раздел
                </button>
              ) : null}
              <button className={styles.linkButton} onClick={() => setModal(null)} type="button">
                Закрыть
              </button>
            </div>
          </>
        ),
      };
    }

    if (currentModal.kind === "overview-deficit") {
      const { metric, track } = currentModal;
      const value = metricValue(track, metric);
      const tone = deficitTone(value);
      const color = tone === "critical" ? "var(--accent)" : tone === "risk" ? "var(--gold)" : "var(--ink-40)";

      return {
        stripeColor: color,
        badge: <Badge label={deficitToneLabel(tone)} tone={tone === "critical" ? "accent" : tone === "risk" ? "warm" : "default"} />,
        title: `${metric.modalLabel} - ${trackShortLabel(track)}`,
        wide: true,
        body: (
          <>
            <div className={styles["overview-modal-summary"]}>
              <ProgressRing
                centerLabel={metric.label}
                centerValue={percentage(value)}
                color={color}
                size={92}
                value={value}
              />
              <div>
                <div className={styles["overview-modal-kicker"]}>Что означает показатель</div>
                <div className={styles["overview-modal-title"]}>{metric.modalLabel}</div>
                <p>{metric.description}</p>
              </div>
            </div>
            <div className={styles["overview-modal-split"]}>
              <div>
                <strong>Сигнал</strong>
                <span>{trackShortLabel(track)}: {percentage(value)}</span>
              </div>
              <div>
                <strong>Статус</strong>
                <span>{deficitToneLabel(tone)}</span>
              </div>
              <div>
                <strong>Действие</strong>
                <span>{metric.action}</span>
              </div>
            </div>
            <div className={styles["deficit-guide-note"]}>
              <strong>{track.label}</strong>
              <span>{track.detail}</span>
            </div>
            <div className={styles.modalActions}>
              <button
                className={cx(styles.linkButton, styles.linkButtonPrimary)}
                onClick={() => {
                  setModal(null);
                  handleTabChange(trackTab(track));
                }}
                type="button"
              >
                Перейти к разделу
              </button>
              <button className={styles.linkButton} onClick={() => setModal(null)} type="button">
                Закрыть
              </button>
            </div>
          </>
        ),
      };
    }

    if (currentModal.kind === "overview-protocol") {
      const { stage } = currentModal;
      const tone = protocolTone(stage.status);

      return {
        stripeColor: toneColor(tone),
        badge: <Badge label={stage.status_label} tone={tone} />,
        title: stage.label,
        wide: true,
        body: (
          <>
            <div className={styles["protocol-modal-grid"]}>
              <div>
                <span>Требование этапа</span>
                <strong>{stage.requirement_label}</strong>
              </div>
              <div>
                <span>Ваш результат</span>
                <strong>{stage.result_label}</strong>
              </div>
              <div>
                <span>Что нужно сделать</span>
                <strong>{stage.detail}</strong>
              </div>
            </div>
            {renderProtocolLinkedReview(stage)}
            <div className={styles.modalActions}>
              <button
                className={cx(styles.linkButton, styles.linkButtonPrimary)}
                onClick={() => {
                  setModal(null);
                  handleTabChange(stage.key === "cases" ? "cases" : stage.key === "osce" ? "osce" : "tests");
                }}
                type="button"
              >
                Перейти к этапу
              </button>
              <button className={styles.linkButton} onClick={() => setModal(null)} type="button">
                Закрыть
              </button>
            </div>
          </>
        ),
      };
    }

    if (currentModal.kind === "test-question") {
      const { topic, error: errorItem, index } = currentModal;
      const tone = repeatingErrorTone(errorItem.incorrect_answers, errorItem.accuracy_percent);
      const color = toneColor(tone);

      return {
        stripeColor: color,
        badge: <Badge label={errorItem.incorrect_answers > 1 ? "Повторная ошибка" : "Ошибка"} tone={tone} />,
        title: `Разбор вопроса ${index}`,
        wide: true,
        body: (
          <>
            <div className={styles["test-question-modal-meta"]}>
              <div>
                <span>Ваш ответ</span>
                <strong data-tone="accent">
                  {errorItem.last_selected_option_label ?? "Нет"}
                </strong>
              </div>
              <div>
                <span>Правильный ответ</span>
                <strong data-tone="green">
                  {errorItem.correct_option_label ?? "Не указан"}
                </strong>
              </div>
              <div>
                <span>Ваш результат</span>
                <strong data-tone="accent">{percentage(errorItem.accuracy_percent)}</strong>
              </div>
            </div>
            <div className={styles["test-question-modal-body"]}>
              <div>
                <div className={styles.reviewSectionTitle}>Вопрос</div>
                <p>{errorItem.question_text}</p>
              </div>
              <div>
                <div className={styles.reviewSectionTitle}>Пояснение</div>
                <p>{errorItem.explanation ?? "Пояснение к этому вопросу пока не добавлено."}</p>
              </div>
            </div>
            <div className={styles["test-question-answer-grid"]}>
              <div data-tone="accent">
                <span>Последний выбранный ответ</span>
                <strong>
                  {errorItem.last_selected_option_label && errorItem.last_selected_option_text
                    ? `${errorItem.last_selected_option_label}. ${errorItem.last_selected_option_text}`
                    : "Нет данных"}
                </strong>
              </div>
              <div data-tone="green">
                <span>Правильный ответ</span>
                <strong>
                  {errorItem.correct_option_label && errorItem.correct_option_text
                    ? `${errorItem.correct_option_label}. ${errorItem.correct_option_text}`
                    : "Не указан"}
                </strong>
              </div>
            </div>
            <div className={styles.modalActions}>
              <button
                className={cx(styles.linkButton, styles.linkButtonPrimary)}
                disabled={repeatTopicErrorsPending}
                onClick={() => void handleRepeatErrorsForTopic(topic, [errorItem])}
                type="button"
              >
                {repeatTopicErrorsPending ? "Собираем..." : "Повторить вопрос"}
              </button>
              <button className={styles.linkButton} onClick={() => setModal(null)} type="button">
                Закрыть
              </button>
            </div>
          </>
        ),
      };
    }

    if (currentModal.kind === "repeating-error-group") {
      const { group } = currentModal;
      const firstError = group.errors[0] ?? null;
      const weakestAccuracy = group.errors.reduce(
        (minimum, errorItem) => Math.min(minimum, errorItem.accuracy_percent),
        firstError?.accuracy_percent ?? 100,
      );
      const tone = repeatingErrorTone(group.totalIncorrectAnswers, weakestAccuracy);
      const color = toneColor(tone);
      const topic = group.topicId !== null ? state?.topics.find((item) => item.topic_id === group.topicId) ?? null : null;

      return {
        stripeColor: color,
        badge: (
          <Badge
            label={`${group.errors.length} ${pluralRu(group.errors.length, ["вопрос", "вопроса", "вопросов"])}`}
            tone={tone}
          />
        ),
        title: group.title,
        smallTitle: true,
        wide: true,
        body: (
          <>
            <div className={styles.protocolReviewPanel}>
              <div className={styles.protocolReviewHead}>
                <div>
                  <div className={styles.protocolReviewTitle}>Повторяющиеся ошибки</div>
                  <div className={styles.protocolReviewMeta}>
                    Внутри темы показаны вопросы, где ошибка повторялась чаще всего.
                  </div>
                </div>
                <Badge
                  label={`${group.totalIncorrectAnswers} ${pluralRu(group.totalIncorrectAnswers, ["повтор", "повтора", "повторов"])}`}
                  tone={tone}
                />
              </div>
              <div className={styles.protocolReviewRows}>
                {group.errors.map((errorItem) => {
                  const errorTone = repeatingErrorTone(errorItem.incorrect_answers, errorItem.accuracy_percent);

                  return (
                    <button
                      className={styles.protocolReviewRow}
                      key={errorItem.question_id}
                      onClick={() => setModal({ kind: "error", error: errorItem })}
                    type="button"
                  >
                    <span>
                      <strong title={errorItem.question_preview}>{errorItem.question_preview}</strong>
                      <small title={`${errorItem.incorrect_answers} ${pluralRu(errorItem.incorrect_answers, ["ошибка", "ошибки", "ошибок"])} · точность ${percentage(errorItem.accuracy_percent)} · последняя ${formatDate(errorItem.last_incorrect_at ?? errorItem.last_seen_at, { month: "short" })}`}>
                        {errorItem.incorrect_answers} {pluralRu(errorItem.incorrect_answers, ["ошибка", "ошибки", "ошибок"])} · точность{" "}
                        {percentage(errorItem.accuracy_percent)} · последняя{" "}
                        {formatDate(errorItem.last_incorrect_at ?? errorItem.last_seen_at, { month: "short" })}
                        </small>
                      </span>
                      <Badge label={repeatingErrorLabel(errorItem.incorrect_answers)} tone={errorTone} />
                      <ArrowRightIcon />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.modalActions}>
              {topic ? (
                <button
                  className={cx(styles.linkButton, styles.linkButtonPrimary)}
                  onClick={() => {
                    setSelectedTestTopicId(topic.topic_id);
                    setModal(null);
                    handleTabChange("tests");
                  }}
                  type="button"
                >
                  Открыть тему
                </button>
              ) : null}
              <button className={styles.linkButton} onClick={() => setModal(null)} type="button">
                Закрыть
              </button>
            </div>
          </>
        ),
      };
    }

    if (currentModal.kind === "topic") {
      const { topic } = currentModal;
      const hasTopicResult = topic.answered_questions > 0;
      const accuracyColor = toneColor(hasTopicResult ? accuracyTone(topic.accuracy_percent) : "default");
      const topicErrors = topicErrorsByTopicId[topic.topic_id] ?? activeTopicErrors;

      return {
        stripeColor: accuracyColor,
        badge: <Badge label={topicLabel(topic.status)} tone={topicTone(topic.status)} />,
        title: topic.topic_name,
        wide: true,
        body: (
          <>
            <div className={styles["test-topic-modal-head"]}>
              <span className={styles["test-topic-modal-icon"]}>{topicIcon(topic)}</span>
              <div className={styles["test-topic-modal-stat"]}>
                <span>Ваш результат</span>
                <strong>{hasTopicResult ? `${Math.round(topic.accuracy_percent)}%` : "-"}</strong>
              </div>
              <div className={styles["test-topic-modal-stat"]}>
                <span>Зачёт / освоение</span>
                <strong>70/85%</strong>
              </div>
              <div className={styles["test-topic-modal-stat"]}>
                <span>Статус</span>
                <strong>{topicLabel(topic.status)}</strong>
              </div>
            </div>

            <div className={styles["test-topic-modal-grid"]}>
              <div>
                <strong>Сигналы</strong>
                <ul>
                  {topic.test_incorrect_answers > 0 ? <li>Ошибок в тестах: {topic.test_incorrect_answers}</li> : null}
                  {topic.repeated_question_struggles > 0 ? <li>Повторяющихся ошибок: {topic.repeated_question_struggles}</li> : null}
                  {topic.hard_question_accuracy_percent !== null ? (
                    <li>Сложные вопросы: {Math.round(topic.hard_question_accuracy_percent)}%</li>
                  ) : null}
                  {!hasTopicResult ? <li>Тема пока не проходилась</li> : null}
                  {hasTopicResult && topic.test_incorrect_answers === 0 && topic.repeated_question_struggles === 0 ? <li>Явных повторов пока нет</li> : null}
                </ul>
              </div>
              <div>
                <strong>Что делать</strong>
                <ul>
                  {hasTopicResult ? <li>Повторить вопросы с ошибками</li> : <li>Начать мини-тест по теме</li>}
                  {hasTopicResult ? <li>Разобрать повторяющиеся ошибки</li> : <li>После первой попытки система покажет точность</li>}
                  <li>Пройти дополнительную тренировку</li>
                </ul>
              </div>
            </div>

            <div className={styles.topicErrorSection}>
              <div className={styles.topicErrorSectionHead}>
                <div>
                  <div className={styles.topicErrorSectionTitle}>Ошибки по тестам</div>
                  <div className={styles.topicErrorSectionMeta}>Раздел: {topic.section_name}</div>
                </div>
              </div>

              {isTopicErrorsLoading ? (
                <div className={styles.inlineNote}>Загружаем вопросы для разбора...</div>
              ) : topicErrorsLoadError ? (
                <div className={styles.inlineNote}>{topicErrorsLoadError}</div>
              ) : activeTopicErrors.length > 0 ? (
                <div className={styles.topicErrorList}>
                  {activeTopicErrors.map((errorItem) => {
                    const itemTone = repeatingErrorTone(errorItem.incorrect_answers, errorItem.accuracy_percent);
                    const isExpanded = expandedTopicErrorId === errorItem.question_id;

                    return (
                      <div className={styles.topicErrorItem} data-tone={itemTone} key={errorItem.question_id}>
                        <button
                          className={styles.topicErrorToggle}
                          onClick={() =>
                            setExpandedTopicErrorId((currentValue) =>
                              currentValue === errorItem.question_id ? null : errorItem.question_id,
                            )
                          }
                          type="button"
                        >
                          <div className={styles.topicErrorToggleMain}>
                            <div className={styles.topicErrorQuestionPreview} title={errorItem.question_text}>{errorItem.question_text}</div>
                            <div className={styles.topicErrorToggleMeta}>
                              <span>{difficultyLabel(errorItem.difficulty)}</span>
                              {errorItem.incorrect_answers > 1 ? <span>повторная ошибка</span> : null}
                            </div>
                          </div>
                          <div className={styles.topicErrorToggleSide}>
                            <span className={styles.topicErrorToggleArrow} data-open={isExpanded}>
                              ⌄
                            </span>
                          </div>
                        </button>

                        {isExpanded ? (
                          <div className={styles.topicErrorDetails}>
                            <div className={styles.topicErrorPromptBlock}>
                              <div className={styles.topicErrorPromptLabel}>Полный вопрос</div>
                              <div className={styles.topicErrorPrompt}>{errorItem.question_text}</div>
                            </div>

                            <div className={styles.topicErrorAnswerGrid}>
                              <div className={styles.topicErrorAnswerCard} data-tone="accent">
                                <div className={styles.topicErrorAnswerLabel}>Ваш последний ответ</div>
                                <div className={cx(styles.topicErrorAnswerValue, styles.statValueDim)}>
                                  {errorItem.last_selected_option_label && errorItem.last_selected_option_text
                                    ? `${errorItem.last_selected_option_label}. ${errorItem.last_selected_option_text}`
                                    : "Нет данных"}
                                </div>
                              </div>
                              <div className={styles.topicErrorAnswerCard} data-tone="green">
                                <div className={styles.topicErrorAnswerLabel}>Правильный ответ</div>
                                <div className={styles.topicErrorAnswerValue}>
                                  {errorItem.correct_option_label && errorItem.correct_option_text
                                    ? `${errorItem.correct_option_label}. ${errorItem.correct_option_text}`
                                    : "Не указан"}
                                </div>
                              </div>
                            </div>

                            <div className={styles.topicErrorExplanation}>
                              <div className={styles.topicErrorExplanationLabel}>Пояснение</div>
                              <p>{errorItem.explanation ?? "Пояснение к этому вопросу пока не добавлено."}</p>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.inlineNote}>По этой теме пока нет ошибок в тестовых вопросах.</div>
              )}
            </div>

            {repeatTopicErrorsError ? <div className={styles.inlineNote}>{repeatTopicErrorsError}</div> : null}

            <div className={cx(styles.modalActions, styles.modalActionsSticky)}>
              {isTopicErrorsLoading || activeTopicErrors.length > 0 ? (
                <button
                  className={cx(styles.linkButton, styles.linkButtonPrimary)}
                  disabled={repeatTopicErrorsPending || isTopicErrorsLoading || topicErrors.length === 0}
                  onClick={() => void handleRepeatErrorsForTopic(topic, topicErrors)}
                  type="button"
                >
                  {repeatTopicErrorsPending
                    ? "Собираем сессию..."
                    : isTopicErrorsLoading
                      ? "Готовим вопросы..."
                      : "Перейти к теме"}
                </button>
              ) : (
                <Link
                  className={cx(styles.linkButton, styles.linkButtonPrimary)}
                  onClick={() => setModal(null)}
                  to="/app/practice"
                >
                  Перейти к тестам
                </Link>
              )}
              <button className={styles.linkButton} onClick={() => setModal(null)} type="button">
                Закрыть
              </button>
            </div>
          </>
        ),
      };
    }

    if (currentModal.kind === "error") {
      const { error: errorItem } = currentModal;
      const tone = repeatingErrorTone(errorItem.incorrect_answers, errorItem.accuracy_percent);
      const color = toneColor(tone);

      return {
        stripeColor: color,
        badge: <Badge label={repeatingErrorLabel(errorItem.incorrect_answers)} tone={tone} />,
        title: errorItem.question_preview,
        smallTitle: true,
        body: (
          <>
            <div className={styles.ringBlock}>
              <ProgressRing
                centerLabel="верно"
                centerValue={percentage(errorItem.accuracy_percent)}
                color={color}
                value={errorItem.accuracy_percent}
              />
              <div className={styles.statsList}>
                <div>
                  <div className={styles.statLabel}>Тема · сложность</div>
                  <div className={cx(styles.statValue, styles.statValueDim)}>
                    {(errorItem.topic_name ?? "Без темы") + " · " + difficultyLabel(errorItem.difficulty)}
                  </div>
                </div>
                <div>
                  <div className={styles.statLabel}>Ошибок / попыток</div>
                  <div className={styles.statValue}>
                    {errorItem.incorrect_answers} / {errorItem.attempts_count}
                  </div>
                </div>
                <div>
                  <div className={styles.statLabel}>Последняя ошибка</div>
                  <div className={cx(styles.statValue, styles.statValueDim)}>
                    {formatDate(errorItem.last_incorrect_at ?? errorItem.last_seen_at, { month: "short" })}
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.modalActions}>
              <Link
                className={cx(styles.linkButton, styles.linkButtonPrimary)}
                onClick={() => setModal(null)}
                to="/app/practice"
              >
                Повторить в тестах
              </Link>
              <button className={styles.linkButton} onClick={() => setModal(null)} type="button">
                Закрыть
              </button>
            </div>
          </>
        ),
      };
    }

    if (currentModal.kind === "case") {
      const { attempt } = currentModal;
      const tone = caseTone(attempt.accuracy_percent);
      const color = toneColor(tone);
      const review = activeCaseModal?.id === attempt.id ? activeCaseReview : caseReviewsByAttemptId[attempt.id] ?? null;
      const isReviewLoading = activeCaseModal?.id === attempt.id ? isCaseReviewLoading : false;
      const reviewError = activeCaseModal?.id === attempt.id ? caseReviewLoadError : null;
      const incorrectAnswersCount = review?.incorrect_items.length ?? Math.max(attempt.answered_questions - attempt.correct_answers, 0);

      return {
        stripeColor: color,
        badge: <Badge label={caseLabel(attempt.accuracy_percent)} tone={tone} />,
        title: attempt.case_title,
        wide: true,
        body: (
          <>
            <div className={styles.reviewMetaGrid}>
              <div className={styles.reviewMetaCard}>
                <div className={styles.reviewMetaLabel}>Точность</div>
                <div className={styles.reviewMetaValue}>{percentage(attempt.accuracy_percent)}</div>
              </div>
              <div className={styles.reviewMetaCard}>
                <div className={styles.reviewMetaLabel}>Тема</div>
                <div className={styles.reviewMetaValue}>{review?.topic_name ?? attempt.topic_name ?? "Без темы"}</div>
              </div>
              <div className={styles.reviewMetaCard}>
                <div className={styles.reviewMetaLabel}>Ошибок</div>
                <div className={styles.reviewMetaValue}>{incorrectAnswersCount}</div>
              </div>
              <div className={styles.reviewMetaCard}>
                <div className={styles.reviewMetaLabel}>Когда</div>
                <div className={styles.reviewMetaValue}>
                  {formatDate((review?.submitted_at ?? attempt.submitted_at) as string, { month: "short" })}
                </div>
              </div>
            </div>

            {reviewError ? <div className={styles.inlineNote}>{reviewError}</div> : null}
            {isReviewLoading ? <div className={styles.inlineNote}>Готовим разбор кейса...</div> : null}

            {review ? (
              <>
                <div className={styles.reviewSection}>
                  <div className={styles.reviewSectionTitle}>Ситуация пациента</div>
                  <div className={styles.reviewText}>{review.patient_summary}</div>
                </div>

                {review.review_available ? (
                  review.incorrect_items.length > 0 ? (
                    <div className={styles.reviewSection}>
                      <div className={styles.reviewSectionTitle}>Ошибки в попытке</div>
                      <div className={styles.reviewList}>
                        {review.incorrect_items.map((item) => (
                          <div className={styles.reviewItem} key={item.question_id}>
                            <div className={styles.reviewPrompt}>{item.prompt}</div>
                            <div className={styles.reviewAnswerGrid}>
                              <div className={styles.reviewAnswerCard} data-tone="accent">
                                <div className={styles.reviewAnswerLabel}>Ваш ответ</div>
                                <div className={styles.reviewAnswerValue}>
                                  {item.selected_option_label && item.selected_option_text
                                    ? `${item.selected_option_label}. ${item.selected_option_text}`
                                    : "Не указан"}
                                </div>
                              </div>
                              <div className={styles.reviewAnswerCard} data-tone="green">
                                <div className={styles.reviewAnswerLabel}>Правильный ответ</div>
                                <div className={styles.reviewAnswerValue}>
                                  {item.correct_option_label && item.correct_option_text
                                    ? `${item.correct_option_label}. ${item.correct_option_text}`
                                    : "Не указан"}
                                </div>
                              </div>
                            </div>
                            <div className={styles.topicErrorExplanation}>
                              <div className={styles.topicErrorExplanationLabel}>Пояснение</div>
                              <p>{item.explanation ?? "Пояснение к этому вопросу пока не добавлено."}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className={styles.inlineNote}>В этой попытке не осталось ошибок в контрольных вопросах.</div>
                  )
                ) : (
                  <div className={styles.reviewSupportNote}>
                    Для этой старой попытки детальные ответы не сохранились. Ниже оставили ориентиры, что стоит повторить в кейсе.
                  </div>
                )}

                {review.focus_points.length > 0 ? (
                  <div className={styles.reviewSection}>
                    <div className={styles.reviewSectionTitle}>Что повторить</div>
                    <div className={styles.reviewBulletList}>
                      {review.focus_points.map((item) => (
                        <div className={styles.reviewBulletItem} key={item}>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {review.exam_targets.length > 0 ? (
                  <div className={styles.reviewSection}>
                    <div className={styles.reviewSectionTitle}>На что обратить внимание</div>
                    <div className={styles.reviewBulletList}>
                      {review.exam_targets.map((item) => (
                        <div className={styles.reviewBulletItem} key={item}>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className={styles.modalActions}>
              <Link
                className={cx(styles.linkButton, styles.linkButtonPrimary)}
                onClick={() => setModal(null)}
                to={`/app/cases?slug=${attempt.case_slug}`}
              >
                Открыть кейс
              </Link>
              <button className={styles.linkButton} onClick={() => setModal(null)} type="button">
                Закрыть
              </button>
            </div>
          </>
        ),
      };
    }

    const { station } = currentModal;
    const review = activeOsceModal?.slug === station.slug ? activeOsceReview : osceReviewsBySlug[station.slug] ?? null;
    const stationStatus = review?.status ?? station.status;
    const tone = osceTone(stationStatus);
    const color = toneColor(tone);
    const isReviewLoading = activeOsceModal?.slug === station.slug ? isOsceReviewLoading : false;
    const reviewError = activeOsceModal?.slug === station.slug ? osceReviewLoadError : null;
    const missedCriticalCount = review?.missed_checklist_items.filter((item) => item.critical).length ?? 0;

    return {
      stripeColor: color,
      badge: <Badge label={osceLabel(stationStatus)} tone={tone} />,
      title: station.title,
      wide: true,
      body: (
        <>
          <div className={styles.reviewMetaGrid}>
            <div className={styles.reviewMetaCard}>
              <div className={styles.reviewMetaLabel}>Последняя попытка</div>
              <div className={styles.reviewMetaValue}>
                {review?.latest_total_score_percent !== null && review?.latest_total_score_percent !== undefined
                  ? percentage(review.latest_total_score_percent)
                  : station.best_score_percent !== null
                    ? percentage(station.best_score_percent)
                    : "—"}
              </div>
            </div>
            <div className={styles.reviewMetaCard}>
              <div className={styles.reviewMetaLabel}>Раздел</div>
              <div className={styles.reviewMetaValue}>{review?.section_name ?? station.section_name}</div>
            </div>
            <div className={styles.reviewMetaCard}>
              <div className={styles.reviewMetaLabel}>Критичных пропусков</div>
              <div className={styles.reviewMetaValue}>{missedCriticalCount}</div>
            </div>
            <div className={styles.reviewMetaCard}>
              <div className={styles.reviewMetaLabel}>Ошибок в вопросах</div>
              <div className={styles.reviewMetaValue}>{review?.incorrect_quiz_items.length ?? 0}</div>
            </div>
          </div>

          {reviewError ? <div className={styles.inlineNote}>{reviewError}</div> : null}
          {isReviewLoading ? <div className={styles.inlineNote}>Готовим разбор станции...</div> : null}

          {review ? (
            review.attempts_count === 0 ? (
              <div className={styles.reviewSupportNote}>
                По этой станции ещё не было попыток. Открой станцию и пройди её целиком, чтобы здесь появился разбор шагов.
              </div>
            ) : (
              <>
                {review.missed_checklist_items.length > 0 ? (
                  <div className={styles.reviewSection}>
                    <div className={styles.reviewSectionTitle}>Пропущенные шаги</div>
                    <div className={styles.reviewBulletList}>
                      {review.missed_checklist_items.map((item) => (
                        <div className={styles.reviewBulletItem} key={item.id}>
                          <div className={styles.reviewBulletHead}>
                            <span>{item.title}</span>
                            {item.critical ? <Badge label="Критично" tone="accent" /> : null}
                          </div>
                          <div className={styles.reviewBulletHint}>{item.description}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {review.incorrect_quiz_items.length > 0 ? (
                  <div className={styles.reviewSection}>
                    <div className={styles.reviewSectionTitle}>Ошибки в вопросах</div>
                    <div className={styles.reviewList}>
                      {review.incorrect_quiz_items.map((item) => (
                        <div className={styles.reviewItem} key={item.question_id}>
                          <div className={styles.reviewPrompt}>{item.prompt}</div>
                          <div className={styles.reviewAnswerGrid}>
                            <div className={styles.reviewAnswerCard} data-tone="accent">
                              <div className={styles.reviewAnswerLabel}>Ваш ответ</div>
                              <div className={styles.reviewAnswerValue}>
                                {item.selected_option_label && item.selected_option_text
                                  ? `${item.selected_option_label}. ${item.selected_option_text}`
                                  : "Не указан"}
                              </div>
                            </div>
                            <div className={styles.reviewAnswerCard} data-tone="green">
                              <div className={styles.reviewAnswerLabel}>Правильный ответ</div>
                              <div className={styles.reviewAnswerValue}>
                                {item.correct_option_label && item.correct_option_text
                                  ? `${item.correct_option_label}. ${item.correct_option_text}`
                                  : "Не указан"}
                              </div>
                            </div>
                          </div>
                          <div className={styles.topicErrorExplanation}>
                            <div className={styles.topicErrorExplanationLabel}>Пояснение</div>
                            <p>{item.explanation ?? "Пояснение к этому вопросу пока не добавлено."}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {review.missed_checklist_items.length === 0 && review.incorrect_quiz_items.length === 0 ? (
                  <div className={styles.inlineNote}>В последней попытке по этой станции не осталось явных ошибок.</div>
                ) : null}
              </>
            )
          ) : null}

          <div className={styles.modalActions}>
            <Link
              className={cx(styles.linkButton, styles.linkButtonPrimary)}
              onClick={() => setModal(null)}
              to={`/app/osce/${station.slug}`}
            >
              Повторить станцию
            </Link>
            <button className={styles.linkButton} onClick={() => setModal(null)} type="button">
              Закрыть
            </button>
          </div>
        </>
      ),
    };
  }

  const modalContent = modal ? renderModalContent(modal) : null;

  return (
    <>
      <div className={styles.pageShell}>
        <div className={styles.page}>
          <div className={styles.header}>
            <div className={styles.headerCopy}>
              <div className={styles.headerKicker}>Аналитика подготовки</div>
              <h1 className={styles.headerTitle}>
                Аналитический
                <br />
                <em>центр</em>
              </h1>
              <div className={styles.headerSub}>Учебная готовность, дефициты и разбор ошибок, которые влияют на план подготовки.</div>
            </div>
          </div>

          <div className={styles.tabsBar}>
            {analyticsTabs.map((tab) => {
              const track =
                tab === "tests" ? testsTrack : tab === "cases" ? casesTrack : tab === "osce" ? osceTrack : null;
              const trackTone = track ? readinessTone(track.status) : "default";

              return (
                <button
                  className={cx(styles.tabButton, activeTab === tab && styles.activeTab)}
                  key={tab}
                  onClick={() => handleTabChange(tab)}
                  type="button"
                >
                  <span className={styles.tabDot} style={{ background: track ? toneColor(trackTone) : "var(--ink-15)" }} />
                  {tabLabel(tab)}
                </button>
              );
            })}
          </div>

          {error ? <div className={styles.errorBox}>{error}</div> : null}

          {loading ? <LoadingState /> : null}

          {!loading && !state ? (
            <EmptyBlock
              description="Страница аналитики не смогла загрузить данные. Попробуй открыть её ещё раз чуть позже."
              title="Аналитика временно недоступна"
            />
          ) : null}

          {!loading && state ? (
            <>
              {activeTab === "overview" ? renderOverviewPane() : null}
              {activeTab === "tests" ? renderTestsPane(testsTrack) : null}
              {activeTab === "cases" ? renderCasesPane() : null}
              {activeTab === "osce" ? renderOscePane() : null}
            </>
          ) : null}
        </div>
      </div>

      {portalTarget && modalContent
        ? createPortal(
            <div
              className={styles.overlay}
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setModal(null);
                }
              }}
            >
              <div
                aria-labelledby="analytics-modal-title"
                aria-modal="true"
                className={cx(styles.modal, modalContent.wide && styles.modalWide)}
                role="dialog"
              >
                <div className={styles.modalStripe} style={{ background: modalContent.stripeColor }} />
                <div className={styles.modalTop}>
                  <div className={styles.modalTopLeft}>
                    <div>{modalContent.badge}</div>
                    <div
                      className={cx(styles.modalTitle, modalContent.smallTitle && styles.modalTitleSmall)}
                      id="analytics-modal-title"
                    >
                      {modalContent.title}
                    </div>
                  </div>
                  <button
                    aria-label="Закрыть"
                    className={styles.modalClose}
                    onClick={() => setModal(null)}
                    type="button"
                  >
                    <CloseIcon />
                  </button>
                </div>
                <div className={styles.modalBody}>{modalContent.body}</div>
              </div>
            </div>,
            portalTarget,
          )
        : null}
    </>
  );
}

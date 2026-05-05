import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { useNotifications, type NotificationTone } from "../contexts/NotificationContext";
import { api, ApiError, isAbortError } from "../lib/api";
import { getLocalTodayIso, shiftIsoDate } from "../lib/date";
import { formatDate, taskWorkloadLabel } from "../lib/format";
import {
  DAILY_STUDY_MINUTE_OPTIONS,
  DEFAULT_STUDY_WEEKDAYS,
  findNextAllowedStudyDate,
  isStudyDateAllowed,
  normalizeStudyWeekdays,
  STUDY_WEEKDAY_OPTIONS,
  studyWeekdaysEqual,
  type StudyIntensity,
} from "../lib/studyPreferences";
import {
  buildAccreditationTaskRoute,
  buildSessionPayloadFromTask,
  buildTaskKindLabel,
  buildTaskTitle,
  isAccreditationTask,
  isCaseTask,
  isOsceTask,
  isWeeklyControlTask,
} from "../lib/session";
import type { PlanEventItem, PlanTask, ReadinessSummary, ScheduleResponse } from "../types/api";
import styles from "./SchedulePage.module.css";

type PendingAction = { action: "start" | "postpone" | "skip"; taskId: number } | null;
type CalendarLoad = "high" | "medium" | "low" | "pause";
type IconProps = { className?: string };

const WEEKDAY_LABELS = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];
const STUDY_DAY_VALUES = STUDY_WEEKDAY_OPTIONS.map((option) => option.value);
const DISPLAY_INTENSITY_OPTIONS: Array<{
  value: StudyIntensity;
  title: string;
  description: string;
}> = [
  { value: "gentle", title: "Мягкий режим", description: "Плавный старт с лёгким ритмом" },
  { value: "steady", title: "Сбалансированный", description: "Ровный темп для большинства" },
  { value: "intensive", title: "Интенсивный", description: "Плотный режим с акцентом на результат" },
];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function CalendarIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <rect height="16" rx="2.5" width="17" x="3.5" y="5" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M3.5 10h17" />
    </svg>
  );
}

function GearIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.2a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.8a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.2a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.2a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.8a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.2a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2Z" />
      <circle cx="12" cy="12" r="3" />
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

function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function SkipIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M4 12h12" />
      <path d="m11 7 5 5-5 5" />
      <path d="M20 6v12" />
    </svg>
  );
}

function RefreshIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M20 11a8 8 0 0 0-13.5-5.8L4 8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 13.5 5.8L20 16" />
      <path d="M16 16h4v4" />
    </svg>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addMonths(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function mondayIndex(value: Date) {
  return (value.getDay() + 6) % 7;
}

function monthLabel(value: Date) {
  return capitalize(
    new Intl.DateTimeFormat("ru-RU", {
      month: "long",
      year: "numeric",
    }).format(value),
  );
}

function fullDateLabel(value: string) {
  return capitalize(
    formatDate(value, {
      weekday: "long",
      day: "numeric",
      month: "long",
    }),
  );
}

function dayMonthLabel(value: string) {
  return formatDate(value, {
    day: "numeric",
    month: "long",
  });
}

function shortDateLabel(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  }).format(parseIsoDate(value));
}

function isTaskActive(task: PlanTask) {
  return !task.is_completed && !task.is_skipped;
}

function compareTasks(left: PlanTask, right: PlanTask) {
  const dateCompare = left.scheduled_date.localeCompare(right.scheduled_date);

  if (dateCompare !== 0) {
    return dateCompare;
  }

  return left.id - right.id;
}

function groupTasksByDate(tasks: PlanTask[]) {
  return tasks.reduce<Record<string, PlanTask[]>>((accumulator, task) => {
    accumulator[task.scheduled_date] = accumulator[task.scheduled_date]
      ? [...accumulator[task.scheduled_date], task]
      : [task];
    return accumulator;
  }, {});
}

function canStartTask(task: PlanTask, serverToday: string, studyWeekdays: number[], hasStudyTime: boolean) {
  return (
    hasStudyTime &&
    isTaskActive(task) &&
    task.scheduled_date <= serverToday &&
    isStudyDateAllowed(serverToday, studyWeekdays)
  );
}

function taskTone(task: PlanTask) {
  if (isWeeklyControlTask(task) || isAccreditationTask(task)) {
    return "accent";
  }

  if (task.task_type === "case") {
    return "green";
  }

  if (task.task_type === "osce") {
    return "gold";
  }

  return "accent";
}

function taskMeta(task: PlanTask) {
  return `${taskWorkloadLabel(task)} · ${buildTaskKindLabel(task)}`;
}

function taskDuration(task: PlanTask) {
  return `≈ ${task.estimated_minutes} мин`;
}

function routeDateTitle(date: string, serverToday: string) {
  if (date === serverToday) {
    return `СЕГОДНЯ, ${dayMonthLabel(date).toUpperCase()}`;
  }

  if (date === shiftIsoDate(serverToday, 1)) {
    return `ЗАВТРА, ${dayMonthLabel(date).toUpperCase()}`;
  }

  return dayMonthLabel(date).toUpperCase();
}

function calendarLoad(minutes: number, hasTasks: boolean, isStudyDay: boolean): CalendarLoad {
  if (!isStudyDay || !hasTasks) {
    return "pause";
  }

  if (minutes >= 80) {
    return "high";
  }

  if (minutes >= 45) {
    return "medium";
  }

  return "low";
}

function eventDate(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  }).format(parsed);
}

function eventTime(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function eventFullDate(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed).replace(" г.", "");
}

function historyIconForEvent(event: PlanEventItem) {
  if (event.event_type.includes("mode") || event.event_type.includes("preference")) {
    return <GearIcon />;
  }

  if (event.event_type.includes("postpone") || event.event_type.includes("reschedule")) {
    return <RefreshIcon />;
  }

  return <CalendarIcon />;
}

function studyWeekdaysText(value: number[]) {
  const normalized = normalizeStudyWeekdays(value);

  if (studyWeekdaysEqual(normalized, [...DEFAULT_STUDY_WEEKDAYS])) {
    return "ежедневно";
  }

  return WEEKDAY_LABELS.filter((_, index) => normalized.includes(index)).join(", ");
}

function actionUnavailableLabel(task: PlanTask | null, serverToday: string, todayIsStudyDay: boolean, hasStudyTime: boolean) {
  if (!task) {
    return "Открыть";
  }

  if (task.scheduled_date > serverToday) {
    return "Позже";
  }

  if (!todayIsStudyDay) {
    return "Пауза";
  }

  if (!hasStudyTime) {
    return "Лимит";
  }

  return "Открыть";
}

function resolveTaskTrackKey(task: PlanTask | null) {
  if (!task) {
    return null;
  }

  if (isCaseTask(task)) {
    return "cases";
  }

  if (isOsceTask(task)) {
    return "osce";
  }

  return "tests";
}

function percentLabel(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Нет данных";
  }

  return `${Math.round(value)}%`;
}

export function SchedulePage() {
  const navigate = useNavigate();
  const { token, user, replaceUser } = useAuth();
  const { addNotification } = useNotifications();

  const initialDate = user?.server_today ?? getLocalTodayIso();

  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [readiness, setReadiness] = useState<ReadinessSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preferencesNotice, setPreferencesNotice] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(parseIsoDate(initialDate)));
  const [preferencesModalOpen, setPreferencesModalOpen] = useState(false);
  const [dailyStudyMinutes, setDailyStudyMinutes] = useState(String(user?.daily_study_minutes ?? 90));
  const [studyIntensity, setStudyIntensity] = useState<StudyIntensity>(user?.study_intensity ?? "intensive");
  const [studyWeekdays, setStudyWeekdays] = useState<number[]>(user?.study_weekdays ?? [...DEFAULT_STUDY_WEEKDAYS]);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [planDetailsOpen, setPlanDetailsOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  const serverToday = schedule?.server_today ?? user?.server_today ?? getLocalTodayIso();
  const activeStudyWeekdays = normalizeStudyWeekdays(user?.study_weekdays ?? [...DEFAULT_STUDY_WEEKDAYS]);
  const normalizedStudyWeekdays = normalizeStudyWeekdays(studyWeekdays);
  const todayIsStudyDay = isStudyDateAllowed(serverToday, activeStudyWeekdays);
  const todayHasStudyTime = (schedule?.remaining_study_seconds ?? (user?.daily_study_minutes ?? 90) * 60) > 0;
  const rescheduleMaxDate = user?.accreditation_date ? shiftIsoDate(user.accreditation_date, -1) : null;
  const nextStudyDate = todayIsStudyDay
    ? serverToday
    : findNextAllowedStudyDate(serverToday, activeStudyWeekdays, rescheduleMaxDate);
  const hasPreferenceChanges = Boolean(
    user &&
      (Number(dailyStudyMinutes) !== user.daily_study_minutes ||
        studyIntensity !== user.study_intensity ||
        !studyWeekdaysEqual(normalizedStudyWeekdays, user.study_weekdays)),
  );
  const dailyMinuteOptions = useMemo(() => {
    const currentValue = Number(dailyStudyMinutes);
    const hasCurrentValue = DAILY_STUDY_MINUTE_OPTIONS.some((option) => option.value === currentValue);

    if (!Number.isFinite(currentValue) || hasCurrentValue) {
      return DAILY_STUDY_MINUTE_OPTIONS;
    }

    return [...DAILY_STUDY_MINUTE_OPTIONS, { value: currentValue, label: `${currentValue} минут` }].sort(
      (left, right) => left.value - right.value,
    );
  }, [dailyStudyMinutes]);

  const visibleTasks = useMemo(() => [...(schedule?.tasks ?? [])].sort(compareTasks), [schedule?.tasks]);
  const tasksByDate = useMemo(() => groupTasksByDate(visibleTasks), [visibleTasks]);
  const activeTasks = useMemo(() => visibleTasks.filter(isTaskActive), [visibleTasks]);
  const selectedTasks = useMemo(() => [...(tasksByDate[selectedDate] ?? [])].sort(compareTasks), [tasksByDate, selectedDate]);
  const selectedActiveTasks = selectedTasks.filter(isTaskActive);
  const selectedPrimaryTask = selectedActiveTasks[0] ?? null;
  const selectedMinutes = selectedTasks.reduce((sum, task) => sum + (isTaskActive(task) ? task.estimated_minutes : 0), 0);
  const selectedIsStudyDay = isStudyDateAllowed(selectedDate, activeStudyWeekdays);
  const completedTasks = visibleTasks
    .filter((task) => task.is_completed)
    .sort((left, right) => right.scheduled_date.localeCompare(left.scheduled_date) || right.id - left.id)
    .slice(0, 3);
  const calendarDays = useMemo(() => {
    const firstDay = startOfMonth(calendarMonth);
    const gridStart = addDays(firstDay, -mondayIndex(firstDay));

    return Array.from({ length: 42 }, (_, index) => {
      const date = addDays(gridStart, index);
      const iso = toIsoDate(date);
      const dayTasks = tasksByDate[iso] ?? [];
      const dayActiveTasks = dayTasks.filter(isTaskActive);
      const minutes = dayActiveTasks.reduce((sum, task) => sum + task.estimated_minutes, 0);
      const isStudyDay = isStudyDateAllowed(iso, activeStudyWeekdays);

      return {
        iso,
        date,
        inCurrentMonth: date.getMonth() === calendarMonth.getMonth(),
        isToday: iso === serverToday,
        isSelected: iso === selectedDate,
        isStudyDay,
        tasks: dayTasks,
        minutes,
        load: calendarLoad(minutes, dayActiveTasks.length > 0, isStudyDay),
      };
    });
  }, [activeStudyWeekdays, calendarMonth, selectedDate, serverToday, tasksByDate]);

  const routeDates = useMemo(() => {
    const dates = Array.from(new Set(activeTasks.map((task) => task.scheduled_date)))
      .filter((date) => date >= serverToday)
      .sort((left, right) => left.localeCompare(right));

    if (dates.length > 0) {
      return dates.slice(0, 5);
    }

    return Array.from(new Set(activeTasks.map((task) => task.scheduled_date)))
      .sort((left, right) => left.localeCompare(right))
      .slice(0, 5);
  }, [activeTasks, serverToday]);

  const recommendedTrack = readiness?.tracks.find((track) => track.key === readiness.recommended_focus_key) ?? null;
  const selectedTaskTrackKey = resolveTaskTrackKey(selectedPrimaryTask);
  const selectedTaskTrack = selectedTaskTrackKey
    ? readiness?.tracks.find((track) => track.key === selectedTaskTrackKey) ?? null
    : null;
  const planEvents = schedule?.events ?? [];
  const planDetailTrack = selectedTaskTrack ?? recommendedTrack;
  const activeDailyMinutes = Math.round((schedule?.daily_study_seconds ?? (user?.daily_study_minutes ?? 90) * 60) / 60);
  const planDetailSource = selectedPrimaryTask?.planner_reason
    ? "Логика задачи"
    : recommendedTrack
      ? "Учебная аналитика"
      : readiness?.exam_protocol.summary
        ? "Протокол пробной аккредитации"
        : "Базовые правила";
  const planDetailRows = [
    { label: "Источник", value: planDetailSource },
    selectedPrimaryTask ? { label: "Дата", value: fullDateLabel(selectedPrimaryTask.scheduled_date) } : null,
    selectedPrimaryTask ? { label: "Объем", value: taskDuration(selectedPrimaryTask) } : null,
    planDetailTrack ? { label: "Направление", value: planDetailTrack.label } : null,
    planDetailTrack ? { label: "Учебная готовность", value: percentLabel(planDetailTrack.readiness_percent) } : null,
    planDetailTrack ? { label: "Дефицит", value: percentLabel(planDetailTrack.deficit_percent) } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const planReason =
    selectedPrimaryTask?.planner_reason ??
    recommendedTrack?.detail ??
    readiness?.exam_protocol.summary ??
    "Планировщик держит впереди ближайшие незакрытые этапы и распределяет нагрузку по выбранному режиму.";

  function beginRequest() {
    abortControllerRef.current?.abort();

    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;

    requestIdRef.current = requestId;
    abortControllerRef.current = controller;

    return { controller, requestId };
  }

  function isLatestRequest(requestId: number, controller: AbortController) {
    return requestIdRef.current === requestId && abortControllerRef.current === controller && !controller.signal.aborted;
  }

  function pushToast(message: string, tone: NotificationTone) {
    addNotification({
      title: "Планировщик",
      message,
      tone,
    });
  }

  function selectDate(date: string) {
    setSelectedDate(date);
    setCalendarMonth(startOfMonth(parseIsoDate(date)));
  }

  function toggleStudyDay(day: number) {
    setStudyWeekdays((current) => {
      const normalized = normalizeStudyWeekdays(current);

      if (normalized.includes(day)) {
        return normalized.length === 1 ? normalized : normalized.filter((item) => item !== day);
      }

      return [...normalized, day].sort((left, right) => left - right);
    });
  }

  async function refreshSchedule(errorMessage: string) {
    if (!token) {
      return;
    }

    try {
      const nextSchedule = await api.getSchedule(token);
      setSchedule(nextSchedule);
      setError(null);
    } catch (exception) {
      setError(exception instanceof ApiError ? exception.message : errorMessage);
    }
  }

  async function handleStart(task: PlanTask) {
    if (!token) {
      return;
    }

    if (!canStartTask(task, serverToday, activeStudyWeekdays, todayHasStudyTime)) {
      selectDate(task.scheduled_date);
      setError(
        !todayIsStudyDay
          ? "Сегодня пауза по учебному режиму. Задача откроется в ближайший учебный день."
          : !todayHasStudyTime
            ? "Учебный лимит на сегодня уже закрыт. Задача останется в маршруте."
            : "Эта задача откроется в свой учебный день по плану.",
      );
      return;
    }

    setPendingAction({ action: "start", taskId: task.id });
    setError(null);

    try {
      if (isAccreditationTask(task)) {
        startTransition(() => navigate(buildAccreditationTaskRoute(task)));
        return;
      }

      if (isCaseTask(task)) {
        const searchParams = new URLSearchParams();

        if (task.topic_id !== null) {
          searchParams.set("topicId", String(task.topic_id));
        }

        searchParams.set("plannedTaskId", String(task.id));
        searchParams.set("mode", "exam");
        searchParams.set("autostart", "1");
        startTransition(() => navigate(`/app/cases?${searchParams.toString()}`));
        return;
      }

      if (isOsceTask(task) && task.osce_station_slug) {
        const searchParams = new URLSearchParams();
        searchParams.set("plannedTaskId", String(task.id));
        startTransition(() => navigate(`/app/osce/${task.osce_station_slug}?${searchParams.toString()}`));
        return;
      }

      const session = await api.startSession(token, buildSessionPayloadFromTask(task));
      startTransition(() => navigate(`/app/tests/${session.id}`));
    } catch (exception) {
      setError(exception instanceof ApiError ? exception.message : "Не удалось открыть задачу");
    } finally {
      setPendingAction(null);
    }
  }

  async function handlePostpone(task: PlanTask) {
    if (!token) {
      return;
    }

    setPendingAction({ action: "postpone", taskId: task.id });
    setError(null);

    try {
      await api.postponeTask(token, task.id);
      pushToast("Задача перенесена, маршрут пересобран.", "warm");
      await refreshSchedule("Задача перенесена, но план не удалось обновить");
    } catch (exception) {
      setError(exception instanceof ApiError ? exception.message : "Не удалось перенести задачу");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleSkip(task: PlanTask) {
    if (!token) {
      return;
    }

    setPendingAction({ action: "skip", taskId: task.id });
    setError(null);

    try {
      await api.skipTask(token, task.id);
      pushToast("Задача пропущена, будущие дни обновлены.", "warm");
      await refreshSchedule("Задача пропущена, но план не удалось обновить");
    } catch (exception) {
      setError(exception instanceof ApiError ? exception.message : "Не удалось пропустить задачу");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleSavePreferences() {
    if (!token) {
      return;
    }

    const minutes = Number(dailyStudyMinutes);

    if (!Number.isFinite(minutes) || minutes < 20 || minutes > 180) {
      setPreferencesNotice("Выбери от 20 до 180 минут в день.");
      return;
    }

    setSavingPreferences(true);
    setPreferencesNotice(null);
    setError(null);

    try {
      const response = await api.updateSchedulePreferences(token, {
        daily_study_minutes: minutes,
        study_intensity: studyIntensity,
        study_weekdays: normalizedStudyWeekdays,
      });

      replaceUser(response.user);
      setSchedule(response.schedule);
      setPreferencesModalOpen(false);
      pushToast("Режим сохранён.", "success");
    } catch (exception) {
      setPreferencesNotice(exception instanceof ApiError ? exception.message : "Не удалось сохранить режим");
    } finally {
      setSavingPreferences(false);
    }
  }

  useEffect(() => {
    if (!user) {
      return;
    }

    setDailyStudyMinutes(String(user.daily_study_minutes));
    setStudyIntensity(user.study_intensity);
    setStudyWeekdays(user.study_weekdays);
  }, [user]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const { controller, requestId } = beginRequest();

    setLoading(true);
    setError(null);

    void Promise.allSettled([api.getSchedule(token, controller.signal), api.getAnalyticsReadiness(token, controller.signal)])
      .then(([scheduleResult, readinessResult]) => {
        if (!isLatestRequest(requestId, controller)) {
          return;
        }

        if (scheduleResult.status === "fulfilled") {
          setSchedule(scheduleResult.value);
          setSelectedDate((current) => current || scheduleResult.value.server_today);
          setCalendarMonth((current) => current || startOfMonth(parseIsoDate(scheduleResult.value.server_today)));
        } else if (!isAbortError(scheduleResult.reason)) {
          setError(scheduleResult.reason instanceof ApiError ? scheduleResult.reason.message : "Не удалось загрузить план");
        }

        if (readinessResult.status === "fulfilled") {
          setReadiness(readinessResult.value);
        } else {
          setReadiness(null);
        }
      })
      .finally(() => {
        if (isLatestRequest(requestId, controller)) {
          setLoading(false);
          abortControllerRef.current = null;
        }
      });

    return () => {
      controller.abort();

      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    };
  }, [token]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if ((!preferencesModalOpen && !historyModalOpen) || typeof document === "undefined" || typeof window === "undefined") {
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

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (historyModalOpen) {
        setHistoryModalOpen(false);
      } else {
        setPreferencesModalOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [historyModalOpen, preferencesModalOpen]);

  return (
    <div className={styles.shell}>
      <header className={styles.ph}>
        <div>
          <div className={styles["ph-kicker"]}>Первичная аккредитация</div>
          <h1 className={styles["ph-title"]}>
            Планировщик
            <br />
            <em>аккредитации</em>
          </h1>
          <p className={styles["ph-desc"]}>
            Маршрут подготовки по дате аккредитации, режиму занятий и незакрытым этапам: тестам, кейсам и ОСКЭ.
          </p>
        </div>
      </header>

      <section className={styles["status-strip"]} aria-label="Сводка планировщика">
        <button className={styles["status-cell"]} onClick={() => selectDate(nextStudyDate ?? serverToday)} type="button">
          <span className={styles["status-icon"]}>
            <CalendarIcon />
          </span>
          <span>
            <span className={styles["status-label"]}>Ближайшая учебная дата</span>
            <strong>{nextStudyDate ? fullDateLabel(nextStudyDate) : "Нет учебной даты"}</strong>
          </span>
        </button>
        <div className={styles["status-cell"]}>
          <span className={cx(styles.dot, todayIsStudyDay && todayHasStudyTime ? styles.green : styles.pause)} />
          <span>
            <span className={styles["status-label"]}>Статус на сегодня</span>
            <strong>
              {todayIsStudyDay ? (todayHasStudyTime ? "Сегодня учебный день" : "Лимит на сегодня закрыт") : "Сегодня пауза"}
            </strong>
          </span>
        </div>
        <button className={cx(styles["status-cell"], styles["mode-cell"])} onClick={() => setPreferencesModalOpen(true)} type="button">
          <span className={styles["mode-icon"]}>
            <GearIcon />
          </span>
          <strong>Настроить режим</strong>
          <ChevronRightIcon className={styles["status-chevron"]} />
        </button>
      </section>

      {error ? (
        <div className={cx(styles.notice, styles.danger)}>
          <span>{error}</span>
          <button onClick={() => setError(null)} type="button">
            ×
          </button>
        </div>
      ) : null}

      <main className={styles.layout}>
        <section className={styles.left}>
          <div className={styles["section-label"]}>Главный маршрут</div>
          <div className={styles["route-card"]}>
            {loading ? (
              <div className={styles.skeletons}>
                <div className={styles.skeleton} />
                <div className={styles.skeleton} />
                <div className={styles.skeleton} />
              </div>
            ) : routeDates.length > 0 ? (
              routeDates.map((date, index) => {
                const tomorrow = shiftIsoDate(serverToday, 1);
                const isPrimaryDate = date === serverToday || date === tomorrow;
                const firstUpcomingIndex = routeDates.findIndex((routeDate) => routeDate > tomorrow);
                const dateLabel = isPrimaryDate
                  ? routeDateTitle(date, serverToday)
                  : index === firstUpcomingIndex
                    ? "БЛИЖАЙШИЕ ДНИ"
                    : "";

                return (
                  <div className={styles["route-block"]} key={date}>
                    <div className={cx(styles["route-date-label"], date === serverToday && styles.today)}>{dateLabel}</div>
                    {(tasksByDate[date] ?? [])
                      .filter(isTaskActive)
                      .slice(0, isPrimaryDate ? 1 : 2)
                      .map((task) => (
                        <div
                          className={styles["route-task"]}
                          key={task.id}
                          onClick={() => selectDate(task.scheduled_date)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              selectDate(task.scheduled_date);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <span className={styles["route-time"]}>
                            <strong>{isPrimaryDate ? "10:00" : shortDateLabel(date)}</strong>
                          </span>
                          <span className={styles["route-copy"]}>
                            <strong>{buildTaskTitle(task)}</strong>
                            <small>{taskMeta(task)}</small>
                          </span>
                          <button
                            className={styles["route-open"]}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleStart(task);
                            }}
                            type="button"
                          >
                            {pendingAction?.action === "start" && pendingAction.taskId === task.id ? "..." : "Открыть"}
                            <ArrowRightIcon />
                          </button>
                        </div>
                      ))}
                  </div>
                );
              })
            ) : (
              <div className={styles.empty}>
                <strong>Маршрут пуст</strong>
                <span>Активных задач пока нет.</span>
              </div>
            )}
          </div>

          <div className={styles["section-label"]}>Недавние завершённые</div>
          <div className={styles["completed-card"]}>
            {completedTasks.length > 0 ? (
              completedTasks.map((task) => (
                <button className={styles["completed-row"]} key={task.id} onClick={() => selectDate(task.scheduled_date)} type="button">
                  <span className={styles.check}>✓</span>
                  <span className={styles["completed-date"]}>{shortDateLabel(task.scheduled_date)}</span>
                  <strong title={buildTaskTitle(task)}>{buildTaskTitle(task)}</strong>
                  <small>{taskDuration(task)}</small>
                </button>
              ))
            ) : (
              <div className={styles.empty}>
                <strong>Пока нет завершённых</strong>
                <span>Они появятся здесь после учебных сессий.</span>
              </div>
            )}
          </div>
        </section>

        <section className={styles.center}>
          <div className={styles["day-card"]}>
            <div className={styles["day-head"]}>
              <div>
                <div className={styles["day-label"]}>Задачи на {dayMonthLabel(selectedDate).toUpperCase()}</div>
                <h2>{fullDateLabel(selectedDate)}</h2>
              </div>
              <strong>{selectedMinutes > 0 ? `≈ ${selectedMinutes} мин` : selectedIsStudyDay ? "Пусто" : "Пауза"}</strong>
            </div>

            <div className={styles.timeline}>
              {selectedTasks.length > 0 ? (
                selectedTasks.map((task, index) => (
                  <button
                    aria-label={`Открыть ${buildTaskTitle(task)}`}
                    className={cx(
                      styles["timeline-row"],
                      styles[`tone-${taskTone(task)}`],
                      !isTaskActive(task) && styles.muted,
                    )}
                    disabled={!isTaskActive(task)}
                    key={task.id}
                    onClick={() => void handleStart(task)}
                    type="button"
                  >
                    <span className={styles["timeline-node"]}>{index === 0 && isTaskActive(task) ? "" : ""}</span>
                    <span className={styles["timeline-copy"]}>
                      <strong title={buildTaskTitle(task)}>{buildTaskTitle(task)}</strong>
                      <small>{taskMeta(task)}</small>
                    </span>
                    <span className={styles["timeline-min"]}>{taskDuration(task)}</span>
                    <span className={styles["timeline-chevron"]}>
                      <ChevronRightIcon />
                    </span>
                  </button>
                ))
              ) : (
                <div className={styles["day-empty"]}>
                  <strong>{selectedIsStudyDay ? "На эту дату задач нет" : "В этот день пауза"}</strong>
                  <span>
                    {selectedIsStudyDay
                      ? "Кликни другую дату в календаре или выбери задачу в маршруте."
                      : "Этот день не входит в текущий учебный режим."}
                  </span>
                </div>
              )}
            </div>

            <div className={styles["day-actions"]}>
              <button
                className={styles.primary}
                disabled={
                  !selectedPrimaryTask ||
                  !canStartTask(selectedPrimaryTask, serverToday, activeStudyWeekdays, todayHasStudyTime) ||
                  pendingAction?.taskId === selectedPrimaryTask.id
                }
                onClick={() => selectedPrimaryTask && void handleStart(selectedPrimaryTask)}
                type="button"
              >
                <span className={styles["action-icon"]}>
                  <ArrowRightIcon />
                </span>
                {pendingAction?.action === "start" && pendingAction.taskId === selectedPrimaryTask?.id
                  ? "Открываем..."
                  : actionUnavailableLabel(selectedPrimaryTask, serverToday, todayIsStudyDay, todayHasStudyTime)}
              </button>
              <button
                className={styles.secondary}
                disabled={!selectedPrimaryTask || pendingAction?.taskId === selectedPrimaryTask.id}
                onClick={() => selectedPrimaryTask && void handlePostpone(selectedPrimaryTask)}
                type="button"
              >
                <span className={styles["action-icon"]}>
                  <CalendarIcon />
                </span>
                {pendingAction?.action === "postpone" && pendingAction.taskId === selectedPrimaryTask?.id
                  ? "Переносим..."
                  : "На след. учебный"}
              </button>
              <button
                className={styles.ghost}
                disabled={!selectedPrimaryTask || pendingAction?.taskId === selectedPrimaryTask.id}
                onClick={() => selectedPrimaryTask && void handleSkip(selectedPrimaryTask)}
                type="button"
              >
                <span className={styles["action-icon"]}>
                  <SkipIcon />
                </span>
                {pendingAction?.action === "skip" && pendingAction.taskId === selectedPrimaryTask?.id
                  ? "Пропускаем..."
                  : "Пропустить"}
              </button>
            </div>
          </div>
        </section>

        <aside className={styles.right}>
          <div className={styles["calendar-card"]}>
            <div className={styles["card-title"]}>Календарь</div>
            <div className={styles["calendar-head"]}>
              <button onClick={() => setCalendarMonth((current) => addMonths(current, -1))} type="button">
                <ChevronLeftIcon />
              </button>
              <strong>{monthLabel(calendarMonth)}</strong>
              <button onClick={() => setCalendarMonth((current) => addMonths(current, 1))} type="button">
                <ChevronRightIcon />
              </button>
            </div>
            <div className={styles["dow-row"]}>
              {WEEKDAY_LABELS.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className={styles["calendar-grid"]}>
              {calendarDays.map((day) => (
                <button
                  aria-label={fullDateLabel(day.iso)}
                  className={cx(
                    styles["calendar-day"],
                    !day.inCurrentMonth && styles.other,
                    day.isToday && styles.today,
                    day.isSelected && styles.selected,
                  )}
                  key={day.iso}
                  onClick={() => selectDate(day.iso)}
                  type="button"
                >
                  <span>{day.date.getDate()}</span>
                  <i className={cx(styles["load-dot"], styles[day.load])} />
                </button>
              ))}
            </div>
            <div className={styles.legend}>
              <span>
                <i className={styles.high} /> 80+ мин
              </span>
              <span>
                <i className={styles.medium} /> 45-79 мин
              </span>
              <span>
                <i className={styles.low} /> До 45 мин
              </span>
              <span>
                <i className={styles.pause} /> Пауза
              </span>
            </div>
          </div>

          <div className={styles["context-card"]}>
            <div className={styles["card-title"]}>Почему такой план?</div>
            <p>{planReason}</p>
            <button
              aria-expanded={planDetailsOpen}
              disabled={!selectedPrimaryTask && !planDetailTrack}
              onClick={() => setPlanDetailsOpen((current) => !current)}
              type="button"
            >
              {planDetailsOpen ? "Свернуть" : "Подробнее"}{" "}
              <ArrowRightIcon className={cx(styles["link-icon"], planDetailsOpen && styles.open)} />
            </button>
            {planDetailsOpen ? (
              <div className={styles["plan-details"]}>
                {selectedPrimaryTask ? (
                  <div className={styles["plan-focus"]}>
                    <span>Выбранная задача</span>
                    <strong>{buildTaskTitle(selectedPrimaryTask)}</strong>
                    <small>{taskMeta(selectedPrimaryTask)}</small>
                  </div>
                ) : null}
                <div className={styles["plan-detail-grid"]}>
                  {planDetailRows.map((row) => (
                    <span key={row.label}>
                      <small>{row.label}</small>
                      <strong>{row.value}</strong>
                    </span>
                  ))}
                </div>
                <div className={styles["plan-detail-note"]}>
                  План строится из незакрытых задач, текущего дефицита учебной готовности и лимита {activeDailyMinutes} мин в день.
                </div>
              </div>
            ) : null}
          </div>

          <div className={styles["context-card"]}>
            <div className={styles["card-title"]}>История изменений</div>
            <div className={styles.history}>
              {planEvents.slice(0, 3).map((event: PlanEventItem) => (
                <div className={styles["history-row"]} key={event.id}>
                  <span className={cx(styles["history-icon"], styles[`tone-${event.tone}`])}>
                    {historyIconForEvent(event)}
                  </span>
                  <span className={styles["history-date"]}>{eventDate(event.created_at)}</span>
                  <strong>{event.title}</strong>
                  <time>{eventTime(event.created_at)}</time>
                </div>
              ))}
              {!planEvents.length ? <div className={styles["history-empty"]}>Изменений пока нет.</div> : null}
            </div>
            <button onClick={() => setHistoryModalOpen(true)} type="button">
              Вся история <ArrowRightIcon className={styles["link-icon"]} />
            </button>
          </div>
        </aside>
      </main>

      {portalTarget && preferencesModalOpen
        ? createPortal(
            <div
              className={styles["prefs-overlay"]}
              onClick={(event) => {
                if (event.target === event.currentTarget && !savingPreferences) {
                  setPreferencesModalOpen(false);
                }
              }}
            >
              <div className={styles["prefs-popover"]} role="dialog" aria-modal="true" aria-label="Параметры обучения">
                <div className={styles["prefs-head"]}>
                  <strong>Параметры обучения</strong>
                  <button disabled={savingPreferences} onClick={() => setPreferencesModalOpen(false)} type="button">
                    ×
                  </button>
                </div>

                <div className={styles["prefs-body"]}>
                  <div className={styles["prefs-section"]}>
                    <div className={styles["prefs-section-label"]}>Время в день</div>
                    <div className={styles["prefs-time-grid"]}>
                      {dailyMinuteOptions.map((option) => (
                        <button
                          className={cx(styles["prefs-time-pill"], String(option.value) === dailyStudyMinutes && styles.on)}
                          disabled={savingPreferences}
                          key={option.value}
                          onClick={() => setDailyStudyMinutes(String(option.value))}
                          type="button"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={styles["prefs-section"]}>
                    <div className={styles["prefs-section-label"]}>Режим подготовки</div>
                    <div className={styles["prefs-intensity-grid"]}>
                      {DISPLAY_INTENSITY_OPTIONS.map((option) => (
                        <button
                          className={cx(
                            styles["prefs-intensity-card"],
                            studyIntensity === option.value && styles.on,
                          )}
                          disabled={savingPreferences}
                          key={option.value}
                          onClick={() => setStudyIntensity(option.value)}
                          type="button"
                        >
                          <span className={styles["prefs-intensity-line"]} aria-hidden="true" />
                          <span className={styles["prefs-intensity-check"]} aria-hidden="true">
                            <svg width="8" height="8" viewBox="0 0 9 9" fill="none">
                              <path
                                d="M1.5 4.5L3.5 6.5L7.5 2.5"
                                stroke="currentColor"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="1.7"
                              />
                            </svg>
                          </span>
                          <strong>{option.title}</strong>
                          <span>{option.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={styles["prefs-section"]}>
                    <div className={styles["prefs-section-label"]}>Учебные дни</div>
                    <div className={styles["prefs-weekdays-grid"]}>
                      {STUDY_DAY_VALUES.map((day) => {
                        const option = STUDY_WEEKDAY_OPTIONS.find((item) => item.value === day);
                        const selected = normalizedStudyWeekdays.includes(day);

                        return (
                        <button
                          className={cx(styles["prefs-weekday"], selected && styles.on)}
                          disabled={savingPreferences}
                          key={day}
                          onClick={() => toggleStudyDay(day)}
                          type="button"
                        >
                          <span>{option?.shortLabel ?? WEEKDAY_LABELS[day]}</span>
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path
                              d="M2 5l2.5 2.5 3.5-4"
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.8"
                            />
                          </svg>
                        </button>
                        );
                      })}
                    </div>
                    <div className={styles["prefs-hint"]}>Учебные дни: {studyWeekdaysText(normalizedStudyWeekdays)}</div>
                  </div>

                  {preferencesNotice ? <div className={styles["prefs-notice"]}>{preferencesNotice}</div> : null}
                </div>

                <div className={styles["prefs-actions"]}>
                  <button disabled={savingPreferences} onClick={() => setPreferencesModalOpen(false)} type="button">
                    Отмена
                  </button>
                  <button
                    className={styles.save}
                    disabled={savingPreferences || !hasPreferenceChanges}
                    onClick={() => void handleSavePreferences()}
                    type="button"
                  >
                    {savingPreferences ? "Сохраняем..." : "Сохранить"}
                  </button>
                </div>
              </div>
            </div>,
            portalTarget,
          )
        : null}

      {portalTarget && historyModalOpen
        ? createPortal(
            <div
              className={styles["prefs-overlay"]}
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setHistoryModalOpen(false);
                }
              }}
            >
              <section
                aria-labelledby="schedule-history-title"
                aria-modal="true"
                className={styles["history-popover"]}
                role="dialog"
              >
                <div className={styles["history-popover-stripe"]} />
                <div className={styles["history-popover-head"]}>
                  <div>
                    <div className={styles["history-popover-kicker"]}>История изменений</div>
                    <h2 id="schedule-history-title">Все изменения плана</h2>
                    <p>Здесь собраны события, которые повлияли на учебный маршрут и задачи планировщика.</p>
                  </div>
                  <button aria-label="Закрыть" onClick={() => setHistoryModalOpen(false)} type="button">
                    ×
                  </button>
                </div>

                <div className={styles["history-popover-body"]}>
                  {planEvents.length > 0 ? (
                    <div className={styles["history-modal-list"]}>
                      {planEvents.map((event) => (
                        <article className={styles["history-modal-row"]} key={event.id}>
                          <span className={cx(styles["history-icon"], styles[`tone-${event.tone}`])}>
                            {historyIconForEvent(event)}
                          </span>
                          <div className={styles["history-modal-copy"]}>
                            <span className={styles["history-modal-date"]}>
                              {eventFullDate(event.created_at)} · {eventTime(event.created_at)}
                            </span>
                            <strong>{event.title}</strong>
                            {event.description ? <p>{event.description}</p> : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className={styles["history-modal-empty"]}>
                      <strong>Истории пока нет</strong>
                      <p>Когда план будет перестроен или задача изменится, событие появится здесь.</p>
                    </div>
                  )}
                </div>
              </section>
            </div>,
            portalTarget,
          )
        : null}

    </div>
  );
}

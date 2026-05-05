import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";

import { DashboardEventStrip } from "../components/DashboardEventStrip";
import { DashboardHeader } from "../components/DashboardHeader";
import { DashboardLayout } from "../components/DashboardLayout";
import { DashboardMessageCard } from "../components/DashboardMessageCard";
import { DashboardNotice } from "../components/DashboardNotice";
import { DashboardProgressPanel } from "../components/DashboardProgressPanel";
import {
  DashboardBodyGrid,
  DashboardColumn,
  DashboardSection,
} from "../components/DashboardScaffold";
import { DashboardSkeleton } from "../components/DashboardSkeleton";
import {
  DashboardDiagnosticCard,
  DashboardTodayCard,
  DashboardTodayEmptyCard,
  type DashboardTodayStatus,
} from "../components/DashboardTodayPanel";
import type { DashboardTone } from "../components/DashboardBadge";
import {
  DashboardUpcomingList,
  type DashboardUpcomingItem,
} from "../components/DashboardUpcomingList";
import { useAuth } from "../contexts/AuthContext";
import { api, ApiError, isAbortError } from "../lib/api";
import { shiftIsoDate } from "../lib/date";
import { greetByTime } from "../lib/format";
import {
  plannerActionImpact,
  PLANNER_MOVED_HERE_LABEL,
  PLANNER_NEW_FOCUS_LABEL,
} from "../lib/plannerUi";
import {
  DEFAULT_STUDY_WEEKDAYS,
  findNextAllowedStudyDate,
  isStudyDateAllowed,
  normalizeStudyWeekdays,
} from "../lib/studyPreferences";
import {
  buildAccreditationTaskRoute,
  buildSessionPayloadFromTask,
  buildTaskTitle,
  isAccreditationTask,
  isCaseTask,
  isOsceTask,
  isWeeklyControlTask,
} from "../lib/session";
import type {
  AnalyticsOverview,
  Faculty,
  PlanTask,
  ReadinessSummary,
  ScheduleResponse,
  ScheduleTodayResponse,
} from "../types/api";

interface DashboardState {
  overview: AnalyticsOverview;
  readiness: ReadinessSummary;
  schedule: ScheduleResponse;
  today: ScheduleTodayResponse;
}

type PlanAdjustmentState = {
  action: Exclude<DashboardTodayStatus, null>;
  taskId: number;
} | null;

type AnalyticsFocusTab = "tests" | "cases" | "osce";

function analyticsTabForFocusKey(key: string | null | undefined): AnalyticsFocusTab {
  if (key === "cases") {
    return "cases";
  }

  if (key === "osce") {
    return "osce";
  }

  return "tests";
}

function focusActionLabel(tab: AnalyticsFocusTab): string {
  if (tab === "cases") {
    return "Открыть кейсы";
  }

  if (tab === "osce") {
    return "Открыть ОСКЭ";
  }

  return "Открыть тесты";
}

function needsStartDiagnostic(state: DashboardState | null): boolean {
  if (!state) {
    return false;
  }

  return (
    state.overview.total_answered === 0 &&
    state.overview.completed_sessions === 0 &&
    state.readiness.tracks.every((track) => track.volume_percent === 0)
  );
}

function buildTaskDescription(task: PlanTask, isOverdue: boolean): string {
  if (isOverdue) {
    return "Эта задача осталась с прошлого учебного дня. Закройте ее сейчас или перенесите, чтобы план дальше шел от актуальной даты.";
  }

  if (task.planner_reason) {
    return task.planner_reason;
  }

  if (isWeeklyControlTask(task)) {
    return "Контроль недели: короткая проверка без подсказок, которая обновит учебный прогноз и следующий маршрут.";
  }

  if (isOsceTask(task)) {
    return `Практическая станция «${buildTaskTitle(task)}» с чек-листом и мини-тестом для отработки навыка.`;
  }

  if (task.topic_name) {
    return `Фокусная проработка темы «${task.topic_name}» с ${task.questions_count} вопросами.`;
  }

  return `Системная тренировка с ${task.questions_count} вопросами для закрепления материала.`;
}

function canStartDashboardTask(
  task: PlanTask,
  serverToday: string,
  studyWeekdays: number[],
  hasStudyTime: boolean,
): boolean {
  return (
    hasStudyTime &&
    !task.is_completed &&
    !task.is_skipped &&
    task.scheduled_date <= serverToday &&
    isStudyDateAllowed(serverToday, studyWeekdays)
  );
}

function getUpcomingMarker(
  task: PlanTask,
  index: number,
  planAdjustment: PlanAdjustmentState,
  hasCurrentTask: boolean,
): { label: string; tone: DashboardTone } | undefined {
  if (
    planAdjustment?.action === "postponed" &&
    planAdjustment.taskId === task.id
  ) {
    return { label: PLANNER_MOVED_HERE_LABEL, tone: "gold" };
  }

  if (planAdjustment?.action === "skipped" && index === 0 && !hasCurrentTask) {
    return { label: PLANNER_NEW_FOCUS_LABEL, tone: "accent" };
  }

  return undefined;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [state, setState] = useState<DashboardState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{
    message: string;
    tone: "success" | "danger";
  } | null>(null);
  const [startingTaskId, setStartingTaskId] = useState<number | null>(null);
  const [startingDiagnostic, setStartingDiagnostic] = useState(false);
  const [postponingTaskId, setPostponingTaskId] = useState<number | null>(null);
  const [skippingTaskId, setSkippingTaskId] = useState<number | null>(null);
  const [facultyName, setFacultyName] = useState<string | null>(null);
  const [todayStatus, setTodayStatus] =
    useState<DashboardTodayStatus>(null);
  const [planAdjustment, setPlanAdjustment] =
    useState<PlanAdjustmentState>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dashboardRequestIdRef = useRef(0);
  const dashboardAbortControllerRef = useRef<AbortController | null>(null);

  const showNotice = useCallback(
    (message: string, tone: "success" | "danger") => {
      setNotice({ message, tone });

      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }

      noticeTimerRef.current = setTimeout(() => {
        setNotice(null);
      }, 4500);
    },
    [],
  );

  useEffect(() => {
    return () => {
      dashboardAbortControllerRef.current?.abort();

      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!loadError) {
      return;
    }

    const timer = setTimeout(() => {
      setLoadError(null);
    }, 6000);

    return () => clearTimeout(timer);
  }, [loadError]);

  function beginDashboardRequest() {
    dashboardAbortControllerRef.current?.abort();

    const controller = new AbortController();
    const requestId = dashboardRequestIdRef.current + 1;

    dashboardRequestIdRef.current = requestId;
    dashboardAbortControllerRef.current = controller;

    return { controller, requestId };
  }

  function isLatestDashboardRequest(requestId: number, controller: AbortController) {
    return (
      dashboardRequestIdRef.current === requestId &&
      dashboardAbortControllerRef.current === controller &&
      !controller.signal.aborted
    );
  }

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    const { controller, requestId } = beginDashboardRequest();

    setLoading(true);
    setLoadError(null);
    setFacultyName(null);
    setTodayStatus(null);
    setPlanAdjustment(null);

    void Promise.all([
      api.getAnalyticsOverview(token, controller.signal),
      api.getAnalyticsReadiness(token, controller.signal),
      api.getSchedule(token, controller.signal),
      api.getTodaySchedule(token, controller.signal),
      api.listFaculties(token).catch((): Faculty[] => []),
    ])
      .then(
        ([overview, readiness, schedule, today, faculties]) => {
          if (!isLatestDashboardRequest(requestId, controller)) {
            return;
          }

          const matchedFaculty = faculties.find((faculty) => faculty.id === user?.faculty_id);

          setFacultyName(matchedFaculty?.name ?? null);
          setState({
            overview,
            readiness,
            schedule,
            today,
          });
        },
      )
      .catch((error) => {
        if (isAbortError(error) || !isLatestDashboardRequest(requestId, controller)) {
          return;
        }

        setLoadError(
          error instanceof ApiError
            ? error.message
            : "Не удалось загрузить кабинет",
        );
      })
      .finally(() => {
        if (dashboardAbortControllerRef.current === controller) {
          dashboardAbortControllerRef.current = null;
        }

        if (dashboardRequestIdRef.current === requestId && !controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();

      if (dashboardAbortControllerRef.current === controller) {
        dashboardAbortControllerRef.current = null;
      }
    };
  }, [token, user?.faculty_id]);

  async function refreshSchedule(errorMessage: string) {
    if (!token) {
      return;
    }

    const { controller, requestId } = beginDashboardRequest();

    try {
      const [schedule, today] = await Promise.all([
        api.getSchedule(token, controller.signal),
        api.getTodaySchedule(token, controller.signal),
      ]);

      if (!isLatestDashboardRequest(requestId, controller)) {
        return;
      }

      setState((currentState) =>
        currentState ? { ...currentState, schedule, today } : currentState,
      );
      setTodayStatus((currentStatus) =>
        today.tasks.some((task) => !task.is_completed && !task.is_skipped) ? null : currentStatus,
      );
    } catch (error) {
      if (isAbortError(error) || !isLatestDashboardRequest(requestId, controller)) {
        return;
      }

      showNotice(errorMessage, "danger");
    } finally {
      if (dashboardAbortControllerRef.current === controller) {
        dashboardAbortControllerRef.current = null;
      }
    }
  }

  async function handleStartTask(taskId: number) {
    if (!token || !state || !user) {
      return;
    }

    const serverToday = state.schedule.server_today;
    const activeStudyWeekdays = normalizeStudyWeekdays(user.study_weekdays ?? [...DEFAULT_STUDY_WEEKDAYS]);
    const todayIsStudyDay = isStudyDateAllowed(serverToday, activeStudyWeekdays);
    const todayHasStudyTime = state.schedule.remaining_study_seconds > 0;
    const task =
      state.schedule.tasks.find((item) => item.id === taskId) ??
      state.today.tasks.find((item) => item.id === taskId);

    if (!task) {
      return;
    }

    if (!canStartDashboardTask(task, serverToday, activeStudyWeekdays, todayHasStudyTime)) {
      showNotice(
        !todayIsStudyDay
          ? "Сегодня выходной по учебному графику. Задача откроется в следующий учебный день."
          : !todayHasStudyTime
            ? "Учебный лимит на сегодня уже закрыт. Следующая задача останется в маршруте."
            : "Эта задача откроется в свой учебный день по плану.",
        "danger",
      );
      return;
    }

    setStartingTaskId(task.id);

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

      const session = await api.startSession(
        token,
        buildSessionPayloadFromTask(task),
      );

      startTransition(() => navigate(`/app/tests/${session.id}`));
    } catch (error) {
      showNotice(
        error instanceof ApiError
          ? error.message
          : "Не удалось запустить сессию",
        "danger",
      );
    } finally {
      setStartingTaskId(null);
    }
  }

  async function handleStartDiagnostic() {
    if (!token) {
      return;
    }

    setStartingDiagnostic(true);

    try {
      const session = await api.startSession(token, {
        topic_id: null,
        question_count: 30,
        mode: "exam",
        planned_task_id: null,
        simulation_id: null,
      });

      startTransition(() => navigate(`/app/tests/${session.id}`));
    } catch (error) {
      showNotice(
        error instanceof ApiError
          ? error.message
          : "Не удалось запустить стартовую диагностику",
        "danger",
      );
    } finally {
      setStartingDiagnostic(false);
    }
  }

  async function handlePostponeTask(taskId: number) {
    if (!token) {
      return;
    }

    setPostponingTaskId(taskId);

    try {
      await api.postponeTask(token, taskId);
      setTodayStatus("postponed");
      setPlanAdjustment({ action: "postponed", taskId });
      showNotice(plannerActionImpact("postponed"), "success");
      await refreshSchedule(
        "Задача перенесена, но не удалось обновить дашборд",
      );
    } catch (error) {
      showNotice(
        error instanceof ApiError
          ? error.message
          : "Не удалось перенести задачу",
        "danger",
      );
    } finally {
      setPostponingTaskId(null);
    }
  }

  async function handleSkipTask(taskId: number) {
    if (!token) {
      return;
    }

    setSkippingTaskId(taskId);

    try {
      await api.skipTask(token, taskId);
      setTodayStatus("skipped");
      setPlanAdjustment({ action: "skipped", taskId });
      showNotice(plannerActionImpact("skipped"), "success");
      await refreshSchedule(
        "Задача пропущена, но не удалось обновить дашборд",
      );
    } catch (error) {
      showNotice(
        error instanceof ApiError
          ? error.message
          : "Не удалось пропустить задачу",
        "danger",
      );
    } finally {
      setSkippingTaskId(null);
    }
  }

  if (!user) {
    return null;
  }

  const greeting = greetByTime();
  const serverToday = state?.schedule.server_today ?? user.server_today;
  const activeStudyWeekdays = normalizeStudyWeekdays(user.study_weekdays ?? [...DEFAULT_STUDY_WEEKDAYS]);
  const todayIsStudyDay = isStudyDateAllowed(serverToday, activeStudyWeekdays);
  const todayHasStudyTime = (state?.schedule.remaining_study_seconds ?? user.daily_study_minutes * 60) > 0;
  const startDiagnosticNeeded = needsStartDiagnostic(state);
  const nextStudyDate = todayIsStudyDay
    ? serverToday
    : findNextAllowedStudyDate(
        serverToday,
        activeStudyWeekdays,
        user.accreditation_date ? shiftIsoDate(user.accreditation_date, -1) : null,
      );
  const plannedCurrentTask =
    state?.schedule.tasks.find((task) =>
      canStartDashboardTask(task, serverToday, activeStudyWeekdays, todayHasStudyTime),
    ) ??
    null;
  const currentTask = startDiagnosticNeeded ? null : plannedCurrentTask;
  const currentTaskIsOverdue =
    currentTask !== null && currentTask.scheduled_date < serverToday;
  const visibleTodayStatus = currentTask ? null : todayStatus;
  const upcomingTasks =
    state?.schedule.tasks
      .filter(
        (task) =>
          !task.is_completed && !task.is_skipped && task.id !== currentTask?.id,
      )
      .slice(0, 5) ?? [];
  const upcomingItems: DashboardUpcomingItem[] = upcomingTasks.map(
    (task, index) => ({
      canStart: canStartDashboardTask(task, serverToday, activeStudyWeekdays, todayHasStudyTime),
      task,
      marker: getUpcomingMarker(task, index, planAdjustment, Boolean(currentTask)),
    }),
  );
  const focusAnalyticsTab = analyticsTabForFocusKey(state?.readiness.recommended_focus_key);
  const progressActionLabel = startDiagnosticNeeded ? "Начать диагностику" : focusActionLabel(focusAnalyticsTab);
  const progressActionRoute = `/app/analytics?tab=${focusAnalyticsTab}`;
  const protocolActionRoute = "/app/accreditation";

  return (
    <DashboardLayout>
      <DashboardHeader
        currentTaskEstimatedMinutes={startDiagnosticNeeded ? 30 : currentTask?.estimated_minutes ?? null}
        dailyStudySeconds={state?.schedule.daily_study_seconds ?? user.daily_study_minutes * 60}
        daysUntilAccreditation={state?.overview.days_until_accreditation ?? null}
        firstName={user.first_name}
        greeting={greeting}
        isTodayStudyDay={todayIsStudyDay}
        lastName={user.last_name}
        remainingStudySeconds={state?.schedule.remaining_study_seconds ?? user.daily_study_minutes * 60}
        subtitle={facultyName ? `Факультет · ${facultyName}` : "Факультет не выбран"}
        todayStudySeconds={state?.schedule.today_study_seconds ?? 0}
      />

      {notice || loadError ? (
        <DashboardNotice
          message={loadError ?? notice!.message}
          onClose={() => {
            setNotice(null);
            setLoadError(null);
          }}
          tone={loadError ? "danger" : notice!.tone}
        />
      ) : null}

      <DashboardEventStrip events={state?.schedule.events ?? []} />

      {loading ? (
        <DashboardSkeleton />
      ) : !state ? (
        <DashboardMessageCard
          message="Попробуйте обновить страницу или повторить вход в систему."
          title="Дашборд сейчас недоступен"
          tone="danger"
        />
      ) : (
        <DashboardBodyGrid>
          <DashboardColumn>
            <DashboardSection title="Что делать сейчас">
              {startDiagnosticNeeded ? (
                <DashboardDiagnosticCard
                  onStart={handleStartDiagnostic}
                  scheduledDate={serverToday}
                  starting={startingDiagnostic}
                />
              ) : currentTask ? (
                <DashboardTodayCard
                  description={buildTaskDescription(currentTask, currentTaskIsOverdue)}
                  isOverdue={currentTaskIsOverdue}
                  onPostpone={() => handlePostponeTask(currentTask.id)}
                  onSkip={() => handleSkipTask(currentTask.id)}
                  onStart={() => handleStartTask(currentTask.id)}
                  postponing={postponingTaskId === currentTask.id}
                  skipping={skippingTaskId === currentTask.id}
                  starting={startingTaskId === currentTask.id}
                  status={visibleTodayStatus}
                  task={currentTask}
                />
              ) : (
                <DashboardTodayEmptyCard
                  hasStudyTime={todayHasStudyTime}
                  isTodayStudyDay={todayIsStudyDay}
                  nextStudyDate={nextStudyDate}
                  status={visibleTodayStatus}
                />
              )}
            </DashboardSection>

            <DashboardSection title="Ближайшие задачи">
              <DashboardUpcomingList
                items={upcomingItems}
                onStart={handleStartTask}
                startingTaskId={startingTaskId}
              />
            </DashboardSection>
          </DashboardColumn>

          <DashboardColumn>
            <DashboardSection title="Учебный прогноз">
              <DashboardProgressPanel
                hasCurrentTask={Boolean(currentTask)}
                hasStudyTime={todayHasStudyTime}
                isCurrentTaskOverdue={currentTaskIsOverdue}
                isTodayStudyDay={todayIsStudyDay}
                onFocusAction={() =>
                  startDiagnosticNeeded
                    ? void handleStartDiagnostic()
                    : startTransition(() => navigate(progressActionRoute))
                }
                onProtocolAction={() =>
                  startTransition(() => navigate(protocolActionRoute))
                }
                focusActionLabel={progressActionLabel}
                isInitialState={startDiagnosticNeeded}
                readiness={state.readiness}
              />
            </DashboardSection>
          </DashboardColumn>
        </DashboardBodyGrid>
      )}
    </DashboardLayout>
  );
}

import { startTransition, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";

import { DashboardLayout } from "../components/DashboardLayout";
import { useAuth } from "../contexts/AuthContext";
import { api, ApiError, isAbortError } from "../lib/api";
import type { ExamReadinessProtocol, ExamSimulation, ExamSimulationStage, ExamStageProtocol } from "../types/api";
import styles from "./AccreditationPage.module.css";

type StageKey = "tests" | "cases" | "osce";
type NoticeTone = "success" | "danger";
type ProtocolStageTone = "default" | "green" | "warm" | "accent";

const STAGES: Array<{
  key: StageKey;
  number: string;
  title: string;
  requirement: string;
}> = [
  {
    key: "tests",
    number: "01",
    title: "Тестовый этап",
    requirement: "80 вопросов, порог 70%",
  },
  {
    key: "cases",
    number: "02",
    title: "Ситуационные задачи",
    requirement: "2 кейса, 24 вопроса, порог 70%",
  },
  {
    key: "osce",
    number: "03",
    title: "ОСКЭ",
    requirement: "5 станций, каждая от 70%",
  },
];

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function parsePositiveInt(value: string | null): number | null {
  return value && /^\d+$/.test(value) ? Number(value) : null;
}

function checkpointToStage(value: string | null): StageKey | null {
  if (value === "test_stage") {
    return "tests";
  }

  if (value === "case_stage") {
    return "cases";
  }

  if (value === "osce_stage") {
    return "osce";
  }

  return null;
}

function stageTone(status: string | null | undefined): ProtocolStageTone {
  if (status === "passed") {
    return "green";
  }

  if (status === "failed") {
    return "accent";
  }

  if (status === "active") {
    return "warm";
  }

  return "default";
}

function protocolStatusTone(status: string | null | undefined): "green" | "accent" {
  return status === "ready" ? "green" : "accent";
}

function simulationStatusLabel(simulation: ExamSimulation | null): string {
  if (!simulation) {
    return "Не начата";
  }

  if (simulation.status === "completed") {
    return simulation.passed ? "Пробная аккредитация сдана" : "Пробная аккредитация не сдана";
  }

  if (simulation.status === "active") {
    return "Пробная аккредитация активна";
  }

  return "Черновик протокола";
}

function stageStatusLabel(stage: ExamSimulationStage | null, protocolStage: ExamStageProtocol | null): string {
  if (protocolStage?.status_label) {
    return protocolStage.status_label;
  }

  if (!stage || stage.status === "unconfirmed") {
    return "Не начат";
  }

  if (stage.status === "active") {
    return "В процессе";
  }

  if (stage.status === "passed") {
    return "Сдан";
  }

  if (stage.status === "failed") {
    return "Не сдан";
  }

  return "Не начат";
}

function scoreLabel(stage: ExamSimulationStage | null, protocolStage: ExamStageProtocol | null): string {
  if (stage?.score_percent != null) {
    return `${Math.round(stage.score_percent)}%`;
  }

  return protocolStage?.result_label ?? "Нет результата";
}

function detailNumber(stage: ExamSimulationStage | null, key: string): number | null {
  const value = stage?.details?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function detailStringList(stage: ExamSimulationStage | null, key: string): string[] {
  const value = stage?.details?.[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function progressLabel(stageKey: StageKey, stage: ExamSimulationStage | null): string {
  if (stageKey === "tests") {
    const answered = detailNumber(stage, "answered_questions");
    const total = detailNumber(stage, "total_questions");
    return answered != null && total != null ? `${answered}/${total} вопросов` : "80 вопросов";
  }

  if (stageKey === "cases") {
    const count = detailNumber(stage, "case_count") ?? 0;
    const required = detailNumber(stage, "required_case_count") ?? 2;
    const totalQuestions = detailNumber(stage, "total_questions");
    return totalQuestions != null ? `${count}/${required} кейса · ${totalQuestions}/24 вопроса` : `${count}/${required} кейса`;
  }

  const count = detailNumber(stage, "station_count") ?? 0;
  const required = detailNumber(stage, "required_station_count") ?? 5;
  const passed = detailNumber(stage, "passed_station_count");
  return passed != null ? `${count}/${required} станций · ${passed} зачтено` : `${count}/${required} станций`;
}

function ratioPercent(value: number | null, total: number | null): number {
  if (value === null || total === null || total <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (value / total) * 100));
}

function stageProgressPercent(stageKey: StageKey, stage: ExamSimulationStage | null, protocolStage: ExamStageProtocol | null): number {
  if (stage?.status === "passed" || protocolStage?.status === "passed") {
    return 100;
  }

  if (stageKey === "tests") {
    return ratioPercent(
      detailNumber(stage, "answered_questions") ?? 0,
      detailNumber(stage, "total_questions") ?? detailNumber(stage, "assigned_question_count") ?? 80,
    );
  }

  if (stageKey === "cases") {
    const caseProgress = ratioPercent(
      detailNumber(stage, "case_count") ?? 0,
      detailNumber(stage, "required_case_count") ?? 2,
    );
    const questionProgress = ratioPercent(
      detailNumber(stage, "total_questions") ?? 0,
      detailNumber(stage, "required_total_questions") ?? 24,
    );

    return Math.max(caseProgress, questionProgress);
  }

  return ratioPercent(
    detailNumber(stage, "station_count") ?? 0,
    detailNumber(stage, "required_station_count") ?? 5,
  );
}

function buildOverallProgress(
  stageMap: Map<string, ExamSimulationStage>,
  protocolStageMap: Map<string, ExamStageProtocol>,
): number {
  const total = STAGES.reduce((sum, stageInfo) => {
    return sum + stageProgressPercent(
      stageInfo.key,
      stageMap.get(stageInfo.key) ?? null,
      protocolStageMap.get(stageInfo.key) ?? null,
    );
  }, 0);

  return Math.round(total / STAGES.length);
}

function protocolTitleParts(simulation: ExamSimulation | null, protocol: ExamReadinessProtocol | null): [string, string] {
  if (protocol?.overall_status === "ready") {
    return ["Протокол", "подтвержден"];
  }

  if (!simulation) {
    return ["Пробная", "аккредитация не начата"];
  }

  if (simulation.status === "active") {
    return ["Пробная", "аккредитация активна"];
  }

  if (simulation.status === "completed") {
    return simulation.passed ? ["Пробная", "аккредитация сдана"] : ["Пробная", "аккредитация не сдана"];
  }

  return ["Протокол", "собирается"];
}

function protocolSummary(simulation: ExamSimulation | null, protocol: ExamReadinessProtocol | null): string {
  if (!simulation) {
    return "Запустите пробную аккредитацию, чтобы собрать протокол по тестам, ситуационным задачам и ОСКЭ.";
  }

  if (simulation.status === "active") {
    return "Протокол собирается с текущего дня. Продолжайте этапы, чтобы подтвердить результат пробной аккредитации.";
  }

  return protocol?.summary ?? "Протокол обновляется по результатам пробной аккредитации.";
}

function formatProtocolDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date).replace(" г.", "");
}

function todoItemsForProtocol(protocol: ExamReadinessProtocol | null): string[] {
  if (protocol?.action_items?.length) {
    return protocol.action_items.slice(0, 3);
  }

  return [
    "Пройдите ситуационные задачи (2 кейса)",
    "Завершите 5 станций ОСКЭ",
    "Достигните порога по всем этапам",
  ];
}

function buildStageMap(simulation: ExamSimulation | null): Map<string, ExamSimulationStage> {
  return new Map((simulation?.stages ?? []).map((stage) => [stage.key, stage]));
}

function buildProtocolStageMap(protocol: ExamReadinessProtocol | null): Map<string, ExamStageProtocol> {
  return new Map((protocol?.stages ?? []).map((stage) => [stage.key, stage]));
}

function simulationHistoryTone(simulation: ExamSimulation): ProtocolStageTone {
  if (simulation.status === "active") {
    return "warm";
  }

  if (simulation.status === "completed") {
    return simulation.passed ? "green" : "accent";
  }

  return "default";
}

function simulationHistorySubtitle(simulation: ExamSimulation): string {
  if (simulation.status === "active") {
    return "Попытка сейчас в процессе. Ее можно продолжить по этапам ниже.";
  }

  if (simulation.status === "completed") {
    return simulation.passed
      ? "Все обязательные этапы закрыты по порогу пробной аккредитации."
      : "Есть этапы ниже порога. Разберите ошибки и начните новую пробную аккредитацию.";
  }

  if (simulation.status === "cancelled") {
    return "Попытка была отменена перед завершением всех этапов.";
  }

  return "Попытка создана, но этапы еще не пройдены.";
}

function numericDetail(stage: ExamSimulationStage, key: string): number {
  const value = stage.details?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function simulationHasStartedWork(simulation: ExamSimulation): boolean {
  return simulation.stages.some((stage) => {
    if (stage.status !== "unconfirmed" || stage.score_percent !== null || stage.started_at || stage.finished_at) {
      return true;
    }

    return (
      numericDetail(stage, "answered_questions") > 0 ||
      numericDetail(stage, "case_count") > 0 ||
      numericDetail(stage, "station_count") > 0 ||
      numericDetail(stage, "passed_station_count") > 0 ||
      numericDetail(stage, "total_questions") > 0
    );
  });
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" height="12" viewBox="0 0 16 16" width="12">
      <path
        d="M3 8h9.2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="m8.8 4.4 3.8 3.6-3.8 3.6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect height="15.5" rx="2.4" width="16.5" x="3.75" y="5.25" />
      <path d="M7.8 3.25v4.2" />
      <path d="M16.2 3.25v4.2" />
      <path d="M3.75 9.45h16.5" />
      <path d="M8 13h.01" />
      <path d="M12 13h.01" />
      <path d="M16 13h.01" />
      <path d="M8 16.4h.01" />
      <path d="M12 16.4h.01" />
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4.5 18.5h15" />
      <path d="M4.5 18.5V5.5" />
      <path d="M6.5 15.4 10 11.8l3 2.9 5.5-6.6" />
      <path d="M14.8 8.1h3.7v3.7" />
    </svg>
  );
}

function ClockRefreshIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M20 12a8 8 0 1 1-2.35-5.65" />
      <path d="M20 4.5v5h-5" />
      <path d="M12 7.75v4.65l3.15 1.85" />
      <path d="M8.4 4.9A8 8 0 0 1 12 4" />
    </svg>
  );
}

function ProtocolCheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 3.75h6.75L18 8v12.25H7z" />
      <path d="M13.75 3.75V8H18" />
      <path d="M9.2 11h5.6" />
      <path d="m9.2 15.2 1.8 1.8 3.9-4.25" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" height="14" viewBox="0 0 14 14" width="14">
      <path
        d="M3.25 3.25 10.75 10.75M10.75 3.25 3.25 10.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export function AccreditationPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [simulations, setSimulations] = useState<ExamSimulation[]>([]);
  const [protocol, setProtocol] = useState<ExamReadinessProtocol | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; tone: NoticeTone } | null>(null);
  const [creating, setCreating] = useState(false);
  const [startingStage, setStartingStage] = useState<StageKey | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const portalTarget = typeof document !== "undefined" ? document.body : null;

  const plannedTaskId = parsePositiveInt(searchParams.get("plannedTaskId"));
  const routedTopicId = parsePositiveInt(searchParams.get("topicId"));
  const routedStationSlug = searchParams.get("stationSlug")?.trim() ?? "";
  const focusedStage = checkpointToStage(searchParams.get("stage"));
  const routedSimulationId = searchParams.get("simulationId")?.trim() ?? "";

  const routedSimulation = useMemo(
    () => simulations.find((simulation) => simulation.id === routedSimulationId) ?? null,
    [routedSimulationId, simulations],
  );
  const activeSimulation = useMemo(() => {
    if (routedSimulation?.status === "active") {
      return routedSimulation;
    }

    return simulations.find((simulation) => simulation.status === "active") ?? null;
  }, [routedSimulation, simulations]);
  const latestSimulation = routedSimulation ?? simulations[0] ?? null;
  const historySimulations = useMemo(() => simulations.filter(simulationHasStartedWork), [simulations]);
  const visibleSimulation = activeSimulation ?? latestSimulation;
  const stageMap = useMemo(() => buildStageMap(visibleSimulation), [visibleSimulation]);
  const protocolStageMap = useMemo(() => buildProtocolStageMap(protocol), [protocol]);
  const overallTone = protocolStatusTone(protocol?.overall_status);
  const canUseActiveSimulation = Boolean(activeSimulation);
  const protocolProgress = buildOverallProgress(stageMap, protocolStageMap);
  const [protocolTitleMain, protocolTitleAccent] = protocolTitleParts(visibleSimulation, protocol);
  const protocolStartDate = formatProtocolDate(visibleSimulation?.started_at ?? visibleSimulation?.created_at);
  const protocolLastResult = visibleSimulation?.score_percent != null ? `${Math.round(visibleSimulation.score_percent)}%` : "Нет результата";
  const protocolTodoItems = todoItemsForProtocol(protocol);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    setLoading(true);
    setLoadError(null);

    void Promise.all([
      api.listExamSimulations(token, controller.signal),
      api.getExamProtocol(token, controller.signal),
    ])
      .then(([simulationItems, protocolResponse]) => {
        if (controller.signal.aborted) {
          return;
        }

        setSimulations(simulationItems);
        setProtocol(protocolResponse);
      })
      .catch((error) => {
        if (isAbortError(error) || controller.signal.aborted) {
          return;
        }

        setLoadError(error instanceof ApiError ? error.message : "Не удалось загрузить аккредитационный центр");
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

  useEffect(() => {
    if (!historyOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setHistoryOpen(false);
      }
    }

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
  }, [historyOpen]);

  async function createSimulation() {
    if (!token || creating) {
      return;
    }

    if (
      activeSimulation &&
      !window.confirm("Текущая активная пробная аккредитация будет отменена. Начать новую?")
    ) {
      return;
    }

    setCreating(true);
    setNotice(null);

    try {
      const created = await api.createExamSimulation(token);
      setSimulations((current) => [created, ...current.filter((simulation) => simulation.id !== created.id)]);
      const nextProtocol = await api.getExamProtocol(token);
      setProtocol(nextProtocol);
      setNotice({ message: "Новая пробная аккредитация создана. Протокол собирается с текущего дня.", tone: "success" });
    } catch (error) {
      setNotice({
        message: error instanceof ApiError ? error.message : "Не удалось создать пробную аккредитацию",
        tone: "danger",
      });
    } finally {
      setCreating(false);
    }
  }

  function plannedTaskIdForStage(stageKey: StageKey) {
    return plannedTaskId && focusedStage === stageKey ? plannedTaskId : null;
  }

  async function startStage(stageKey: StageKey) {
    if (!token || !activeSimulation || startingStage) {
      return;
    }

    setStartingStage(stageKey);
    setNotice(null);

    try {
      if (stageKey === "tests") {
        const session = await api.startSession(token, {
          topic_id: null,
          question_count: 80,
          mode: "exam",
          planned_task_id: plannedTaskIdForStage("tests"),
          simulation_id: activeSimulation.id,
        });

        startTransition(() => navigate(`/app/tests/${session.id}`));
        return;
      }

      const params = new URLSearchParams();
      params.set("simulationId", activeSimulation.id);
      params.set("mode", "exam");
      params.set("examRun", "1");

      const stagePlannedTaskId = plannedTaskIdForStage(stageKey);

      if (stagePlannedTaskId !== null) {
        params.set("plannedTaskId", String(stagePlannedTaskId));
      }

      if (stageKey === "cases") {
        const assignedCaseSlugs = detailStringList(stageMap.get("cases") ?? null, "assigned_case_slugs");

        if (assignedCaseSlugs.length > 0) {
          params.set("caseSlugs", assignedCaseSlugs.join(","));
        }

        if (routedTopicId !== null) {
          params.set("topicId", String(routedTopicId));
        }

        startTransition(() => navigate(`/app/cases?${params.toString()}`));
        return;
      }

      const assignedStationSlugs = detailStringList(stageMap.get("osce") ?? null, "assigned_station_slugs");

      if (assignedStationSlugs.length > 0) {
        params.set("stationSlugs", assignedStationSlugs.join(","));
      }

      if (routedStationSlug) {
        params.set("stationSlug", routedStationSlug);
      }

      startTransition(() => navigate(`/app/osce?${params.toString()}`));
    } catch (error) {
      setNotice({
        message: error instanceof ApiError ? error.message : "Не удалось открыть этап пробной аккредитации",
        tone: "danger",
      });
    } finally {
      setStartingStage(null);
    }
  }

  return (
    <DashboardLayout>
      <div className={styles.page} data-testid="accreditation-page">
        <header className={styles.header}>
          <div>
            <div className={styles.kicker}>Первичная аккредитация</div>
            <h1 className={styles.title}>
              Аккредитационный
              <br />
              <em>центр</em>
            </h1>
            <p className={styles.subtitle}>
              Подтверждение проходит только через пробную аккредитацию: тесты, ситуационные задачи и ОСКЭ.
            </p>
          </div>

          <div className={styles.headerActions}>
            <button
              className={styles.primaryButton}
              data-testid="accreditation-create-simulation"
              disabled={creating || loading}
              onClick={() => void createSimulation()}
              type="button"
            >
              {creating ? "Создаем" : canUseActiveSimulation ? "Начать новую пробную аккредитацию" : "Начать пробную аккредитацию"}
              <ArrowIcon />
            </button>
          </div>
        </header>

        {notice ? (
          <div className={cx(styles.notice, styles[notice.tone])}>
            <span>{notice.message}</span>
          </div>
        ) : null}

        {loadError ? (
          <div className={cx(styles.notice, styles.danger)}>
            <span>{loadError}</span>
          </div>
        ) : null}

        <section className={cx(styles.protocolConsole, styles[overallTone])} aria-busy={loading} data-testid="accreditation-protocol">
          <div className={styles.protocolKicker}>Протокол пробной аккредитации</div>

          <div className={styles.protocolHero}>
            <div className={styles.protocolMainBlock}>
              <div className={styles.protocolHeroCopy}>
                <h2 className={styles.protocolHeroTitle} data-testid="accreditation-protocol-status">
                  <span className={styles.protocolStatusDot} aria-hidden="true" />
                  <span title={`${protocolTitleMain} ${protocolTitleAccent}`}>
                    {protocolTitleMain} {protocolTitleAccent}
                  </span>
                </h2>
                <p>{protocolSummary(visibleSimulation, protocol)}</p>

                <div className={styles.protocolNote}>
                  <span>
                    <ProtocolCheckIcon />
                  </span>
                  <p>Подтверждение проходит только через пробную аккредитацию: тесты, ситуационные задачи и ОСКЭ.</p>
                </div>
              </div>

              <div className={styles.protocolProgress}>
                <div
                  aria-label={`Общий прогресс ${protocolProgress}%`}
                  className={styles.protocolProgressRing}
                  style={{ "--protocol-progress": `${protocolProgress * 3.6}deg` } as CSSProperties}
                >
                  <div className={styles.protocolProgressValue}>
                    <strong>{protocolProgress}</strong>
                    <span>%</span>
                  </div>
                  <small>общий прогресс</small>
                </div>
              </div>
            </div>

            <div className={styles.protocolMeta}>
              <div className={styles.protocolMetaItem}>
                <span className={styles.protocolMetaIcon}><CalendarIcon /></span>
                <div>
                  <span>Дата старта</span>
                  <strong>{protocolStartDate}</strong>
                </div>
              </div>

              <div className={styles.protocolMetaItem}>
                <span className={styles.protocolMetaIcon}><TrendIcon /></span>
                <div>
                  <span>Последний результат</span>
                  <strong className={visibleSimulation?.passed ? styles.metaPositive : undefined}>{protocolLastResult}</strong>
                </div>
              </div>

              <div className={styles.protocolMetaItem}>
                <span className={styles.protocolMetaIcon}><ClockRefreshIcon /></span>
                <div>
                  <span>Обновление протокола</span>
                  <strong>в реальном времени</strong>
                </div>
              </div>

              <button
                className={styles.protocolHistoryButton}
                onClick={() => setHistoryOpen(true)}
                type="button"
              >
                История пробной аккредитации
                <ArrowIcon />
              </button>
            </div>

            <div className={styles.protocolHeroTodo}>
              <div className={styles.protocolSmallTitle}>Что нужно сделать</div>
              <ul data-testid="accreditation-action-items">
                {protocolTodoItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className={styles.protocolFlow}>
            <div className={styles.stages} aria-busy={loading}>
              {STAGES.map((stageInfo) => {
                const stage = stageMap.get(stageInfo.key) ?? null;
                const protocolStage = protocolStageMap.get(stageInfo.key) ?? null;
                const tone = stageTone(stage?.status ?? protocolStage?.status);
                const stagePassed = stage?.status === "passed" || protocolStage?.status === "passed";
                const stageFailed = stage?.status === "failed" || protocolStage?.status === "failed";
                const stageFinished = stagePassed || stageFailed;
                const disabled = !canUseActiveSimulation || stageFinished || startingStage !== null || loading;
                const actionLabel = stagePassed
                  ? "Сдано"
                  : stageFailed
                    ? "Новая пробная аккредитация"
                  : startingStage === stageInfo.key
                    ? "Открываем"
                    : canUseActiveSimulation
                      ? "Начать этап"
                      : "Сначала пробная аккредитация";

                return (
                  <article
                    className={cx(styles.stageCard, styles[tone], focusedStage === stageInfo.key && styles.focused)}
                    data-testid={`accreditation-stage-${stageInfo.key}`}
                    key={stageInfo.key}
                  >
                    <div className={styles.stageTop}>
                      <span className={styles.stageNumber}>{stageInfo.number}</span>
                      <span className={styles.stageStatus} data-testid={`accreditation-stage-${stageInfo.key}-status`}>{stageStatusLabel(stage, protocolStage)}</span>
                    </div>

                    <h2 className={styles.stageTitle}>{protocolStage?.label ?? stageInfo.title}</h2>
                    <div className={styles.stageRequirement}>{protocolStage?.requirement_label ?? stageInfo.requirement}</div>

                    <div className={styles.stageMetrics}>
                      <div>
                        <span>Результат</span>
                        <strong>{scoreLabel(stage, protocolStage)}</strong>
                      </div>
                      <div>
                        <span>Объем</span>
                        <strong>{progressLabel(stageInfo.key, stage)}</strong>
                      </div>
                    </div>

                    <p className={styles.stageDetail}>{protocolStage?.detail ?? stageInfo.requirement}</p>

                    <button
                      className={styles.stageButton}
                      data-testid={`accreditation-stage-${stageInfo.key}-start`}
                      disabled={disabled}
                      onClick={() => void startStage(stageInfo.key)}
                      type="button"
                    >
                      {actionLabel}
                      <ArrowIcon />
                    </button>
                  </article>
                );
              })}
            </div>
          </div>

        </section>

        {historyOpen && portalTarget ? createPortal(
          <div
            className={styles.historyOverlay}
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setHistoryOpen(false);
              }
            }}
          >
            <section
              aria-labelledby="accreditation-history-title"
              aria-modal="true"
              className={styles.historyModal}
              role="dialog"
            >
              <div className={styles.historyStripe} />
              <header className={styles.historyHeader}>
                <div>
                  <div className={styles.historyKicker}>История</div>
                  <h2 id="accreditation-history-title">Пробные аккредитации</h2>
                  <p>Здесь сохраняются запущенные пробные аккредитации и результат по каждому этапу.</p>
                </div>

                <button
                  aria-label="Закрыть"
                  className={styles.historyCloseButton}
                  onClick={() => setHistoryOpen(false)}
                  type="button"
                >
                  <CloseIcon />
                </button>
              </header>

              {historySimulations.length > 0 ? (
                <div className={styles.historyList}>
                  {historySimulations.map((simulation, index) => {
                    const simulationStageMap = buildStageMap(simulation);
                    const simulationProgress = buildOverallProgress(simulationStageMap, new Map());
                    const tone = simulationHistoryTone(simulation);

                    return (
                      <article className={cx(styles.historyItem, styles[tone])} key={simulation.id}>
                        <div className={styles.historyItemTop}>
                          <div>
                            <span className={styles.historyAttempt}>Попытка {historySimulations.length - index}</span>
                            <strong>{simulationStatusLabel(simulation)}</strong>
                          </div>
                          <span className={styles.historyDate}>
                            {formatProtocolDate(simulation.started_at ?? simulation.created_at)}
                          </span>
                        </div>

                        <p>{simulationHistorySubtitle(simulation)}</p>

                        <div className={styles.historyProgress}>
                          <span>Общий прогресс</span>
                          <strong>{simulationProgress}%</strong>
                          <div className={styles.historyProgressTrack}>
                            <i style={{ width: `${simulationProgress}%` }} />
                          </div>
                        </div>

                        <div className={styles.historyStages}>
                          {STAGES.map((stageInfo) => {
                            const stage = simulationStageMap.get(stageInfo.key) ?? null;
                            const score = stage?.score_percent != null ? ` · ${Math.round(stage.score_percent)}%` : "";

                            return (
                              <span className={styles.historyStagePill} key={stageInfo.key}>
                                {stageInfo.title}: {stageStatusLabel(stage, null)}{score}
                              </span>
                            );
                          })}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.historyEmpty}>
                  <strong>Истории пока нет</strong>
                  <p>Здесь появятся только пробные аккредитации, где был начат хотя бы один этап.</p>
                </div>
              )}
            </section>
          </div>,
          portalTarget,
        ) : null}
      </div>
    </DashboardLayout>
  );
}

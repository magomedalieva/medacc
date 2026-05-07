import type { ExamStageProtocol, ReadinessSummary } from "../types/api";
import styles from "./DashboardProgressPanel.module.css";

function TrendIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18">
      <path
        d="M2.5 13.5 6.4 9.6l2.8 2.8 5.5-6.1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M11 6.3h3.7V10"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 22 22">
      <path
        d="M11 2.6 17.2 5v5.1c0 4-2.4 7.4-6.2 9.3-3.8-1.9-6.2-5.3-6.2-9.3V5L11 2.6Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="m7.7 11 2.2 2.2 4.6-5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12">
      <path
        d="M2 6h7M6.5 3.2 9.4 6 6.5 8.8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function StageIcon({ status }: { status: ExamStageProtocol["status"] }) {
  if (status === "passed") {
    return (
      <svg aria-hidden="true" viewBox="0 0 12 12">
        <path
          d="m3 6 2 2 4-4.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.4"
        />
      </svg>
    );
  }

  if (status === "failed") {
    return (
      <svg aria-hidden="true" viewBox="0 0 12 12">
        <path
          d="m3.5 3.5 5 5M8.5 3.5l-5 5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.4"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 12 12">
      <path
        d="M3.2 6h5.6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function shortStageLabel(stage: ExamStageProtocol): string {
  if (stage.key === "tests") {
    return "Тесты";
  }

  if (stage.key === "cases") {
    return "Кейсы";
  }

  if (stage.key === "osce") {
    return "ОСКЭ";
  }

  return stage.label;
}

function stageProgress(stage: ExamStageProtocol): number {
  if (stage.status === "passed") {
    return 100;
  }

  if (stage.status === "failed") {
    return 100;
  }

  return stage.status_label === "В процессе" ? 18 : 0;
}

function stageTone(status: ExamStageProtocol["status"]): string {
  if (status === "passed") {
    return styles.stagePassed;
  }

  if (status === "failed") {
    return styles.stageFailed;
  }

  return styles.stagePending;
}

function stageValue(stage: ExamStageProtocol): string {
  if (stage.result_label && stage.result_label !== "Нет результата") {
    return stage.result_label;
  }

  return stage.requirement_label;
}

export function DashboardProgressPanel({
  readiness,
  focusActionLabel,
  onFocusAction,
  onProtocolAction,
  isInitialState = false,
  isInitialDiagnosticOnly = false,
  initialDiagnosticPercent = null,
}: {
  readiness: ReadinessSummary;
  hasCurrentTask: boolean;
  hasStudyTime: boolean;
  isCurrentTaskOverdue: boolean;
  isTodayStudyDay: boolean;
  focusActionLabel: string;
  onFocusAction: () => void;
  onProtocolAction: () => void;
  isInitialState?: boolean;
  isInitialDiagnosticOnly?: boolean;
  initialDiagnosticPercent?: number | null;
}) {
  const protocol = readiness.exam_protocol;
  const readinessPercent = Math.round(readiness.overall_readiness_percent);
  const displayedReadinessPercent = isInitialState
    ? 0
    : isInitialDiagnosticOnly && typeof initialDiagnosticPercent === "number"
      ? Math.round(initialDiagnosticPercent)
      : readinessPercent;
  const focusTrack =
    readiness.tracks.find((track) => track.key === readiness.recommended_focus_key) ??
    readiness.tracks[0] ??
    null;
  const focusDetail = isInitialState
    ? "Пока нет прохождений, поэтому система не делает выводы о слабых темах. Начни со стартовой диагностики."
    : isInitialDiagnosticOnly
      ? "Диагностика уже показала стартовый уровень. План построен по слабым темам, а учебная готовность начнет расти после занятий."
    : focusTrack?.detail ?? "Система выбрала ближайший учебный фокус по текущим результатам.";
  const confirmedStages = protocol.stages.filter((stage) => stage.status === "passed").length;
  const protocolPercent = Math.round((confirmedStages / Math.max(protocol.stages.length, 1)) * 100);

  return (
    <div className={styles.stack}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitle}>
            <TrendIcon />
            <span>Учебный прогноз</span>
          </div>
        </div>

        <div className={styles.forecastGrid}>
          <div className={styles.forecastCopy}>
            <span className={styles.eyebrow}>{isInitialDiagnosticOnly ? "Стартовый уровень" : "Учебная готовность"}</span>
            <strong className={styles.readinessValue}>{displayedReadinessPercent}%</strong>
            <span className={styles.levelText}>
              {isInitialState
                ? "Пока нет данных"
                : isInitialDiagnosticOnly
                  ? "План составлен"
                : readinessPercent >= 85
                ? "Хороший уровень"
                : readinessPercent >= 70
                  ? "Средний уровень"
                  : "Нужно добрать"}
            </span>
          </div>

          <div
            aria-label={`Учебный прогноз ${displayedReadinessPercent}%`}
            className={styles.bigRing}
            style={{ "--ring-value": `${displayedReadinessPercent * 3.6}deg` } as React.CSSProperties}
          >
            <TrendIcon />
          </div>

          <div className={styles.focusBox}>
            <span className={styles.eyebrow}>Фокус сейчас</span>
            <strong>
              {isInitialState
                ? "Стартовая диагностика"
                : isInitialDiagnosticOnly
                  ? "План по слабым темам"
                  : readiness.recommended_focus_label}
            </strong>
            <p aria-label={focusDetail} title={focusDetail}>{focusDetail}</p>
            <button className={styles.inlineAction} onClick={onFocusAction} type="button">
              {focusActionLabel}
              <ArrowIcon />
            </button>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitle}>
            <ShieldIcon />
            <span>Протокол пробной аккредитации</span>
          </div>
          <button className={styles.detailButton} onClick={onProtocolAction} type="button">
            Детализация
            <ArrowIcon />
          </button>
        </div>

        <div className={styles.protocolGrid}>
          <div
            aria-label={`Подтверждено ${protocolPercent}% этапов`}
            className={styles.protocolRing}
            style={{ "--ring-value": `${protocolPercent * 3.6}deg` } as React.CSSProperties}
          >
            <ShieldIcon />
          </div>

          <div className={styles.stageList}>
            {protocol.stages.map((stage) => (
              <button
                className={styles.stageRow}
                key={stage.key}
                onClick={onProtocolAction}
                type="button"
              >
                <span className={`${styles.stageIcon} ${stageTone(stage.status)}`}>
                  <StageIcon status={stage.status} />
                </span>
                <span className={styles.stageText}>
                  <strong title={stage.label}>{shortStageLabel(stage)}</strong>
                  <span title={stageValue(stage)}>{stageValue(stage)}</span>
                </span>
                <span className={styles.stageBar}>
                  <span
                    className={stageTone(stage.status)}
                    style={{ width: `${stageProgress(stage)}%` }}
                  />
                </span>
                <span className={`${styles.stageStatus} ${stageTone(stage.status)}`}>
                  {stage.status_label}
                </span>
                <ArrowIcon />
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

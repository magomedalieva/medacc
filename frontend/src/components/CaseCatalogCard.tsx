import { Button } from "./Button";
import { StatusBadge } from "./StatusBadge";
import styles from "./CaseCatalogCard.module.css";

type CaseCatalogTone = "default" | "accent" | "green" | "warm";

export function CaseCatalogCard({
  title,
  subtitle,
  section,
  statusLabel,
  statusTone,
  summary,
  durationLabel,
  difficultyLabel,
  accuracyLabel,
  warning,
  selected = false,
  onPreview,
  onPractice,
  onSimulation,
  practiceDisabled = false,
  practicePending = false,
  simulationDisabled = false,
  simulationPending = false,
}: {
  title: string;
  subtitle?: string;
  section: string;
  statusLabel: string;
  statusTone: CaseCatalogTone;
  summary: string;
  durationLabel: string;
  difficultyLabel: string;
  accuracyLabel: string;
  warning?: string;
  selected?: boolean;
  onPreview: () => void;
  onPractice: () => void;
  onSimulation: () => void;
  practiceDisabled?: boolean;
  practicePending?: boolean;
  simulationDisabled?: boolean;
  simulationPending?: boolean;
}) {
  return (
    <article className={`${styles.card} ${selected ? styles.selected : ""}`.trim()}>
      <div className={styles.head}>
        <div className={styles.meta}>
          <span className={styles.section}>{section}</span>
          <StatusBadge label={statusLabel} tone={statusTone} />
        </div>
        <div className={styles.title}>{title}</div>
        {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
      </div>

      <p className={styles.summary}>{summary}</p>

      <div className={styles.facts}>
        <span>{durationLabel}</span>
        <span>{difficultyLabel}</span>
        <span>{accuracyLabel}</span>
      </div>

      {warning ? <div className={styles.warning}>{warning}</div> : null}

      <div className={styles.actions}>
        <Button onClick={onPreview} variant="quiet">
          Сценарий
        </Button>
        <Button disabled={practiceDisabled || practicePending} onClick={onPractice} variant="secondary">
          {practicePending ? "Запускаем..." : "Разбор"}
        </Button>
        <Button disabled={simulationDisabled || simulationPending} onClick={onSimulation} variant="primary">
          {simulationPending ? "Запускаем..." : "Контроль"}
        </Button>
      </div>
    </article>
  );
}

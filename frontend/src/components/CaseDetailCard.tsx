import { Button } from "./Button";
import styles from "./CaseDetailCard.module.css";

type CaseDetailFact = { label: string; value: string };

export function CaseDetailCard({
  title,
  subtitle,
  patientSummary,
  facts,
  topicName,
  difficulty,
  durationMinutes,
  focusPoints,
  examTargets,
  discussionQuestions,
  canPractice,
  practicePending = false,
  simulationPending = false,
  onPractice,
  onSimulation,
  routeSummary,
}: {
  title: string;
  subtitle?: string;
  patientSummary: string;
  facts: CaseDetailFact[];
  topicName?: string | null;
  difficulty: string;
  durationMinutes: number;
  focusPoints: string[];
  examTargets: string[];
  discussionQuestions: string[];
  canPractice: boolean;
  practicePending?: boolean;
  simulationPending?: boolean;
  onPractice: () => void;
  onSimulation: () => void;
  routeSummary?: string;
}) {
  return (
    <article className={styles.card}>
      <div className={styles.head}>
        <h3 className={styles.title}>{title}</h3>
        {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
      </div>

      <p className={styles.summary}>{patientSummary}</p>

      {facts.length > 0 ? (
        <div className={styles.factGrid}>
          {facts.map((fact) => (
            <div className={styles.fact} key={`${fact.label}-${fact.value}`}>
              <div className={styles.factLabel}>{fact.label}</div>
              <div className={styles.factValue}>{fact.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className={styles.meta}>
        {topicName ? <span>Тема <strong>{topicName}</strong></span> : null}
        <span>Сложность <strong>{difficulty}</strong></span>
        <span>Время <strong>{durationMinutes} мин</strong></span>
      </div>

      <div className={styles.noteGrid}>
        <article className={styles.note}>
          <strong>Ключевые действия</strong>
          <p>{focusPoints.join(", ") || "Фокус действий появится после наполнения кейса."}</p>
        </article>
        <article className={styles.note}>
          <strong>Цели аккредитации</strong>
          <p>{examTargets.join(", ") || "Цели аккредитации появятся после наполнения кейса."}</p>
        </article>
        <article className={styles.note}>
          <strong>Вопросы для самопроверки</strong>
          <p>{discussionQuestions.join(" / ") || "Вопросы для самопроверки появятся после наполнения кейса."}</p>
        </article>
      </div>

      {canPractice ? (
        <div className={styles.actions}>
          <Button disabled={practicePending} onClick={onPractice} variant="secondary">
            {practicePending ? "Запускаем..." : "Разбор кейса"}
          </Button>
          <Button disabled={simulationPending} onClick={onSimulation} variant="primary">
            {simulationPending ? "Запускаем..." : "Контроль"}
          </Button>
        </div>
      ) : null}

      {routeSummary ? <div className={styles.routeSummary}>{routeSummary}</div> : null}
    </article>
  );
}

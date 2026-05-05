import { LinkButton } from "./LinkButton";
import { MetricCard } from "./MetricCard";
import { StatusBadge } from "./StatusBadge";
import styles from "./OsceStationCard.module.css";

type OsceStationTone = "default" | "accent" | "green" | "warm";

export function OsceStationCard({
  section,
  title,
  subtitle,
  summary,
  statusLabel,
  statusTone,
  skillLevel,
  stationLink,
  metrics,
}: {
  section: string;
  title: string;
  subtitle?: string;
  summary: string;
  statusLabel: string;
  statusTone: OsceStationTone;
  skillLevel: string;
  stationLink: string;
  metrics: Array<{ label: string; value: string }>;
}) {
  return (
    <article className={styles.card}>
      <div className={styles.head}>
        <div className={styles.copy}>
          <div className={styles.section}>{section}</div>
          <div className={styles.title}>{title}</div>
          {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
        </div>
        <StatusBadge label={statusLabel} tone={statusTone} />
      </div>

      <p className={styles.summary}>{summary}</p>

      <div className={styles.metrics}>
        {metrics.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} />
        ))}
      </div>

      <div className={styles.actions}>
        <StatusBadge label={skillLevel} tone="warm" />
        <LinkButton to={stationLink} variant="primary">
          Открыть станцию
        </LinkButton>
      </div>
    </article>
  );
}

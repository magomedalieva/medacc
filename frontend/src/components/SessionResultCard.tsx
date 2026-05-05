import { LinkButton } from "./LinkButton";
import { MetricCard } from "./MetricCard";
import { StatusBadge } from "./StatusBadge";
import { Wrapper } from "./Wrapper";
import styles from "./SessionResultCard.module.css";

export function SessionResultCard({
  scoreLabel,
  passed,
  subtitle,
  metrics,
}: {
  scoreLabel: string;
  passed: boolean;
  subtitle: string;
  metrics: Array<{ label: string; value: string; tone?: "default" | "accent" | "green" | "warm" }>;
}) {
  return (
    <article className={styles.card}>
      <div className={`${styles.score} ${passed ? styles.pass : styles.fail}`}>{scoreLabel}</div>
      <div className={styles.subtitle}>{subtitle}</div>
      <StatusBadge
        label={passed ? "Порог пройден" : "Нужно усилить подготовку"}
        tone={passed ? "green" : "accent"}
      />
      <Wrapper layout="grid" minItemWidth={160} gap={12}>
        {metrics.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} tone={metric.tone ?? "default"} value={metric.value} />
        ))}
      </Wrapper>
      <Wrapper direction="row" gap={10} wrap>
        <LinkButton to="/app/practice" variant="secondary">
          К тестам
        </LinkButton>
        <LinkButton to="/app/dashboard" variant="primary" withArrow>
          В кабинет
        </LinkButton>
      </Wrapper>
    </article>
  );
}

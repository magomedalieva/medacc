import { StatusBadge } from "./StatusBadge";
import { SegmentedTabs } from "./SegmentedTabs";
import styles from "./OsceStationHeroCard.module.css";

type StationTabId = "checklist" | "quiz" | "results";

type StationStatusTone = "default" | "accent" | "green" | "warm";

export function OsceStationHeroCard({
  section,
  topic,
  title,
  subtitle,
  statusLabel,
  statusTone,
  skillLevel,
  durationMinutes,
  maxScore,
  activeTab,
  onTabChange,
}: {
  section: string;
  topic: string;
  title: string;
  subtitle?: string;
  statusLabel: string;
  statusTone: StationStatusTone;
  skillLevel: string;
  durationMinutes: number;
  maxScore: number;
  activeTab: StationTabId;
  onTabChange: (value: StationTabId) => void;
}) {
  return (
    <article className={styles.card}>
      <div className={styles.head}>
        <div className={styles.copy}>
          <div className={styles.kicker}>
            {section} · {topic}
          </div>
          <h3 className={styles.title}>{title}</h3>
          {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
        </div>
        <StatusBadge label={statusLabel} tone={statusTone} />
      </div>

      <div className={styles.meta}>
        <span>Формат <strong>{skillLevel}</strong></span>
        <span>Время <strong>{durationMinutes} мин</strong></span>
        <span>Макс. балл <strong>{maxScore}</strong></span>
      </div>

      <SegmentedTabs
        items={[
          { label: "Чек-лист", value: "checklist" },
          { label: "Мини-тест", value: "quiz" },
          { label: "Результаты", value: "results" },
        ]}
        onChange={onTabChange}
        value={activeTab}
      />
    </article>
  );
}

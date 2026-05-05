import type { PlanEventItem } from "../types/api";

import { collapseRepeatedPlanEvents } from "../lib/planEvents";
import { plannerActionImpact } from "../lib/plannerUi";
import { SectionTitle } from "./SectionTitle";
import { StatusBadge } from "./StatusBadge";
import { Wrapper } from "./Wrapper";
import styles from "./PlanEventFeed.module.css";

function eventLabel(eventType: string): string {
  if (eventType === "created" || eventType === "regenerated") {
    return "План";
  }

  if (eventType === "postponed") {
    return "Перенос";
  }

  if (eventType === "rescheduled") {
    return "На дату";
  }

  if (eventType === "skipped") {
    return "Пропуск";
  }

  if (eventType === "completed") {
    return "Готово";
  }

  if (eventType === "preferences_updated") {
    return "Режим";
  }

  if (eventType === "catch_up") {
    return "Маршрут";
  }

  return "Событие";
}

function eventImpact(eventType: string): string | null {
  if (eventType === "postponed") {
    return plannerActionImpact("postponed");
  }

  if (eventType === "rescheduled") {
    return plannerActionImpact("rescheduled");
  }

  if (eventType === "skipped") {
    return plannerActionImpact("skipped");
  }

  if (eventType === "completed") {
    return "Результат учтен, и оставшаяся часть плана уже адаптирована.";
  }

  if (eventType === "preferences_updated") {
    return "Будущая часть плана пересчитана под новый темп, интенсивность и учебный график.";
  }

  if (eventType === "catch_up") {
    return "Старые просроченные задачи сохранены в истории, а активный маршрут начинается от текущей даты.";
  }

  return null;
}

function formatEventMoment(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function PlanEventFeed({
  title = "Последние изменения плана",
  items,
}: {
  title?: string;
  items: PlanEventItem[];
}) {
  const visibleItems = collapseRepeatedPlanEvents(items);

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <Wrapper gap={16}>
      <SectionTitle>{title}</SectionTitle>
      <div className={styles.list}>
        {visibleItems.map((item) => {
          const impact = eventImpact(item.event_type);

          return (
            <article className={styles.item} key={item.id}>
              <div className={styles.head}>
                <Wrapper align="center" direction="row" gap={10} wrap>
                  <StatusBadge label={eventLabel(item.event_type)} tone={item.tone} />
                </Wrapper>
                <span className={styles.meta}>{formatEventMoment(item.created_at)}</span>
              </div>
              <div className={styles.copy}>
                <p className={styles.title}>{item.title}</p>
                <p className={styles.description}>{item.description}</p>
                {impact ? <p className={styles.impact}>{impact}</p> : null}
              </div>
            </article>
          );
        })}
      </div>
    </Wrapper>
  );
}

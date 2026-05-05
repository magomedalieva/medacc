import { useEffect, useMemo } from "react";

import type { PlanEventItem } from "../types/api";

import { useNotifications, type NotificationTone } from "../contexts/NotificationContext";
import { collapseRepeatedPlanEvents } from "../lib/planEvents";

const FRESH_EVENT_WINDOW_MS = 2 * 60 * 1000;
const SEEN_STORAGE_KEY = "medacc.dashboard.seenPlanEventToasts";
const TOAST_EVENT_TYPES = new Set([
  "catch_up",
  "completed",
  "regenerated",
  "rescheduled",
]);

function notificationTone(event: PlanEventItem): NotificationTone {
  if (event.tone === "accent") {
    return "danger";
  }

  if (event.tone === "green") {
    return "success";
  }

  return "warm";
}

function eventIsFresh(event: PlanEventItem): boolean {
  const createdAt = Date.parse(event.created_at);

  if (!Number.isFinite(createdAt)) {
    return false;
  }

  const age = Date.now() - createdAt;
  return age >= -30_000 && age <= FRESH_EVENT_WINDOW_MS;
}

function readSeenEventIds(): Set<number> {
  try {
    const rawValue = window.sessionStorage.getItem(SEEN_STORAGE_KEY);
    const parsedValue = rawValue ? JSON.parse(rawValue) : [];

    if (!Array.isArray(parsedValue)) {
      return new Set();
    }

    return new Set(
      parsedValue.filter((item): item is number => typeof item === "number"),
    );
  } catch {
    return new Set();
  }
}

function rememberSeenEventIds(ids: number[]) {
  try {
    const currentIds = readSeenEventIds();
    ids.forEach((id) => currentIds.add(id));
    window.sessionStorage.setItem(
      SEEN_STORAGE_KEY,
      JSON.stringify([...currentIds].slice(-40)),
    );
  } catch {
    // Toast history is only a comfort feature; storage errors should not affect the dashboard.
  }
}

function normalizeDescription(event: PlanEventItem): string {
  if (event.event_type === "catch_up") {
    return "До аккредитации осталось меньше времени, поэтому план пересобран с сегодняшнего дня.";
  }

  if (event.event_type === "postponed" || event.event_type === "rescheduled") {
    return "Задача сдвинута, план после этой точки пересчитан.";
  }

  if (event.description.length <= 130) {
    return event.description;
  }

  return `${event.description.slice(0, 127).trim()}...`;
}

export function DashboardEventStrip({ events }: { events: PlanEventItem[] }) {
  const { addNotification } = useNotifications();
  const freshEvents = useMemo(
    () =>
      collapseRepeatedPlanEvents(events)
        .filter(
          (event) =>
            TOAST_EVENT_TYPES.has(event.event_type) && eventIsFresh(event),
        )
        .slice(0, 1),
    [events],
  );

  useEffect(() => {
    const seenIds = readSeenEventIds();
    const nextEvents = freshEvents.filter((event) => !seenIds.has(event.id));

    if (nextEvents.length === 0) {
      return;
    }

    rememberSeenEventIds(nextEvents.map((event) => event.id));
    nextEvents.forEach((event) => {
      addNotification({
        title: event.title,
        message: normalizeDescription(event),
        tone: notificationTone(event),
      });
    });
  }, [addNotification, freshEvents]);

  return null;
}

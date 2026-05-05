import type { ReactNode } from "react";

import { EmptyStateCard } from "./EmptyStateCard";
import { LoadingScreen as ModernLoadingScreen } from "./LoadingScreen";
import { MetricCard } from "./MetricCard";
import { PlanEventFeed as ModernPlanEventFeed } from "./PlanEventFeed";
import { SectionTitle } from "./SectionTitle";
import { StatusBadge } from "./StatusBadge";
import { TopicProgressCard } from "./TopicProgressCard";

export function LoadingScreen({ label = "Загружаем интерфейс" }: { label?: string }) {
  return <ModernLoadingScreen label={label} />;
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return <SectionTitle>{children}</SectionTitle>;
}

export function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent" | "green" | "warm";
}) {
  return <MetricCard label={label} tone={tone} value={value} />;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  actionTo,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionTo?: string;
}) {
  return <EmptyStateCard actionLabel={actionLabel} actionTo={actionTo} description={description} title={title} />;
}

export function StatusPill({
  label,
  tone,
  size,
}: {
  label: string;
  tone: "default" | "accent" | "green" | "warm";
  size?: "default" | "compact";
}) {
  return <StatusBadge label={label} size={size} tone={tone} />;
}

export function PlanEventFeed({
  title = "Последние изменения плана",
  items,
}: {
  title?: string;
  items: Parameters<typeof ModernPlanEventFeed>[0]["items"];
}) {
  return <ModernPlanEventFeed items={items} title={title} />;
}

export function TopicProgress({
  label,
  caption,
  accuracyPercent,
  status,
}: {
  label: string;
  caption: string;
  accuracyPercent: number;
  status: string;
}) {
  return <TopicProgressCard accuracyPercent={accuracyPercent} caption={caption} label={label} status={status} />;
}

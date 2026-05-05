import type { User } from "../types/api";

export type StudyIntensity = User["study_intensity"];

export const DAILY_STUDY_MINUTE_OPTIONS = [
  { value: 30, label: "До 30 минут" },
  { value: 45, label: "Около 45 минут" },
  { value: 60, label: "Около часа" },
  { value: 90, label: "90 минут" },
  { value: 120, label: "До 2 часов" },
];

export const STUDY_INTENSITY_OPTIONS: Array<{ value: StudyIntensity; label: string }> = [
  { value: "gentle", label: "Мягкий режим" },
  { value: "steady", label: "Сбалансированный режим" },
  { value: "intensive", label: "Интенсивный режим" },
];

export const DEFAULT_STUDY_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export const STUDY_WEEKDAY_OPTIONS = [
  { value: 0, shortLabel: "Пн", fullLabel: "Понедельник" },
  { value: 1, shortLabel: "Вт", fullLabel: "Вторник" },
  { value: 2, shortLabel: "Ср", fullLabel: "Среда" },
  { value: 3, shortLabel: "Чт", fullLabel: "Четверг" },
  { value: 4, shortLabel: "Пт", fullLabel: "Пятница" },
  { value: 5, shortLabel: "Сб", fullLabel: "Суббота" },
  { value: 6, shortLabel: "Вс", fullLabel: "Воскресенье" },
] as const;

export function studyIntensityLabel(value: StudyIntensity): string {
  return STUDY_INTENSITY_OPTIONS.find((option) => option.value === value)?.label ?? "Сбалансированный режим";
}

export function normalizeStudyWeekdays(value: number[]): number[] {
  return Array.from(new Set(value))
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6)
    .sort((left, right) => left - right);
}

export function studyWeekdaysEqual(left: number[], right: number[]): boolean {
  const normalizedLeft = normalizeStudyWeekdays(left);
  const normalizedRight = normalizeStudyWeekdays(right);

  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }

  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

export function studyWeekdaysSummary(value: number[]): string {
  const normalized = normalizeStudyWeekdays(value);

  if (studyWeekdaysEqual(normalized, [...DEFAULT_STUDY_WEEKDAYS])) {
    return "ежедневно";
  }

  const labels = STUDY_WEEKDAY_OPTIONS.filter((option) => normalized.includes(option.value)).map(
    (option) => option.shortLabel,
  );
  const dayLabel = normalized.length === 1 ? "день" : normalized.length < 5 ? "дня" : "дней";

  return `${normalized.length} ${dayLabel} в неделю: ${labels.join(", ")}`;
}

export function isStudyWeekdaySelected(value: number[], weekday: number): boolean {
  return normalizeStudyWeekdays(value).includes(weekday);
}

export function isStudyDateAllowed(dateValue: string, studyWeekdays: number[]): boolean {
  if (!dateValue) {
    return false;
  }

  const parsedDate = new Date(`${dateValue}T00:00:00`);
  const weekday = (parsedDate.getDay() + 6) % 7;

  return normalizeStudyWeekdays(studyWeekdays).includes(weekday);
}

export function findNextAllowedStudyDate(
  startDate: string,
  studyWeekdays: number[],
  maxDate?: string | null,
): string | null {
  const normalized = normalizeStudyWeekdays(studyWeekdays);
  const candidate = new Date(`${startDate}T00:00:00`);
  const maxBoundary = maxDate ? new Date(`${maxDate}T00:00:00`) : null;

  while (!Number.isNaN(candidate.getTime())) {
    if (maxBoundary && candidate > maxBoundary) {
      return null;
    }

    const weekday = (candidate.getDay() + 6) % 7;

    if (normalized.includes(weekday)) {
      const year = candidate.getFullYear();
      const month = String(candidate.getMonth() + 1).padStart(2, "0");
      const day = String(candidate.getDate()).padStart(2, "0");

      return `${year}-${month}-${day}`;
    }

    candidate.setDate(candidate.getDate() + 1);
  }

  return null;
}

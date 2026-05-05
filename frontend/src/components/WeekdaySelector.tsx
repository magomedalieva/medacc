import {
  STUDY_WEEKDAY_OPTIONS,
  isStudyWeekdaySelected,
  normalizeStudyWeekdays,
  studyWeekdaysSummary,
} from "../lib/studyPreferences";
import styles from "./WeekdaySelector.module.css";

type WeekdaySelectorProps = {
  label: string;
  value: number[];
  onChange: (value: number[]) => void;
  disabled?: boolean;
  hint?: string;
};

export function WeekdaySelector({ label, value, onChange, disabled = false, hint }: WeekdaySelectorProps) {
  function handleToggle(weekday: number) {
    const isSelected = isStudyWeekdaySelected(value, weekday);
    const nextValue = isSelected ? value.filter((item) => item !== weekday) : [...value, weekday];
    const normalized = normalizeStudyWeekdays(nextValue);

    if (normalized.length === 0) {
      return;
    }

    onChange(normalized);
  }

  return (
    <div className={styles.field}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        <span className={styles.summary}>{studyWeekdaysSummary(value)}</span>
      </div>

      <div className={styles.grid}>
        {STUDY_WEEKDAY_OPTIONS.map((option) => {
          const isSelected = isStudyWeekdaySelected(value, option.value);

          return (
            <button
              key={option.value}
              aria-label={option.fullLabel}
              aria-pressed={isSelected}
              className={`${styles.day} ${isSelected ? styles.selected : ""}`.trim()}
              disabled={disabled}
              onClick={() => handleToggle(option.value)}
              type="button"
            >
              {option.shortLabel}
            </button>
          );
        })}
      </div>

      {hint ? <div className={styles.hint}>{hint}</div> : null}
    </div>
  );
}

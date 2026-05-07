import { useEffect, type FormEvent } from "react";

import { PLANNER_LOADING_POSTPONE_LABEL } from "../lib/plannerUi";
import styles from "./ScheduleRescheduleModal.module.css";

type ScheduleRescheduleModalProps = {
  availabilityNote: string;
  canConfirm: boolean;
  currentDateLabel: string;
  firstAffectedTaskDateLabel: string | null;
  firstAffectedTaskTitle: string | null;
  isSubmitting: boolean;
  maxDate: string | null;
  minDate: string;
  onClose: () => void;
  onConfirm: () => void;
  onDateChange: (value: string) => void;
  targetDate: string;
  targetDateLabel: string;
  targetDaySummary: string;
  taskTitle: string;
};

export function ScheduleRescheduleModal({
  availabilityNote,
  canConfirm,
  currentDateLabel,
  isSubmitting,
  maxDate,
  minDate,
  onClose,
  onConfirm,
  onDateChange,
  targetDate,
  targetDaySummary,
  taskTitle,
}: ScheduleRescheduleModalProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSubmitting, onClose]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isSubmitting && canConfirm && targetDate.length > 0) {
      onConfirm();
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.backdrop} onClick={isSubmitting ? undefined : onClose} />
      <form
        aria-labelledby="schedule-reschedule-title"
        aria-modal="true"
        className={styles.modal}
        onSubmit={handleSubmit}
        role="dialog"
      >
        <div className={styles.header}>
          <div>
            <div className={styles.kicker}>Планировщик</div>
            <h2 className={styles.title} id="schedule-reschedule-title">
              Перенести задачу
            </h2>
          </div>
          <button aria-label="Закрыть" className={styles.close} disabled={isSubmitting} onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.task}>
            <span>Задача</span>
            <strong>{taskTitle}</strong>
            <small>Сейчас: {currentDateLabel}</small>
          </div>

          <label className={styles.field}>
            <span>Новая дата</span>
            <input
              disabled={isSubmitting}
              max={maxDate ?? undefined}
              min={minDate}
              onChange={(event) => onDateChange(event.target.value)}
              type="date"
              value={targetDate}
            />
          </label>

          <div className={styles.summary}>{targetDaySummary}</div>

          <div className={styles.note}>{availabilityNote}</div>
        </div>

        <div className={styles.actions}>
          <button disabled={isSubmitting} onClick={onClose} type="button">
            Отмена
          </button>
          <button className={styles.primary} disabled={isSubmitting || !canConfirm || targetDate.length === 0} type="submit">
            {isSubmitting ? PLANNER_LOADING_POSTPONE_LABEL : "Перенести"}
          </button>
        </div>
      </form>
    </div>
  );
}

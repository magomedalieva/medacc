import { useEffect } from "react";

import { PLANNER_LOADING_POSTPONE_LABEL, PLANNER_RESCHEDULED_LABEL } from "../lib/plannerUi";
import { Button } from "./Button";
import { TextField } from "./TextField";
import { Wrapper } from "./Wrapper";
import styles from "./ScheduleRescheduleModal.module.css";

type ScheduleRescheduleModalProps = {
  availabilityNote: string;
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
  currentDateLabel,
  firstAffectedTaskDateLabel,
  firstAffectedTaskTitle,
  isSubmitting,
  maxDate,
  minDate,
  onClose,
  onConfirm,
  onDateChange,
  targetDate,
  targetDateLabel,
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

  return (
    <div aria-modal="true" className={styles.overlay} role="dialog">
      <div className={styles.backdrop} onClick={isSubmitting ? undefined : onClose} />
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.kicker}>Планировщик</div>
          <div className={styles.title}>Перенести задачу</div>
        </div>

        <div className={styles.body}>
          <p className={styles.description}>
            Выбери новую дату для задачи. Перед подтверждением видно, какая точка маршрута изменится первой.
          </p>

          <div className={styles.taskCard}>
            <div className={styles.taskLabel}>Задача</div>
            <div className={styles.taskTitle}>{taskTitle}</div>
            <div className={styles.taskMeta}>Сейчас запланирована на {currentDateLabel}</div>
          </div>

          <TextField
            label={PLANNER_RESCHEDULED_LABEL}
            max={maxDate ?? undefined}
            min={minDate}
            onChange={(event) => onDateChange(event.target.value)}
            type="date"
            value={targetDate}
          />

          <div className={styles.preview}>
            <div className={styles.previewLabel}>Что изменится</div>
            <div className={styles.previewGrid}>
              <div className={styles.previewCard}>
                <div className={styles.previewKicker}>Сейчас</div>
                <div className={styles.previewDate}>{currentDateLabel}</div>
                <div className={styles.previewTitle}>{taskTitle}</div>
              </div>

              <div className={styles.previewCardAccent}>
                <div className={styles.previewKicker}>После переноса</div>
                <div className={styles.previewDate}>{targetDateLabel}</div>
                <div className={styles.previewTitle}>{taskTitle}</div>
                <div className={styles.previewHint}>{targetDaySummary}</div>
              </div>
            </div>

            <div className={styles.impactCard}>
              <div className={styles.impactLabel}>Первое затронутое место маршрута</div>
              {firstAffectedTaskTitle && firstAffectedTaskDateLabel ? (
                <>
                  <div className={styles.impactTitle}>{firstAffectedTaskTitle}</div>
                  <div className={styles.impactMeta}>
                    Сейчас эта точка стоит на {firstAffectedTaskDateLabel}. После подтверждения она будет
                    пересчитана вместе со следующими днями.
                  </div>
                </>
              ) : (
                <div className={styles.impactMeta}>
                  После этой даты система просто пересчитает оставшиеся будущие слоты подготовки.
                </div>
              )}
            </div>
          </div>

          <div className={styles.note}>{availabilityNote}</div>
        </div>

        <Wrapper align="center" direction="row" gap={10} justify="end" wrap>
          <Button disabled={isSubmitting} onClick={onClose} variant="quiet">
            Отмена
          </Button>
          <Button disabled={isSubmitting || targetDate.length === 0} onClick={onConfirm} variant="primary">
            {isSubmitting ? PLANNER_LOADING_POSTPONE_LABEL : "Перенести"}
          </Button>
        </Wrapper>
      </div>
    </div>
  );
}

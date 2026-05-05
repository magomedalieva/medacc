import { QuestionOptionCard } from "./QuestionOptionCard";
import styles from "./TestQuestionCard.module.css";

type AnswerOption = { label: string; text: string };
type AnswerState = "default" | "correct" | "incorrect";

export function TestQuestionCard({
  difficultyLabel,
  questionId,
  questionText,
  options,
  selectedLabel,
  selectedStateByLabel,
  disabled = false,
  onSelect,
}: {
  difficultyLabel: string;
  questionId: number;
  questionText: string;
  options: AnswerOption[];
  selectedLabel: string;
  selectedStateByLabel: Record<string, AnswerState>;
  disabled?: boolean;
  onSelect: (label: string) => void;
}) {
  return (
    <article className={styles.card}>
      <div className={styles.kicker}>{difficultyLabel}</div>
      <h2 className={styles.title}>{questionText}</h2>
      <div className={styles.options}>
        {options.map((option) => (
          <QuestionOptionCard
            checked={selectedLabel === option.label}
            disabled={disabled}
            key={option.label}
            name={`question-${questionId}`}
            onChange={() => onSelect(option.label)}
            optionLabel={option.label}
            state={selectedStateByLabel[option.label] ?? "default"}
            text={option.text}
          />
        ))}
      </div>
    </article>
  );
}

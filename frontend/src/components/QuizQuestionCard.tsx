import { QuestionOptionCard } from "./QuestionOptionCard";
import styles from "./QuizQuestionCard.module.css";

type QuizOption = { label: string; text: string };

export function QuizQuestionCard({
  index,
  questionId,
  prompt,
  options,
  selectedLabel,
  onSelect,
  disabled = false,
}: {
  index: number;
  questionId: string;
  prompt: string;
  options: QuizOption[];
  selectedLabel?: string;
  onSelect: (label: string) => void;
  disabled?: boolean;
}) {
  return (
    <article className={styles.card}>
      <div className={styles.title}>
        {index}. {prompt}
      </div>
      <div className={styles.options}>
        {options.map((option) => (
          <QuestionOptionCard
            checked={selectedLabel === option.label}
            disabled={disabled}
            key={`${questionId}-${option.label}`}
            name={questionId}
            onChange={() => onSelect(option.label)}
            optionLabel={option.label}
            text={option.text}
          />
        ))}
      </div>
    </article>
  );
}

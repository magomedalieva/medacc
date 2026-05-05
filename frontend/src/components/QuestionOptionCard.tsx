import styles from "./QuestionOptionCard.module.css";

type QuestionOptionState = "default" | "correct" | "incorrect";

export function QuestionOptionCard({
  name,
  optionLabel,
  text,
  checked,
  disabled = false,
  onChange,
  state = "default",
}: {
  name: string;
  optionLabel: string;
  text: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  state?: QuestionOptionState;
}) {
  return (
    <label className={`${styles.card} ${checked ? styles.selected : ""} ${styles[state]}`.trim()}>
      <input checked={checked} disabled={disabled} name={name} onChange={onChange} type="radio" />
      <span className={styles.label}>{optionLabel}</span>
      <span className={styles.text}>{text}</span>
    </label>
  );
}

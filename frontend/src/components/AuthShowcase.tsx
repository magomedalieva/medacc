import styles from "./AuthShowcase.module.css";

export function AuthShowcase({
  kicker,
  title,
  accent,
  lead,
  items,
}: {
  kicker: string;
  title: string;
  accent: string;
  lead: string;
  items: Array<{ title: string; description: string }>;
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.crest}>
        <span className={styles.crestText}>MedAcc</span>
      </div>
      <div className={styles.kicker}>{kicker}</div>
      <h1 className={styles.title}>
        {title}
        <span>{accent}</span>
      </h1>
      <p className={styles.lead}>{lead}</p>
      <div className={styles.list}>
        {items.map((item) => (
          <article className={styles.item} key={item.title}>
            <strong>{item.title}</strong>
            <span>{item.description}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

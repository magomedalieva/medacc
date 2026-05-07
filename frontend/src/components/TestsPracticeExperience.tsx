import { startTransition, useDeferredValue, useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { api, ApiError } from "../lib/api";
import type { Topic, TopicAnalytics } from "../types/api";
import { TestsChrome } from "./TestsChrome";
import styles from "./TestsExperience.module.css";

type ModalType = "mixed" | "topic";
type SessionMode = "learning" | "exam";

function setRipplePosition(event: MouseEvent<HTMLElement>) {
  const element = event.currentTarget;
  const rect = element.getBoundingClientRect();
  const x = (((event.clientX - rect.left) / rect.width) * 100).toFixed(1);
  const y = (((event.clientY - rect.top) / rect.height) * 100).toFixed(1);
  element.style.setProperty("--rx", `${x}%`);
  element.style.setProperty("--ry", `${y}%`);
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7.25" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16.2 16.2 4.05 4.05" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ShuffleIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M3.75 7h3.1c1.75 0 2.9.85 4.15 2.55l2 2.7c1.25 1.7 2.4 2.55 4.15 2.55h3.1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17.35 4.3 20.25 7l-2.9 2.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.75 15h3.1c1.45 0 2.5-.58 3.5-1.78M13.65 8.82c1-.95 2.05-1.82 3.5-1.82h3.1M17.35 12.3l2.9 2.7-2.9 2.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TopicIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="4.25" y="3.75" width="15.5" height="16.5" rx="2.25" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 8h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 12h6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ArrowIcon({ size = 10 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M3 8h9.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m8.8 4.4 3.8 3.6-3.8 3.6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" className={styles["howto-arrow"]} width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="m6.5 9 5.5 5.5L17.5 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EmptySearchIcon() {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M5.25 4.25h7.25l4.25 4.25v2.25" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 4.25V8.5h4.25" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.25 4.25v15.5h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="15.25" cy="15.25" r="3.25" stroke="currentColor" strokeWidth="1.75" />
      <path d="m17.75 17.75 2.5 2.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function ModalCloseIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="m7 7 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m17 7-10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function statusTone(analytics: TopicAnalytics | undefined): "green" | "warm" | "accent" | "new" {
  if (!analytics) {
    return "new";
  }

  if (analytics.status === "weak") {
    return "accent";
  }

  if (analytics.status === "medium") {
    return "warm";
  }

  if (analytics.status === "strong") {
    return "green";
  }

  return analytics.answered_questions > 0 ? "green" : "new";
}

function statusLabel(analytics: TopicAnalytics | undefined) {
  if (!analytics || analytics.answered_questions === 0) {
    return "Новая";
  }

  return `${Math.round(analytics.accuracy_percent)}% точность`;
}

function statusBadgeLabel(analytics: TopicAnalytics | undefined) {
  if (!analytics || analytics.answered_questions === 0) {
    return "Новая";
  }

  if (analytics.status === "weak") {
    return "Нужно повторить";
  }

  if (analytics.status === "medium") {
    return "Зачтено";
  }

  return "Освоено";
}

function fillColor(tone: "green" | "warm" | "accent" | "new") {
  if (tone === "green") {
    return "var(--green)";
  }

  if (tone === "warm") {
    return "var(--gold)";
  }

  if (tone === "accent") {
    return "var(--accent)";
  }

  return "var(--ink-15)";
}

function HowToCard({
  active,
  icon,
  title,
  body,
  tone,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  body: string;
  tone: "default" | "accent" | "green" | "gold";
  onClick: () => void;
}) {
  const iconToneClass =
    tone === "accent"
      ? styles["qi-accent"]
      : tone === "green"
        ? styles["qi-green"]
        : tone === "gold"
          ? styles["qi-gold"]
        : styles["qi-def"];

  return (
    <div className={`${styles["howto-card"]} ${active ? styles.active : ""}`.trim()}>
      <button className={styles["howto-header"]} onClick={onClick} type="button">
        <div className={`${styles["howto-icon"]} ${styles.qi} ${iconToneClass}`.trim()}>{icon}</div>
        <div className={styles["howto-title"]}>{title}</div>
        <ChevronDownIcon />
      </button>
      <div className={styles["howto-content"]}>
        <div className={styles["howto-body"]}>{body}</div>
      </div>
    </div>
  );
}

export function TestsPracticeExperience() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [analytics, setAnalytics] = useState<TopicAnalytics[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("");
  const [activeHowTo, setActiveHowTo] = useState<"mixed" | "topic" | null>("mixed");
  const [modalType, setModalType] = useState<ModalType | null>(null);
  const [modalTopicId, setModalTopicId] = useState<number | null>(null);
  const [questionCount, setQuestionCount] = useState(30);
  const [mode, setMode] = useState<SessionMode>("learning");
  const [launching, setLaunching] = useState(false);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    if (!modalType) {
      return;
    }

    const { body, documentElement } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

    body.style.overflow = "hidden";

    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [modalType]);

  useEffect(() => {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);

    void Promise.all([api.listTopics(token, user?.faculty_id ?? undefined), api.getAnalyticsTopics(token)])
      .then(([topicItems, topicAnalytics]) => {
        setTopics(topicItems);
        setAnalytics(topicAnalytics);
      })
      .catch((exception) => {
        setError(exception instanceof ApiError ? exception.message : "Не удалось загрузить раздел тестирования");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token, user?.faculty_id]);

  const analyticsByTopic = new Map(analytics.map((item) => [item.topic_id, item]));
  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const visibleTopics = topics.filter((topic) => {
    if (!normalizedSearch) {
      return true;
    }

    return `${topic.name} ${topic.section_name}`.toLowerCase().includes(normalizedSearch);
  });

  const groupedSections: Array<{ name: string; topics: Topic[] }> = [];
  const groupedMap = new Map<string, Topic[]>();

  visibleTopics.forEach((topic) => {
    if (!groupedMap.has(topic.section_name)) {
      groupedMap.set(topic.section_name, []);
      groupedSections.push({ name: topic.section_name, topics: groupedMap.get(topic.section_name)! });
    }

    groupedMap.get(topic.section_name)!.push(topic);
  });

  useEffect(() => {
    if (groupedSections.length === 0) {
      if (activeSection) {
        setActiveSection("");
      }
      return;
    }

    if (!groupedSections.some((section) => section.name === activeSection)) {
      setActiveSection(groupedSections[0].name);
    }
  }, [activeSection, groupedSections]);

  function openModal(type: ModalType, topicId?: number) {
    setModalType(type);
    setModalTopicId(topicId ?? null);

    if (type === "mixed") {
      setQuestionCount(30);
      setMode("learning");
      return;
    }

    setQuestionCount(30);
    setMode("learning");
  }

  function closeModal() {
    if (launching) {
      return;
    }

    setModalType(null);
    setModalTopicId(null);
  }

  async function handleLaunchSession() {
    if (!token || !modalType) {
      return;
    }

    setLaunching(true);
    setError(null);

    try {
      const session = await api.startSession(token, {
        question_count: questionCount,
        mode,
        topic_id: modalType === "topic" ? modalTopicId : null,
      });

      closeModal();
      startTransition(() => navigate(`/app/tests/${session.id}`));
    } catch (exception) {
      setError(exception instanceof ApiError ? exception.message : "Не удалось запустить тест");
    } finally {
      setLaunching(false);
    }
  }

  const modalTopic = modalTopicId ? topics.find((topic) => topic.id === modalTopicId) ?? null : null;
  const modalAnalytics = modalTopic ? analyticsByTopic.get(modalTopic.id) : undefined;
  const modalCountOptions = modalType === "mixed" ? [30, 50, 70] : [30, 50];
  const showModes = true;
  const modalKicker =
    modalType === "mixed"
      ? "Ежедневная тренировка"
      : modalTopic?.section_name ?? "";
  const modalTitle =
    modalType === "mixed"
      ? "Смешанный тест"
      : modalTopic?.name ?? "";
  const modalDescription =
    modalType === "mixed"
      ? "Вопросы из разных тем в случайном порядке — идеально для ежедневной разминки и проверки общего уровня подготовки."
      : modalTopic?.description ?? "Тематический прогон с фокусом на уверенное решение профильных вопросов.";
  const modalToneClass = modalType === "topic" ? styles["m-green"] : "";
  const modalIconClass = modalType === "topic" ? styles["qi-green"] : styles["qi-gold"];
  const modalIcon = modalType === "topic" ? <TopicIcon /> : <ShuffleIcon />;

  return (
    <TestsChrome activeKey="tests">
      <div className={styles.shell}>
        <div className={`${styles.screen} ${styles.active}`.trim()}>
        {(error ?? "").length > 0 ? (
          <div className={`${styles.notice} ${styles.show} ${styles.danger}`.trim()}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M7 4.5v3M7 9v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span>{error}</span>
            <button className={styles["notice-x"]} onClick={() => setError(null)} type="button">
              &#10005;
            </button>
          </div>
        ) : null}

        <div className={styles.ph}>
          <div>
            <div className={styles["ph-kicker"]}>Первичная аккредитация · I этап</div>
            <h1 className={styles["ph-title"]}>
              Тестирование
              <br />
              <em>и практика</em>
            </h1>
            <p className={styles["ph-sub"]}>
              Запускай смешанные тесты и тематические прогоны для подготовки к теоретической части первичной аккредитации.
            </p>
          </div>
          <label className={styles["search-wrap"]}>
            <span className={styles["search-icon"]}>
              <SearchIcon />
            </span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск темы..."
              type="search"
              value={search}
            />
          </label>
        </div>

        <div className={styles["body-grid"]}>
          <div>
            <div className={styles["sec-lbl"]}>Быстрый старт</div>
            <div className={styles["qs-grid"]}>
              <button className={styles["qs-card"]} onClick={() => openModal("mixed")} onMouseDown={setRipplePosition} type="button">
                <div className={`${styles.qi} ${styles["qi-gold"]}`.trim()}>
                  <ShuffleIcon />
                </div>
                <div className={styles["qs-title"]}>Смешанный тест</div>
                <div className={styles["qs-desc"]}>
                  Вопросы из разных тем в случайном порядке — идеально для ежедневной тренировки и проверки общего
                  уровня.
                </div>
                <div className={styles["qs-foot"]}>
                  <span className={styles["qs-go"]}>
                    Начать <ArrowIcon />
                  </span>
                </div>
              </button>

            </div>

            <div className={styles["sec-lbl"]}>Тесты по темам</div>
            {loading ? (
              <div className={styles["empty-card"]}>
                <div className={styles["empty-icon"]}>
                  <TopicIcon />
                </div>
                <div className={styles["empty-title"]}>Загружаем темы</div>
                <div className={styles["empty-desc"]}>
                  Подтягиваем разделы и статистику, чтобы собрать страницу в реальных данных проекта.
                </div>
              </div>
            ) : groupedSections.length > 0 ? (
              <>
                <div className={styles["section-tabs"]}>
                  {groupedSections.map((section) => (
                    <button
                      className={`${styles.stab} ${activeSection === section.name ? styles.active : ""}`.trim()}
                      key={section.name}
                      onClick={() => setActiveSection(section.name)}
                      type="button"
                    >
                      {section.name}
                      <span className={styles["stab-count"]}>{section.topics.length}</span>
                    </button>
                  ))}
                </div>

                {groupedSections.map((section) => (
                  <div
                    className={`${styles["section-panel"]} ${activeSection === section.name ? styles.active : ""}`.trim()}
                    key={section.name}
                  >
                    <div className={styles["topic-list"]}>
                      {section.topics.map((topic, index) => {
                        const topicAnalytics = analyticsByTopic.get(topic.id);
                        const tone = statusTone(topicAnalytics);

                        return (
                          <button
                            className={styles["topic-row"]}
                            key={topic.id}
                            onClick={() => openModal("topic", topic.id)}
                            onMouseDown={setRipplePosition}
                            style={
                              {
                                ["--tc" as const]: tone === "green"
                                  ? "var(--green)"
                                  : tone === "warm"
                                    ? "var(--gold)"
                                    : tone === "accent"
                                      ? "var(--accent)"
                                      : "var(--ink)",
                                animationDelay: `${index * 30}ms`,
                              } as CSSProperties
                            }
                            type="button"
                          >
                            <div className={styles["tr-info"]}>
                              <div className={styles["tr-name"]} title={topic.name}>{topic.name}</div>
                              <div className={styles["tr-prog-wrap"]}>
                                {topicAnalytics && topicAnalytics.answered_questions > 0 ? (
                                  <>
                                    <div className={styles["tr-bar"]}>
                                      <div
                                        className={styles["tr-bar-fill"]}
                                        style={
                                          {
                                            width: `${Math.round(topicAnalytics.accuracy_percent)}%`,
                                            background: fillColor(tone),
                                          } as CSSProperties
                                        }
                                      />
                                    </div>
                                    <span className={styles["tr-pct"]}>{Math.round(topicAnalytics.accuracy_percent)}%</span>
                                  </>
                                ) : (
                                  <span className={styles["tr-pct"]} style={{ color: "var(--ink-40)" } as CSSProperties}>
                                    Не проходилась
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className={styles["tr-go"]}>
                              Начать <ArrowIcon />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className={styles["empty-card"]}>
                <div className={styles["empty-icon"]}>
                  <EmptySearchIcon />
                </div>
                <div className={styles["empty-title"]}>Темы не найдены</div>
                <div className={styles["empty-desc"]}>
                  {normalizedSearch ? "По запросу не нашлось. Попробуйте другое слово." : "В базе пока нет тем."}
                </div>
              </div>
            )}
          </div>

          <div className={styles.sidebar}>
            <div className={styles["sec-lbl"]}>Как использовать</div>

            <HowToCard
              active={activeHowTo === "mixed"}
              body="Подходит для ежедневной практики и быстрой проверки учебной теоретической готовности. 10–15 минут каждый день."
              icon={<ShuffleIcon />}
              onClick={() => setActiveHowTo((current) => (current === "mixed" ? null : "mixed"))}
              title="Смешанный тест"
              tone="gold"
            />

            <HowToCard
              active={activeHowTo === "topic"}
              body="Лучший режим для закрытия слабых зон. Цветовая индикация показывает приоритеты."
              icon={<TopicIcon />}
              onClick={() => setActiveHowTo((current) => (current === "topic" ? null : "topic"))}
              title="Тест по теме"
              tone="green"
            />
          </div>
        </div>
      </div>

      <div
        className={`${styles.overlay} ${modalType ? styles.show : ""}`.trim()}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeModal();
          }
        }}
        role="presentation"
      >
        {modalType ? (
          <div className={`${styles.modal} ${modalToneClass}`.trim()}>
              <div className={styles["modal-head"]}>
                <div className={`${styles["modal-icon"]} ${styles.qi} ${modalIconClass}`.trim()}>{modalIcon}</div>
                <div className={styles["modal-heading"]}>
                  <div className={styles["modal-kicker"]}>{modalKicker}</div>
                  <div className={styles["modal-title"]}>{modalTitle}</div>
                </div>
                <button className={styles["modal-close"]} onClick={closeModal} type="button">
                  <ModalCloseIcon />
                </button>
              </div>

              <div className={styles["modal-body"]}>
                <p className={styles["modal-desc"]}>{modalDescription}</p>

                {modalType === "topic" && modalAnalytics && modalAnalytics.answered_questions > 0 ? (
                  <div className={styles["m-analytics"]}>
                    <div className={styles["ma-row"]}>
                      <span className={styles["ma-lbl"]}>Точность по теме</span>
                      <span className={styles["ma-val"]}>{Math.round(modalAnalytics.accuracy_percent)}%</span>
                    </div>
                    <div className={styles["ma-row"]}>
                      <span className={styles["ma-lbl"]}>Статус</span>
                      <span className={`${styles.sbadge} ${styles[`sb-${statusTone(modalAnalytics)}`]}`.trim()}>
                        {statusBadgeLabel(modalAnalytics)}
                      </span>
                    </div>
                    <div className={styles["ma-row"]}>
                      <span className={styles["ma-lbl"]}>Попыток</span>
                      <span className={styles["ma-val"]}>{modalAnalytics.answered_questions}</span>
                    </div>
                  </div>
                ) : null}

                <div className={styles["m-sec-lbl"]}>Количество вопросов</div>
                <div className={styles["count-opts"]}>
                  {modalCountOptions.map((count) => (
                    <button
                      className={`${styles["count-opt"]} ${questionCount === count ? styles.active : ""}`.trim()}
                      key={count}
                      onClick={() => setQuestionCount(count)}
                      type="button"
                    >
                      {count}
                    </button>
                  ))}
                </div>

                {showModes ? (
                  <>
                    <div className={styles["m-sec-lbl"]}>Режим прохождения</div>
                    <div className={styles["mode-opts"]}>
                      <button
                        className={`${styles["mode-opt"]} ${mode === "learning" ? styles.active : ""}`.trim()}
                        onClick={() => setMode("learning")}
                        type="button"
                      >
                        <div className={styles["mode-radio"]}>
                          <div className={styles["mode-rdot"]} />
                        </div>
                        <div>
                          <div className={styles["mode-name"]}>Учебный режим</div>
                          <div className={styles["mode-hint"]}>После каждого ответа — правильный вариант и разбор</div>
                        </div>
                      </button>
                      <button
                        className={`${styles["mode-opt"]} ${mode === "exam" ? styles.active : ""}`.trim()}
                        onClick={() => setMode("exam")}
                        type="button"
                      >
                        <div className={styles["mode-radio"]}>
                          <div className={styles["mode-rdot"]} />
                        </div>
                        <div>
                          <div className={styles["mode-name"]}>Контроль без подсказок</div>
                          <div className={styles["mode-hint"]}>Результат и разбор после финиша; это учебная проверка</div>
                        </div>
                      </button>
                    </div>
                  </>
                ) : null}

                <div className={styles["m-sec-lbl"]}>Параметры сессии</div>
                <div className={styles["m-stats"]}>
                  <div className={styles["ms-col"]}>
                    <div className={styles["ms-lbl"]}>Вопросов</div>
                    <div className={styles["ms-val"]}>{questionCount}</div>
                  </div>
                  <div className={styles["ms-col"]}>
                    <div className={styles["ms-lbl"]}>~Минут</div>
                    <div className={styles["ms-val"]}>{Math.round(questionCount * 1.5)}</div>
                  </div>
                  <div className={styles["ms-col"]}>
                    <div className={`${styles["ms-val"]} ${styles["ms-val-sm"]}`.trim()}>
                      {mode === "exam" ? "Контроль" : "Учебный"}
                    </div>
                    <div className={styles["ms-lbl"]}>Режим</div>
                  </div>
                </div>
              </div>

              <div className={styles["modal-foot"]}>
                <button className={`${styles.btn} ${styles["btn-o"]}`.trim()} onClick={closeModal} type="button">
                  Отмена
                </button>
                <button
                  className={`${styles.btn} ${styles["btn-p"]}`.trim()}
                  onClick={handleLaunchSession}
                  onMouseDown={setRipplePosition}
                  type="button"
                >
                  <span className={styles["btn-rip"]} />
                  {launching ? <span className={styles.spin} /> : null}
                  <span>{launching ? "Запускаем..." : "Начать тест"}</span>
                  {!launching ? (
                    <span className={styles["btn-arr"]}>
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path
                          d="M1.5 6.5h9M7 2.5l4 4-4 4"
                          stroke="white"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  ) : null}
                </button>
              </div>
          </div>
        ) : null}
      </div>
      </div>
    </TestsChrome>
  );
}

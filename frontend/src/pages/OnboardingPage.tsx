import { startTransition, useEffect, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { api, ApiError } from "../lib/api";
import { getLocalTodayIso, shiftIsoDate } from "../lib/date";
import {
  DAILY_STUDY_MINUTE_OPTIONS,
  normalizeStudyWeekdays,
  studyIntensityLabel,
  STUDY_INTENSITY_OPTIONS,
  STUDY_WEEKDAY_OPTIONS,
  type StudyIntensity,
} from "../lib/studyPreferences";
import type { Faculty, User } from "../types/api";
import styles from "./OnboardingPage.module.css";

type NoticeTone = "danger" | "success";
type SlideDirection = "forward" | "backward";
type NoticeState = { message: string; tone: NoticeTone; persistent?: boolean } | null;

const MONTH_LABELS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const DEFAULT_ONBOARDING_WEEKDAYS = [0, 1, 2, 3, 4] as const;
const HERO_COUNTER_TARGETS = [48, 74, 45] as const;
const HERO_ANIMATION_DURATIONS = [1100, 900, 900] as const;
const TIME_OPTIONS = [
  { value: "30", label: "До 30" },
  { value: "45", label: "≈ 45" },
  { value: "60", label: "≈ час" },
  { value: "90", label: "90" },
  { value: "120", label: "2 часа" },
] as const;
const DISPLAY_INTENSITY_OPTIONS: Array<{
  value: StudyIntensity;
  title: string;
  description: string;
}> = [
  { value: "gentle", title: "Мягкий режим", description: "Плавный старт с лёгким ритмом" },
  { value: "steady", title: "Сбалансированный", description: "Ровный темп для большинства" },
  { value: "intensive", title: "Интенсивный", description: "Плотный режим с акцентом на результат" },
];

function cx(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

function formatDateLabel(value: string) {
  if (!value) {
    return "—";
  }

  const [year, month, day] = value.split("-");
  const monthIndex = Number(month) - 1;
  return `${Number(day)} ${MONTH_LABELS[monthIndex] ?? ""} ${year}`;
}

function getDayDifference(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function getPluralDayLabel(count: number) {
  if (count % 10 === 1 && count % 100 !== 11) {
    return "день";
  }

  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)) {
    return "дня";
  }

  return "дней";
}

function getSelectedTimeLabel(value: string) {
  return TIME_OPTIONS.find((option) => option.value === value)?.label ?? "≈ 45";
}

function getDisplayIntensityLabel(value: StudyIntensity) {
  return studyIntensityLabel(value);
}

function formatWeekdaySummary(value: number[]) {
  const normalized = normalizeStudyWeekdays(value);

  if (!normalized.length) {
    return "—";
  }

  return STUDY_WEEKDAY_OPTIONS.filter((option) => normalized.includes(option.value))
    .map((option) => option.shortLabel)
    .join(" ");
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" className={styles.buttonArrow} width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M1.5 6.5h9M7 2.5l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NoticeIcon() {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 4.5v2.5M7 9v.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function SuccessCheckIcon() {
  return (
    <svg aria-hidden="true" width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path
        className={styles.successCheckPath}
        d="M7 16.5L13 23L25 10"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SummaryFacultyIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="9 22 9 12 15 12 15 22"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SummaryCalendarIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="1.75" />
      <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function SummaryClockIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.75" />
      <polyline
        points="12 6 12 12 16 14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SummaryBarIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <line x1="18" y1="20" x2="18" y2="10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <line x1="12" y1="20" x2="12" y2="4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <line x1="6" y1="20" x2="6" y2="14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function SummaryWeekdaysIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="1.75" />
      <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <line x1="8" y1="14" x2="8" y2="14" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      <line x1="12" y1="14" x2="12" y2="14" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      <line x1="16" y1="14" x2="16" y2="14" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}

function GentleIntensityIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SteadyIntensityIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <polyline
        points="23 6 13.5 15.5 8.5 10.5 1 18"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="17 6 23 6 23 12"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IntensiveIntensityIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <polygon
        points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IntensityIcon({ value }: { value: StudyIntensity }) {
  if (value === "gentle") {
    return <GentleIntensityIcon />;
  }

  if (value === "steady") {
    return <SteadyIntensityIcon />;
  }

  return <IntensiveIntensityIcon />;
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const { token, user, replaceUser } = useAuth();
  const serverToday = user?.server_today ?? getLocalTodayIso();
  const suggestedAccreditationDate = shiftIsoDate(serverToday, 90);

  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [step, setStep] = useState(0);
  const [leavingStep, setLeavingStep] = useState<number | null>(null);
  const [direction, setDirection] = useState<SlideDirection>("forward");
  const [notice, setNotice] = useState<NoticeState>(null);
  const [savedUser, setSavedUser] = useState<User | null>(null);
  const [facultyId, setFacultyId] = useState(() => (user?.faculty_id ? String(user.faculty_id) : ""));
  const [accreditationDate, setAccreditationDate] = useState(() => user?.accreditation_date ?? suggestedAccreditationDate);
  const [isAccreditationDateTouched, setIsAccreditationDateTouched] = useState(Boolean(user?.accreditation_date));
  const [dailyStudyMinutes, setDailyStudyMinutes] = useState(() => {
    const existingValue = String(user?.daily_study_minutes ?? 45);
    return TIME_OPTIONS.some((option) => option.value === existingValue) ? existingValue : "45";
  });
  const [displayIntensity, setDisplayIntensity] = useState<StudyIntensity>(() => user?.study_intensity ?? "steady");
  const [studyWeekdays, setStudyWeekdays] = useState<number[]>(() =>
    normalizeStudyWeekdays(user?.study_weekdays?.length ? user.study_weekdays : [...DEFAULT_ONBOARDING_WEEKDAYS]),
  );
  const [heroCounters, setHeroCounters] = useState<[number, number, number]>([0, 0, 0]);

  const preferredFacultyId = user?.faculty_id ? String(user.faculty_id) : "";
  const normalizedWeekdays = normalizeStudyWeekdays(studyWeekdays);
  const daysUntilAccreditation = accreditationDate ? getDayDifference(serverToday, accreditationDate) : null;
  const progressWidth = step === 0 ? 0 : (step / 4) * 100;
  const activeDotIndex = step === 0 ? 0 : Math.min(step - 1, 3);
  const stepLabels = ["Добро пожаловать", "Шаг 1 из 3", "Шаг 2 из 3", "Шаг 3 из 3", "Готово!"];
  const summaryRows = [
    {
      key: "Факультет",
      value: faculties.find((faculty) => String(faculty.id) === facultyId)?.name ?? (loading ? "Загружаем..." : "—"),
      icon: <SummaryFacultyIcon />,
    },
    {
      key: "Аккредитация",
      value:
        accreditationDate && daysUntilAccreditation !== null
          ? `${formatDateLabel(accreditationDate)} · ${daysUntilAccreditation} дн.`
          : formatDateLabel(accreditationDate),
      icon: <SummaryCalendarIcon />,
    },
    {
      key: "Время в день",
      value: getSelectedTimeLabel(dailyStudyMinutes),
      icon: <SummaryClockIcon />,
    },
    {
      key: "Режим",
      value: getDisplayIntensityLabel(displayIntensity),
      icon: <SummaryBarIcon />,
    },
    {
      key: "Учебные дни",
      value: formatWeekdaySummary(normalizedWeekdays),
      icon: <SummaryWeekdaysIcon />,
    },
  ];

  useEffect(() => {
    document.title = "MedAcc — Настройка профиля";
  }, []);

  useEffect(() => {
    if (!isAccreditationDateTouched) {
      setAccreditationDate(user?.accreditation_date ?? suggestedAccreditationDate);
    }
  }, [isAccreditationDateTouched, suggestedAccreditationDate, user?.accreditation_date]);

  useEffect(() => {
    if (!token) {
      return;
    }

    setLoading(true);

    void api
      .listFaculties(token)
      .then((items) => {
        setFaculties(items);
        setFacultyId((currentFacultyId) => {
          if (currentFacultyId && items.some((item) => String(item.id) === currentFacultyId)) {
            return currentFacultyId;
          }

          if (preferredFacultyId && items.some((item) => String(item.id) === preferredFacultyId)) {
            return preferredFacultyId;
          }

          return items[0] ? String(items[0].id) : "";
        });
        setNotice((currentNotice) => (currentNotice?.persistent ? null : currentNotice));
      })
      .catch((exception) => {
        setNotice({
          message: exception instanceof ApiError ? exception.message : "Не удалось загрузить список факультетов",
          tone: "danger",
          persistent: true,
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [preferredFacultyId, token]);

  useEffect(() => {
    if (!notice || notice.persistent) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setNotice(null);
    }, 4000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [notice]);

  useEffect(() => {
    if (leavingStep === null) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setLeavingStep(null);
    }, 340);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [leavingStep]);

  useEffect(() => {
    const animationFrames = new Set<number>();
    const timeouts: number[] = [];

    const animateCounter = (counterIndex: 0 | 1 | 2) => {
      const target = HERO_COUNTER_TARGETS[counterIndex];
      const duration = HERO_ANIMATION_DURATIONS[counterIndex];
      const animationStart = performance.now();

      const tick = (now: number) => {
        const progress = Math.min((now - animationStart) / duration, 1);
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        const nextValue = Math.round(target * easedProgress);

        setHeroCounters((current) => {
          const next = [...current] as [number, number, number];
          next[counterIndex] = nextValue;
          return next;
        });

        if (progress < 1) {
          const frame = window.requestAnimationFrame(tick);
          animationFrames.add(frame);
        }
      };

      const frame = window.requestAnimationFrame(tick);
      animationFrames.add(frame);
    };

    timeouts.push(
      window.setTimeout(() => {
        animateCounter(0);
        timeouts.push(window.setTimeout(() => animateCounter(1), 300));
        timeouts.push(window.setTimeout(() => animateCounter(2), 600));
      }, 350),
    );

    return () => {
      animationFrames.forEach((frame) => {
        window.cancelAnimationFrame(frame);
      });
      timeouts.forEach((timeout) => {
        window.clearTimeout(timeout);
      });
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;

      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (event.key === "ArrowRight" && step === 0) {
        event.preventDefault();
        goToStep(1);
      }

      if (event.key === "ArrowLeft" && step > 0 && step < 4) {
        event.preventDefault();
        goToStep(step - 1);
      }

      if (event.key === "Enter" && step === 0) {
        event.preventDefault();
        goToStep(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [step]);

  function updateRipplePosition(event: MouseEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();

    event.currentTarget.style.setProperty("--rx", `${(((event.clientX - bounds.left) / bounds.width) * 100).toFixed(1)}%`);
    event.currentTarget.style.setProperty("--ry", `${(((event.clientY - bounds.top) / bounds.height) * 100).toFixed(1)}%`);
  }

  function showNotice(message: string, tone: NoticeTone, persistent = false) {
    setNotice({ message, tone, persistent });
  }

  function clearNotice() {
    setNotice(null);
  }

  function goToStep(nextStep: number) {
    if (nextStep < 0 || nextStep > 4 || nextStep === step) {
      return;
    }

    setDirection(nextStep > step ? "forward" : "backward");
    setLeavingStep(step);
    setStep(nextStep);
    setNotice((currentNotice) => (currentNotice?.persistent ? currentNotice : null));
  }

  function handleStepOneContinue() {
    if (loading) {
      showNotice("Список факультетов ещё загружается", "danger");
      return;
    }

    if (!facultyId) {
      showNotice("Выбери факультет", "danger");
      return;
    }

    if (!accreditationDate) {
      showNotice("Укажи дату аккредитации", "danger");
      return;
    }

    if (daysUntilAccreditation === null || daysUntilAccreditation <= 0) {
      showNotice("Дата должна быть в будущем", "danger");
      return;
    }

    clearNotice();
    goToStep(2);
  }

  function handleWeekdayToggle(weekday: number) {
    setStudyWeekdays((currentValue) => {
      const normalized = normalizeStudyWeekdays(currentValue);

      if (normalized.includes(weekday)) {
        if (normalized.length === 1) {
          showNotice("Нужен хотя бы один день", "danger");
          return normalized;
        }

        clearNotice();
        return normalized.filter((item) => item !== weekday);
      }

      clearNotice();
      return [...normalized, weekday];
    });
  }

  async function handleSubmitPlan() {
    if (saving || !token) {
      return;
    }

    if (!facultyId) {
      showNotice("Выбери факультет", "danger");
      return;
    }

    if (!accreditationDate || daysUntilAccreditation === null || daysUntilAccreditation <= 0) {
      showNotice("Проверь дату аккредитации", "danger");
      return;
    }

    if (!normalizedWeekdays.length) {
      showNotice("Выбери хотя бы один день", "danger");
      return;
    }

    setSaving(true);
    clearNotice();

    try {
      const response = await api.completeOnboarding(token, {
        faculty_id: Number(facultyId),
        accreditation_date: accreditationDate,
        daily_study_minutes: Number(dailyStudyMinutes),
        study_intensity: displayIntensity,
        study_weekdays: normalizedWeekdays,
      });

      setSavedUser(response.user);
      goToStep(4);
    } catch (exception) {
      showNotice(
        exception instanceof ApiError ? exception.message : "Не удалось завершить настройку профиля",
        "danger",
        true,
      );
    } finally {
      setSaving(false);
    }
  }

  function handleGoDashboard() {
    if (!savedUser || redirecting) {
      return;
    }

    setRedirecting(true);
    replaceUser(savedUser);
    startTransition(() => navigate("/app/dashboard", { replace: true }));
  }

  function getSlideClassName(slideIndex: number) {
    return cx(
      styles.slide,
      slideIndex === step && styles.active,
      leavingStep === slideIndex && (direction === "forward" ? styles.prev : styles.next),
    );
  }

  return (
    <div className={styles.screen} data-testid="onboarding-page">
      <div className={styles.topLine} />

      <header className={styles.header}>
        <div className={styles.stepDots} aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className={cx(
                styles.dot,
                step > 0 && index < activeDotIndex && styles.dotDone,
                index === activeDotIndex && styles.dotActive,
              )}
            />
          ))}
        </div>
        <div className={styles.stepLabel}>{stepLabels[step]}</div>
      </header>

      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ width: `${progressWidth}%` }} />
      </div>

      <div className={styles.slides}>
        {notice ? (
          <div
            aria-live="polite"
            className={cx(styles.notice, notice.tone === "danger" ? styles.noticeDanger : styles.noticeSuccess)}
            role="status"
          >
            <NoticeIcon />
            <span>{notice.message}</span>
          </div>
        ) : null}

        <section aria-hidden={step !== 0} className={getSlideClassName(0)}>
          <div className={styles.welcome}>
            <div>
              <div className={styles.kickerRow}>
                <span className={styles.kickerLine} />
                MedAcc · Настройка профиля
              </div>
              <h1 className={styles.welcomeTitle}>
                Готовься к
                <br />
                <em>аккредитации</em>
                <br />
                умно
              </h1>
              <p className={styles.welcomeSubtitle}>
                3 шага — и система выдаст персональный маршрут
                <br />
                под твой факультет, сроки и темп.
              </p>
            </div>

            <div className={styles.featureGrid}>
              <article className={cx(styles.featureCard, styles.featureAccent)}>
                <div className={cx(styles.featureNumber, styles.featureNumberAccent)}>{heroCounters[0]}</div>
                <div className={styles.featureName}>тем в плане</div>
                <div className={styles.featureDescription}>Персональный маршрут под твой факультет и дату</div>
              </article>

              <article className={cx(styles.featureCard, styles.featureGreen)}>
                <div className={cx(styles.featureNumber, styles.featureNumberGreen)}>{heroCounters[1]}%</div>
                <div className={styles.featureName}>точность адаптации</div>
                <div className={styles.featureDescription}>План пересчитывается по твоим результатам</div>
              </article>

              <article className={cx(styles.featureCard, styles.featureWarm)}>
                <div className={cx(styles.featureNumber, styles.featureNumberWarm)}>{heroCounters[2]}</div>
                <div className={styles.featureName}>мин в день</div>
                <div className={styles.featureDescription}>Короткие сессии только в твои учебные дни</div>
              </article>
            </div>

            <button
              className={cx(styles.button, styles.buttonPrimary)}
              onClick={() => goToStep(1)}
              onMouseDown={updateRipplePosition}
              type="button"
            >
              <span className={styles.ripple} aria-hidden="true" />
              Начать настройку — 3 шага
              <ArrowIcon />
            </button>
          </div>
        </section>

        <section aria-hidden={step !== 1} className={getSlideClassName(1)}>
          <div className={styles.card}>
            <div>
              <div className={styles.kicker}>Шаг 1 из 3</div>
              <h2 className={styles.title}>
                Факультет и <em>дата</em>
              </h2>
              <p className={styles.subtitle}>От этих двух данных зависит весь план — набор тем и порядок изучения.</p>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelBlock}>
                <label className={styles.fieldLabel} htmlFor="onboarding-faculty">
                  Твой факультет
                </label>
                <div className={styles.selectWrap}>
                  <select
                    aria-label="Факультет"
                    className={styles.fieldControl}
                    disabled={loading || saving}
                    id="onboarding-faculty"
                    onChange={(event) => setFacultyId(event.target.value)}
                    value={facultyId}
                  >
                    {!faculties.length ? (
                      <option value="">{loading ? "Загружаем факультеты..." : "Факультеты недоступны"}</option>
                    ) : null}
                    {faculties.map((faculty) => (
                      <option key={faculty.id} value={faculty.id}>
                        {faculty.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.panelBlock}>
                <label className={styles.fieldLabel} htmlFor="onboarding-accreditation-date">
                  Дата аккредитации
                </label>
                <div className={styles.fieldHint}>
                  Можно примерную — потом скорректируешь, план обновится автоматически.
                </div>
                <div className={styles.dateRow}>
                  <input
                    className={styles.fieldControl}
                    disabled={saving}
                    id="onboarding-accreditation-date"
                    min={shiftIsoDate(serverToday, 1)}
                    onChange={(event) => {
                      setIsAccreditationDateTouched(true);
                      setAccreditationDate(event.target.value);
                    }}
                    type="date"
                    value={accreditationDate}
                  />
                  {daysUntilAccreditation !== null ? (
                    <div
                      className={cx(
                        styles.datePill,
                        daysUntilAccreditation > 60
                          ? styles.datePillGreen
                          : daysUntilAccreditation > 20
                            ? styles.datePillWarm
                            : styles.datePillAccent,
                      )}
                    >
                      {daysUntilAccreditation} дн.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className={styles.buttonRow}>
              <button
                className={cx(styles.button, styles.buttonSecondary)}
                onClick={() => goToStep(0)}
                onMouseDown={updateRipplePosition}
                type="button"
              >
                <span className={styles.ripple} aria-hidden="true" />
                ← Назад
              </button>
              <button
                className={cx(styles.button, styles.buttonPrimary, styles.rowPrimary)}
                onClick={handleStepOneContinue}
                onMouseDown={updateRipplePosition}
                type="button"
              >
                <span className={styles.ripple} aria-hidden="true" />
                Далее
                <ArrowIcon />
              </button>
            </div>
          </div>
        </section>

        <section aria-hidden={step !== 2} className={getSlideClassName(2)}>
          <div className={styles.card}>
            <div>
              <div className={styles.kicker}>Шаг 2 из 3</div>
              <h2 className={styles.title}>
                Время и <em>темп</em>
              </h2>
              <p className={styles.subtitle}>Сколько минут в день и в каком ритме двигаться к цели.</p>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelBlock}>
                <div className={cx(styles.fieldLabel, styles.stepSectionLabel)}>Минут в день</div>
                <div className={styles.timePills}>
                  {TIME_OPTIONS.map((option) => (
                    <button
                      key={option.label}
                      className={cx(styles.timePill, option.value === dailyStudyMinutes && styles.timePillActive)}
                      onClick={() => setDailyStudyMinutes(option.value)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.panelBlock}>
                <div className={cx(styles.fieldLabel, styles.stepSectionLabel)}>Режим подготовки</div>
                <div className={styles.intensityGrid}>
                  {DISPLAY_INTENSITY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      className={cx(
                        styles.intensityCard,
                        option.value === displayIntensity && styles.intensityCardActive,
                      )}
                      onClick={() => setDisplayIntensity(option.value)}
                      type="button"
                    >
                      <span className={styles.intensityLine} aria-hidden="true" />
                      <span className={styles.intensityCheck} aria-hidden="true">
                        <svg width="8" height="8" viewBox="0 0 9 9" fill="none">
                          <path
                            d="M1.5 4.5L3.5 6.5L7.5 2.5"
                            stroke="white"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span className={styles.intensityIcon}>
                        <IntensityIcon value={option.value} />
                      </span>
                      <span className={styles.intensityName}>{option.title}</span>
                      <span className={styles.intensityDescription}>{option.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.buttonRow}>
              <button
                className={cx(styles.button, styles.buttonSecondary)}
                onClick={() => goToStep(1)}
                onMouseDown={updateRipplePosition}
                type="button"
              >
                <span className={styles.ripple} aria-hidden="true" />
                ← Назад
              </button>
              <button
                className={cx(styles.button, styles.buttonPrimary, styles.rowPrimary)}
                onClick={() => goToStep(3)}
                onMouseDown={updateRipplePosition}
                type="button"
              >
                <span className={styles.ripple} aria-hidden="true" />
                Далее
                <ArrowIcon />
              </button>
            </div>
          </div>
        </section>

        <section aria-hidden={step !== 3} className={getSlideClassName(3)}>
          <div className={styles.card}>
            <div>
              <div className={styles.kicker}>Шаг 3 из 3 · Последний</div>
              <h2 className={styles.title}>
                Учебные <em>дни</em>
              </h2>
              <p className={styles.subtitle}>
                Нажми на день чтобы включить или выключить. Задачи встанут только в выбранные дни.
              </p>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelBlock}>
                <div className={styles.weekdaysGrid}>
                  {STUDY_WEEKDAY_OPTIONS.map((weekday) => {
                    const selected = normalizedWeekdays.includes(weekday.value);

                    return (
                      <button
                        key={weekday.value}
                        className={cx(styles.weekday, selected && styles.weekdayActive)}
                        onClick={() => handleWeekdayToggle(weekday.value)}
                        type="button"
                      >
                        <span className={styles.weekdayShort}>{weekday.shortLabel}</span>
                        <svg className={styles.weekdayCheck} width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path
                            d="M2 5l2.5 2.5 3.5-4"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    );
                  })}
                </div>
                <div className={styles.weekdayHint}>
                  Выбрано {normalizedWeekdays.length} {getPluralDayLabel(normalizedWeekdays.length)} из 7
                </div>
              </div>

              <div className={cx(styles.panelBlock, styles.summaryBlock)}>
                <div className={styles.summaryLabel}>Итоговый план</div>
                <div className={styles.summaryList}>
                  {summaryRows.map((row) => (
                    <div key={row.key} className={styles.summaryRow}>
                      <span className={styles.summaryKey}>
                        <span className={styles.summaryIcon}>{row.icon}</span>
                        {row.key}
                      </span>
                      <span className={styles.summaryValue}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.buttonRow}>
              <button
                className={cx(styles.button, styles.buttonSecondary)}
                onClick={() => goToStep(2)}
                onMouseDown={updateRipplePosition}
                type="button"
              >
                <span className={styles.ripple} aria-hidden="true" />
                ← Назад
              </button>
              <button
                className={cx(styles.button, styles.buttonPrimary, styles.rowPrimary)}
                disabled={saving || loading || !facultyId}
                onClick={handleSubmitPlan}
                onMouseDown={updateRipplePosition}
                type="button"
              >
                <span className={styles.ripple} aria-hidden="true" />
                {saving ? <span className={styles.spinner} aria-hidden="true" /> : <ArrowIcon />}
                {saving ? "Формируем план..." : "Сформировать план"}
              </button>
            </div>
          </div>
        </section>

        <section aria-hidden={step !== 4} className={getSlideClassName(4)}>
          <div className={styles.success}>
            <div className={styles.successBadge}>
              <SuccessCheckIcon />
            </div>

            <div>
              <h2 className={styles.successTitle}>
                Маршрут <em>готов!</em>
              </h2>
              <p className={styles.successSubtitle}>Первая задача уже ждёт тебя в дашборде.</p>
            </div>

            <div className={cx(styles.panel, styles.successPanel)}>
              <div className={styles.panelBlock}>
                <div className={styles.summaryList}>
                  {summaryRows.map((row) => (
                    <div key={row.key} className={styles.summaryRow}>
                      <span className={styles.summaryKey}>
                        <span className={styles.summaryIcon}>{row.icon}</span>
                        {row.key}
                      </span>
                      <span className={styles.summaryValue}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <button
              className={cx(styles.button, styles.buttonPrimary, styles.successButton)}
              disabled={!savedUser || redirecting}
              onClick={handleGoDashboard}
              onMouseDown={updateRipplePosition}
              type="button"
            >
              <span className={styles.ripple} aria-hidden="true" />
              {redirecting ? <span className={styles.spinner} aria-hidden="true" /> : null}
              {redirecting ? "Переходим..." : "Перейти в дашборд"}
              {redirecting ? null : <ArrowIcon />}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

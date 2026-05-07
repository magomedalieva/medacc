import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { api, ApiError } from "../lib/api";
import { buildAccreditationReturnRoute } from "../lib/session";
import type { TestSession, TestSessionAnswerResponse, TestSessionFinishResponse } from "../types/api";
import { TestsChrome } from "./TestsChrome";
import styles from "./TestsExperience.module.css";

interface RecordedAnswer {
  selectedOptionLabel: string;
  response: TestSessionAnswerResponse;
}

const TRAINING_PASS_PERCENT = 70;
const TRAINING_MASTERY_PERCENT = 85;

function mapAnswerResults(results: TestSessionAnswerResponse[] = []): Record<number, RecordedAnswer> {
  return Object.fromEntries(
    results.map((answer) => [
      answer.question_id,
      {
        selectedOptionLabel: answer.selected_option_label,
        response: answer,
      },
    ]),
  );
}

function timestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function sessionElapsedSeconds(session: TestSession) {
  const startedAt = timestamp(session.started_at);
  const finishedAt = timestamp(session.finished_at);
  const serverNow = timestamp(session.server_time);
  const effectiveNow = finishedAt ?? serverNow;

  if (startedAt === null || effectiveNow === null) {
    return 0;
  }

  return Math.max(0, Math.floor((effectiveNow - startedAt) / 1000));
}

function finishElapsedSeconds(result: TestSessionFinishResponse, fallbackSeconds: number) {
  const startedAt = timestamp(result.started_at);
  const finishedAt = timestamp(result.finished_at);

  if (startedAt === null || finishedAt === null) {
    return fallbackSeconds;
  }

  return Math.max(0, Math.floor((finishedAt - startedAt) / 1000));
}

function setRipplePosition(event: MouseEvent<HTMLElement>) {
  const element = event.currentTarget;
  const rect = element.getBoundingClientRect();
  const x = (((event.clientX - rect.left) / rect.width) * 100).toFixed(1);
  const y = (((event.clientY - rect.top) / rect.height) * 100).toFixed(1);
  element.style.setProperty("--rx", `${x}%`);
  element.style.setProperty("--ry", `${y}%`);
}

function TimerIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="13" r="7.25" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9.5 3.75h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 8.5V13l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SessionBadgeArrow() {
  return (
    <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 12h13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m12 6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ButtonArrowWhite() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 12h13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m12 6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path
        d="m5 12 4.4 4.4L19 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WrongIcon() {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="m7 7 10 10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="m17 7-10 10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 10.5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 7.75h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function ExamInfoIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="4" width="14" height="16" rx="2.25" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 8.5h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.5 12.5h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.5 16.5h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ClockFeedbackIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.75V12l3 1.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ConfirmIcon() {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 16.5h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function ResultPassIcon() {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="m8 12.2 2.7 2.7L16.5 9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ResultFailIcon() {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m9 9 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m15 9-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ResultHomeIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M4.5 11.5 12 5l7.5 6.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.75 10.5v8h10.5v-8"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.25 18.5v-4h3.5v4"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function difficultyMeta(difficulty: string) {
  if (difficulty === "easy") {
    return { label: "Базовый", className: styles["diff-easy"] };
  }

  if (difficulty === "hard") {
    return { label: "Сложный", className: styles["diff-hard"] };
  }

  return { label: "Рабочий", className: styles["diff-medium"] };
}

function AnimatedRingValue({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const startedAt = performance.now();
    let frame = 0;

    function tick(now: number) {
      const progress = Math.min((now - startedAt) / 900, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(value * eased));

      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <div className={styles["ring-val"]}>{displayValue}%</div>;
}

function ResultRing({ value, color }: { value: number; color: string }) {
  const size = 138;
  const radius = 58;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const [dashArray, setDashArray] = useState(`0 ${circumference}`);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDashArray(`${(value / 100) * circumference} ${circumference}`);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [circumference, value]);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--rule)" strokeWidth="9" />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="9"
        strokeDasharray={dashArray}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
        style={{ transition: "stroke-dasharray 1.2s cubic-bezier(.22,1,.36,1)" }}
      />
    </svg>
  );
}

export function TestsSessionExperience({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { token } = useAuth();
  const [session, setSession] = useState<TestSession | null>(null);
  const [finishResult, setFinishResult] = useState<TestSessionFinishResponse | null>(null);
  const [answers, setAnswers] = useState<Record<number, RecordedAnswer>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; tone: "success" | "danger" } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedReviewQuestionId, setSelectedReviewQuestionId] = useState<number | null>(null);
  const [resultReviewOpen, setResultReviewOpen] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const startedAtRef = useRef<number>(Date.now());
  const totalSecondsRef = useRef(0);
  const autoFinishTriggeredRef = useRef(false);
  const noticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);

    void api
      .getSession(token, sessionId)
      .then(async (nextSession) => {
        setSession(nextSession);
        setAnswers(mapAnswerResults(nextSession.answers));
        setCurrentIndex(Math.min(nextSession.current_index, Math.max(nextSession.questions.length - 1, 0)));

        const totalSeconds = (nextSession.time_limit_minutes ?? 0) * 60;
        const elapsedSeconds = sessionElapsedSeconds(nextSession);
        totalSecondsRef.current = totalSeconds;
        setTimerSeconds(nextSession.mode === "exam" ? Math.max(totalSeconds - elapsedSeconds, 0) : elapsedSeconds);
        startedAtRef.current = Date.now() - elapsedSeconds * 1000;
        autoFinishTriggeredRef.current = false;

        if (nextSession.status === "finished") {
          const result = await api.finishSession(token, sessionId);
          setFinishResult(result);
          setAnswers(mapAnswerResults(result.answers));
          setResultReviewOpen(false);
        }
      })
      .catch((exception) => {
        setError(exception instanceof ApiError ? exception.message : "Не удалось загрузить тестовую сессию");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [sessionId, token]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const question = session.questions[currentIndex];
    setSelectedOption(question ? answers[question.id]?.selectedOptionLabel ?? "" : "");
  }, [answers, currentIndex, session]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
    }

    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 5000);

    return () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, [notice]);

  useEffect(() => {
    if (!showConfirm && selectedReviewQuestionId === null) {
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
  }, [showConfirm, selectedReviewQuestionId]);

  useEffect(() => {
    if (!session || finishResult || loading) {
      return;
    }

    const examSession = session.mode === "exam";
    const timer = window.setInterval(() => {
      setTimerSeconds((current) => {
        if (!examSession) {
          return current + 1;
        }

        if (current <= 1) {
          window.clearInterval(timer);

          if (!autoFinishTriggeredRef.current) {
            autoFinishTriggeredRef.current = true;
            setNotice({ message: "Время истекло! Сессия завершена автоматически.", tone: "danger" });
            window.setTimeout(() => {
              void handleFinish();
            }, 1800);
          }

          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [finishResult, loading, session]);

  useEffect(() => {
    if (!session || selectedReviewQuestionId === null) {
      return;
    }

    const activeSession = session;
    const selectedIndex = activeSession.questions.findIndex((question) => question.id === selectedReviewQuestionId);

    if (selectedIndex < 0) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedReviewQuestionId(null);
        return;
      }

      if (event.key === "ArrowLeft" && selectedIndex > 0) {
        event.preventDefault();
        setSelectedReviewQuestionId(activeSession.questions[selectedIndex - 1]!.id);
        return;
      }

      if (event.key === "ArrowRight" && selectedIndex < activeSession.questions.length - 1) {
        event.preventDefault();
        setSelectedReviewQuestionId(activeSession.questions[selectedIndex + 1]!.id);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedReviewQuestionId, session]);

  async function handleSubmitAnswer() {
    if (!token || !session) {
      return;
    }

    const question = session.questions[currentIndex];

    if (!question || !selectedOption || answers[question.id]) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await api.submitAnswer(token, sessionId, {
        question_id: question.id,
        selected_option_label: selectedOption,
      });

      setAnswers((current) => ({
        ...current,
        [question.id]: {
          selectedOptionLabel: response.selected_option_label,
          response,
        },
      }));

      if (session.mode === "exam") {
        const nextUnansweredIndex = session.questions.findIndex(
          (candidate, index) => index > currentIndex && candidate.id !== question.id && !answers[candidate.id],
        );
        const fallbackUnansweredIndex = session.questions.findIndex(
          (candidate) => candidate.id !== question.id && !answers[candidate.id],
        );
        const nextIndex = nextUnansweredIndex >= 0 ? nextUnansweredIndex : fallbackUnansweredIndex;

        if (nextIndex >= 0) {
          setSelectedOption("");
          setCurrentIndex(nextIndex);
        } else {
          await handleFinish();
        }
      }
    } catch (exception) {
      setError(exception instanceof ApiError ? exception.message : "Не удалось отправить ответ");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFinish() {
    if (!token) {
      return;
    }

    setFinishing(true);
    setError(null);

    try {
      const result = await api.finishSession(token, sessionId);
      setFinishResult(result);
      setAnswers(mapAnswerResults(result.answers));
      setSession((current) => (current ? { ...current, status: result.status } : current));
      setShowConfirm(false);
      setResultReviewOpen(false);
    } catch (exception) {
      setError(exception instanceof ApiError ? exception.message : "Не удалось завершить тест");
    } finally {
      setFinishing(false);
    }
  }

  const routedPlannedTaskIdValue = searchParams.get("plannedTaskId");
  const routedPlannedTaskId =
    routedPlannedTaskIdValue && /^\d+$/.test(routedPlannedTaskIdValue) ? Number(routedPlannedTaskIdValue) : null;

  function getAccreditationReturnPath() {
    return buildAccreditationReturnRoute({
      plannedTaskId: routedPlannedTaskId,
      simulationId: finishResult?.simulation_id ?? session?.simulation_id ?? null,
      stage: "test_stage",
    });
  }

  function isStrictAccreditationSession() {
    return Boolean(finishResult?.simulation_id ?? session?.simulation_id) ||
      (finishResult?.attempt_context ?? session?.attempt_context) === "strict_simulation";
  }

  function handleGoDashboard() {
    if (isStrictAccreditationSession()) {
      navigate(getAccreditationReturnPath());
      return;
    }

    navigate("/app/dashboard");
  }

  function handleStartNewTest() {
    if (isStrictAccreditationSession()) {
      navigate(getAccreditationReturnPath());
      return;
    }

    navigate("/app/practice");
  }

  function openReviewQuestionByIndex(index: number) {
    if (!session) {
      return;
    }

    const question = session.questions[index];

    if (!question) {
      return;
    }

    setSelectedReviewQuestionId(question.id);
  }

  if (loading) {
    return (
      <TestsChrome activeKey="tests">
        <div className={styles.shell} data-testid="test-session-page">
          <div className={`${styles.screen} ${styles.active}`.trim()}>
          <div className={styles["empty-card"]}>
            <div className={styles["empty-icon"]}>
              <TimerIcon />
            </div>
            <div className={styles["empty-title"]}>Загружаем сессию</div>
            <div className={styles["empty-desc"]}>Подтягиваем вопросы, таймер и структуру навигации теста.</div>
          </div>
        </div>
        </div>
      </TestsChrome>
    );
  }

  if (!session) {
    return (
      <TestsChrome activeKey="tests">
        <div className={styles.shell} data-testid="test-session-page">
          <div className={`${styles.screen} ${styles.active}`.trim()}>
          <div className={styles["empty-card"]}>
            <div className={styles["empty-icon"]}>
              <InfoIcon />
            </div>
            <div className={styles["empty-title"]}>Сессия не найдена</div>
            <div className={styles["empty-desc"]}>Попробуй вернуться на страницу тестов и запустить новую сессию.</div>
          </div>
        </div>
        </div>
      </TestsChrome>
    );
  }

  const question = session.questions[currentIndex] ?? null;
  const recordedAnswer = question ? answers[question.id] : undefined;
  const examMode = session.mode === "exam";
  const activeAttemptContext = finishResult?.attempt_context ?? session.attempt_context;
  const activeSimulationId = finishResult?.simulation_id ?? session.simulation_id;
  const strictAccreditationMode = activeAttemptContext === "strict_simulation" || Boolean(activeSimulationId);
  const controlExamMode = examMode && !strictAccreditationMode;
  const completedCount = Math.min(Object.keys(answers).length, session.total_questions);
  const progressPercent = Math.round((completedCount / session.total_questions) * 100);
  const correctCount = examMode ? 0 : Object.values(answers).filter((answer) => answer.response.is_correct === true).length;
  const incorrectCount = examMode ? 0 : Object.values(answers).filter((answer) => answer.response.is_correct === false).length;
  const remainingCount = Math.max(0, session.total_questions - completedCount);
  const isLastQuestion = currentIndex === session.questions.length - 1;
  const allDone = completedCount >= session.questions.length;
  const minutes = Math.floor(timerSeconds / 60);
  const seconds = timerSeconds % 60;
  const timerLabel = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const timerPercent = examMode && totalSecondsRef.current > 0 ? Math.max(0, (timerSeconds / totalSecondsRef.current) * 100) : 0;
  const timerStateClass =
    examMode ? (timerSeconds <= 60 ? styles.crit : timerSeconds <= 300 ? styles.warn : "") : "";
  const timerHint = examMode
    ? timerSeconds <= 60
      ? "Меньше минуты! Поторопись"
      : timerSeconds <= 300
        ? "Осталось менее 5 минут"
        : "Всё идёт хорошо"
    : "Учебный режим без ограничения по времени";
  const timerBadgeLabel = examMode
    ? timerSeconds <= 60
      ? "Критично"
      : timerSeconds <= 300
        ? "Внимание"
        : "Время сессии"
    : "Прошло времени";
  const fallbackElapsedSeconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
  const elapsedSeconds = finishResult ? finishElapsedSeconds(finishResult, fallbackElapsedSeconds) : fallbackElapsedSeconds;
  const resultPercent = finishResult ? Math.round(finishResult.score_percent) : 0;
  const resultPassed = finishResult ? finishResult.score_percent >= TRAINING_PASS_PERCENT : false;
  const resultMastered = finishResult ? finishResult.score_percent >= TRAINING_MASTERY_PERCENT : false;
  const resultFullyPassed = strictAccreditationMode || controlExamMode ? resultPassed : resultMastered;
  const resultToneColor = resultFullyPassed ? "var(--green)" : resultPassed ? "var(--gold)" : "var(--accent)";
  const resultVerdictClass = resultFullyPassed ? styles["v-pass"] : resultPassed ? styles["v-ok"] : styles["v-fail"];
  const resultMinutes = Math.floor(elapsedSeconds / 60);
  const resultSeconds = elapsedSeconds % 60;
  const sessionKicker = examMode
    ? strictAccreditationMode
      ? "Этап пробной аккредитации"
      : "Контрольная сессия"
    : "Учебная сессия";
  const sessionTitle = session.topic_id
    ? examMode
      ? "Контроль по теме"
      : "Тематический тест"
    : examMode
      ? strictAccreditationMode
        ? "Пробная аккредитация"
        : "Контроль без подсказок"
      : "Смешанный тест";
  const sessionSubtitle = examMode
    ? strictAccreditationMode
      ? "Строгий режим пробной аккредитации. Разбор доступен после финиша."
      : "Учебный контроль без подсказок. Разбор доступен после финиша."
    : "После каждого ответа система покажет правильный вариант и пояснение.";
  const sessionModeLabel = examMode
    ? strictAccreditationMode
      ? "Пробная аккредитация"
      : "Контроль без подсказок"
    : "Учебный режим";
  const resultSubtitle = resultPassed
    ? strictAccreditationMode
      ? "Этап учтен в протоколе пробной аккредитации. Просмотри результат и разбор ошибок."
      : controlExamMode
        ? "Хороший результат. Мы учли его в плане подготовки и оставили только темы, которые стоит дополнительно укрепить."
        : resultMastered
          ? "Порог освоения 85% пройден. Просмотри разбор ошибок или сразу запусти новый тест."
          : "Порог 70% пройден. Разбор поможет добрать результат до освоения 85%."
    : strictAccreditationMode
      ? "Порог не достигнут. Этот этап не зачтен; разберите ошибки перед новой пробной аккредитацией."
      : controlExamMode
        ? "Результат пока невысокий. Мы составили для вас план подготовки по слабым темам, начните с разбора ошибок."
        : "Порог не достигнут. Просмотри разбор ошибок и запусти повторную попытку.";
  const resultVerdictLabel = resultPassed
    ? strictAccreditationMode
      ? "Аккредитационный порог пройден"
      : controlExamMode
        ? "Контрольный порог пройден"
        : resultMastered
          ? "Освоено (85%+)"
          : "Порог 70% пройден"
    : "Порог не достигнут (70%)";
  const resultModeLabel = strictAccreditationMode
    ? "Пробная аккредитация"
    : controlExamMode
      ? "Контроль без подсказок"
      : "Учебный режим";
  const examFeedbackSubtitle = strictAccreditationMode ? "Пробная аккредитация" : "Учебный контроль";

  const selectedStateByLabel = question
    ? Object.fromEntries(
        question.answer_options.map((option) => {
          const isSelected = selectedOption === option.label;
          const isCorrect = recordedAnswer?.response.correct_option_label === option.label;
          const isIncorrect = recordedAnswer ? isSelected && recordedAnswer.response.is_correct === false : false;

          if (!examMode && isCorrect) {
            return [option.label, "correct"] as const;
          }

          if (!examMode && isIncorrect) {
            return [option.label, "incorrect"] as const;
          }

          if (isSelected) {
            return [option.label, "selected"] as const;
          }

          return [option.label, "default"] as const;
        }),
      )
    : {};

  const activeNotice = error ? { message: error, tone: "danger" as const } : notice;
  const selectedReviewQuestion =
    selectedReviewQuestionId === null
      ? null
      : session.questions.find((reviewQuestion) => reviewQuestion.id === selectedReviewQuestionId) ?? null;
  const selectedReviewAnswer = selectedReviewQuestion ? answers[selectedReviewQuestion.id] : undefined;
  const selectedReviewOption = selectedReviewQuestion?.answer_options.find(
    (option) => option.label === selectedReviewAnswer?.selectedOptionLabel,
  );
  const selectedReviewCorrectOption = selectedReviewQuestion?.answer_options.find(
    (option) => option.label === selectedReviewAnswer?.response.correct_option_label,
  );
  const selectedReviewIndex = selectedReviewQuestion
    ? session.questions.findIndex((reviewQuestion) => reviewQuestion.id === selectedReviewQuestion.id)
    : -1;
  const hasPreviousReview = selectedReviewIndex > 0;
  const hasNextReview = selectedReviewIndex >= 0 && selectedReviewIndex < session.questions.length - 1;

  return (
    <TestsChrome activeKey="tests">
      <div className={styles.shell} data-testid="test-session-page">
        <div className={`${styles.screen} ${styles.active}`.trim()}>
        {activeNotice ? (
          <div className={`${styles.notice} ${styles.show} ${styles[activeNotice.tone]}`.trim()}>
            <InfoIcon />
            <span>{activeNotice.message}</span>
            <button
              className={styles["notice-x"]}
              onClick={() => {
                if (error) {
                  setError(null);
                  return;
                }

                setNotice(null);
              }}
              type="button"
            >
              &#10005;
            </button>
          </div>
        ) : null}

        {finishResult ? (
          <div
            className={`${styles["result-wrap"]} ${resultReviewOpen ? styles["result-review-wrap"] : ""}`.trim()}
            data-testid="test-session-result"
          >
            <div className={styles["result-modal-card"]}>
              {!resultReviewOpen ? (
                <>
                  <div className={styles["ring-wrap"]}>
                    <ResultRing color={resultToneColor} value={resultPercent} />
                    <div className={styles["ring-inner"]}>
                      <AnimatedRingValue value={resultPercent} />
                      <div className={styles["ring-lbl"]}>Точность</div>
                    </div>
                  </div>

                  <h2 className={styles["result-title"]}>
                    {resultMastered ? "Материал освоен!" : resultPassed ? "Порог пройден" : "Нужно повторить"}
                  </h2>
                  <p className={styles["result-sub"]} data-testid="test-session-result-subtitle">
                    {resultSubtitle}
                  </p>
                  <div
                    className={`${styles.verdict} ${resultVerdictClass}`.trim()}
                    data-testid="test-session-result-verdict"
                  >
                    {resultPassed ? <ResultPassIcon /> : <ResultFailIcon />}
                    {resultVerdictLabel}
                  </div>

                  <div className={styles["result-metrics"]}>
                    <div className={styles.rmet}>
                      <div className={styles["rmet-lbl"]}>Верно</div>
                      <div className={styles["rmet-val"]}>
                        {finishResult.correct_answers}/{finishResult.total_questions}
                      </div>
                    </div>
                    <div className={styles.rmet}>
                      <div className={styles["rmet-lbl"]}>Время</div>
                      <div className={`${styles["rmet-val"]} ${styles.mono}`.trim()}>
                        {String(resultMinutes).padStart(2, "0")}:{String(resultSeconds).padStart(2, "0")}
                      </div>
                    </div>
                  </div>

                  <div className={styles["result-acts"]}>
                    <button
                      className={`${styles.btn} ${styles["btn-p"]}`.trim()}
                      onClick={() => setResultReviewOpen(true)}
                      onMouseDown={setRipplePosition}
                      type="button"
                    >
                      <span className={styles["btn-rip"]} />
                      Посмотреть разбор
                    </button>
                    <button
                      className={`${styles.btn} ${styles["btn-o"]}`.trim()}
                      onClick={handleGoDashboard}
                      onMouseDown={setRipplePosition}
                      type="button"
                    >
                      <span className={styles["btn-rip"]} />
                      <ResultHomeIcon />
                      {isStrictAccreditationSession() ? "В аккредитацию" : "На главную"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <div className={styles["result-header-kicker"]}>Тест завершён</div>
                    <h1 className={styles["result-header-title"]}>
                      {resultMastered ? "Материал" : resultPassed ? "Порог" : "Сессия"}
                      <br />
                      <em>{resultMastered ? "освоен" : resultPassed ? "пройден" : "не пройдена"}</em>
                    </h1>
                    <p className={styles["result-header-subtitle"]} data-testid="test-session-result-subtitle">
                      {resultSubtitle}
                    </p>
                  </div>

                  <div className={styles["result-hero"]}>
                    <div className={styles["result-glow"]} />
                    <div className={styles["result-inner"]}>
                      <div className={styles["ring-wrap"]}>
                        <ResultRing color={resultToneColor} value={resultPercent} />
                        <div className={styles["ring-inner"]}>
                          <AnimatedRingValue value={resultPercent} />
                          <div className={styles["ring-lbl"]}>Точность</div>
                        </div>
                      </div>

                      <div className={styles["result-info"]}>
                        <div
                          className={`${styles.verdict} ${resultVerdictClass}`.trim()}
                          data-testid="test-session-result-verdict"
                        >
                          {resultPassed ? <ResultPassIcon /> : <ResultFailIcon />}
                          {resultVerdictLabel}
                        </div>
                        <h2 className={styles["result-title"]}>
                          {finishResult.correct_answers} из {finishResult.total_questions}
                          <br />
                          <em>{resultMastered ? "освоено" : resultPassed ? "порог пройден" : "нужно повторить"}</em>
                        </h2>
                        <p className={styles["result-sub"]} data-testid="test-session-result-mode">
                          Точность {resultPercent}% · Отвечено {finishResult.answered_questions} из {finishResult.total_questions} ·{" "}
                          {resultModeLabel}
                        </p>
                        <div className={styles["result-metrics"]}>
                          <div className={styles.rmet}>
                            <div className={styles["rmet-lbl"]}>Точность</div>
                            <div
                              className={styles["rmet-val"]}
                              style={{ color: resultToneColor } as CSSProperties}
                            >
                              {resultPercent}%
                            </div>
                          </div>
                          <div className={styles.rmet}>
                            <div className={styles["rmet-lbl"]}>Верно</div>
                            <div className={styles["rmet-val"]}>{finishResult.correct_answers}</div>
                          </div>
                          <div className={styles.rmet}>
                            <div className={styles["rmet-lbl"]}>Время</div>
                            <div className={`${styles["rmet-val"]} ${styles.mono}`.trim()}>
                              {String(resultMinutes).padStart(2, "0")}:{String(resultSeconds).padStart(2, "0")}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className={styles["sec-lbl"]}>Разбор ответов</div>
                    <div className={styles["review-list"]}>
                      {session.questions.map((reviewQuestion, index) => {
                        const answer = answers[reviewQuestion.id];
                        const answered = Boolean(answer);
                        const correct = answer?.response.is_correct === true;
                        const tone = !answered ? styles["sb-new"] : correct ? styles["sb-green"] : styles["sb-accent"];
                        const label = !answered ? "Пропущен" : correct ? "Верно" : "Ошибка";
                        const shortText =
                          reviewQuestion.text.length > 95 ? `${reviewQuestion.text.slice(0, 95)}...` : reviewQuestion.text;

                        return (
                          <button
                            className={styles["rev-row"]}
                            data-testid={`test-review-question-${reviewQuestion.id}`}
                            key={reviewQuestion.id}
                            onClick={() => setSelectedReviewQuestionId(reviewQuestion.id)}
                            type="button"
                          >
                            <div className={styles["rev-head"]}>
                              <div className={styles["rev-num"]}>{String(index + 1).padStart(2, "0")}</div>
                              <div style={{ flex: 1 }}>
                                <div className={styles["rev-q"]} title={reviewQuestion.text}>{shortText}</div>
                                <div className={styles["rev-meta"]}>
                                  {answer
                                    ? `Ответ: ${answer.selectedOptionLabel} · Верно: ${answer.response.correct_option_label ?? "—"}`
                                    : "Не отвечен"}
                                </div>
                              </div>
                              <span className={`${styles.sbadge} ${tone}`.trim()}>{label}</span>
                            </div>
                            {answer && answer.response.is_correct === false && answer.response.explanation ? (
                              <div className={styles["rev-expl"]}>{answer.response.explanation}</div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className={styles["result-acts"]}>
                    <button
                      className={`${styles.btn} ${styles["btn-o"]}`.trim()}
                      onClick={() => setResultReviewOpen(false)}
                      onMouseDown={setRipplePosition}
                      type="button"
                    >
                      <span className={styles["btn-rip"]} />
                      К результату
                    </button>
                    <button
                      className={`${styles.btn} ${styles["btn-p"]}`.trim()}
                      onClick={handleStartNewTest}
                      onMouseDown={setRipplePosition}
                      type="button"
                    >
                      <span className={styles["btn-rip"]} />
                      {isStrictAccreditationSession() ? "В аккредитацию" : "Новый тест"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className={styles["sess-hd"]}>
              <div>
                <div className={styles["sess-kicker"]} data-testid="test-session-kicker">
                  {sessionKicker}
                </div>
                <h1 className={styles["sess-title"]} data-testid="test-session-title">
                  {sessionTitle}
                </h1>
                <p className={styles["sess-sub"]} data-testid="test-session-subtitle">
                  {sessionSubtitle}
                </p>
              </div>

              <div className={styles["sess-right"]}>
                <div className={`${styles["mode-badge"]} ${examMode ? styles.exam : styles.train}`.trim()}>
                  <SessionBadgeArrow />
                  <span data-testid="test-session-mode-label">{sessionModeLabel}</span>
                </div>
              </div>
            </div>

            <div className={`${styles["timer-bar"]} ${timerStateClass}`.trim()}>
              <div className={styles["tb-left"]}>
                <div className={styles["tb-icon"]}>
                  <TimerIcon />
                </div>
                <div className={styles["tb-main"]}>
                  <div className={styles["tb-lbl"]} data-testid="test-session-timer-label">{timerBadgeLabel}</div>
                  <div className={styles["tb-time"]} data-testid="test-session-timer-value">{timerLabel}</div>
                </div>
              </div>

              <div className={styles["tb-bar-wrap"]}>
                {examMode ? (
                  <div className={styles["tb-bar"]}>
                    <div className={styles["tb-fill"]} style={{ width: `${timerPercent}%` } as CSSProperties} />
                  </div>
                ) : null}
                <div className={styles["tb-hint"]}>{timerHint}</div>
              </div>

            </div>

            <div className={styles["prog-strip"]}>
              <div className={styles["prog-left"]}>
                <div className={styles["prog-label"]}>
                  <span className={styles["prog-txt"]}>Пройдено {progressPercent}%</span>
                  <span className={styles["prog-det"]}>
                    {completedCount >= session.total_questions ? "Все вопросы отвечены" : `Вопрос ${currentIndex + 1} / ${session.total_questions}`}
                  </span>
                </div>
                <div className={styles["prog-mini"]}>
                  <span>Осталось {remainingCount}</span>
                  {examMode ? (
                    <span>Разбор после финиша</span>
                  ) : (
                    <>
                      <span>Верно {correctCount}</span>
                      <span>Ошибок {incorrectCount}</span>
                    </>
                  )}
                </div>
                <div className={styles["prog-bar"]}>
                  <div className={styles["prog-fill"]} style={{ width: `${progressPercent}%` } as CSSProperties} />
                </div>
              </div>
            </div>

            {question ? (
              <div className={styles["q-grid"]}>
                <div className={styles.qcard}>
                  <div className={styles["qcard-head"]}>
                    <div className={styles["qcard-shim"]} />
                    <div className={styles["qcard-badges"]}>
                      <span className={`${styles.sbadge} ${styles["sb-accent"]}`.trim()}>
                        <span className={styles["pulse-accent"]} />
                        Вопрос {currentIndex + 1}
                      </span>
                      <span className={`${styles.diff} ${difficultyMeta(question.difficulty).className}`.trim()}>
                        {difficultyMeta(question.difficulty).label}
                      </span>
                      {examMode ? (
                        <span className={`${styles.sbadge} ${styles["sb-new"]}`.trim()}>
                          {strictAccreditationMode ? "Аккредитация" : "Контроль"}
                        </span>
                      ) : null}
                    </div>
                    <div className={styles["qcard-num"]}>
                      {String(currentIndex + 1).padStart(2, "0")} / {String(session.questions.length).padStart(2, "0")}
                    </div>
                  </div>

                  <div className={styles["qcard-body"]}>
                    <div className={styles["q-text"]}>{question.text}</div>
                    <div className={styles.options}>
                      {question.answer_options.map((option) => {
                        const selectedState = selectedStateByLabel[option.label] ?? "default";
                        const optionClassName =
                          selectedState === "correct"
                            ? `${styles.opt} ${styles["opt-correct"]} ${styles["opt-disabled"]}`
                            : selectedState === "incorrect"
                              ? `${styles.opt} ${styles["opt-wrong"]} ${styles["opt-disabled"]}`
                              : selectedState === "selected"
                                ? answers[question.id]
                                  ? `${styles.opt} ${styles["opt-sel"]} ${styles["opt-disabled"]}`
                                  : `${styles.opt} ${styles["opt-sel"]}`
                                : answers[question.id]
                                  ? `${styles.opt} ${styles["opt-disabled"]}`
                                  : styles.opt;

                        const showCorrect = !examMode && recordedAnswer?.response.correct_option_label === option.label;
                        const showWrong =
                          !examMode &&
                          recordedAnswer &&
                          recordedAnswer.selectedOptionLabel === option.label &&
                          recordedAnswer.response.is_correct === false;

                        return (
                          <button
                            className={optionClassName}
                            data-testid={`test-session-option-${question.id}-${option.label}`}
                            key={option.label}
                            aria-pressed={selectedOption === option.label}
                            onClick={() => {
                              if (!recordedAnswer) {
                                setSelectedOption(option.label);
                              }
                            }}
                            type="button"
                          >
                            <div className={styles["opt-lbl"]}>{option.label}</div>
                            <div className={styles["opt-text"]}>{option.text}</div>
                            {showCorrect ? (
                              <div className={`${styles["opt-icon"]} ${styles["oi-ok"]} ${styles.show}`.trim()}>
                                <CheckIcon />
                              </div>
                            ) : showWrong ? (
                              <div className={`${styles["opt-icon"]} ${styles["oi-err"]} ${styles.show}`.trim()}>
                                <WrongIcon />
                              </div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className={styles["q-sidebar"]}>
                  {recordedAnswer && !examMode ? (
                    <div className={`${styles["fb-card"]} ${recordedAnswer.response.is_correct === true ? styles["fb-ok"] : styles["fb-err"]}`.trim()}>
                      <div className={styles["fb-head"]}>
                        <div className={styles["fb-hico"]}>{recordedAnswer.response.is_correct === true ? <CheckIcon /> : <WrongIcon />}</div>
                        <div>
                          <div className={styles["fb-htitle"]}>
                            {recordedAnswer.response.is_correct === true
                              ? "Ответ верный!"
                              : `Верный ответ: ${recordedAnswer.response.correct_option_label ?? "—"}`}
                          </div>
                          <div className={styles["fb-hsub"]}>{recordedAnswer.response.is_correct === true ? "Отлично" : "Ошибка — изучи разбор"}</div>
                        </div>
                      </div>
                      <div className={styles["fb-body"]}>
                        <p>{recordedAnswer.response.explanation ?? "Подробное пояснение к вопросу пока не добавлено."}</p>
                      </div>
                    </div>
                  ) : recordedAnswer && examMode ? (
                    <div className={`${styles["fb-card"]} ${styles["fb-exam"]} ${styles.muted}`.trim()}>
                      <div className={styles["fb-head"]}>
                        <div className={styles["fb-hico"]}>
                          <ClockFeedbackIcon />
                        </div>
                        <div>
                          <div className={styles["fb-htitle"]}>Ответ зафиксирован</div>
                          <div className={styles["fb-hsub"]} data-testid="test-session-feedback-mode">
                            {sessionModeLabel}
                          </div>
                        </div>
                      </div>
                      <div className={styles["fb-body"]}>
                        <p>Результат будет показан после завершения сессии.</p>
                      </div>
                    </div>
                  ) : examMode ? (
                    <div className={`${styles["fb-card"]} ${styles["fb-exam"]} ${styles.muted}`.trim()}>
                      <div className={styles["fb-head"]}>
                        <div className={styles["fb-hico"]} style={{ background: "var(--ink-07)", color: "var(--ink-40)" } as CSSProperties}>
                          <ExamInfoIcon />
                        </div>
                        <div>
                          <div className={styles["fb-htitle"]} style={{ color: "var(--ink-70)" } as CSSProperties}>
                            {sessionModeLabel}
                          </div>
                          <div className={styles["fb-hsub"]} data-testid="test-session-exam-feedback-subtitle">
                            {examFeedbackSubtitle}
                          </div>
                        </div>
                      </div>
                      <div className={styles["fb-body"]}>
                        <p>Разбор доступен после завершения всей сессии.</p>
                      </div>
                    </div>
                  ) : (
                    <div className={`${styles["fb-card"]} ${styles.muted}`.trim()}>
                      <div className={styles["fb-head"]}>
                        <div className={styles["fb-hico"]} style={{ background: "var(--ink-07)", color: "var(--ink-40)" } as CSSProperties}>
                          <InfoIcon />
                        </div>
                        <div>
                          <div className={styles["fb-htitle"]} style={{ color: "var(--ink-70)" } as CSSProperties}>
                            Выбери вариант
                          </div>
                          <div className={styles["fb-hsub"]}>Ожидание</div>
                        </div>
                      </div>
                      <div className={styles["fb-body"]}>
                        <p>После отправки система покажет правильный вариант и краткий разбор.</p>
                      </div>
                    </div>
                  )}

                  <div className={styles["act-card"]}>
                    {!recordedAnswer ? (
                      <button
                        className={`${styles.btn} ${styles["btn-p"]}`.trim()}
                        data-testid="test-session-submit-answer"
                        disabled={!selectedOption || submitting}
                        onClick={handleSubmitAnswer}
                        onMouseDown={setRipplePosition}
                        type="button"
                      >
                        <span className={styles["btn-rip"]} />
                        {submitting ? <span className={styles.spin} /> : null}
                        <span>{submitting ? "Отправляем..." : examMode ? "Ответить" : "Зафиксировать ответ"}</span>
                        {!submitting ? <span className={styles["btn-arr"]}><ButtonArrowWhite /></span> : null}
                      </button>
                    ) : allDone || isLastQuestion ? (
                      <button
                        className={`${styles.btn} ${styles["btn-p"]}`.trim()}
                        disabled={finishing}
                        onClick={() => void handleFinish()}
                        onMouseDown={setRipplePosition}
                        type="button"
                      >
                        <span className={styles["btn-rip"]} />
                        {finishing ? <span className={styles.spin} /> : null}
                        <span>{finishing ? "Считаем результат..." : "Завершить сессию"}</span>
                        {!finishing ? <span className={styles["btn-arr"]}><ButtonArrowWhite /></span> : null}
                      </button>
                    ) : (
                      <button
                        className={`${styles.btn} ${styles["btn-p"]}`.trim()}
                        onClick={() => setCurrentIndex((current) => Math.min(current + 1, session.questions.length - 1))}
                        onMouseDown={setRipplePosition}
                        type="button"
                      >
                        <span className={styles["btn-rip"]} />
                        <span>Следующий вопрос</span>
                        <span className={styles["btn-arr"]}>
                          <ButtonArrowWhite />
                        </span>
                      </button>
                    )}

                    <button
                      data-testid="test-session-finish-early"
                      className={`${styles.btn} ${styles["btn-o"]}`.trim()}
                      disabled={finishing}
                      onClick={() => setShowConfirm(true)}
                      onMouseDown={setRipplePosition}
                      type="button"
                    >
                      <span className={styles["btn-rip"]} />
                      Завершить досрочно
                    </button>
                  </div>

                  <div className={styles["qmap-card"]}>
                    <div className={styles["qmap-head"]}>
                      <div className={styles["qmap-head-lbl"]}>Навигация</div>
                      <div className={styles["qmap-legend"]}>
                        {examMode ? (
                          <>
                            <div className={styles["qm-leg"]}>
                              <div
                                className={styles["qm-leg-dot"]}
                                style={{ background: "var(--ink-07)", border: "1px solid var(--ink-15)" } as CSSProperties}
                              />
                              Отвечено
                            </div>
                            <div className={styles["qm-leg"]}>
                              <div
                                className={styles["qm-leg-dot"]}
                                style={{ background: "var(--ink)", border: "1px solid var(--ink)" } as CSSProperties}
                              />
                              Текущий
                            </div>
                          </>
                        ) : (
                          <>
                            <div className={styles["qm-leg"]}>
                              <div
                                className={styles["qm-leg-dot"]}
                                style={{ background: "var(--green-lo)", border: "1px solid var(--green-mid)" } as CSSProperties}
                              />
                              Верно
                            </div>
                            <div className={styles["qm-leg"]}>
                              <div
                                className={styles["qm-leg-dot"]}
                                style={{ background: "var(--accent-lo)", border: "1px solid var(--accent-mid)" } as CSSProperties}
                              />
                              Ошибка
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className={styles["qmap-grid"]}>
                      {session.questions.map((mapQuestion, index) => {
                        const answer = answers[mapQuestion.id];
                        const className =
                          index === currentIndex
                            ? `${styles["qmap-dot"]} ${styles["qd-cur"]}`
                            : answer
                              ? examMode
                                ? `${styles["qmap-dot"]} ${styles["qd-done"]}`
                                : answer.response.is_correct === true
                                  ? `${styles["qmap-dot"]} ${styles["qd-ok"]}`
                                  : `${styles["qmap-dot"]} ${styles["qd-err"]}`
                              : styles["qmap-dot"];

                        return (
                          <button
                            className={className}
                            key={mapQuestion.id}
                            aria-label={`Перейти к вопросу ${index + 1}`}
                            onClick={() => setCurrentIndex(index)}
                            title={`Вопрос ${index + 1}`}
                            type="button"
                          >
                            {String(index + 1).padStart(2, "0").slice(-2)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles["empty-card"]}>
                <div className={styles["empty-icon"]}>
                  <InfoIcon />
                </div>
                <div className={styles["empty-title"]}>Финишная точка</div>
                <div className={styles["empty-desc"]}>Все вопросы пройдены. Осталось завершить сессию и получить результат.</div>
              </div>
            )}
          </>
        )}
      </div>

      <div
        className={`${styles.overlay} ${showConfirm ? styles.show : ""}`.trim()}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setShowConfirm(false);
          }
        }}
        role="presentation"
      >
        {showConfirm ? (
          <div className={`${styles.modal} ${styles.compact}`.trim()}>
              <div className={`${styles["modal-body"]} ${styles.compact}`.trim()}>
                <div className={styles["cm-icon"]}>
                  <ConfirmIcon />
                </div>
                <div className={styles["cm-title"]}>Завершить сейчас?</div>
                <p className={styles["cm-desc"]}>
                  Оставшиеся вопросы будут засчитаны как пропущенные. Результат подсчитается по уже отвеченным.
                </p>
                <div className={styles["cm-acts"]}>
                  <button className={`${styles.btn} ${styles["btn-o"]}`.trim()} onClick={() => setShowConfirm(false)} type="button">
                    Продолжить
                  </button>
                  <button
                    data-testid="test-session-confirm-finish"
                    className={`${styles.btn} ${styles["btn-danger"]}`.trim()}
                    onClick={() => void handleFinish()}
                    type="button"
                  >
                    Да, завершить
                  </button>
                </div>
              </div>
          </div>
        ) : null}
      </div>

      <div
        className={`${styles.overlay} ${selectedReviewQuestion ? styles.show : ""}`.trim()}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setSelectedReviewQuestionId(null);
          }
        }}
        role="presentation"
      >
        {selectedReviewQuestion ? (
          <div
            aria-labelledby="test-review-question-title"
            aria-modal="true"
            className={`${styles.modal} ${selectedReviewAnswer?.response.is_correct === true ? styles["m-green"] : styles["m-accent"]}`.trim()}
            role="dialog"
          >
            <div className={styles["modal-head"]}>
              <div
                className={styles["modal-icon"]}
                style={
                  {
                    background:
                      selectedReviewAnswer?.response.is_correct === true ? "var(--green-lo)" : "var(--accent-lo)",
                    borderColor:
                      selectedReviewAnswer?.response.is_correct === true ? "var(--green-mid)" : "var(--accent-mid)",
                    color: selectedReviewAnswer?.response.is_correct === true ? "var(--green)" : "var(--accent)",
                  } as CSSProperties
                }
              >
                {selectedReviewAnswer?.response.is_correct === true ? <CheckIcon /> : <WrongIcon />}
              </div>
              <div className={styles["modal-heading"]}>
                <div className={styles["modal-kicker"]}>Полный разбор</div>
                <div className={styles["modal-title"]} id="test-review-question-title">
                  Вопрос {session.questions.findIndex((item) => item.id === selectedReviewQuestion.id) + 1}
                </div>
              </div>
              <button
                aria-label="Закрыть разбор вопроса"
                className={styles["modal-close"]}
                onClick={() => setSelectedReviewQuestionId(null)}
                type="button"
              >
                &#10005;
              </button>
            </div>

            <div className={styles["modal-body"]}>
              <div className={styles["review-modal-question"]}>{selectedReviewQuestion.text}</div>

              <div className={styles["review-modal-grid"]}>
                <div className={styles["review-modal-answer"]}>
                  <div className={styles["review-modal-label"]}>Ответ пользователя</div>
                  <div className={styles["review-modal-value"]}>
                    {selectedReviewAnswer
                      ? `${selectedReviewAnswer.selectedOptionLabel}. ${selectedReviewOption?.text ?? "Текст ответа не найден"}`
                      : "Вопрос пропущен"}
                  </div>
                </div>

                <div className={styles["review-modal-answer"]}>
                  <div className={styles["review-modal-label"]}>Верный ответ</div>
                  <div className={styles["review-modal-value"]}>
                    {selectedReviewAnswer?.response.correct_option_label
                      ? `${selectedReviewAnswer.response.correct_option_label}. ${
                          selectedReviewCorrectOption?.text ?? "Текст ответа не найден"
                        }`
                      : "Недоступен"}
                  </div>
                </div>
              </div>

              <div className={styles["review-modal-expl"]}>
                <div className={styles["review-modal-label"]}>Пояснение</div>
                <p>
                  {selectedReviewAnswer?.response.explanation ??
                    "Пояснение к этому вопросу пока не добавлено."}
                </p>
              </div>
            </div>

            <div className={`${styles["modal-foot"]} ${styles["review-modal-foot"]}`.trim()}>
              <button
                className={`${styles.btn} ${styles["btn-o"]}`.trim()}
                data-testid="test-review-prev"
                disabled={!hasPreviousReview}
                onClick={() => openReviewQuestionByIndex(selectedReviewIndex - 1)}
                type="button"
              >
                Предыдущий
              </button>
              <div className={styles["review-modal-step"]} data-testid="test-review-position">
                {selectedReviewIndex + 1} / {session.questions.length}
              </div>
              <button
                className={`${styles.btn} ${styles["btn-p"]}`.trim()}
                data-testid="test-review-next"
                disabled={!hasNextReview}
                onClick={() => openReviewQuestionByIndex(selectedReviewIndex + 1)}
                type="button"
              >
                Следующий
              </button>
            </div>
          </div>
        ) : null}
      </div>
      </div>
    </TestsChrome>
  );
}

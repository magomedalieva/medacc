import { startTransition, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../components/Button";
import styles from "../components/AuthPage.module.css";
import { NoticeBanner } from "../components/NoticeBanner";
import { useAuth } from "../contexts/AuthContext";
import { ApiError } from "../lib/api";

type AuthTab = "login" | "register";
type ModuleId = "tests" | "cases" | "oske" | "plan" | "analytics";

type LandingModule = {
  id: ModuleId;
  num: string;
  title: string;
  label: string;
  copy: string;
  preview: string[];
};

const modules: LandingModule[] = [
  {
    id: "tests",
    num: "01",
    title: "Тесты",
    label: "Рабочий режим",
    copy: "Вопросы первичной аккредитации с вариантами, статусами, прогрессом и разбором ошибок.",
    preview: ["Учебный режим", "Контрольная попытка", "Разбор ответа"],
  },
  {
    id: "cases",
    num: "02",
    title: "Кейсы",
    label: "Клинические задачи",
    copy: "Исходные данные, признаки, диагноз, подтверждение и тактика в одном учебном маршруте.",
    preview: ["12 вопросов", "Подсказки", "Клиническое мышление"],
  },
  {
    id: "oske",
    num: "03",
    title: "ОСКЭ",
    label: "Станции и чек-листы",
    copy: "Практические станции с чек-листом действий, мини-тестом и итоговым баллом.",
    preview: ["Чек-лист 70%", "Тест 30%", "Порог освоения"],
  },
  {
    id: "plan",
    num: "04",
    title: "План",
    label: "Учебный маршрут",
    copy: "Планировщик показывает задачи на сегодня, ближайшие повторы и нагрузку по дням.",
    preview: ["Дата аккредитации", "Дни занятий", "Пересчёт после паузы"],
  },
  {
    id: "analytics",
    num: "05",
    title: "Аналитика",
    label: "Готовность и дефицит",
    copy: "Система отдельно считает готовность по тестам, кейсам и ОСКЭ.",
    preview: ["Слабый этап", "Прогноз", "История попыток"],
  },
];

export function AuthPage() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [activeTab, setActiveTab] = useState<AuthTab>("login");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showRegisterConfirm, setShowRegisterConfirm] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const trimmedLoginEmail = loginForm.email.trim();
  const trimmedRegisterEmail = registerForm.email.trim();
  const loginReady = Boolean(trimmedLoginEmail && loginForm.password);
  const registerHasAllFields = Boolean(
    registerForm.first_name.trim() &&
      registerForm.last_name.trim() &&
      trimmedRegisterEmail &&
      registerForm.password &&
      registerForm.confirmPassword,
  );
  const registerPasswordHasMinLength = registerForm.password.length >= 8;
  const registerConfirmationStarted = registerForm.confirmPassword.length > 0;
  const registerPasswordsMatch =
    registerForm.password.length > 0 &&
    registerForm.confirmPassword.length > 0 &&
    registerForm.password === registerForm.confirmPassword;
  const registerReady = registerHasAllFields && registerPasswordHasMinLength && registerPasswordsMatch;
  const activeModule = modules[activeModuleIndex];

  useEffect(() => {
    setError(null);
  }, [activeTab]);

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen]);

  function openAuth(tab: AuthTab) {
    setActiveTab(tab);
    setDrawerOpen(true);
    setError(null);
  }

  function updateLoginField(field: "email" | "password", value: string) {
    setLoginForm((current) => ({ ...current, [field]: value }));
    if (error) {
      setError(null);
    }
  }

  function updateRegisterField(
    field: "first_name" | "last_name" | "email" | "password" | "confirmPassword",
    value: string,
  ) {
    setRegisterForm((current) => ({ ...current, [field]: value }));
    if (error) {
      setError(null);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!loginReady) {
      setError("Заполни email и пароль.");
      return;
    }

    setPending(true);

    try {
      await login({ email: trimmedLoginEmail, password: loginForm.password });
      startTransition(() => navigate("/", { replace: true }));
    } catch (exception) {
      setError(exception instanceof ApiError ? exception.message : "Не удалось выполнить вход");
    } finally {
      setPending(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!registerHasAllFields) {
      setError("Заполни имя, фамилию, email и пароль.");
      return;
    }

    if (!registerPasswordHasMinLength) {
      setError("Пароль должен содержать минимум 8 символов.");
      return;
    }

    if (!registerPasswordsMatch) {
      setError("Пароли не совпадают.");
      return;
    }

    setError(null);
    setPending(true);

    try {
      await register({
        first_name: registerForm.first_name.trim(),
        last_name: registerForm.last_name.trim(),
        email: trimmedRegisterEmail,
        password: registerForm.password,
      });
      startTransition(() => navigate("/", { replace: true }));
    } catch (exception) {
      setError(exception instanceof ApiError ? exception.message : "Не удалось создать аккаунт");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.screen}>
      <Background />

      <main className={styles.landing}>
        <header className={styles.topbar}>
          <button className={styles.brand} onClick={() => openAuth("login")} type="button" aria-label="MedAcc">
            Med<span>Acc</span>
          </button>
        </header>

        <section className={styles.heroShell} aria-labelledby="auth-hero-title">
          <div className={styles.heroCopy}>
            <div className={styles.kickerLine}>
              <span />
              <p>Подготовка к</p>
            </div>

            <h1 className={styles.heroTitle} id="auth-hero-title">
              Первичной
              <br />
              аккредитации
            </h1>

            <p className={styles.heroAccent}>в одном рабочем пространстве</p>

            <p className={styles.heroText}>
              MedAcc объединяет тесты, клинические кейсы, станции ОСКЭ, планировщик подготовки и аналитику.
              Пользователь сразу видит, что учить сегодня, где есть дефицит и как дойти до пробной аккредитации.
            </p>

            <button className={styles.cta} onClick={() => openAuth("register")} type="button">
              Начать подготовку
              <Arrow />
            </button>

            <div className={styles.moduleSummary} aria-live="polite">
              <div>
                <span>{activeModule.num}</span>
                <i />
                <strong>{activeModule.label}</strong>
              </div>
              <p>{activeModule.copy}</p>
            </div>
          </div>

          <ModuleCards active={activeModuleIndex} setActive={setActiveModuleIndex} />
        </section>
      </main>

      {drawerOpen ? (
        <div
          className={styles.drawerLayer}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDrawerOpen(false);
            }
          }}
        >
          <aside aria-labelledby="auth-drawer-title" aria-modal="true" className={styles.drawerPanel} role="dialog">
            <button
              aria-label="Закрыть"
              className={styles.closeButton}
              onClick={() => setDrawerOpen(false)}
              type="button"
            >
              ×
            </button>

            <div className={styles.drawerHeader}>
              <h2 className={styles.srOnly} id="auth-drawer-title">
                {activeTab === "login" ? "Вход" : "Регистрация"}
              </h2>
              <div className={styles.authTabs} role="tablist">
                <button
                  aria-selected={activeTab === "login"}
                  className={activeTab === "login" ? styles.authTabActive : ""}
                  onClick={() => setActiveTab("login")}
                  role="tab"
                  type="button"
                >
                  Вход
                </button>
                <button
                  aria-selected={activeTab === "register"}
                  className={activeTab === "register" ? styles.authTabActive : ""}
                  onClick={() => setActiveTab("register")}
                  role="tab"
                  type="button"
                >
                  Регистрация
                </button>
              </div>
            </div>

            {error ? <NoticeBanner message={error} tone="danger" /> : null}

            {activeTab === "login" ? (
              <form className={styles.authForm} onSubmit={handleLogin}>
                <AuthField
                  autoComplete="email"
                  label="Электронная почта"
                  onChange={(value) => updateLoginField("email", value)}
                  placeholder="student@example.com"
                  type="email"
                  value={loginForm.email}
                />
                <AuthField
                  autoComplete="current-password"
                  label="Пароль"
                  onChange={(value) => updateLoginField("password", value)}
                  placeholder="Минимум 8 символов"
                  type={showLoginPassword ? "text" : "password"}
                  value={loginForm.password}
                  withVisibilityToggle
                  visible={showLoginPassword}
                  onToggleVisibility={() => setShowLoginPassword((current) => !current)}
                />
                <label className={styles.rememberRow}>
                  <input
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                    type="checkbox"
                  />
                  <span>Запомнить меня</span>
                </label>
                <Button disabled={pending || !loginReady} fullWidth type="submit" variant="primary" withArrow>
                  {pending ? "Входим..." : "Войти"}
                </Button>
              </form>
            ) : (
              <form className={`${styles.authForm} ${styles.authFormRegister}`} onSubmit={handleRegister}>
                <div className={styles.authGrid}>
                  <AuthField
                    label="Имя"
                    onChange={(value) => updateRegisterField("first_name", value)}
                    placeholder="Иван"
                    value={registerForm.first_name}
                  />
                  <AuthField
                    label="Фамилия"
                    onChange={(value) => updateRegisterField("last_name", value)}
                    placeholder="Петров"
                    value={registerForm.last_name}
                  />
                </div>
                <AuthField
                  autoComplete="email"
                  label="Электронная почта"
                  onChange={(value) => updateRegisterField("email", value)}
                  placeholder="ivan.petrov@example.com"
                  type="email"
                  value={registerForm.email}
                />
                <AuthField
                  autoComplete="new-password"
                  label="Пароль"
                  onChange={(value) => updateRegisterField("password", value)}
                  placeholder="Минимум 8 символов"
                  type={showRegisterPassword ? "text" : "password"}
                  value={registerForm.password}
                  withVisibilityToggle
                  visible={showRegisterPassword}
                  onToggleVisibility={() => setShowRegisterPassword((current) => !current)}
                />
                <div className={styles.passwordMeter} aria-hidden="true">
                  <span className={registerPasswordHasMinLength ? styles.meterOn : ""} />
                  <span className={registerPasswordHasMinLength ? styles.meterOn : ""} />
                  <span className={registerPasswordsMatch ? styles.meterOn : ""} />
                  <em>{registerPasswordHasMinLength ? "Хороший" : "Слабый"}</em>
                </div>
                <div aria-live="polite" className={styles.authChecklist}>
                  <div
                    className={`${styles.authRule} ${
                      registerForm.password.length === 0
                        ? styles.authRuleIdle
                        : registerPasswordHasMinLength
                          ? styles.authRuleReady
                          : styles.authRuleAlert
                    }`.trim()}
                  >
                    Минимум 8 символов
                  </div>
                </div>
                <AuthField
                  autoComplete="new-password"
                  label="Повтор пароля"
                  onChange={(value) => updateRegisterField("confirmPassword", value)}
                  placeholder="Ещё раз пароль"
                  type={showRegisterConfirm ? "text" : "password"}
                  value={registerForm.confirmPassword}
                  withVisibilityToggle
                  visible={showRegisterConfirm}
                  onToggleVisibility={() => setShowRegisterConfirm((current) => !current)}
                />
                <div aria-live="polite" className={styles.authChecklist}>
                  <div
                    className={`${styles.authRule} ${
                      !registerConfirmationStarted
                        ? styles.authRuleIdle
                        : registerPasswordsMatch
                          ? styles.authRuleReady
                          : styles.authRuleAlert
                    }`.trim()}
                  >
                    Подтверждение совпадает с паролем
                  </div>
                </div>
                  <Button disabled={pending || !registerReady} fullWidth type="submit" variant="primary" withArrow>
                    {pending ? "Создаём профиль..." : "Создать аккаунт"}
                  </Button>
                  <div className={styles.formHint}>
                    Сразу после регистрации откроется короткая настройка персонального плана.
                  </div>
              </form>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function AuthField({
  autoComplete,
  label,
  onChange,
  onToggleVisibility,
  placeholder,
  type = "text",
  value,
  visible = false,
  withVisibilityToggle = false,
}: {
  autoComplete?: string;
  label: string;
  onChange: (value: string) => void;
  onToggleVisibility?: () => void;
  placeholder?: string;
  type?: string;
  value: string;
  visible?: boolean;
  withVisibilityToggle?: boolean;
}) {
  return (
    <label className={styles.authField}>
      <span className={styles.authLabel}>{label}</span>
      <span className={styles.authControlWrap}>
        <input
          autoComplete={autoComplete}
          className={styles.authInput}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type={type}
          value={value}
        />
        {withVisibilityToggle ? (
          <button
            aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
            className={styles.visibilityButton}
            onClick={onToggleVisibility}
            type="button"
          >
            <EyeIcon />
          </button>
        ) : null}
      </span>
    </label>
  );
}

function ModuleCards({ active, setActive }: { active: number; setActive: (index: number) => void }) {
  const activeModule = modules[active];
  const collapsedModules = modules.map((module, index) => ({ module, index })).filter(({ index }) => index !== active);

  return (
    <div className={styles.cardsArea} aria-label="Разделы платформы">
      <div className={styles.cardsDivider} />
      <div className={styles.cardsStack}>
        <article className={styles.activeCard}>
          <span className={styles.cardAccentLine} />
          <span className={styles.cardNumber}>{activeModule.num}</span>
          <span className={styles.cardIcon}>
            <ModuleIcon id={activeModule.id} />
          </span>
          <div className={styles.cardBody}>
            <div className={styles.cardHead}>
              <div>
                <h3>{activeModule.title}</h3>
                <span />
              </div>
              <p>{activeModule.label}</p>
            </div>
            <p className={styles.cardCopy}>{activeModule.copy}</p>
            <div className={styles.previewSlot}>
              <div className={styles.previewFrame}>
                <div className={styles.answerList}>
                  {activeModule.preview.map((item, index) => (
                    <div className={index === 0 ? `${styles.answerRow} ${styles.answerRowActive}` : styles.answerRow} key={item}>
                      <span>{index + 1}</span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </article>

        {collapsedModules.map(({ module, index }) => (
          <button
            className={styles.collapsedCard}
            key={module.id}
            onClick={() => setActive(index)}
            type="button"
            aria-label={`Открыть раздел ${module.title}`}
          >
            <span className={styles.collapsedNumber}>{module.num}</span>
            <span className={styles.collapsedIcon}>
              <ModuleIcon id={module.id} />
            </span>
            <span className={styles.collapsedTitle}>
              <span>{module.title}</span>
            </span>
            <span className={styles.collapsedGhost}>{index + 1}</span>
            <span className={styles.collapsedArrow}>
              <Arrow />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Background() {
  return (
    <>
      <img className={styles.anatomyImage} src="/anatomy.png" alt="" aria-hidden="true" />
      <div className={styles.gridBackground} aria-hidden="true" />
      <div className={styles.pageFrame} aria-hidden="true" />
    </>
  );
}

function ModuleIcon({ id }: { id: ModuleId }) {
  const props = {
    width: 17,
    height: 17,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.45,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (id === "tests") {
    return (
      <svg {...props}>
        <rect x="5" y="4" width="14" height="17" rx="1.6" />
        <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
        <path d="M9 4V3h6v1" />
      </svg>
    );
  }

  if (id === "cases") {
    return (
      <svg {...props}>
        <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h5l2 2h7a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18Z" />
        <path d="M12 12.5v4M10 14.5h4" />
      </svg>
    );
  }

  if (id === "oske") {
    return (
      <svg {...props}>
        <rect x="4" y="4" width="16" height="17" rx="1.8" />
        <path d="M8 9h8M8 13h8M8 17h5" />
        <path d="M10 4V3h4v1" />
      </svg>
    );
  }

  if (id === "plan") {
    return (
      <svg {...props}>
        <rect x="3.5" y="5" width="17" height="15" rx="1.6" />
        <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
        <path d="M8 13h2M13 13h3M8 16h5" />
      </svg>
    );
  }

  return (
    <svg {...props}>
      <path d="M4 19h16" />
      <path d="M4 4v15" />
      <path d="M7 16l4-5 3 2 5-7" />
      <circle cx="19" cy="6" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.7" />
    </svg>
  );
}

function Arrow({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

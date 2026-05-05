import { startTransition, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../components/Button";
import styles from "../components/AuthPage.module.css";
import { NoticeBanner } from "../components/NoticeBanner";
import { SegmentedTabs } from "../components/SegmentedTabs";
import { TextField } from "../components/TextField";
import { Wrapper } from "../components/Wrapper";
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
};

const modules: LandingModule[] = [
  {
    id: "tests",
    num: "01",
    title: "Тесты",
    label: "Рабочий режим",
    copy: "Вопросы первичной аккредитации с вариантами, статусами, прогрессом и разбором ошибок.",
  },
  {
    id: "cases",
    num: "02",
    title: "Кейсы",
    label: "Клинические задачи",
    copy: "Исходные данные, красные флаги, диагноз, ключевые признаки и первичная тактика.",
  },
  {
    id: "oske",
    num: "03",
    title: "ОСКЭ",
    label: "Станции и чек-листы",
    copy: "Практические станции с ключевыми пунктами, чек-листом и оценкой уверенности.",
  },
  {
    id: "plan",
    num: "04",
    title: "План",
    label: "Учебный маршрут",
    copy: "Планировщик показывает учебный день, задачи, ближайшие повторения и календарь нагрузки.",
  },
  {
    id: "analytics",
    num: "05",
    title: "Аналитика",
    label: "Готовность и дефицит",
    copy: "Дашборд показывает учебную готовность, карту дефицита и статус пробной аккредитации по этапам.",
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
  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
  });
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
              <div>
                <div className={styles.drawerKicker}>Старт работы</div>
                <h2 className={styles.drawerTitle} id="auth-drawer-title">
                  {activeTab === "login" ? "Войти в MedAcc" : "Создать аккаунт"}
                </h2>
                <p className={styles.drawerSubtitle}>
                  {activeTab === "login"
                    ? "Откроем кабинет или продолжим настройку плана с того места, где ты остановился."
                    : "После регистрации система предложит выбрать факультет и дату аккредитации."}
                </p>
              </div>
              <SegmentedTabs
                items={[
                  { label: "Вход", value: "login" },
                  { label: "Регистрация", value: "register" },
                ]}
                onChange={setActiveTab}
                value={activeTab}
              />
            </div>

            {error ? <NoticeBanner message={error} tone="danger" /> : null}

            {activeTab === "login" ? (
              <form onSubmit={handleLogin}>
                <Wrapper gap={16}>
                  <TextField
                    autoComplete="email"
                    label="Электронная почта"
                    onChange={(event) => updateLoginField("email", event.target.value)}
                    placeholder="student@example.com"
                    type="email"
                    value={loginForm.email}
                  />
                  <TextField
                    autoComplete="current-password"
                    label="Пароль"
                    onChange={(event) => updateLoginField("password", event.target.value)}
                    placeholder="Минимум 8 символов"
                    type="password"
                    value={loginForm.password}
                  />
                  <Button disabled={pending || !loginReady} fullWidth type="submit" variant="primary" withArrow>
                    {pending ? "Входим..." : "Войти"}
                  </Button>
                  <div className={styles.formHint}>После входа откроется кабинет студента.</div>
                </Wrapper>
              </form>
            ) : (
              <form onSubmit={handleRegister}>
                <Wrapper gap={16}>
                  <Wrapper direction="row" gap={16} wrap>
                    <Wrapper fullWidth grow>
                      <TextField
                        label="Имя"
                        onChange={(event) => updateRegisterField("first_name", event.target.value)}
                        placeholder="Анна"
                        value={registerForm.first_name}
                      />
                    </Wrapper>
                    <Wrapper fullWidth grow>
                      <TextField
                        label="Фамилия"
                        onChange={(event) => updateRegisterField("last_name", event.target.value)}
                        placeholder="Петрова"
                        value={registerForm.last_name}
                      />
                    </Wrapper>
                  </Wrapper>
                  <TextField
                    autoComplete="email"
                    label="Электронная почта"
                    onChange={(event) => updateRegisterField("email", event.target.value)}
                    placeholder="student@example.com"
                    type="email"
                    value={registerForm.email}
                  />
                  <Wrapper direction="row" gap={16} wrap>
                    <Wrapper fullWidth grow>
                      <TextField
                        autoComplete="new-password"
                        label="Пароль"
                        onChange={(event) => updateRegisterField("password", event.target.value)}
                        placeholder="Минимум 8 символов"
                        type="password"
                        value={registerForm.password}
                      />
                    </Wrapper>
                    <Wrapper fullWidth grow>
                      <TextField
                        autoComplete="new-password"
                        label="Повтор пароля"
                        onChange={(event) => updateRegisterField("confirmPassword", event.target.value)}
                        placeholder="Ещё раз пароль"
                        type="password"
                        value={registerForm.confirmPassword}
                      />
                    </Wrapper>
                  </Wrapper>
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
                </Wrapper>
              </form>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function ModuleCards({ active, setActive }: { active: number; setActive: (index: number) => void }) {
  const activeModule = modules[active];
  const collapsedModules = modules.map((module, index) => ({ module, index })).filter(({ index }) => index !== active);

  return (
    <div className={styles.cardsArea} aria-label="Разделы платформы">
      <div className={styles.cardsDivider} />
      <div className={styles.cardsStack}>
        <ActiveCard module={activeModule} />
        {collapsedModules.map(({ module, index }) => (
          <CollapsedCard key={module.id} module={module} index={index} onActivate={() => setActive(index)} />
        ))}
      </div>
    </div>
  );
}

function ActiveCard({ module }: { module: LandingModule }) {
  return (
    <article className={styles.activeCard}>
      <span className={styles.cardAccentLine} />
      <span className={styles.cardNumber}>{module.num}</span>
      <span className={styles.cardIcon}>
        <ModuleIcon id={module.id} />
      </span>

      <div className={styles.cardBody}>
        <div className={styles.cardHead}>
          <div>
            <h3>{module.title}</h3>
            <span />
          </div>
          <p>{module.label}</p>
        </div>

        <p className={styles.cardCopy}>{module.copy}</p>

        <div className={styles.previewSlot}>
          <ProductPreview id={module.id} />
        </div>
      </div>
    </article>
  );
}

function CollapsedCard({
  module,
  index,
  onActivate,
}: {
  module: LandingModule;
  index: number;
  onActivate: () => void;
}) {
  return (
    <button className={styles.collapsedCard} onClick={onActivate} type="button" aria-label={`Открыть раздел ${module.title}`}>
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
  );
}

function ProductPreview({ id }: { id: ModuleId }) {
  return (
    <div className={styles.productPreview}>
      {id === "tests" ? <TestsPreview /> : null}
      {id === "cases" ? <CasesPreview /> : null}
      {id === "oske" ? <OskePreview /> : null}
      {id === "plan" ? <PlanPreview /> : null}
      {id === "analytics" ? <AnalyticsPreview /> : null}
    </div>
  );
}

function PreviewFrame({
  children,
  className = "",
  maxWidth = 320,
}: {
  children: ReactNode;
  className?: string;
  maxWidth?: number;
}) {
  return (
    <div className={`${styles.previewFrame} ${className}`.trim()} style={{ maxWidth }}>
      {children}
    </div>
  );
}

function TestsPreview() {
  const answers = ["Отложить лечение", "Госпитализировать", "Плановая диагностика", "Антибиотик без показаний"];

  return (
    <PreviewFrame maxWidth={292}>
      <div className={styles.testPreviewTop}>
        <span>
          <i />
          Вопрос 1
        </span>
        <span>01 / 30</span>
      </div>
      <div className={styles.testPreviewBody}>
        <p>Острый холецистит: боль, лихорадка, симптом Мерфи. Что выбрать?</p>
        <div className={styles.answerList}>
          {answers.map((answer, index) => (
            <div className={`${styles.answerRow} ${index === 1 ? styles.answerRowActive : ""}`} key={answer}>
              <span>{String.fromCharCode(65 + index)}</span>
              {answer}
            </div>
          ))}
        </div>
      </div>
    </PreviewFrame>
  );
}

function CasesPreview() {
  const items = [
    ["Жалобы", "Боль в животе"],
    ["Осмотр", "Похудание"],
    ["Красный флаг", "Свищи"],
    ["Диагноз", "Болезнь Крона"],
    ["Признак", "Свищи и стриктуры"],
    ["Тактика", "Подобрать терапию"],
  ];

  return (
    <PreviewFrame className={styles.casesPreview}>
      <div className={styles.previewStage}>Этап 1 из 14</div>
      <h4>Исходные данные</h4>
      <div className={styles.caseFactGrid}>
        {items.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p>
        <b>Вводные:</b> пациент в приемном отделении, оценка симптомов и тактики.
      </p>
    </PreviewFrame>
  );
}

function OskePreview() {
  const steps = [
    "Оценить безопасность",
    "Проверить сознание",
    "Позвать на помощь",
    "Открыть дыхательные пути",
    "Оценить дыхание",
  ];

  return (
    <PreviewFrame>
      <div className={styles.oskePreviewTop}>
        <strong>Отмечено пунктов</strong>
        <span>0 / 8</span>
      </div>
      <div className={styles.oskeList}>
        {steps.map((step) => (
          <div key={step}>
            <span>
              <i />
              {step}
            </span>
            <strong>Ключевой</strong>
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}

function PlanPreview() {
  return (
    <PreviewFrame className={styles.planPreview}>
      <div className={styles.planHeader}>
        <span>Пятница, 1 мая</span>
        <span>Учебный день</span>
        <span>Режим →</span>
      </div>
      <div className={styles.planGrid}>
        <div>
          <b>Сегодня</b>
          <strong>10:00 Реанимация</strong>
          <span>Завтра: Желтуха</span>
        </div>
        <div>
          <h4>1 мая</h4>
          {["ОСКЭ", "Неврология", "Повтор"].map((item) => (
            <span key={item}>○ {item}</span>
          ))}
        </div>
        <div>
          <h4>Май</h4>
          <div className={styles.calendarGrid}>
            {Array.from({ length: 28 }).map((_, index) => (
              <span className={index === 11 ? styles.calendarActive : ""} key={index}>
                {index + 1}
              </span>
            ))}
          </div>
        </div>
      </div>
    </PreviewFrame>
  );
}

function AnalyticsPreview() {
  const deficitRows = ["Покр", "Свеж", "Стаб", "Практ"];

  return (
    <PreviewFrame className={styles.analyticsPreview}>
      <div className={styles.analyticsTabs}>
        <span>Обзор</span>
        <span>Тесты</span>
        <span>Кейсы</span>
        <span>ОСКЭ</span>
      </div>
      <div className={styles.analyticsGrid}>
        <div>
          <b>Учебная готовность</b>
          <div className={styles.miniRing}>
            <span>38%</span>
          </div>
          <p>
            Тесты 45%
            <br />
            Кейсы 50%
            <br />
            ОСКЭ 25%
          </p>
        </div>
        <div>
          <b>Карта дефицита</b>
          <div className={styles.deficitGrid}>
            <span />
            {["Т", "К", "О"].map((header) => (
              <b key={header}>{header}</b>
            ))}
            {deficitRows
              .map((row, rowIndex) => [
                <span key={row}>{row}</span>,
                ...[0, 1, 2].map((columnIndex) => (
                  <span key={`${row}-${columnIndex}`}>
                    <i
                      className={
                        rowIndex + columnIndex > 3
                          ? styles.deficitCritical
                          : rowIndex + columnIndex > 1
                            ? styles.deficitRisk
                            : styles.deficitNorm
                      }
                    />
                  </span>
                )),
              ])
              .flat()}
          </div>
        </div>
        <div>
          <b>Протокол</b>
          {["Тестовый", "Задачи", "ОСКЭ"].map((item, index) => (
            <p className={styles.protocolRow} key={item}>
              <span>{item}</span>
              <strong>{index === 2 ? "Сдан" : "Не сдан"}</strong>
            </p>
          ))}
        </div>
      </div>
    </PreviewFrame>
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

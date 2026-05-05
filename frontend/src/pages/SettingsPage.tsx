import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { api, ApiError } from "../lib/api";
import { studyIntensityLabel, studyWeekdaysSummary } from "../lib/studyPreferences";
import styles from "./SettingsPage.module.css";

type NoticeTone = "default" | "danger" | "success";
type NoticeKey = "profile" | "password";

type NoticeState = {
  message: string;
  tone: NoticeTone;
} | null;

type ProfileFormState = {
  first_name: string;
  last_name: string;
  email: string;
};

type PasswordFormState = {
  current_password: string;
  new_password: string;
  confirmPassword: string;
};

type PasswordVisibilityState = {
  current_password: boolean;
  new_password: boolean;
  confirmPassword: boolean;
};

const EMPTY_PASSWORD_FORM: PasswordFormState = {
  current_password: "",
  new_password: "",
  confirmPassword: "",
};

const HIDDEN_PASSWORDS: PasswordVisibilityState = {
  current_password: false,
  new_password: false,
  confirmPassword: false,
};

function trimProfileForm(form: ProfileFormState): ProfileFormState {
  return {
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    email: form.email.trim(),
  };
}

function getInputClassName(...modifiers: Array<string | false>) {
  return [styles.fieldInput, ...modifiers].filter(Boolean).join(" ");
}

function getNoticeClassName(notice: NoticeState) {
  return [styles.notice, notice ? styles[notice.tone] : ""].filter(Boolean).join(" ");
}

function CheckIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
      <path d="M1.5 4l2 2L7 2" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <ellipse cx="7" cy="7" rx="5.5" ry="3.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" />
    </svg>
  );
}

function NoticeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 4.5v3M7 9.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 6.5l3 3 5-5.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <rect x="2" y="5" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 5V3.5a2 2 0 1 1 4 0V5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1 5h7M5.5 1.5L9 5l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SettingsPage() {
  const { token, user, replaceUser } = useAuth();
  const navigate = useNavigate();
  const noticeTimers = useRef<Partial<Record<NoticeKey, ReturnType<typeof setTimeout>>>>({});
  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    first_name: user?.first_name ?? "",
    last_name: user?.last_name ?? "",
    email: user?.email ?? "",
  });
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(EMPTY_PASSWORD_FORM);
  const [visiblePasswords, setVisiblePasswords] = useState<PasswordVisibilityState>(HIDDEN_PASSWORDS);
  const [profileNotice, setProfileNotice] = useState<NoticeState>(null);
  const [passwordNotice, setPasswordNotice] = useState<NoticeState>(null);
  const [isProfilePending, setProfilePending] = useState(false);
  const [isPasswordPending, setPasswordPending] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    setProfileForm({
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
    });
  }, [user]);

  useEffect(() => {
    return () => {
      Object.values(noticeTimers.current).forEach((timer) => {
        if (timer) {
          clearTimeout(timer);
        }
      });
    };
  }, []);

  if (!user || !token) {
    return null;
  }

  const currentUser = user;
  const authToken = token;
  const trimmedProfile = trimProfileForm(profileForm);
  const hasProfileChanges =
    trimmedProfile.first_name !== currentUser.first_name ||
    trimmedProfile.last_name !== currentUser.last_name ||
    trimmedProfile.email.toLowerCase() !== currentUser.email.toLowerCase();
  const isProfileValid = Boolean(trimmedProfile.first_name && trimmedProfile.last_name && trimmedProfile.email);
  const hasPasswordDraft = Boolean(
    passwordForm.current_password || passwordForm.new_password || passwordForm.confirmPassword,
  );
  const hasNewPasswordDraft = passwordForm.new_password.length > 0;
  const hasConfirmPasswordDraft = passwordForm.confirmPassword.length > 0;
  const passwordHasMinLength = passwordForm.new_password.length >= 8;
  const passwordsMatch =
    hasNewPasswordDraft &&
    hasConfirmPasswordDraft &&
    passwordForm.new_password === passwordForm.confirmPassword;
  const passwordLengthStatus = !hasNewPasswordDraft ? "" : passwordHasMinLength ? styles.ready : styles.alert;
  const passwordMatchStatus =
    !hasNewPasswordDraft && !hasConfirmPasswordDraft ? "" : passwordsMatch ? styles.ready : styles.alert;
  const passwordCanSubmit = Boolean(passwordForm.current_password && passwordHasMinLength && passwordsMatch);
  const studyModeLabel = studyIntensityLabel(currentUser.study_intensity);
  const studyDaysLabel = studyWeekdaysSummary(currentUser.study_weekdays);

  function closeNotice(key: NoticeKey) {
    const timer = noticeTimers.current[key];

    if (timer) {
      clearTimeout(timer);
      noticeTimers.current[key] = undefined;
    }

    if (key === "profile") {
      setProfileNotice(null);
      return;
    }

    setPasswordNotice(null);
  }

  function showNotice(key: NoticeKey, message: string, tone: NoticeTone = "success") {
    closeNotice(key);

    if (key === "profile") {
      setProfileNotice({ message, tone });
    } else {
      setPasswordNotice({ message, tone });
    }

    noticeTimers.current[key] = setTimeout(() => closeNotice(key), 4500);
  }

  function handleRipple(event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--rx", `${(((event.clientX - rect.left) / rect.width) * 100).toFixed(1)}%`);
    event.currentTarget.style.setProperty("--ry", `${(((event.clientY - rect.top) / rect.height) * 100).toFixed(1)}%`);
  }

  function resetProfileForm() {
    setProfileForm({
      first_name: currentUser.first_name,
      last_name: currentUser.last_name,
      email: currentUser.email,
    });
    closeNotice("profile");
  }

  function resetPasswordForm() {
    setPasswordForm(EMPTY_PASSWORD_FORM);
    setVisiblePasswords(HIDDEN_PASSWORDS);
    closeNotice("password");
  }

  function togglePasswordVisibility(field: keyof PasswordVisibilityState) {
    setVisiblePasswords((current) => ({
      ...current,
      [field]: !current[field],
    }));
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    closeNotice("profile");

    const payload = trimmedProfile;

    if (!payload.first_name || !payload.last_name || !payload.email) {
      showNotice("profile", "Заполни имя, фамилию и email.", "danger");
      return;
    }

    if (!hasProfileChanges) {
      showNotice("profile", "Изменений пока нет.", "default");
      return;
    }

    setProfilePending(true);

    try {
      const updatedUser = await api.updateProfile(authToken, payload);
      replaceUser(updatedUser);
      showNotice("profile", "Данные аккаунта обновлены.", "success");
    } catch (exception) {
      showNotice(
        "profile",
        exception instanceof ApiError ? exception.message : "Не удалось обновить данные аккаунта.",
        "danger",
      );
    } finally {
      setProfilePending(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    closeNotice("password");

    if (!passwordForm.current_password) {
      showNotice("password", "Заполни текущий пароль.", "danger");
      return;
    }

    if (!passwordForm.new_password || !passwordForm.confirmPassword) {
      showNotice("password", "Заполни новый пароль и подтверждение.", "danger");
      return;
    }

    if (!passwordHasMinLength) {
      showNotice("password", "Новый пароль должен содержать минимум 8 символов.", "danger");
      return;
    }

    if (!passwordsMatch) {
      showNotice("password", "Новый пароль и подтверждение не совпадают.", "danger");
      return;
    }

    setPasswordPending(true);

    try {
      await api.changePassword(authToken, {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      resetPasswordForm();
      showNotice("password", "Пароль обновлён.", "success");
    } catch (exception) {
      showNotice(
        "password",
        exception instanceof ApiError ? exception.message : "Не удалось обновить пароль.",
        "danger",
      );
    } finally {
      setPasswordPending(false);
    }
  }

  return (
    <main className={styles.shell} data-testid="settings-page">
      <div className={styles.ph}>
        <div className={styles.phKicker}>Аккаунт и безопасность</div>
        <h1 className={styles.phTitle}>
          Профиль и <em>вход</em>
        </h1>
        <p className={styles.phLead}>
          Здесь управляются данные профиля, email для входа и пароль. Параметры подготовки вынесены в Планировщик,
          чтобы расписание менялось в одном месте.
        </p>
      </div>

      <div className={styles.layout}>
        <div className={styles.mainCol}>
          <section className={styles.card} id="profile-card">
            <div className={styles.cardInner}>
              <div className={styles.cardHead}>
                <div className={styles.cardEyebrow}>Профиль</div>
                <h2 className={styles.cardTitle}>Личные данные</h2>
                <p className={styles.cardLead}>Обнови имя и почту, которые используются в твоём аккаунте.</p>
              </div>

              {profileNotice ? (
                <div className={getNoticeClassName(profileNotice)}>
                  <NoticeIcon />
                  <span>{profileNotice.message}</span>
                  <button className={styles.noticeX} onClick={() => closeNotice("profile")} type="button" aria-label="Закрыть уведомление">
                    ×
                  </button>
                </div>
              ) : null}

              <form className={styles.formStack} onSubmit={handleProfileSubmit}>
                <div className={styles.formGrid}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="first_name">
                      Имя
                    </label>
                    <div className={styles.fieldWrap}>
                      <input
                        className={getInputClassName(
                          trimmedProfile.first_name && trimmedProfile.first_name !== currentUser.first_name ? styles.ok : false,
                        )}
                        disabled={isProfilePending}
                        id="first_name"
                        onChange={(event) => setProfileForm((current) => ({ ...current, first_name: event.target.value }))}
                        type="text"
                        value={profileForm.first_name}
                      />
                    </div>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="last_name">
                      Фамилия
                    </label>
                    <div className={styles.fieldWrap}>
                      <input
                        className={getInputClassName(
                          trimmedProfile.last_name && trimmedProfile.last_name !== currentUser.last_name ? styles.ok : false,
                        )}
                        disabled={isProfilePending}
                        id="last_name"
                        onChange={(event) => setProfileForm((current) => ({ ...current, last_name: event.target.value }))}
                        type="text"
                        value={profileForm.last_name}
                      />
                    </div>
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="email">
                    Email для входа
                  </label>
                  <div className={styles.fieldWrap}>
                    <input
                      autoComplete="email"
                      className={getInputClassName(
                        trimmedProfile.email && trimmedProfile.email.toLowerCase() !== currentUser.email.toLowerCase()
                          ? styles.ok
                          : false,
                      )}
                      disabled={isProfilePending}
                      id="email"
                      onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))}
                      type="email"
                      value={profileForm.email}
                    />
                  </div>
                </div>

                <div className={styles.formActions}>
                  <button
                    className={`${styles.btn} ${styles.btnQuiet}`}
                    disabled={isProfilePending}
                    onClick={resetProfileForm}
                    onMouseDown={handleRipple}
                    style={{ visibility: hasProfileChanges ? "visible" : "hidden" }}
                    type="button"
                  >
                    <div className={styles.btnRip} />
                    Сбросить
                  </button>

                  <div className={styles.formActionsRight}>
                    <button
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      data-testid="settings-save-profile"
                      disabled={isProfilePending || !hasProfileChanges || !isProfileValid}
                      onMouseDown={handleRipple}
                      type="submit"
                    >
                      <div className={styles.btnRip} />
                      {isProfilePending ? (
                        <>
                          <span className={styles.spin} />
                          <span>Сохраняем...</span>
                        </>
                      ) : (
                        <>
                          <SaveIcon />
                          Сохранить данные
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </section>

          <section className={styles.card} id="password-card">
            <div className={styles.cardInner}>
              <div className={styles.cardHead}>
                <div className={styles.cardEyebrow}>Безопасность</div>
                <h2 className={styles.cardTitle}>Смена пароля</h2>
                <p className={styles.cardLead}>
                  Задай новый пароль для входа в аккаунт. Старый пароль нужен для подтверждения.
                </p>
              </div>

              {passwordNotice ? (
                <div className={getNoticeClassName(passwordNotice)}>
                  <NoticeIcon />
                  <span>{passwordNotice.message}</span>
                  <button className={styles.noticeX} onClick={() => closeNotice("password")} type="button" aria-label="Закрыть уведомление">
                    ×
                  </button>
                </div>
              ) : null}

              <form className={styles.formStack} onSubmit={handlePasswordSubmit}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="current_password">
                    Текущий пароль
                  </label>
                  <div className={styles.fieldWrap}>
                    <input
                      autoComplete="current-password"
                      className={getInputClassName(styles.hasToggle)}
                      disabled={isPasswordPending}
                      id="current_password"
                      onChange={(event) => setPasswordForm((current) => ({ ...current, current_password: event.target.value }))}
                      type={visiblePasswords.current_password ? "text" : "password"}
                      value={passwordForm.current_password}
                    />
                    <button
                      className={`${styles.pwToggle} ${visiblePasswords.current_password ? styles.pwToggleActive : ""}`.trim()}
                      onClick={() => togglePasswordVisibility("current_password")}
                      type="button"
                      aria-label="Показать текущий пароль"
                    >
                      <EyeIcon />
                    </button>
                  </div>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="new_password">
                      Новый пароль
                    </label>
                    <div className={styles.fieldWrap}>
                      <input
                        autoComplete="new-password"
                        className={getInputClassName(
                          styles.hasToggle,
                          passwordForm.new_password.length === 0
                            ? false
                            : passwordHasMinLength
                              ? styles.ok
                              : styles.err,
                        )}
                        disabled={isPasswordPending}
                        id="new_password"
                        onChange={(event) => setPasswordForm((current) => ({ ...current, new_password: event.target.value }))}
                        type={visiblePasswords.new_password ? "text" : "password"}
                        value={passwordForm.new_password}
                      />
                      <button
                        className={`${styles.pwToggle} ${visiblePasswords.new_password ? styles.pwToggleActive : ""}`.trim()}
                        onClick={() => togglePasswordVisibility("new_password")}
                        type="button"
                        aria-label="Показать новый пароль"
                      >
                        <EyeIcon />
                      </button>
                    </div>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="confirm_password">
                      Повтори новый пароль
                    </label>
                    <div className={styles.fieldWrap}>
                      <input
                        autoComplete="new-password"
                        className={getInputClassName(
                          styles.hasToggle,
                          !hasConfirmPasswordDraft ? false : passwordsMatch ? styles.ok : styles.err,
                        )}
                        disabled={isPasswordPending}
                        id="confirm_password"
                        onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                        type={visiblePasswords.confirmPassword ? "text" : "password"}
                        value={passwordForm.confirmPassword}
                      />
                      <button
                        className={`${styles.pwToggle} ${visiblePasswords.confirmPassword ? styles.pwToggleActive : ""}`.trim()}
                        onClick={() => togglePasswordVisibility("confirmPassword")}
                        type="button"
                        aria-label="Показать подтверждение пароля"
                      >
                        <EyeIcon />
                      </button>
                    </div>
                  </div>
                </div>

                <div className={styles.checklist} aria-live="polite">
                  <div className={`${styles.checkRow} ${passwordLengthStatus}`.trim()} data-testid="settings-password-length-rule">
                    <div className={styles.checkIcon}>
                      <CheckIcon />
                    </div>
                    Минимум 8 символов
                  </div>
                  <div className={`${styles.checkRow} ${passwordMatchStatus}`.trim()} data-testid="settings-password-match-rule">
                    <div className={styles.checkIcon}>
                      <CheckIcon />
                    </div>
                    Подтверждение совпадает с новым паролем
                  </div>
                </div>

                <div className={styles.formActions}>
                  <button
                    className={`${styles.btn} ${styles.btnQuiet}`}
                    disabled={isPasswordPending}
                    onClick={resetPasswordForm}
                    onMouseDown={handleRipple}
                    style={{ visibility: hasPasswordDraft ? "visible" : "hidden" }}
                    type="button"
                  >
                    <div className={styles.btnRip} />
                    Очистить
                  </button>

                  <div className={styles.formActionsRight}>
                    <button
                      className={`${styles.btn} ${styles.btnSecondary}`}
                      data-testid="settings-change-password"
                      disabled={isPasswordPending || !passwordCanSubmit}
                      onMouseDown={handleRipple}
                      type="submit"
                    >
                      <div className={styles.btnRip} />
                      {isPasswordPending ? (
                        <>
                          <span className={`${styles.spin} ${styles.spinDark}`} />
                          <span>Обновляем...</span>
                        </>
                      ) : (
                        <>
                          <LockIcon />
                          Обновить пароль
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </section>
        </div>

        <aside className={styles.asideCol}>
          <section className={`${styles.card} ${styles.green} ${styles.asideCard}`.trim()}>
            <div className={styles.cardInner}>
              <div className={styles.cardHeadNoMargin}>
                <div className={`${styles.cardEyebrow} ${styles.cardEyebrowGreen}`.trim()}>Планировщик</div>
                <h2 className={styles.cardTitle}>Учебные параметры</h2>
                <p className={styles.cardLead}>
                  Параметры подготовки живут в одном месте, чтобы расписание и нагрузка менялись согласованно.
                </p>
              </div>

              <dl className={styles.asideTable}>
                <div className={styles.asideRow}>
                  <dt>Время в день</dt>
                  <dd>{currentUser.daily_study_minutes} мин</dd>
                </div>
                <div className={styles.asideRow}>
                  <dt>Режим</dt>
                  <dd>{studyModeLabel}</dd>
                </div>
                <div className={styles.asideRow}>
                  <dt>Учебные дни</dt>
                  <dd>{studyDaysLabel}</dd>
                </div>
              </dl>

              <div className={styles.asideActions}>
                <button
                  className={`${styles.btn} ${styles.btnSecondary} ${styles.plannerButton}`.trim()}
                  onClick={() => navigate("/app/schedule")}
                  onMouseDown={handleRipple}
                  type="button"
                >
                  <div className={styles.btnRip} />
                  Открыть планировщик
                  <ArrowIcon />
                </button>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

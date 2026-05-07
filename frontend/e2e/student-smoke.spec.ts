import { expect, request as playwrightRequest, test, type APIRequestContext, type Page } from "@playwright/test";

const BACKEND_BASE_URL = "http://127.0.0.1:8000";
const API_PREFIX = "/api/v1";

type StudentCredentials = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

type PlanTask = {
  id: number;
  task_type: string;
  title: string;
  scheduled_date: string;
  osce_station_slug?: string | null;
  is_completed: boolean;
  is_skipped: boolean;
};

type ScheduleResponse = {
  server_today: string;
  tasks: PlanTask[];
};

type ExamSimulationStage = {
  key: string;
  status: string;
  details: Record<string, unknown>;
};

type ExamSimulation = {
  id: string;
  status: string;
  stages: ExamSimulationStage[];
};

type ClinicalCaseListItem = {
  slug: string;
};

type TestSessionApi = {
  id: string;
  simulation_id: string | null;
  attempt_context: string;
  questions: Array<{ id: number; text: string; answer_options: Array<{ label: string }> }>;
};

function buildStudentCredentials(): StudentCredentials {
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 10_000)}`;

  return {
    firstName: "Анна",
    lastName: "Смирнова",
    email: `e2e-student-${uniqueSuffix}@example.com`,
    password: "StrongPass123!",
  };
}

async function registerStudent(page: Page, credentials: StudentCredentials) {
  await page.goto("/auth");
  await page.getByRole("button", { name: "Начать подготовку" }).click();
  await expect(page.getByRole("tab", { name: "Регистрация" })).toHaveAttribute("aria-selected", "true");

  await page.getByLabel("Имя").fill(credentials.firstName);
  await page.getByLabel("Фамилия").fill(credentials.lastName);
  await page.getByLabel("Электронная почта").fill(credentials.email);
  await page.getByLabel("Пароль", { exact: true }).fill(credentials.password);
  await page.getByLabel("Повтор пароля", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Создать аккаунт" }).click();

  await expect(page).toHaveURL(/\/app\/onboarding$/);
}

function buildFutureIsoDate(daysAhead: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

async function completeOnboarding(page: Page, daysUntilAccreditation = 90) {
  await expect(page.getByRole("heading", { name: "Готовься к аккредитации умно" })).toHaveCSS("font-weight", "400");
  await expect(page.getByText("48", { exact: true })).toBeVisible();
  await expect(page.getByText("74%", { exact: true })).toBeVisible();
  await expect(page.getByText("45", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Начать настройку — 3 шага" }).click();

  const facultySelect = page.getByLabel("Факультет");

  await expect.poll(async () => await facultySelect.locator("option").count()).toBeGreaterThan(0);
  await facultySelect.selectOption({ index: 0 });
  await page.locator('input[type="date"]').fill(buildFutureIsoDate(daysUntilAccreditation));
  await page.getByRole("button", { name: "Далее" }).click();
  await page.getByRole("button", { name: "Далее" }).click();
  await page.getByRole("button", { name: "Сформировать план" }).click();
  await page.getByRole("button", { name: "Перейти в дашборд" }).click();

  await expect(page).toHaveURL(/\/app\/dashboard$/);
}

async function createAuthenticatedApi(page: Page) {
  return playwrightRequest.newContext({
    baseURL: BACKEND_BASE_URL,
    storageState: await page.context().storageState(),
  });
}

async function getSchedule(api: APIRequestContext): Promise<ScheduleResponse> {
  const response = await api.get(`${API_PREFIX}/schedule`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ScheduleResponse;
}

async function getProfile(api: APIRequestContext) {
  const response = await api.get(`${API_PREFIX}/auth/me`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { daily_study_minutes: number };
}

async function getSimulations(api: APIRequestContext): Promise<ExamSimulation[]> {
  const response = await api.get(`${API_PREFIX}/accreditation/simulations`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ExamSimulation[];
}

function stageByKey(simulation: ExamSimulation, key: string): ExamSimulationStage {
  const stage = simulation.stages.find((item) => item.key === key);
  expect(stage, `Simulation should include ${key} stage`).toBeTruthy();
  return stage!;
}

function detailStringList(stage: ExamSimulationStage, key: string): string[] {
  const value = stage.details[key];
  expect(Array.isArray(value), `${stage.key}.${key} should be an array`).toBeTruthy();
  return (value as unknown[]).filter((item): item is string => typeof item === "string");
}

test.describe("student smoke journeys", () => {
  test("student can create a backend-owned strict accreditation simulation", async ({ page }) => {
    const credentials = buildStudentCredentials();

    await registerStudent(page, credentials);
    await completeOnboarding(page);

    await page.goto("/app/accreditation");
    await expect(page.getByTestId("accreditation-page")).toBeVisible();
    await page.getByTestId("accreditation-create-simulation").click();
    await expect(page.getByTestId("accreditation-stage-cases-start")).toBeEnabled();

    const api = await createAuthenticatedApi(page);
    const simulationsResponse = await api.get(`${API_PREFIX}/accreditation/simulations`);
    expect(simulationsResponse.ok()).toBeTruthy();
    const simulations = (await simulationsResponse.json()) as ExamSimulation[];
    const activeSimulation = simulations.find((simulation) => simulation.status === "active") ?? simulations[0];
    expect(activeSimulation, "Created accreditation simulation should be visible through API").toBeTruthy();

    const caseStage = stageByKey(activeSimulation!, "cases");
    const osceStage = stageByKey(activeSimulation!, "osce");
    const assignedCaseSlugs = detailStringList(caseStage, "assigned_case_slugs");
    const assignedStationSlugs = detailStringList(osceStage, "assigned_station_slugs");

    expect(assignedCaseSlugs).toHaveLength(2);
    expect(assignedStationSlugs).toHaveLength(5);
    expect(JSON.stringify(caseStage.details)).not.toContain("correct_option_label");
    expect(JSON.stringify(osceStage.details)).not.toContain("correct_option_label");

    await page.getByTestId("accreditation-stage-cases-start").click();
    await expect(page).toHaveURL(/\/app\/accreditation\/cases/);
    const casesUrl = new URL(page.url());
    expect(casesUrl.searchParams.get("simulationId")).toBe(activeSimulation!.id);
    expect(casesUrl.searchParams.get("caseSlugs")?.split(",")).toEqual(assignedCaseSlugs);
    await expect(page.getByTestId("cases-passage")).toBeVisible();

    const casesResponse = await api.get(`${API_PREFIX}/cases`);
    expect(casesResponse.ok()).toBeTruthy();
    const cases = (await casesResponse.json()) as ClinicalCaseListItem[];
    const unassignedCase = cases.find((item) => !assignedCaseSlugs.includes(item.slug));
    expect(unassignedCase, "Fixture content should include a case outside the assigned strict simulation pair").toBeTruthy();

    const rejectedAttemptResponse = await api.post(`${API_PREFIX}/cases/${unassignedCase!.slug}/attempts`, {
      data: {
        mode: "exam",
        simulation_id: activeSimulation!.id,
      },
    });
    expect(rejectedAttemptResponse.status()).toBe(400);
    const rejectedAttemptBody = await rejectedAttemptResponse.json();
    expect(rejectedAttemptBody).toMatchObject({
      detail: expect.stringContaining("не входит в состав"),
    });

    await page.goto("/app/accreditation");
    await expect(page.getByTestId("accreditation-page")).toBeVisible();
    await page.getByTestId("accreditation-stage-osce-start").click();
    await expect(page).toHaveURL(/\/app\/accreditation\/osce/);
    const osceUrl = new URL(page.url());
    expect(osceUrl.searchParams.get("simulationId")).toBe(activeSimulation!.id);
    expect(osceUrl.searchParams.get("stationSlugs")?.split(",")).toEqual(assignedStationSlugs);
    await expect(page.getByTestId("osce-station-modal")).toBeVisible();

    await api.dispose();
  });

  test("student can complete a test session and logout safely", async ({ page }) => {
    const credentials = buildStudentCredentials();

    await registerStudent(page, credentials);
    await completeOnboarding(page);

    await page.reload();
    await expect(page).toHaveURL(/\/app\/dashboard$/);

    const api = await createAuthenticatedApi(page);
    const sessionResponse = await api.post(`${API_PREFIX}/tests/sessions`, {
      data: {
        question_count: 12,
        mode: "learning",
        topic_id: null,
      },
    });
    expect(sessionResponse.ok()).toBeTruthy();
    const session = (await sessionResponse.json()) as { id: string };

    await page.goto(`/app/tests/${session.id}`);

    await expect(page).toHaveURL(/\/app\/tests\/.+/);
    await expect(page.getByTestId("test-session-page")).toBeVisible();
    await expect(page.getByTestId("test-session-timer-label")).toContainText("Прошло времени");
    await expect(page.getByTestId("test-session-timer-value")).toHaveText(/00:0[0-2]/);

    await page.getByTestId("test-session-finish-early").click();
    await page.getByTestId("test-session-confirm-finish").click();

    await expect(page.getByTestId("test-session-result")).toBeVisible();

    await page.goto("/app/dashboard");
    await expect(page).toHaveURL(/\/app\/dashboard$/);
    await page.getByTestId("app-profile-menu-trigger").click();
    await page.getByTestId("app-logout").click();
    await expect(page).toHaveURL(/\/auth$/);

    await page.goto("/app/dashboard");
    await expect(page).toHaveURL(/\/auth$/);

    await api.dispose();
  });

  test("exam control test keeps educational copy and does not create protocol", async ({ page }) => {
    const credentials = buildStudentCredentials();

    await registerStudent(page, credentials);
    await completeOnboarding(page);

    const api = await createAuthenticatedApi(page);
    await expect.poll(async () => (await getSimulations(api)).length).toBe(0);

    const sessionResponse = await api.post(`${API_PREFIX}/tests/sessions`, {
      data: {
        question_count: 2,
        mode: "exam",
        topic_id: null,
      },
    });
    expect(sessionResponse.ok()).toBeTruthy();
    const session = (await sessionResponse.json()) as TestSessionApi;

    expect(session.attempt_context).toBe("control");
    expect(session.simulation_id).toBeNull();

    await page.goto(`/app/tests/${session.id}`);
    await expect(page.getByTestId("test-session-page")).toBeVisible();
    await expect(page.getByTestId("test-session-kicker")).toContainText("Контрольная сессия");
    await expect(page.getByTestId("test-session-title")).toContainText("Контроль без подсказок");
    await expect(page.getByTestId("test-session-subtitle")).toContainText("Учебный контроль без подсказок");
    await expect(page.getByTestId("test-session-mode-label")).toContainText("Контроль без подсказок");
    await expect(page.getByTestId("test-session-exam-feedback-subtitle")).toContainText("Учебный контроль");

    await page.getByTestId("test-session-finish-early").click();
    await page.getByTestId("test-session-confirm-finish").click();

    await expect(page.getByTestId("test-session-result")).toBeVisible();
    await expect(page.getByTestId("test-session-result-subtitle")).toContainText("Результат пока невысокий");
    await expect(page.getByTestId("test-session-result-verdict")).toContainText("Порог не достигнут");
    await page.getByRole("button", { name: "Посмотреть разбор" }).click();
    await expect(page.getByTestId("test-session-result-mode")).toContainText("Контроль без подсказок");
    await expect.poll(async () => (await getSimulations(api)).length).toBe(0);

    await api.dispose();
  });

  test("strict simulation test keeps accreditation copy", async ({ page }) => {
    const credentials = buildStudentCredentials();

    await registerStudent(page, credentials);
    await completeOnboarding(page);

    const api = await createAuthenticatedApi(page);
    const simulationResponse = await api.post(`${API_PREFIX}/accreditation/simulations`, {
      data: {},
    });
    expect(simulationResponse.ok()).toBeTruthy();
    const simulation = (await simulationResponse.json()) as ExamSimulation;

    const sessionResponse = await api.post(`${API_PREFIX}/tests/sessions`, {
      data: {
        topic_id: null,
        question_count: 80,
        mode: "exam",
        simulation_id: simulation.id,
      },
    });
    expect(sessionResponse.ok()).toBeTruthy();
    const session = (await sessionResponse.json()) as TestSessionApi;

    expect(session.attempt_context).toBe("strict_simulation");
    expect(session.simulation_id).toBe(simulation.id);

    await page.goto(`/app/tests/${session.id}`);
    await expect(page.getByTestId("test-session-page")).toBeVisible();
    await expect(page.getByTestId("test-session-kicker")).toContainText("Этап пробной аккредитации");
    await expect(page.getByTestId("test-session-title")).toContainText("Пробная аккредитация");
    await expect(page.getByTestId("test-session-subtitle")).toContainText("Строгий режим пробной аккредитации");
    await expect(page.getByTestId("test-session-mode-label")).toContainText("Пробная аккредитация");
    await expect(page.getByTestId("test-session-exam-feedback-subtitle")).toContainText("Пробная аккредитация");

    await page.getByTestId("test-session-finish-early").click();
    await page.getByTestId("test-session-confirm-finish").click();
    await expect(page.getByTestId("test-session-result")).toBeVisible();
    await page.getByRole("button", { name: "В аккредитацию" }).click();
    await expect(page).toHaveURL(/\/app\/accreditation/);
    const accreditationUrl = new URL(page.url());
    expect(accreditationUrl.searchParams.get("simulationId")).toBe(simulation.id);
    expect(accreditationUrl.searchParams.get("stage")).toBe("test_stage");

    await api.dispose();
  });

  test("exam test advances immediately after answering", async ({ page }) => {
    const credentials = buildStudentCredentials();

    await registerStudent(page, credentials);
    await completeOnboarding(page);

    const api = await createAuthenticatedApi(page);
    const sessionResponse = await api.post(`${API_PREFIX}/tests/sessions`, {
      data: {
        question_count: 2,
        mode: "exam",
        topic_id: null,
      },
    });
    expect(sessionResponse.ok()).toBeTruthy();
    const session = (await sessionResponse.json()) as {
      id: string;
      questions: Array<{ id: number; text: string; answer_options: Array<{ label: string }> }>;
    };

    expect(session.questions.length).toBeGreaterThanOrEqual(2);

    await page.goto(`/app/tests/${session.id}`);
    await expect(page.getByTestId("test-session-page")).toBeVisible();
    await expect(page.getByText("Вопрос 1", { exact: true })).toBeVisible();

    const firstQuestion = session.questions[0]!;
    const secondQuestion = session.questions[1]!;

    await page.getByTestId(`test-session-option-${firstQuestion.id}-${firstQuestion.answer_options[0]!.label}`).click();
    await expect(page.getByTestId("test-session-submit-answer")).toContainText("Ответить");
    await page.getByTestId("test-session-submit-answer").click();

    await expect(page.getByText("Вопрос 2", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Следующий вопрос" })).toHaveCount(0);

    await page.getByTestId(`test-session-option-${secondQuestion.id}-${secondQuestion.answer_options[0]!.label}`).click();
    await page.getByTestId("test-session-submit-answer").click();

    await expect(page.getByTestId("test-session-result")).toBeVisible();

    await page.getByRole("button", { name: "Посмотреть разбор" }).click();
    await page.getByTestId(`test-review-question-${firstQuestion.id}`).click();
    const reviewDialog = page.getByRole("dialog", { name: "Вопрос 1" });
    await expect(reviewDialog).toBeVisible();
    await expect(reviewDialog.getByText(firstQuestion.text)).toBeVisible();
    await expect(reviewDialog.getByText("Ответ пользователя")).toBeVisible();
    await expect(reviewDialog.getByText("Верный ответ")).toBeVisible();
    await expect(page.getByTestId("test-review-position")).toContainText("1 / 2");
    await expect(page.getByTestId("test-review-prev")).toBeDisabled();
    await page.getByTestId("test-review-next").click();
    const secondReviewDialog = page.getByRole("dialog", { name: "Вопрос 2" });
    await expect(secondReviewDialog).toBeVisible();
    await expect(secondReviewDialog.getByText(secondQuestion.text)).toBeVisible();
    await expect(page.getByTestId("test-review-position")).toContainText("2 / 2");
    await expect(page.getByTestId("test-review-next")).toBeDisabled();
    await page.getByTestId("test-review-prev").click();
    await expect(page.getByRole("dialog", { name: "Вопрос 1" })).toBeVisible();
    await page.getByLabel("Закрыть разбор вопроса").click();
    await expect(reviewDialog).toHaveCount(0);

    await api.dispose();
  });

  test("student can complete a planned osce task from schedule", async ({ page }) => {
    const credentials = buildStudentCredentials();

    await registerStudent(page, credentials);
    await completeOnboarding(page, 14);

    const api = await createAuthenticatedApi(page);
    const schedule = await getSchedule(api);
    const plannedOsceTask = schedule.tasks.find(
      (task) =>
        task.task_type === "osce" &&
        !task.is_completed &&
        !task.is_skipped &&
        task.scheduled_date <= schedule.server_today &&
        task.osce_station_slug,
    );

    expect(
      plannedOsceTask,
      "Planner should return at least one startable planned OSCE task close to accreditation",
    ).toBeTruthy();

    const stationResponse = await api.get(`${API_PREFIX}/osce/stations/${plannedOsceTask!.osce_station_slug}`);
    expect(stationResponse.ok()).toBeTruthy();

    const stationDetail = (await stationResponse.json()) as {
      checklist_items: Array<{ id: string }>;
      quiz_questions: Array<{ id: string; options: Array<{ label: string }> }>;
    };

    await page.goto("/app/schedule");
    await expect(page.getByTestId("schedule-page")).toBeVisible();
    await expect(page.getByTestId(`schedule-task-${plannedOsceTask!.id}`)).toBeVisible();

    await page.getByTestId(`schedule-task-start-${plannedOsceTask!.id}`).click();

    await expect(page).toHaveURL(new RegExp(`/app/osce/${plannedOsceTask!.osce_station_slug}`));
    await expect(
      page.locator('[data-testid="osce-station-page"], [data-testid="osce-station-modal"]'),
    ).toBeVisible();

    await page.getByTestId("osce-start-checklist").click();
    await expect(page.getByTestId("osce-station-page")).toBeVisible();

    for (const checklistItem of stationDetail.checklist_items.slice(0, Math.min(2, stationDetail.checklist_items.length))) {
      await page.getByTestId(`osce-checklist-${checklistItem.id}`).click();
    }

    await page.getByTestId("osce-open-quiz").click();

    for (const question of stationDetail.quiz_questions) {
      expect(question.options[0], `OSCE question ${question.id} should have at least one answer option`).toBeTruthy();
      await page.getByTestId(`osce-quiz-${question.id}-${question.options[0]!.label}`).click();
    }

    await page.getByTestId("osce-submit-attempt").click();
    await expect(page.getByTestId("osce-success-modal")).toBeVisible();

    await page.getByTestId("osce-open-results").click();
    await expect(page.getByTestId("osce-results")).toBeVisible();

    await expect
      .poll(async () => {
        const nextSchedule = await getSchedule(api);
        return nextSchedule.tasks.find((task) => task.id === plannedOsceTask!.id)?.is_completed ?? false;
      })
      .toBe(true);

    await page.goto("/app/schedule");
    await expect(page.getByTestId(`schedule-task-${plannedOsceTask!.id}`)).toBeDisabled();

    await api.dispose();
  });

  test("student can complete a clinical case in browser and reach the ai review", async ({ page }) => {
    const credentials = buildStudentCredentials();

    await registerStudent(page, credentials);
    await completeOnboarding(page);

    await page.goto("/app/cases");
    await expect(page.getByTestId("cases-page")).toBeVisible();
    await page.locator('[data-testid^="case-item-"]').first().click();
    await page.getByTestId("cases-open-start-modal").click();
    await expect(page.getByTestId("cases-start-modal")).toBeVisible();
    await page.getByTestId("cases-confirm-start").click();
    await expect(page.getByTestId("cases-passage")).toBeVisible();
    await expect(page.getByTestId("cases-passage-timer-value")).toHaveText(/00:0[0-2]/);

    const aiResult = page.getByTestId("cases-ai-result");

    for (let step = 0; step < 24; step += 1) {
      if (await aiResult.isVisible()) {
        break;
      }

      const option = page.locator('[data-testid^="cases-option-"]:visible').first();
      if ((await option.count()) > 0) {
        await option.click();
      }

      await page.getByTestId("cases-next-step").click();
    }

    await expect(aiResult).toBeVisible();
    await aiResult.getByRole("button", { name: "Посмотреть разбор" }).click();
    await expect(page.getByTestId("cases-review-page")).toBeVisible();
    await expect(aiResult).toBeHidden();
    await page.getByRole("button", { name: "К результату" }).click();
    await expect(aiResult).toBeVisible();
  });

  test("student can update schedule preferences and keep the session after reload", async ({ page }) => {
    const credentials = buildStudentCredentials();

    await registerStudent(page, credentials);
    await completeOnboarding(page);

    await page.goto("/app/schedule");
    await expect(page.getByTestId("schedule-page")).toBeVisible();

    await page.getByTestId("schedule-open-preferences").click();
    const dailyMinutesSelect = page.getByLabel("Сколько времени в день").first();
    const currentValue = await dailyMinutesSelect.inputValue();
    const availableValues = await dailyMinutesSelect.locator("option").evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    );
    const nextValue = availableValues.find((value) => value !== currentValue);

    expect(nextValue, "Schedule preferences should have at least two selectable daily minute options").toBeTruthy();

    await dailyMinutesSelect.selectOption(nextValue!);
    await page.getByTestId("schedule-save-preferences").click();
    await expect(page.getByText("Настройки обновлены", { exact: false })).toBeVisible();

    const api = await createAuthenticatedApi(page);
    await expect.poll(async () => (await getProfile(api)).daily_study_minutes).toBe(Number(nextValue));

    await page.reload();
    await expect(page).toHaveURL(/\/app\/schedule$/);
    await page.getByTestId("schedule-open-preferences").click();
    await expect(dailyMinutesSelect).toHaveValue(nextValue!);

    await api.dispose();
  });

  test("student can update account settings and login with a new password", async ({ page }) => {
    const credentials = buildStudentCredentials();
    const nextPassword = "StrongerPass456!";

    await registerStudent(page, credentials);
    await completeOnboarding(page);

    await page.getByTestId("app-profile-menu-trigger").click();
    await page.getByTestId("app-profile-settings").click();

    await expect(page).toHaveURL(/\/app\/settings$/);
    await expect(page.getByTestId("settings-page")).toBeVisible();

    await page.getByLabel("Имя").fill("Елена");
    await page.getByTestId("settings-save-profile").click();
    await expect(page.getByText("Данные аккаунта обновлены.", { exact: false })).toBeVisible();

    await page.getByLabel("Текущий пароль", { exact: true }).fill(credentials.password);
    await page.getByLabel("Новый пароль", { exact: true }).fill(nextPassword);
    await page.getByLabel("Повтори новый пароль", { exact: true }).fill(nextPassword);
    await page.getByTestId("settings-change-password").click();
    await expect(page.getByText("Пароль обновлён.", { exact: false })).toBeVisible();

    await page.getByTestId("app-profile-menu-trigger").click();
    await page.getByTestId("app-logout").click();
    await expect(page).toHaveURL(/\/auth$/);

    await page.getByRole("button", { name: "MedAcc" }).click();
    await expect(page.getByRole("tab", { name: "Вход" })).toHaveAttribute("aria-selected", "true");
    await page.getByLabel("Электронная почта").fill(credentials.email);
    await page.getByLabel("Пароль", { exact: true }).fill(nextPassword);
    await page.getByRole("button", { name: "Войти" }).click();

    await expect(page).toHaveURL(/\/app\/dashboard$/);
  });

  test("student password checklist updates while editing account settings", async ({ page }) => {
    const credentials = buildStudentCredentials();
    const shortPassword = "short";
    const validPassword = "LongEnough1";

    await registerStudent(page, credentials);
    await completeOnboarding(page);

    await page.goto("/app/settings");
    await expect(page.getByTestId("settings-page")).toBeVisible();

    const lengthRule = page.getByTestId("settings-password-length-rule");
    const matchRule = page.getByTestId("settings-password-match-rule");
    const changePasswordButton = page.getByTestId("settings-change-password");

    await expect(changePasswordButton).toBeDisabled();

    await page.getByLabel("Новый пароль", { exact: true }).fill(shortPassword);
    await expect(lengthRule).toHaveCSS("color", "rgb(185, 28, 58)");
    await expect(matchRule).toHaveCSS("color", "rgb(185, 28, 58)");
    await expect(changePasswordButton).toBeDisabled();

    await page.getByLabel("Повтори новый пароль", { exact: true }).fill(shortPassword);
    await expect(lengthRule).toHaveCSS("color", "rgb(185, 28, 58)");
    await expect(matchRule).toHaveCSS("color", "rgb(26, 92, 62)");
    await expect(changePasswordButton).toBeDisabled();

    await page.getByLabel("Новый пароль", { exact: true }).fill(validPassword);
    await expect(lengthRule).toHaveCSS("color", "rgb(26, 92, 62)");
    await expect(matchRule).toHaveCSS("color", "rgb(185, 28, 58)");
    await expect(changePasswordButton).toBeDisabled();

    await page.getByLabel("Повтори новый пароль", { exact: true }).fill(validPassword);
    await expect(lengthRule).toHaveCSS("color", "rgb(26, 92, 62)");
    await expect(matchRule).toHaveCSS("color", "rgb(26, 92, 62)");
    await expect(changePasswordButton).toBeDisabled();

    await page.getByLabel("Текущий пароль", { exact: true }).fill(credentials.password);
    await expect(changePasswordButton).toBeEnabled();
  });

  test("dashboard blocks future planned tasks until their scheduled date", async ({ page }) => {
    const credentials = buildStudentCredentials();

    await registerStudent(page, credentials);
    await completeOnboarding(page);

    const api = await createAuthenticatedApi(page);
    const schedule = await getSchedule(api);
    const futureTask = schedule.tasks.find(
      (task) =>
        !task.is_completed &&
        !task.is_skipped &&
        task.scheduled_date > schedule.server_today,
    );

    test.skip(!futureTask, "Planner should expose at least one future task in the current schedule window");

    await page.goto("/app/dashboard");
    await expect(page.getByTestId(`dashboard-upcoming-start-${futureTask!.id}`)).toBeDisabled();

    await api.dispose();
  });
});

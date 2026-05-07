import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, request as playwrightRequest, test, type APIRequestContext, type Page } from "@playwright/test";

const BACKEND_BASE_URL = "http://127.0.0.1:8000";
const API_PREFIX = "/api/v1";
const BACKEND_ROOT = fileURLToPath(new URL("../../backend/", import.meta.url));
const BACKEND_PYTHON = path.join(BACKEND_ROOT, ".venv", "Scripts", "python.exe");
const CREATE_ADMIN_SCRIPT = path.join(BACKEND_ROOT, "scripts", "create_admin.py");
const RESET_ADMIN_PASSWORD_SCRIPT = path.join(BACKEND_ROOT, "scripts", "reset_admin_password.py");
const BACKEND_ENV_PATH = path.join(BACKEND_ROOT, ".env");
const OPTION_LABELS = ["A", "B", "C", "D", "E"] as const;
const DEFAULT_ADMIN_PASSWORD = "StrongPass123!";
const CASE_QUIZ_QUESTION_COUNT = 12;

type AdminCredentials = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

type AdminQuestionListItem = {
  id: number;
  text: string;
  is_active: boolean;
};

type AdminQuestionListResponse = {
  items: AdminQuestionListItem[];
};

type AdminQuestionDetails = {
  id: number;
  text: string;
  is_active: boolean;
};

type AdminCaseListItem = {
  slug: string;
  title: string;
};

type AdminCaseDetails = {
  slug: string;
  title: string;
  summary: string;
};

type AdminOsceStationListItem = {
  slug: string;
  title: string;
};

type AdminOsceStationDetails = {
  slug: string;
  title: string;
  summary: string;
};

function readBackendEnv() {
  if (!fs.existsSync(BACKEND_ENV_PATH)) {
    return {
      adminAllowedEmails: [] as string[],
      testAdminEmail: "",
    };
  }

  const content = fs.readFileSync(BACKEND_ENV_PATH, "utf8");
  const values = new Map<string, string>();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    values.set(line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim());
  }

  return {
    adminAllowedEmails: (values.get("ADMIN_ALLOWED_EMAILS") ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
    testAdminEmail: (values.get("MEDACC_TEST_ADMIN_EMAIL") ?? "").trim().toLowerCase(),
  };
}

const backendEnv = readBackendEnv();
const configuredAdminEmail =
  process.env.MEDACC_TEST_ADMIN_EMAIL?.trim().toLowerCase() ||
  backendEnv.testAdminEmail ||
  backendEnv.adminAllowedEmails[0] ||
  "";

function buildAdminCredentials(): AdminCredentials {
  if (configuredAdminEmail) {
    return {
      firstName: "Админ",
      lastName: "Проверка",
      email: configuredAdminEmail,
      password: DEFAULT_ADMIN_PASSWORD,
    };
  }

  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 10_000)}`;

  return {
    firstName: "Админ",
    lastName: "Проверка",
    email: `e2e-admin-${uniqueSuffix}@example.com`,
    password: DEFAULT_ADMIN_PASSWORD,
  };
}

function createAdminAccount(credentials: AdminCredentials) {
  execFileSync(
    BACKEND_PYTHON,
    [
      CREATE_ADMIN_SCRIPT,
      "--email",
      credentials.email,
      "--password",
      credentials.password,
      "--first-name",
      credentials.firstName,
      "--last-name",
      credentials.lastName,
    ],
    {
      cwd: BACKEND_ROOT,
      stdio: "pipe",
    },
  );
}

function resetAdminPassword(credentials: AdminCredentials) {
  execFileSync(BACKEND_PYTHON, [RESET_ADMIN_PASSWORD_SCRIPT, "--email", credentials.email, "--password", credentials.password], {
    cwd: BACKEND_ROOT,
    stdio: "pipe",
  });
}

function ensureAdminAccount(credentials: AdminCredentials) {
  if (configuredAdminEmail && credentials.email === configuredAdminEmail) {
    resetAdminPassword(credentials);
    return;
  }

  try {
    resetAdminPassword(credentials);
  } catch {
    createAdminAccount(credentials);
  }
}

async function loginUser(page: Page, credentials: AdminCredentials) {
  await page.goto("/auth");
  await page.getByRole("button", { name: "MedAcc" }).click();
  await expect(page.getByRole("tab", { name: "Вход" })).toHaveAttribute("aria-selected", "true");
  await page.getByLabel("Электронная почта").fill(credentials.email);
  await page.getByLabel("Пароль", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/staff\/(coverage|questions)$/);
  await page.goto("/staff/questions");
  await expect(page.getByTestId("admin-questions-page")).toBeVisible();
}

async function createAuthenticatedApi(page: Page) {
  return playwrightRequest.newContext({
    baseURL: BACKEND_BASE_URL,
    storageState: await page.context().storageState(),
  });
}

async function getAdminQuestions(api: APIRequestContext): Promise<AdminQuestionListResponse> {
  const response = await api.get(`${API_PREFIX}/admin/questions?limit=100`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as AdminQuestionListResponse;
}

async function getAdminQuestion(api: APIRequestContext, questionId: number): Promise<AdminQuestionDetails> {
  const response = await api.get(`${API_PREFIX}/admin/questions/${questionId}`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as AdminQuestionDetails;
}

async function getAdminCases(api: APIRequestContext): Promise<AdminCaseListItem[]> {
  const response = await api.get(`${API_PREFIX}/admin/cases`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as AdminCaseListItem[];
}

async function getAdminCase(api: APIRequestContext, slug: string): Promise<AdminCaseDetails> {
  const response = await api.get(`${API_PREFIX}/admin/cases/${slug}`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as AdminCaseDetails;
}

async function getAdminOsceStations(api: APIRequestContext): Promise<AdminOsceStationListItem[]> {
  const response = await api.get(`${API_PREFIX}/admin/osce`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as AdminOsceStationListItem[];
}

async function getAdminOsceStation(api: APIRequestContext, slug: string): Promise<AdminOsceStationDetails> {
  const response = await api.get(`${API_PREFIX}/admin/osce/${slug}`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as AdminOsceStationDetails;
}

async function selectFirstFacultyAndTopic(page: Page, facultyTestId: string, topicTestId: string) {
  const facultySelect = page.getByTestId(facultyTestId);
  await expect.poll(async () => await facultySelect.locator("option").count()).toBeGreaterThan(1);
  await facultySelect.selectOption({ index: 1 });

  const topicSelect = page.getByTestId(topicTestId);
  await expect.poll(async () => await topicSelect.locator("option").count()).toBeGreaterThan(1);
  await topicSelect.selectOption({ index: 1 });
}

async function acceptNextDialog(page: Page) {
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
}

async function dismissNextDialog(page: Page) {
  page.once("dialog", async (dialog) => {
    await dialog.dismiss();
  });
}

async function fillQuestionOptions(page: Page, seed: string) {
  for (const optionLabel of OPTION_LABELS) {
    await page.getByTestId(`admin-question-option-${optionLabel}-text`).fill(`Вариант ${optionLabel} для ${seed}`);
  }
}

async function fillMinimumCaseQuiz(page: Page, seed: string) {
  for (let questionIndex = 0; questionIndex < CASE_QUIZ_QUESTION_COUNT; questionIndex += 1) {
    await page.getByTestId(`admin-case-question-${questionIndex}-id`).fill(`case-step-${questionIndex + 1}`);
    await page
      .getByTestId(`admin-case-question-${questionIndex}-prompt`)
      .fill(`Какой шаг ${questionIndex + 1} в клиническом кейсе «${seed}»?`);
    await page
      .getByTestId(`admin-case-question-${questionIndex}-option-0-text`)
      .fill(`Корректное действие ${questionIndex + 1}`);
    await page
      .getByTestId(`admin-case-question-${questionIndex}-option-1-text`)
      .fill(`Некорректное действие ${questionIndex + 1}.1`);
    await page
      .getByTestId(`admin-case-question-${questionIndex}-option-2-text`)
      .fill(`Некорректное действие ${questionIndex + 1}.2`);
    await page
      .getByTestId(`admin-case-question-${questionIndex}-option-3-text`)
      .fill(`Некорректное действие ${questionIndex + 1}.3`);
    await page
      .getByTestId(`admin-case-question-${questionIndex}-explanation`)
      .fill(`Шаг ${questionIndex + 1} нужно выполнять после оценки симптомов и клинической ситуации.`);
  }
}

async function deleteAdminCase(api: APIRequestContext, slug: string) {
  const response = await api.delete(`${API_PREFIX}/admin/cases/${slug}`);
  expect(response.ok()).toBeTruthy();
}

async function deleteAdminOsceStation(api: APIRequestContext, slug: string) {
  const response = await api.delete(`${API_PREFIX}/admin/osce/${slug}`);
  expect(response.ok()).toBeTruthy();
}

async function deleteAdminQuestion(api: APIRequestContext, questionId: number) {
  const response = await api.delete(`${API_PREFIX}/admin/questions/${questionId}`);
  expect(response.ok()).toBeTruthy();
}

async function fillMinimumOsceStation(page: Page, slug: string, title: string, summary: string) {
  await page.getByTestId("admin-osce-slug").fill(slug);
  await page.getByTestId("admin-osce-title").fill(title);
  await page.getByTestId("admin-osce-summary").fill(summary);
  await page.getByTestId("admin-osce-checklist-0-id").fill("prepare-scene");
  await page.getByTestId("admin-osce-checklist-0-title").fill("Подготовить место");
  await page.getByTestId("admin-osce-checklist-0-description").fill("Проверить сцену и подготовить материалы");
  await page.getByTestId("admin-osce-question-0-id").fill("first-step");
  await page.getByTestId("admin-osce-question-0-prompt").fill(`Какой первый шаг в станции «${title}»?`);
  await page.getByTestId("admin-osce-question-0-option-0-text").fill("Оценить ситуацию");
  await page.getByTestId("admin-osce-question-0-option-1-text").fill("Сразу завершить станцию");
  await page.getByTestId("admin-osce-question-0-option-2-text").fill("Собирать анамнез без оценки обстановки");
  await page.getByTestId("admin-osce-question-0-option-3-text").fill("Пропустить подготовку и ждать");
  await page
    .getByTestId("admin-osce-question-0-explanation")
    .fill("Первый шаг - оценить ситуацию и подготовить рабочее место.");
}

test.describe("admin smoke journeys", () => {
  test("admin can create, edit, hide, restore, and delete a question", async ({ page }) => {
    const credentials = buildAdminCredentials();
    const createdText = `Проверочный вопрос автотеста ${Date.now()}`;
    const updatedText = `${createdText} обновлен`;

    ensureAdminAccount(credentials);
    await loginUser(page, credentials);
    await expect(page.getByTestId("admin-questions-page")).toBeVisible();

    await page.getByTestId("admin-question-create").click();
    await expect(page.getByTestId("admin-question-editor")).toBeVisible();

    await selectFirstFacultyAndTopic(page, "admin-question-faculty", "admin-question-topic");
    await page.getByTestId("admin-question-text").fill(createdText);
    await fillQuestionOptions(page, createdText);

    await page.getByTestId("admin-question-save").click();
    await expect(page.getByTestId("admin-question-notice")).toBeVisible();

    const api = await createAuthenticatedApi(page);

    await expect
      .poll(async () => {
        const questions = await getAdminQuestions(api);
        return questions.items.some((item) => item.text === createdText);
      })
      .toBe(true);

    const createdQuestionId = (await getAdminQuestions(api)).items.find((item) => item.text === createdText)?.id;
    expect(createdQuestionId).toBeTruthy();

    await page.getByTestId("admin-question-text").fill(updatedText);
    await page.getByTestId("admin-question-save").click();
    await expect(page.getByTestId("admin-question-notice")).toBeVisible();

    await expect
      .poll(async () => (await getAdminQuestion(api, createdQuestionId!)).text)
      .toBe(updatedText);

    await expect(page.getByTestId(`admin-question-card-${createdQuestionId!}`)).toContainText(updatedText);

    await page.getByTestId("admin-question-deactivate").click();
    await expect(page.getByTestId("admin-question-notice")).toBeVisible();

    await expect
      .poll(async () => (await getAdminQuestion(api, createdQuestionId!)).is_active)
      .toBe(false);

    await page.getByTestId("admin-question-deactivate").click();
    await expect(page.getByTestId("admin-question-notice")).toBeVisible();

    await expect
      .poll(async () => (await getAdminQuestion(api, createdQuestionId!)).is_active)
      .toBe(true);

    await acceptNextDialog(page);
    await page.getByTestId("admin-question-delete").click();
    await expect(page.getByTestId("admin-question-notice")).toBeVisible();

    await expect
      .poll(async () => {
        const questions = await getAdminQuestions(api);
        return questions.items.some((item) => item.id === createdQuestionId);
      })
      .toBe(false);

    await api.dispose();

    await page.getByTestId("staff-logout").click();
    await expect(page).toHaveURL(/\/auth$/);
  });

  test("admin can create, edit, and delete a clinical case", async ({ page }) => {
    const credentials = buildAdminCredentials();
    const slug = `e2e-clinical-case-${Date.now()}`;
    const createdTitle = `Проверочный клинический кейс ${Date.now()}`;
    const updatedTitle = `${createdTitle} обновлен`;
    const createdSummary = `Краткое описание для ${createdTitle}`;
    const updatedSummary = `Обновленное описание для ${updatedTitle}`;

    ensureAdminAccount(credentials);
    await loginUser(page, credentials);

    await page.goto("/staff/cases");
    await expect(page.getByTestId("admin-cases-page")).toBeVisible();

    await page.getByTestId("admin-case-create").click();
    await expect(page.getByTestId("admin-case-editor")).toBeVisible();

    await selectFirstFacultyAndTopic(page, "admin-case-faculty", "admin-case-topic");
    await page.getByTestId("admin-case-slug").fill(slug);
    await page.getByTestId("admin-case-title").fill(createdTitle);
    await page.getByTestId("admin-case-summary").fill(createdSummary);
    await page.getByTestId("admin-case-patient-summary").fill(`Клиническая вводная для ${createdTitle}`);

    await fillMinimumCaseQuiz(page, createdTitle);
    await page.getByTestId("admin-case-save").click();
    await expect(page.getByTestId("admin-case-notice")).toBeVisible();

    const api = await createAuthenticatedApi(page);

    await expect
      .poll(async () => {
        const cases = await getAdminCases(api);
        return cases.some((item) => item.slug === slug && item.title === createdTitle);
      })
      .toBe(true);

    await page.getByTestId("admin-case-title").fill(updatedTitle);
    await page.getByTestId("admin-case-summary").fill(updatedSummary);
    await page.getByTestId("admin-case-save").click();
    await expect(page.getByTestId("admin-case-notice")).toBeVisible();

    await expect
      .poll(async () => {
        const clinicalCase = await getAdminCase(api, slug);
        return JSON.stringify({ title: clinicalCase.title, summary: clinicalCase.summary });
      })
      .toBe(JSON.stringify({ title: updatedTitle, summary: updatedSummary }));

    await expect(page.getByTestId(`admin-case-card-${slug}`)).toContainText(updatedTitle);

    await acceptNextDialog(page);
    await page.getByTestId("admin-case-delete").click();
    await expect(page.getByTestId("admin-case-notice")).toBeVisible();

    await expect
      .poll(async () => {
        const cases = await getAdminCases(api);
        return cases.some((item) => item.slug === slug);
      })
      .toBe(false);

    await expect(page.getByTestId(`admin-case-card-${slug}`)).toHaveCount(0);

    await api.dispose();

    await page.getByTestId("staff-logout").click();
    await expect(page).toHaveURL(/\/auth$/);
  });

  test("admin can create, edit, and delete an osce station", async ({ page }) => {
    const credentials = buildAdminCredentials();
    const slug = `e2e-osce-station-${Date.now()}`;
    const createdTitle = `Проверочная станция ОСКЭ ${Date.now()}`;
    const updatedTitle = `${createdTitle} обновлена`;
    const createdSummary = `Краткое описание станции ${createdTitle}`;
    const updatedSummary = `Обновленное описание станции ${updatedTitle}`;

    ensureAdminAccount(credentials);
    await loginUser(page, credentials);

    await page.goto("/staff/osce");
    await expect(page.getByTestId("admin-osce-page")).toBeVisible();

    await page.getByTestId("admin-osce-create").click();
    const editor = page.getByTestId("admin-osce-editor");
    await expect(editor).toBeVisible();

    await selectFirstFacultyAndTopic(page, "admin-osce-faculty", "admin-osce-topic");
    await fillMinimumOsceStation(page, slug, createdTitle, createdSummary);

    await page.getByTestId("admin-osce-save").click();
    await expect(page.getByTestId("admin-osce-notice")).toBeVisible();

    const api = await createAuthenticatedApi(page);

    await expect
      .poll(async () => {
        const stations = await getAdminOsceStations(api);
        return stations.some((item) => item.slug === slug && item.title === createdTitle);
      })
      .toBe(true);

    await page.getByTestId("admin-osce-title").fill(updatedTitle);
    await page.getByTestId("admin-osce-summary").fill(updatedSummary);
    await page.getByTestId("admin-osce-save").click();
    await expect(page.getByTestId("admin-osce-notice")).toBeVisible();

    await expect
      .poll(async () => {
        const station = await getAdminOsceStation(api, slug);
        return JSON.stringify({ title: station.title, summary: station.summary });
      })
      .toBe(JSON.stringify({ title: updatedTitle, summary: updatedSummary }));

    await expect(page.getByTestId(`admin-osce-card-${slug}`)).toContainText(updatedTitle);

    await acceptNextDialog(page);
    await page.getByTestId("admin-osce-delete").click();
    await expect(page.getByTestId("admin-osce-notice")).toBeVisible();

    await expect
      .poll(async () => {
        const stations = await getAdminOsceStations(api);
        return stations.some((item) => item.slug === slug);
      })
      .toBe(false);

    await expect(page.getByTestId(`admin-osce-card-${slug}`)).toHaveCount(0);

    await api.dispose();

    await page.getByTestId("staff-logout").click();
    await expect(page).toHaveURL(/\/auth$/);
  });

  test("admin question editor shows duplicate question conflicts clearly", async ({ page }) => {
    const credentials = buildAdminCredentials();
    const questionText = `Проверка дубля вопроса автотеста ${Date.now()}`;

    ensureAdminAccount(credentials);
    await loginUser(page, credentials);
    await expect(page.getByTestId("admin-questions-page")).toBeVisible();

    await page.getByTestId("admin-question-create").click();
    await expect(page.getByTestId("admin-question-editor")).toBeVisible();
    await selectFirstFacultyAndTopic(page, "admin-question-faculty", "admin-question-topic");
    await page.getByTestId("admin-question-text").fill(questionText);
    await fillQuestionOptions(page, questionText);
    await page.getByTestId("admin-question-save").click();
    await expect(page.getByTestId("admin-question-notice")).toBeVisible();

    const api = await createAuthenticatedApi(page);
    await expect
      .poll(async () => {
        const questions = await getAdminQuestions(api);
        return questions.items.find((item) => item.text === questionText)?.id ?? null;
      })
      .not.toBeNull();
    const createdQuestionId = (await getAdminQuestions(api)).items.find((item) => item.text === questionText)?.id;
    expect(createdQuestionId).toBeTruthy();

    await page.getByTestId("admin-question-create").click();
    await selectFirstFacultyAndTopic(page, "admin-question-faculty", "admin-question-topic");
    await page.getByTestId("admin-question-text").fill(questionText);
    await fillQuestionOptions(page, `${questionText} дубликат`);
    await page.getByTestId("admin-question-save").click();
    await expect(page.getByTestId("admin-question-error")).toContainText("В этой теме уже есть вопрос с таким текстом");

    await expect
      .poll(async () => {
        const questions = await getAdminQuestions(api);
        return questions.items.filter((item) => item.text === questionText).length;
      })
      .toBe(1);

    await deleteAdminQuestion(api, createdQuestionId!);
    await api.dispose();

    await page.getByTestId("staff-logout").click();
    await expect(page).toHaveURL(/\/auth$/);
  });

  test("admin case editor validates slug, keeps the record after cancel delete, and blocks duplicate slug", async ({ page }) => {
    const credentials = buildAdminCredentials();
    const slug = `e2e-case-negative-${Date.now()}`;
    const createdTitle = `Проверочный кейс для валидации ${Date.now()}`;

    ensureAdminAccount(credentials);
    await loginUser(page, credentials);

    await page.goto("/staff/cases");
    await expect(page.getByTestId("admin-cases-page")).toBeVisible();

    await page.getByTestId("admin-case-create").click();
    await expect(page.getByTestId("admin-case-editor")).toBeVisible();
    await selectFirstFacultyAndTopic(page, "admin-case-faculty", "admin-case-topic");
    await page.getByTestId("admin-case-slug").fill("Invalid Slug");
    await page.getByTestId("admin-case-title").fill(createdTitle);
    await page.getByTestId("admin-case-summary").fill(`Краткое описание для ${createdTitle}`);
    await page.getByTestId("admin-case-patient-summary").fill(`Клиническая вводная для ${createdTitle}`);
    await page.getByTestId("admin-case-save").click();
    await expect(page.getByTestId("admin-case-error")).toContainText(
      "Код кейса должен содержать только строчные латинские буквы, цифры и дефис",
    );

    await page.getByTestId("admin-case-slug").fill(slug);
    await fillMinimumCaseQuiz(page, createdTitle);
    await page.getByTestId("admin-case-save").click();
    await expect(page.getByTestId("admin-case-notice")).toBeVisible();

    const api = await createAuthenticatedApi(page);
    await expect
      .poll(async () => {
        const cases = await getAdminCases(api);
        return cases.some((item) => item.slug === slug);
      })
      .toBe(true);

    await dismissNextDialog(page);
    await page.getByTestId("admin-case-delete").click();
    await expect
      .poll(async () => {
        const cases = await getAdminCases(api);
        return cases.some((item) => item.slug === slug);
      })
      .toBe(true);

    await page.getByTestId("admin-case-create").click();
    await selectFirstFacultyAndTopic(page, "admin-case-faculty", "admin-case-topic");
    await page.getByTestId("admin-case-slug").fill(slug);
    await page.getByTestId("admin-case-title").fill(`${createdTitle} дубликат`);
    await page.getByTestId("admin-case-summary").fill(`Duplicate summary for ${createdTitle}`);
    await page.getByTestId("admin-case-patient-summary").fill(`Duplicate patient scenario for ${createdTitle}`);
    await page.getByTestId("admin-case-save").click();
    await expect(page.getByTestId("admin-case-error")).toContainText("Кейс с таким кодом уже существует");

    await deleteAdminCase(api, slug);
    await api.dispose();

    await page.getByTestId("staff-logout").click();
    await expect(page).toHaveURL(/\/auth$/);
  });

  test("admin osce editor validates slug, keeps the record after cancel delete, and blocks duplicate slug", async ({
    page,
  }) => {
    const credentials = buildAdminCredentials();
    const slug = `e2e-osce-negative-${Date.now()}`;
    const createdTitle = `Проверочная станция ОСКЭ для валидации ${Date.now()}`;
    const createdSummary = `Краткое описание станции ${createdTitle}`;

    ensureAdminAccount(credentials);
    await loginUser(page, credentials);

    await page.goto("/staff/osce");
    await expect(page.getByTestId("admin-osce-page")).toBeVisible();

    await page.getByTestId("admin-osce-create").click();
    await expect(page.getByTestId("admin-osce-editor")).toBeVisible();
    await selectFirstFacultyAndTopic(page, "admin-osce-faculty", "admin-osce-topic");
    await page.getByTestId("admin-osce-slug").fill("Invalid Slug");
    await page.getByTestId("admin-osce-save").click();
    await expect(page.getByTestId("admin-osce-error")).toContainText(
      "Код станции должен содержать только строчные латинские буквы, цифры и дефис",
    );

    await fillMinimumOsceStation(page, slug, createdTitle, createdSummary);
    await page.getByTestId("admin-osce-save").click();
    await expect(page.getByTestId("admin-osce-notice")).toBeVisible();

    const api = await createAuthenticatedApi(page);
    await expect
      .poll(async () => {
        const stations = await getAdminOsceStations(api);
        return stations.some((item) => item.slug === slug);
      })
      .toBe(true);

    await dismissNextDialog(page);
    await page.getByTestId("admin-osce-delete").click();
    await expect
      .poll(async () => {
        const stations = await getAdminOsceStations(api);
        return stations.some((item) => item.slug === slug);
      })
      .toBe(true);

    await page.getByTestId("admin-osce-create").click();
    await selectFirstFacultyAndTopic(page, "admin-osce-faculty", "admin-osce-topic");
    await page.getByTestId("admin-osce-slug").fill(slug);
    await page.getByTestId("admin-osce-save").click();
    await expect(page.getByTestId("admin-osce-error")).toContainText("Станция с таким кодом уже существует");

    await deleteAdminOsceStation(api, slug);
    await api.dispose();

    await page.getByTestId("staff-logout").click();
    await expect(page).toHaveURL(/\/auth$/);
  });
});

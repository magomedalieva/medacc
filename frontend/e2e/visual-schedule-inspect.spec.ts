import fs from "node:fs";
import { pathToFileURL } from "node:url";

import { expect, test, type Page } from "@playwright/test";

const DOCS_REFERENCE_PATH = "C:/MedAcc/docs/index.html";

function buildStudentEmail() {
  return `visual-schedule-${Date.now()}-${Math.round(Math.random() * 10_000)}@example.com`;
}

function buildFutureIsoDate(daysAhead: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

async function registerAndOpenSchedule(page: Page) {
  const email = buildStudentEmail();
  const password = "StrongPass123!";

  await page.goto("/auth");
  await page.getByRole("button", { name: "Начать подготовку" }).click();
  await expect(page.getByRole("tab", { name: "Регистрация" })).toHaveAttribute("aria-selected", "true");
  await page.getByLabel("Имя").fill("Визуал");
  await page.getByLabel("Фамилия").fill("Проверка");
  await page.getByLabel("Электронная почта").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByLabel("Повтор пароля", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Создать аккаунт" }).click();

  await expect(page).toHaveURL(/\/app\/onboarding$/);

  await page.getByRole("button", { name: "Начать настройку — 3 шага" }).click();
  const facultySelect = page.getByLabel("Факультет");
  await expect.poll(async () => await facultySelect.locator("option").count()).toBeGreaterThan(0);
  await facultySelect.selectOption({ index: 0 });
  await page.locator('input[type="date"]').fill(buildFutureIsoDate(5));
  await page.getByRole("button", { name: "Далее" }).click();
  await page.getByRole("button", { name: "Далее" }).click();
  await page.getByRole("button", { name: /Сформировать( мой)? план/ }).click();
  await page.getByRole("button", { name: "Перейти в дашборд" }).click();

  await expect(page).toHaveURL(/\/app\/dashboard$/);
  await page.goto("/app/schedule");
  await expect(page.getByTestId("schedule-page")).toBeVisible();
  await expect(page.locator('[data-testid^="schedule-task-"]').first()).toBeVisible();
  await page.waitForTimeout(400);
}

test("visual inspect schedule page against docs mock", async ({ page }) => {
  await registerAndOpenSchedule(page);
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.screenshot({
    fullPage: true,
    path: "../schedule-live-visual.png",
  });

  if (!fs.existsSync(DOCS_REFERENCE_PATH)) {
    return;
  }

  await page.goto(pathToFileURL(DOCS_REFERENCE_PATH).href);
  await page.setViewportSize({ width: 1512, height: 982 });
  await expect(page.locator("body")).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: "../schedule-docs-reference.png",
  });
});

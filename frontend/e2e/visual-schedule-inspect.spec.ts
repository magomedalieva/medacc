import { expect, test, type Page } from "@playwright/test";

function buildStudentEmail() {
  return `visual-schedule-${Date.now()}-${Math.round(Math.random() * 10_000)}@example.com`;
}

async function registerAndOpenSchedule(page: Page) {
  const email = buildStudentEmail();
  const password = "StrongPass123!";

  await page.goto("/auth");
  await page.getByRole("tab", { name: "Регистрация" }).click();
  await page.getByLabel("Имя").fill("Визуал");
  await page.getByLabel("Фамилия").fill("Проверка");
  await page.getByLabel("Электронная почта").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByLabel("Повтор пароля").fill(password);
  await page.getByRole("button", { name: "Создать аккаунт" }).click();

  await expect(page).toHaveURL(/\/app\/onboarding$/);

  await page.getByRole("button", { name: "Начать настройку — 3 шага" }).click();
  const facultySelect = page.getByLabel("Факультет");
  await expect.poll(async () => await facultySelect.locator("option").count()).toBeGreaterThan(0);
  await facultySelect.selectOption({ index: 0 });
  await page.locator('input[type="date"]').fill("2026-05-11");
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

  await page.goto("file:///C:/MedAcc/docs/index.html");
  await page.setViewportSize({ width: 1512, height: 982 });
  await expect(page.locator("body")).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: "../schedule-docs-reference.png",
  });
});

import fs from "node:fs";
import path from "node:path";

import { defineConfig } from "@playwright/test";

const frontendPort = 4173;
const backendPort = 8000;
const frontendRoot = process.cwd();
const backendRoot = path.resolve(frontendRoot, "..", "backend");
const backendPython = path.resolve(backendRoot, ".venv", "Scripts", "python.exe");
const edgeExecutablePath = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((candidate) => fs.existsSync(candidate));

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${frontendPort}`,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...(edgeExecutablePath
      ? {
          launchOptions: {
            executablePath: edgeExecutablePath,
          },
        }
      : {}),
  },
  webServer: [
    {
      command: `${backendPython} -m uvicorn app.main:app --host 127.0.0.1 --port ${backendPort}`,
      cwd: backendRoot,
      url: `http://127.0.0.1:${backendPort}/openapi.json`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm.cmd run dev -- --host 127.0.0.1 --port ${frontendPort}`,
      cwd: frontendRoot,
      url: `http://127.0.0.1:${frontendPort}/auth`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});

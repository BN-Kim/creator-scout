import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

const port = 3100;
const baseUrl = `http://127.0.0.1:${port}`;
const root = process.cwd();
const server = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "dev", "-p", String(port)], {
  cwd: root,
  detached: process.platform !== "win32",
  env: {
    ...process.env,
    E2E_TEST_MODE: "1",
    HISTORY_DATABASE_PATH: ".data/e2e-history.sqlite",
    OPERATIONS_SCHEDULER_ENABLED: "0",
    OPERATIONS_MIN_RUN_INTERVAL_MS: "0",
    OPERATIONS_SCHEDULER_POLL_MS: "1000",
    OPERATIONS_RETRY_BASE_DELAY_MS: "0",
  },
  stdio: "inherit",
});

let stopping = false;

async function stopServer() {
  if (stopping || server.exitCode !== null) return;
  stopping = true;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" });
    await once(killer, "exit");
  } else {
    process.kill(-server.pid, "SIGTERM");
    await Promise.race([once(server, "exit"), new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000))]);
    if (server.exitCode === null) process.kill(-server.pid, "SIGKILL");
  }
}

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`브라우저 테스트 서버가 종료되었습니다. 종료 코드: ${server.exitCode}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error("브라우저 테스트 서버가 제한 시간 안에 시작되지 않았습니다.");
}

const interrupt = () => {
  void stopServer().finally(() => process.exit(130));
};
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);

let exitCode = 1;
try {
  await waitForServer();
  const playwright = spawn(
    process.execPath,
    [resolve(root, "node_modules/@playwright/test/cli.js"), "test", ...process.argv.slice(2)],
    { cwd: root, env: process.env, stdio: "inherit" },
  );
  const [code] = await once(playwright, "exit");
  exitCode = typeof code === "number" ? code : 1;
} finally {
  await stopServer();
}

process.exit(exitCode);

import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function readDotEnvVar(name) {
  try {
    const envPath = join(process.cwd(), ".env");
    const raw = readFileSync(envPath, "utf8");

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const match = trimmed.match(new RegExp(`^${name}\\s*=\\s*(.*)$`));
      if (!match) {
        continue;
      }

      let value = match[1].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return value;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function readAppBaseUrlFromDotEnv() {
  return readDotEnvVar("APP_BASE_URL");
}

function readPortFromDotEnv() {
  return readDotEnvVar("PORT");
}

function normalizePort(value) {
  if (!value) {
    return undefined;
  }

  const trimmed = String(value).trim();
  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }

  const num = Number(trimmed);
  if (num < 1 || num > 65535) {
    return undefined;
  }

  return String(num);
}

function resolvePreferredPort() {
  const portFromEnv = normalizePort(process.env.PORT);
  if (portFromEnv) {
    return portFromEnv;
  }

  const portFromDotEnv = normalizePort(readPortFromDotEnv());
  if (portFromDotEnv) {
    return portFromDotEnv;
  }

  return resolveLocalhostPort();
}

function resolveLocalhostPort() {
  const appBaseUrl = process.env.APP_BASE_URL ?? readAppBaseUrlFromDotEnv();
  if (!appBaseUrl) {
    return undefined;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(appBaseUrl);
  } catch {
    return undefined;
  }

  if (parsedUrl.hostname !== "localhost") {
    return undefined;
  }

  const port = parsedUrl.port;
  if (!port) {
    return parsedUrl.protocol === "https:" ? "443" : "80";
  }

  return port;
}

const mode = process.argv[2];
if (mode !== "dev" && mode !== "start") {
  console.error(
    "Usage: node scripts/run-next-with-app-base-url-port.mjs <dev|start>",
  );
  process.exit(1);
}

const nextArgs = [mode];
const port = resolvePreferredPort();
if (port) {
  nextArgs.push("-p", port);
}

const nextBin = require.resolve("next/dist/bin/next");

const child = spawn(process.execPath, [nextBin, ...nextArgs], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const spawnOptions = { shell: process.platform === "win32" };

const next = spawn(npmCommand, ["run", "dev:next"], {
  ...spawnOptions,
  stdio: ["inherit", "pipe", "inherit"],
});

const inngest = spawn(
  npxCommand,
  [
    "-y",
    "inngest-cli@latest",
    "dev",
    "-u",
    "http://localhost:3000/api/inngest",
    "--no-discovery",
    "-l",
    "warn",
  ],
  { ...spawnOptions, stdio: "inherit" },
);

const nextOutput = createInterface({ input: next.stdout });
nextOutput.on("line", (line) => {
  if (!line.includes("PUT /api/inngest 200")) {
    process.stdout.write(`${line}\n`);
  }
});

let shuttingDown = false;

const stopProcessTree = (child) => {
  if (child.pid === undefined) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    });
    return;
  }

  child.kill("SIGTERM");
};

const shutdown = (exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  stopProcessTree(next);
  stopProcessTree(inngest);
  process.exit(exitCode);
};

process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());

next.on("error", () => shutdown(1));
inngest.on("error", () => shutdown(1));

next.on("exit", (code) => {
  if (!shuttingDown && code !== 0) shutdown(code ?? 1);
});

inngest.on("exit", (code) => {
  if (!shuttingDown && code !== 0) shutdown(code ?? 1);
});

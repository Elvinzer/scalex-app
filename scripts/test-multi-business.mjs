import { spawn } from "node:child_process";
import { resolve } from "node:path";

const value = process.env.MULTI_BUSINESS_TEST_DATABASE_URL;
if (!value) {
  throw new Error("Set MULTI_BUSINESS_TEST_DATABASE_URL to a migrated local minaly_multibusiness_* database.");
}
let target;
try {
  target = new URL(value);
} catch {
  throw new Error("The integration database URL is invalid.");
}
const name = decodeURIComponent(target.pathname.slice(1));
if (!["postgres:", "postgresql:"].includes(target.protocol)
  || !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)
  || !/^minaly_multibusiness_[a-zA-Z0-9_]+$/.test(name)) {
  throw new Error("Refusing integration tests outside a loopback minaly_multibusiness_* database.");
}
target.searchParams.set("sslmode", "disable");

// Database creation and upgrade are explicit prerequisites, never hidden effects
// of running tests. Each suite cleans only the unique fixtures it creates.
const args = [
  resolve("node_modules/vitest/vitest.mjs"),
  "run",
  "lib/businesses/multi-business.integration.test.ts",
  "lib/billing/business-billing.integration.test.ts",
  "lib/businesses/control-records.integration.test.ts",
  ...process.argv.slice(2),
];
const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: { ...process.env, MULTI_BUSINESS_TEST_DATABASE_URL: target.toString(), DATABASE_URL: target.toString() },
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});

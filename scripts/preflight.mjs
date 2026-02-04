import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const EXPECTED_REGISTRY = "https://registry.npmjs.org/";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  readFileSync(resolve(rootDir, "package.json"), "utf8")
);

const safeExec = (command) => {
  try {
    return execSync(command, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
};

const pnpmRegistry = safeExec("pnpm config get registry");
const registry =
  pnpmRegistry ||
  process.env.NPM_CONFIG_REGISTRY ||
  process.env.npm_config_registry ||
  "unknown";

const pnpmVersion = safeExec("pnpm -v");
const expectedPnpm = packageJson.packageManager
  ? packageJson.packageManager.replace(/^pnpm@/, "")
  : null;

console.log(`Node version: ${process.version}`);
console.log(`pnpm version: ${pnpmVersion ?? "not found"}`);
console.log(`Expected pnpm: ${expectedPnpm ?? "not specified"}`);
console.log(`Detected registry: ${registry}`);

if (registry !== EXPECTED_REGISTRY) {
  console.warn(
    `Warning: registry is not ${EXPECTED_REGISTRY}. Public packages may fail to install.`
  );
}

if (!pnpmVersion) {
  console.warn("Warning: pnpm not found on PATH.");
} else if (expectedPnpm && pnpmVersion !== expectedPnpm) {
  console.warn(
    `Warning: pnpm version mismatch (expected ${expectedPnpm}, found ${pnpmVersion}).`
  );
}

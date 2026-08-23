import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const root = new URL("../../", import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const runtime = readJson("fixtures/audit/f2-01-ci-runtime.json");
const transition = readJson("fixtures/audit/f2-01-transition.json");
const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const browserRegistry = readJson("node_modules/playwright-core/browsers.json");
const hash = (value) => createHash("sha256").update(value).digest("hex");

export function validateRuntimeContract({ runtime, transition, packageJson, packageLock, ci = false, ciDigest = "" }) {
  assert.deepEqual(Object.keys(runtime ?? {}).sort(), ["container", "evidence", "playwright", "schemaVersion"].sort(), "runtime schema is divergent");
  assert.equal(runtime.schemaVersion, 1, "runtime schema version is divergent");
  assert.equal(runtime.playwright?.package, "playwright", "Playwright package identity is divergent");
  assert.equal(packageJson?.devDependencies?.playwright, runtime.playwright.version, "package Playwright version is divergent");
  assert.equal(packageLock?.packages?.["node_modules/playwright"]?.version, runtime.playwright.version, "lockfile Playwright version is divergent");
  assert.deepEqual(runtime.playwright.engines, ["chromium", "firefox", "webkit"], "required engine set is absent, reordered or divergent");
  const lockedBuilds = Object.fromEntries(browserRegistry.browsers.filter(({ name }) => runtime.playwright.engines.includes(name)).map(({ name, revision, browserVersion }) => [name, { revision, version: browserVersion }]));
  assert.deepEqual(runtime.playwright.browserBuilds, lockedBuilds, "Playwright browser build identity is divergent from the installed lockfile");
  assert.deepEqual(transition?.f201?.requiredBrowsers, runtime.playwright.engines, "transition browser set differs from runtime authority");
  assert.match(runtime.container?.indexDigest ?? "", /^sha256:[0-9a-f]{64}$/, "container index digest is absent or malformed");
  assert.match(runtime.container?.linuxAmd64Digest ?? "", /^sha256:[0-9a-f]{64}$/, "container amd64 digest is absent or malformed");
  if (ci) assert.equal(ciDigest, runtime.container.indexDigest, "executed container digest differs from runtime authority");
}

export function validateEngineReport(runtime, report, engine) {
  assert.equal(report.schemaVersion, runtime.evidence.reportSchemaVersion, `${engine}: report schema divergent`);
  assert.equal(report.browser?.engine, engine, `${engine}: browser engine evidence missing or divergent`);
  assert.equal(report.browser?.version, runtime.playwright.browserBuilds[engine]?.version, `${engine}: browser version evidence missing or divergent`);
  assert.equal(report.observations?.length, runtime.evidence.requiredObservationCountPerEngine, `${engine}: observation evidence incomplete`);
  assert.equal(report.menuResults?.length, runtime.evidence.requiredMenuEvidenceCountPerEngine, `${engine}: menu evidence incomplete`);
  assert.equal(report.execution?.actions?.length, runtime.evidence.requiredActionCountPerEngine, `${engine}: action evidence incomplete`);
  assert.equal(report.execution?.complete, true, `${engine}: execution incomplete`);
  assert.deepEqual(report.execution.infrastructureErrors, [], `${engine}: infrastructure failure cannot satisfy readiness`);
  assert.equal(report.execution.semanticTests?.length, 4, `${engine}: semantic result vector incomplete`);
}

function expectedStatuses() {
  if (transition.status === "F2_01_AUTHORIZED_IN_DEVELOPMENT") return transition.f201.expectedDevelopmentRed.semanticVector;
  if (["READY_FOR_VIA_A_REVIEW", "F2_01_INTEGRATED_VERIFIED"].includes(transition.status)) {
    return Object.fromEntries(Object.keys(transition.f201.expectedDevelopmentRed.semanticVector).map((name) => [name, "PASS"]));
  }
  throw new Error(`unsupported executable F2-01 state: ${transition.status}`);
}

async function main() {
  validateRuntimeContract({ runtime, transition, packageJson, packageLock, ci: process.env.CI === "true", ciDigest: process.env.F2_01_CONTAINER_DIGEST });
  const directory = join(tmpdir(), `branct-f2-01-three-engine-${process.pid}`);
  mkdirSync(directory, { recursive: true });
  const reports = [];
  try {
  for (const engine of runtime.playwright.engines) {
    const reportPath = join(directory, `${engine}.json`);
    const result = spawnSync(process.execPath, ["--test", transition.f201.responsiveTest.path], {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8",
      timeout: 180000,
      env: { ...process.env, F2_01_BROWSER: engine, F2_01_REPORT_PATH: reportPath },
    });
    assert.equal(result.error, undefined, `${engine}: browser process failed to start: ${result.error?.message}`);
    assert.equal(result.signal, null, `${engine}: browser process terminated by ${result.signal}`);
    const expectedExit = transition.status === "F2_01_AUTHORIZED_IN_DEVELOPMENT" ? runtime.evidence.developmentExitCode : runtime.evidence.readyExitCode;
    assert.equal(result.status, expectedExit, `${engine}: semantic process exit differs; stderr=${result.stderr.slice(-1000)}`);
    let report;
    try { report = JSON.parse(readFileSync(reportPath, "utf8")); }
    catch { assert.fail(`${engine}: report is absent, unreadable or malformed`); }
    validateEngineReport(runtime, report, engine);
    assert.deepEqual(Object.fromEntries(report.execution.semanticTests.map(({ name, status }) => [name, status])), expectedStatuses(), `${engine}: semantic result vector divergent`);
    reports.push({ engine, browserVersion: report.browser.version, reportSha256: hash(JSON.stringify(report)), conclusion: transition.status === "F2_01_AUTHORIZED_IN_DEVELOPMENT" ? "EXPECTED_SEMANTIC_RED" : "GREEN" });
  }
  assert.deepEqual(reports.map(({ engine }) => engine), runtime.playwright.engines, "engine execution set is divergent");
    process.stdout.write(`${JSON.stringify({ status: transition.status, playwrightVersion: runtime.playwright.version, containerDigest: runtime.container.indexDigest, reports }, null, 2)}\n`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  console.error(`F2-01 readiness verification failed: ${error.message}`);
  process.exitCode = 1;
});

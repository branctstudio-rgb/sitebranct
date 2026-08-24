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
const matrix = readJson("fixtures/audit/f2-01-menu-evidence-matrix.json");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const semanticNames = Object.keys(transition.f201.expectedDevelopmentRed.semanticVector);
const actionPhases = (route) => ["before-open", "open", "after-open", "escape-close", ...(route === "index.html" ? ["close-button-open", "close-button-close", "outside-open", "outside-close"] : [])];
const evidenceId = ({ route, viewport, actionPhases }) => `menu-${hash(JSON.stringify({ route, viewport, actionPhases }))}`;
const actionSequence = ({ actionPhases }) => actionPhases.map((phase, sequence) => ({ sequence, phase, status: "COMPLETED" }));
const menuFailure = ({ focusReached, focusStyle, open, closed, closeButtonClosed, outsideClosed }) =>
  !focusReached || !focusStyle?.visible || focusStyle.style === "none" || focusStyle.width < 2 ||
  open?.expanded !== "true" || !open.drawerInside || !open.focusInside || !open.bodyLocked || !open.backgroundInert ||
  !open.closeTarget || open.closeTarget.x < 44 || open.closeTarget.y < 44 || !open.closeTarget.name ||
  closed?.expanded !== "false" || !closed.focusReturned || !closed.backgroundRestored || !closed.closed ||
  !closeButtonClosed || !outsideClosed;

function measuredResult(entry) {
  assert.deepEqual(Object.keys(entry).sort(), ["evidenceId", "route", "viewport", "focusReached", "focusStyle", "open", "closed", "closeButtonClosed", "outsideClosed"].sort(), `menu result schema differs: ${entry?.route} ${entry?.viewport}`);
  return {
    focusReached: entry.focusReached,
    focusStyle: entry.focusStyle,
    open: entry.open,
    closed: entry.closed,
    closeButtonClosed: entry.closeButtonClosed,
    outsideClosed: entry.outsideClosed,
  };
}

function validateCanonicalMatrix() {
  assert.equal(matrix.schemaVersion, 2, "canonical matrix schema is divergent");
  assert.equal(matrix.entries?.length, matrix.evidenceCount, "canonical matrix evidence cardinality is divergent");
  assert.equal(matrix.evidenceCount, runtime.evidence.requiredMenuEvidenceCountPerEngine, "runtime menu cardinality differs from canonical matrix");
  assert.equal(matrix.actionCount, runtime.evidence.requiredActionCountPerEngine, "runtime action cardinality differs from canonical matrix");
  const canonicalBytes = JSON.stringify(matrix.entries.map(({ evidenceId, route, viewport, actionPhases, developmentSemanticStatus, developmentResult, developmentResultSha256 }) => ({ evidenceId, route, viewport, actionPhases, developmentSemanticStatus, developmentResult, developmentResultSha256 })));
  assert.equal(hash(canonicalBytes), matrix.sha256, "canonical matrix digest is divergent");
  assert.equal(matrix.sha256, transition.f201.menuEvidenceMatrix.sha256, "canonical matrix differs from transition authority");
  for (const entry of matrix.entries) {
    assert.deepEqual(entry.actionPhases, actionPhases(entry.route), `canonical action phases differ: ${entry.route} ${entry.viewport}`);
    assert.equal(entry.evidenceId, evidenceId(entry), `canonical identity differs: ${entry.route} ${entry.viewport}`);
  }
}

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
  validateCanonicalMatrix();
  assert.equal(report.schemaVersion, runtime.evidence.reportSchemaVersion, `${engine}: report schema divergent`);
  assert.equal(report.source, transition.baseSha, `${engine}: report source is divergent`);
  assert.equal(report.browser?.engine, engine, `${engine}: browser engine evidence missing or divergent`);
  assert.equal(report.browser?.version, runtime.playwright.browserBuilds[engine]?.version, `${engine}: browser version evidence missing or divergent`);
  assert.deepEqual(report.viewports, transition.f201.matrix.viewports, `${engine}: viewport authority is divergent`);
  assert.equal(report.observations?.length, runtime.evidence.requiredObservationCountPerEngine, `${engine}: observation evidence incomplete`);
  assert.equal(report.menuResults?.length, runtime.evidence.requiredMenuEvidenceCountPerEngine, `${engine}: menu evidence incomplete`);
  assert.equal(report.execution?.actions?.length, runtime.evidence.requiredActionCountPerEngine, `${engine}: action evidence incomplete`);
  assert.equal(report.execution?.complete, true, `${engine}: execution incomplete`);
  assert.deepEqual(report.execution.infrastructureErrors, [], `${engine}: infrastructure failure cannot satisfy readiness`);
  assert.deepEqual(report.execution.semanticTests?.map(({ name }) => name), semanticNames, `${engine}: semantic result vector incomplete, reordered or duplicated`);
  const expectedObservations = transition.f201.matrix.routes.flatMap((route) => Object.keys(transition.f201.matrix.viewports).map((viewport) => `${route}\0${viewport}`)).sort();
  const actualObservations = report.observations.map(({ route, viewport, conclusion }) => {
    assert.equal(conclusion, "CONCLUSIVE", `${engine}: observation is inconclusive: ${route} ${viewport}`);
    return `${route}\0${viewport}`;
  }).sort();
  assert.deepEqual(actualObservations, expectedObservations, `${engine}: observation bijection is divergent`);
  const actualMenuIds = report.menuResults.map((entry) => {
    const canonical = matrix.entries.find(({ route, viewport }) => route === entry.route && viewport === entry.viewport);
    assert.ok(canonical, `${engine}: menu tuple is unknown: ${entry.route} ${entry.viewport}`);
    assert.equal(entry.evidenceId, canonical.evidenceId, `${engine}: menu identity differs from canonical tuple: ${entry.route} ${entry.viewport}`);
    measuredResult(entry);
    return entry.evidenceId;
  }).sort();
  assert.deepEqual(actualMenuIds, matrix.entries.map(({ evidenceId }) => evidenceId).sort(), `${engine}: menu evidence bijection is divergent`);
  const expectedActions = matrix.entries.flatMap(({ evidenceId, route, viewport, actionPhases }) => actionPhases.map((phase) => ({ evidenceId, route, viewport, phase, status: "COMPLETED" })));
  assert.deepEqual(report.execution.actions, expectedActions, `${engine}: action tuple, order or completion is divergent`);
  if (transition.status === "F2_01_AUTHORIZED_IN_DEVELOPMENT") {
    for (const canonical of matrix.entries) {
      const result = measuredResult(report.menuResults.find(({ evidenceId: id }) => id === canonical.evidenceId));
      const semanticStatus = menuFailure(result) ? "FAIL" : "PASS";
      assert.equal(semanticStatus, canonical.developmentSemanticStatus, `${engine}: development semantic result differs: ${canonical.route} ${canonical.viewport}`);
      const envelope = { evidenceId: canonical.evidenceId, route: canonical.route, viewport: canonical.viewport, actionSequence: actionSequence(canonical), semanticStatus, measuredResult: result };
      assert.equal(hash(JSON.stringify(envelope)), canonical.developmentResultSha256, `${engine}: measured result is transplanted or divergent: ${canonical.route} ${canonical.viewport}`);
    }
  }
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
    catch {
      const stdoutTail = result.stdout.slice(-1000).replaceAll("\u0000", "<NUL>");
      const stderrTail = result.stderr.slice(-1000).replaceAll("\u0000", "<NUL>");
      assert.fail(`${engine}: report is absent, unreadable or malformed; status=${result.status}; stdout=${stdoutTail}; stderr=${stderrTail}`);
    }
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

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync, rmSync, statSync } from "node:fs";
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
const matrix = readJson("fixtures/audit/f2-01-menu-evidence-matrix.json");
const targetBaseline = readJson(transition.f201.targetBaseline.path);
const targetBaselineBytes = readFileSync(new URL(transition.f201.targetBaseline.path, root));
const hash = (value) => createHash("sha256").update(value).digest("hex");
const semanticNames = Object.keys(transition.f201.expectedDevelopmentRed.semanticVector);
const actionPhases = (route) => ["before-open", "open", "after-open", "escape-close", ...(route === "index.html" ? ["close-button-open", "close-button-close", "outside-open", "outside-close"] : [])];
const evidenceId = ({ route, viewport, actionPhases }) => `menu-${hash(JSON.stringify({ route, viewport, actionPhases }))}`;
const actionSequence = ({ actionPhases }) => actionPhases.map((phase, sequence) => ({ sequence, phase, status: "COMPLETED" }));
const exactKeys = (value, keys, context) => {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${context} is absent or invalid`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${context} schema is divergent`);
};
const finite = (value, context, { nonNegative = false } = {}) => {
  assert.ok(typeof value === "number" && Number.isFinite(value), `${context} must be a finite number`);
  if (nonNegative) assert.ok(value >= 0, `${context} must be non-negative`);
};
const cleanText = (value, context) => {
  assert.equal(typeof value, "string", `${context} must be a string`);
  assert.doesNotMatch(value, /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/, `${context} contains control characters`);
};
const numericResolution = (value) => {
  const text = String(value).toLowerCase();
  if (text.includes("e")) return Number.EPSILON * Math.max(1, Math.abs(value));
  const decimals = text.includes(".") ? text.length - text.indexOf(".") - 1 : 0;
  return 10 ** -decimals;
};
const box = (value, context) => {
  exactKeys(value, ["left", "right", "width"], context);
  finite(value.left, `${context}.left`);
  finite(value.right, `${context}.right`);
  finite(value.width, `${context}.width`, { nonNegative: true });
  assert.ok(value.right >= value.left, `${context} has inverted bounds`);
  const discrepancy = Math.abs((value.right - value.left) - value.width);
  const serializedResolution = Math.max(numericResolution(value.left), numericResolution(value.right), numericResolution(value.width));
  assert.ok(discrepancy <= serializedResolution + Number.EPSILON * Math.max(1, Math.abs(value.right), Math.abs(value.left), Math.abs(value.width)), `${context} bounding box is inconsistent with width`);
};
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

function readInstalledBrowserRegistry() {
  try { return readJson("node_modules/playwright-core/browsers.json"); }
  catch { assert.fail("installed Playwright browser registry is absent, unreadable or malformed"); }
}

export function validateBaselineV3(baseline, { runtime, transition, bytes } = {}) {
  exactKeys(baseline, ["schemaVersion", "contract", "conclusion", "origin", "reportSchemaVersion", "engines", "canonicalMatrix", "semanticPredicates", "geometryPolicy", "metadataPolicy", "canonicalPayloadSha256"], "F2-01 baseline v3");
  assert.equal(baseline.schemaVersion, 3, "F2-01 baseline downgrade or schema divergence");
  assert.equal(baseline.contract, "F2_01_MULTIENGINE_SEMANTIC_BASELINE", "F2-01 baseline contract identity is divergent");
  assert.equal(baseline.conclusion, "CONCLUSIVE", "F2-01 baseline conclusion must be CONCLUSIVE");
  exactKeys(baseline.origin, ["governanceBaseSha", "migration", "previous"], "F2-01 baseline origin");
  assert.match(baseline.origin.governanceBaseSha ?? "", /^[0-9a-f]{40}$/, "F2-01 baseline origin sha is malformed");
  assert.equal(baseline.origin.migration, "v2-observational-snapshot-to-v3-semantic-contract", "F2-01 baseline migration is divergent");
  exactKeys(baseline.origin.previous, ["path", "schemaVersion", "gitBlobOid", "sha256"], "F2-01 baseline previous snapshot");
  assert.equal(baseline.origin.previous.path, "fixtures/audit/f2-01-baseline-results.json", "F2-01 v2 snapshot path is divergent");
  assert.equal(baseline.origin.previous.schemaVersion, 1, "F2-01 v2 snapshot schema is divergent");
  assert.equal(baseline.origin.previous.gitBlobOid, "2cb98083ad0fb4a55511d9e2c5114bab4999b8c8", "F2-01 v2 snapshot blob is divergent");
  assert.equal(baseline.origin.previous.sha256, "5cdbfb290a975c26511479d8d8b28ee793eb83ebe88a47dde4333a5e3e8aafab", "F2-01 v2 snapshot digest is divergent");
  assert.equal(baseline.reportSchemaVersion, 2, "F2-01 report schema authority is divergent");
  assert.deepEqual(baseline.engines, runtime.playwright.engines.map((engine) => ({ engine, revision: runtime.playwright.browserBuilds[engine].revision, version: runtime.playwright.browserBuilds[engine].version })), "F2-01 baseline engine authority is divergent");
  exactKeys(baseline.canonicalMatrix, ["routes", "viewports", "observationCountPerEngine", "menu"], "F2-01 baseline canonical matrix");
  assert.deepEqual(baseline.canonicalMatrix.routes, transition.f201.matrix.routes, "F2-01 baseline route matrix is divergent");
  assert.deepEqual(baseline.canonicalMatrix.viewports, transition.f201.matrix.viewports, "F2-01 baseline viewport matrix is divergent");
  assert.equal(baseline.canonicalMatrix.observationCountPerEngine, transition.f201.targetBaseline.observationCount, "F2-01 baseline observation cardinality is divergent");
  assert.deepEqual(baseline.canonicalMatrix.menu, {
    path: transition.f201.menuEvidenceMatrix.path,
    schemaVersion: 2,
    sha256: transition.f201.menuEvidenceMatrix.sha256,
    evidenceCountPerEngine: transition.f201.menuEvidenceMatrix.evidenceCount,
    actionCountPerEngine: transition.f201.menuEvidenceMatrix.actionCount,
  }, "F2-01 baseline menu authority is divergent");
  assert.deepEqual(baseline.semanticPredicates, {
    overflowCount: 0,
    mobileOrTabletMaximumWidth: 768,
    minimumNonInlineTargetWidth: 44,
    minimumNonInlineTargetHeight: 44,
    menuSemanticStatus: "PASS",
    reducedMotionMatches: true,
    reducedMotionMaximumDurationMs: 1,
    infrastructureErrors: 0,
    semanticTestStatus: "PASS",
  }, "F2-01 baseline semantic predicates are divergent");
  assert.deepEqual(baseline.geometryPolicy, {
    comparison: "PER_ENGINE_PLAUSIBILITY_AND_SEMANTIC_INVARIANTS",
    requireFiniteNumbers: true,
    requireNonNegativeSizes: true,
    requireBoundingBoxConsistency: true,
    crossEngineByteEquality: false,
    globalTolerance: null,
  }, "F2-01 baseline geometry policy is divergent");
  assert.deepEqual(baseline.metadataPolicy, {
    authoritative: false,
    allowedKeys: ["capturedAt", "capturePath", "message"],
    forbidControlCharacters: true,
  }, "F2-01 baseline metadata policy is divergent");
  const payload = structuredClone(baseline);
  delete payload.canonicalPayloadSha256;
  assert.equal(hash(JSON.stringify(payload)), baseline.canonicalPayloadSha256, "F2-01 baseline canonical payload digest is divergent");
  if (bytes) assert.equal(hash(bytes), transition.f201.targetBaseline.sha256, "F2-01 baseline file digest differs from protected transition authority");
  assert.equal(transition.f201.targetBaseline.schemaVersion, 3, "protected transition permits a baseline downgrade");
  assert.equal(transition.f201.targetBaseline.conclusion, "CONCLUSIVE", "protected transition baseline conclusion is divergent");
  return baseline;
}

function validateObservation(entry, expected, baseline, { requireGreen }) {
  exactKeys(entry, ["route", "viewport", "conclusion", "clientWidth", "scrollWidth", "overflow", "overflowElements", "smallTargets", "inlineTextExceptions", "header", "toggle", "drawer", "consoleIssues"], `observation ${expected}`);
  const [route, viewport] = expected.split("\0");
  assert.equal(entry.route, route, `observation route differs: ${expected}`);
  assert.equal(entry.viewport, viewport, `observation viewport differs: ${expected}`);
  assert.equal(entry.conclusion, "CONCLUSIVE", `observation conclusion must be CONCLUSIVE: ${route} ${viewport}`);
  finite(entry.clientWidth, `${route} ${viewport} clientWidth`, { nonNegative: true });
  finite(entry.scrollWidth, `${route} ${viewport} scrollWidth`, { nonNegative: true });
  assert.ok(entry.clientWidth > 0 && entry.clientWidth <= baseline.canonicalMatrix.viewports[viewport][0], `observation clientWidth is implausible for canonical viewport: ${route} ${viewport}`);
  const derivedOverflow = entry.scrollWidth > entry.clientWidth;
  assert.equal(entry.overflow, derivedOverflow, `reported overflow differs from raw widths: ${route} ${viewport}`);
  if (requireGreen) assert.equal(derivedOverflow, false, `horizontal overflow exceeds zero: ${route} ${viewport}`);
  assert.ok(Array.isArray(entry.overflowElements), `overflow geometry evidence is absent: ${route} ${viewport}`);
  for (const [index, item] of entry.overflowElements.entries()) {
    exactKeys(item, ["selector", "left", "right", "width"], `overflow element ${route} ${viewport} ${index}`);
    cleanText(item.selector, `overflow selector ${route} ${viewport} ${index}`);
    box({ left: item.left, right: item.right, width: item.width }, `overflow element ${route} ${viewport} ${index}`);
  }
  assert.ok(Array.isArray(entry.smallTargets), `target evidence is absent: ${route} ${viewport}`);
  for (const [index, target] of entry.smallTargets.entries()) {
    assert.ok(target && typeof target === "object" && !Array.isArray(target), `target evidence is invalid: ${route} ${viewport} ${index}`);
    cleanText(target.selector ?? "", `target selector ${route} ${viewport} ${index}`);
    finite(target.width, `target width ${route} ${viewport} ${index}`, { nonNegative: true });
    finite(target.height, `target height ${route} ${viewport} ${index}`, { nonNegative: true });
  }
  if (requireGreen && entry.clientWidth <= baseline.semanticPredicates.mobileOrTabletMaximumWidth) {
    assert.ok(entry.smallTargets.every(({ width, height }) => width >= baseline.semanticPredicates.minimumNonInlineTargetWidth && height >= baseline.semanticPredicates.minimumNonInlineTargetHeight), `target below 44x44: ${route} ${viewport}`);
  }
  finite(entry.inlineTextExceptions, `inline exception count ${route} ${viewport}`, { nonNegative: true });
  if (entry.header !== null) box(entry.header, `header ${route} ${viewport}`);
  if (entry.toggle !== null) {
    exactKeys(entry.toggle, ["width", "height", "expanded", "controls", "name"], `toggle ${route} ${viewport}`);
    finite(entry.toggle.width, `toggle width ${route} ${viewport}`, { nonNegative: true });
    finite(entry.toggle.height, `toggle height ${route} ${viewport}`, { nonNegative: true });
    cleanText(entry.toggle.expanded, `toggle expanded ${route} ${viewport}`);
    cleanText(entry.toggle.controls, `toggle controls ${route} ${viewport}`);
    cleanText(entry.toggle.name, `toggle name ${route} ${viewport}`);
  }
  if (entry.drawer !== null) {
    exactKeys(entry.drawer, ["left", "right", "width", "open"], `drawer ${route} ${viewport}`);
    box({ left: entry.drawer.left, right: entry.drawer.right, width: entry.drawer.width }, `drawer ${route} ${viewport}`);
    assert.equal(typeof entry.drawer.open, "boolean", `drawer open state is invalid: ${route} ${viewport}`);
  }
  assert.ok(Array.isArray(entry.consoleIssues), `console evidence is absent: ${route} ${viewport}`);
  for (const issue of entry.consoleIssues) cleanText(issue, `console issue ${route} ${viewport}`);
  if (requireGreen) assert.deepEqual(entry.consoleIssues, [], `console issue blocks GREEN: ${route} ${viewport}`);
}

function validateGreenMenu(entry) {
  const result = measuredResult(entry);
  finite(result.focusStyle.width, `${entry.route} ${entry.viewport} focus width`, { nonNegative: true });
  if (result.open.closeTarget) {
    finite(result.open.closeTarget.x, `${entry.route} ${entry.viewport} close target width`, { nonNegative: true });
    finite(result.open.closeTarget.y, `${entry.route} ${entry.viewport} close target height`, { nonNegative: true });
    cleanText(result.open.closeTarget.name, `${entry.route} ${entry.viewport} close target name`);
  }
  assert.equal(menuFailure(result), false, `menu semantic predicate failed: ${entry.route} ${entry.viewport}`);
}

export function validateRuntimeContract({ runtime, transition, packageJson, packageLock, browserRegistry, ci = false, ciDigest = "" }) {
  assert.deepEqual(Object.keys(runtime ?? {}).sort(), ["container", "evidence", "playwright", "schemaVersion"].sort(), "runtime schema is divergent");
  assert.equal(runtime.schemaVersion, 1, "runtime schema version is divergent");
  assert.equal(runtime.playwright?.package, "playwright", "Playwright package identity is divergent");
  assert.equal(packageJson?.devDependencies?.playwright, runtime.playwright.version, "package Playwright version is divergent");
  assert.equal(packageLock?.packages?.["node_modules/playwright"]?.version, runtime.playwright.version, "lockfile Playwright version is divergent");
  assert.deepEqual(runtime.playwright.engines, ["chromium", "firefox", "webkit"], "required engine set is absent, reordered or divergent");
  const registry = browserRegistry ?? readInstalledBrowserRegistry();
  assert.ok(Array.isArray(registry?.browsers), "Playwright browser registry is absent or malformed");
  const lockedBuilds = Object.fromEntries(registry.browsers.filter(({ name }) => runtime.playwright.engines.includes(name)).map(({ name, revision, browserVersion }) => [name, { revision, version: browserVersion }]));
  assert.deepEqual(runtime.playwright.browserBuilds, lockedBuilds, "Playwright browser build identity is divergent from the installed lockfile");
  assert.deepEqual(transition?.f201?.requiredBrowsers, runtime.playwright.engines, "transition browser set differs from runtime authority");
  assert.match(runtime.container?.indexDigest ?? "", /^sha256:[0-9a-f]{64}$/, "container index digest is absent or malformed");
  assert.match(runtime.container?.linuxAmd64Digest ?? "", /^sha256:[0-9a-f]{64}$/, "container amd64 digest is absent or malformed");
  if (ci) assert.equal(ciDigest, runtime.container.indexDigest, "executed container digest differs from runtime authority");
}

export function validateEngineReport(runtime, report, engine, { baseline = targetBaseline, allowLegacyDevelopmentConclusion = false, requireGreen = transition.status !== "F2_01_AUTHORIZED_IN_DEVELOPMENT" } = {}) {
  validateCanonicalMatrix();
  validateBaselineV3(baseline, { runtime, transition, bytes: baseline === targetBaseline ? targetBaselineBytes : undefined });
  if (allowLegacyDevelopmentConclusion && report.conclusion === undefined) report.conclusion = report.execution?.complete === true ? "CONCLUSIVE" : undefined;
  exactKeys(report, ["schemaVersion", "source", "browser", "viewports", "observations", "menuResults", "reducedMotion", "execution", "conclusion"], `${engine}: report`);
  assert.equal(report.schemaVersion, runtime.evidence.reportSchemaVersion, `${engine}: report schema divergent`);
  assert.equal(report.conclusion, "CONCLUSIVE", `${engine}: report conclusion must be CONCLUSIVE`);
  assert.equal(report.source, transition.baseSha, `${engine}: report source is divergent`);
  exactKeys(report.browser, ["engine", "version"], `${engine}: browser identity`);
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
  const actualObservations = report.observations.map(({ route, viewport }) => `${route}\0${viewport}`).sort();
  assert.deepEqual(actualObservations, expectedObservations, `${engine}: observation bijection is divergent`);
  for (const [index, expected] of expectedObservations.entries()) {
    const [route, viewport] = expected.split("\0");
    const matches = report.observations.filter((entry) => entry.route === route && entry.viewport === viewport);
    assert.equal(matches.length, 1, `${engine}: observation bijection differs: ${route} ${viewport}`);
    validateObservation(matches[0], expected, baseline, { requireGreen });
  }
  const actualMenuIds = report.menuResults.map((entry) => {
    const canonical = matrix.entries.find(({ route, viewport }) => route === entry.route && viewport === entry.viewport);
    assert.ok(canonical, `${engine}: menu tuple is unknown: ${entry.route} ${entry.viewport}`);
    assert.equal(entry.evidenceId, canonical.evidenceId, `${engine}: menu identity differs from canonical tuple: ${entry.route} ${entry.viewport}`);
    measuredResult(entry);
    if (requireGreen) validateGreenMenu(entry);
    return entry.evidenceId;
  }).sort();
  assert.deepEqual(actualMenuIds, matrix.entries.map(({ evidenceId }) => evidenceId).sort(), `${engine}: menu evidence bijection is divergent`);
  const expectedActions = matrix.entries.flatMap(({ evidenceId, route, viewport, actionPhases }) => actionPhases.map((phase) => ({ evidenceId, route, viewport, phase, status: "COMPLETED" })));
  assert.deepEqual(report.execution.actions, expectedActions, `${engine}: action tuple, order or completion is divergent`);
  exactKeys(report.reducedMotion, ["matches", "durationsMs"], `${engine}: reduced-motion evidence`);
  assert.equal(report.reducedMotion.matches, true, `${engine}: reduced-motion media query did not match`);
  assert.ok(Array.isArray(report.reducedMotion.durationsMs) && report.reducedMotion.durationsMs.length > 0, `${engine}: reduced-motion durations are absent`);
  for (const duration of report.reducedMotion.durationsMs) finite(duration, `${engine}: reduced-motion duration`, { nonNegative: true });
  if (requireGreen) assert.ok(report.reducedMotion.durationsMs.every((duration) => duration <= baseline.semanticPredicates.reducedMotionMaximumDurationMs), `${engine}: reduced-motion semantic predicate failed`);
  if (requireGreen) assert.ok(report.execution.semanticTests.every(({ status }) => status === baseline.semanticPredicates.semanticTestStatus), `${engine}: semantic test status is not GREEN`);
  if (!requireGreen && transition.status === "F2_01_AUTHORIZED_IN_DEVELOPMENT") {
    for (const canonical of matrix.entries) {
      const result = measuredResult(report.menuResults.find(({ evidenceId: id }) => id === canonical.evidenceId));
      const semanticStatus = menuFailure(result) ? "FAIL" : "PASS";
      assert.equal(semanticStatus, canonical.developmentSemanticStatus, `${engine}: development semantic result differs: ${canonical.route} ${canonical.viewport}`);
      const envelope = { evidenceId: canonical.evidenceId, route: canonical.route, viewport: canonical.viewport, actionSequence: actionSequence(canonical), semanticStatus, measuredResult: result };
      assert.equal(hash(JSON.stringify(envelope)), canonical.developmentResultSha256, `${engine}: measured result is transplanted or divergent: ${canonical.route} ${canonical.viewport}`);
    }
  }
}

export function validateReadyBaseline(report, baseline) {
  assert.ok(baseline && typeof baseline === "object" && !Array.isArray(baseline), "GREEN target baseline is absent or unreadable");
  const engine = report?.browser?.engine;
  assert.ok(runtime.playwright.engines.includes(engine), "GREEN report engine is absent or unexpected");
  validateEngineReport(runtime, report, engine, { baseline, requireGreen: true });
  return { engine, conclusion: "CONCLUSIVE" };
}

export function validateCaptureEvidence(engine, captures, baseline = targetBaseline) {
  assert.ok(runtime.playwright.engines.includes(engine), `capture engine is unexpected: ${engine}`);
  assert.ok(Array.isArray(captures), `${engine}: capture evidence is absent`);
  const expected = Object.keys(baseline.canonicalMatrix.viewports).flatMap((viewport) => [
    `home-${engine}-${viewport}-closed.jpg`,
    ...(baseline.canonicalMatrix.viewports[viewport][0] <= 768 ? [`home-${engine}-${viewport}-open.jpg`] : []),
  ]).sort();
  const actual = captures.map((item) => {
    exactKeys(item, ["name", "bytes", "sha256"], `${engine}: capture evidence`);
    cleanText(item.name, `${engine}: capture name`);
    finite(item.bytes, `${engine}: capture bytes`, { nonNegative: true });
    assert.ok(item.bytes > 0, `${engine}: capture is empty: ${item.name}`);
    assert.match(item.sha256 ?? "", /^[0-9a-f]{64}$/, `${engine}: capture digest is malformed: ${item.name}`);
    return item.name;
  }).sort();
  assert.deepEqual(actual, expected, `${engine}: capture evidence set is incomplete, duplicated or unexpected`);
  return { engine, captures: captures.length, digest: hash(JSON.stringify(captures.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })).sort((a, b) => a.name.localeCompare(b.name)))) };
}

export function validateMultiengineReports(runtime, reports, { baseline = targetBaseline, capturesByEngine = {} } = {}) {
  validateBaselineV3(baseline, { runtime, transition, bytes: baseline === targetBaseline ? targetBaselineBytes : undefined });
  assert.ok(Array.isArray(reports), "multiengine report set is absent");
  assert.equal(reports.length, runtime.playwright.engines.length, "multiengine report cardinality is incomplete or unexpected");
  const engines = reports.map((report) => report?.browser?.engine);
  assert.deepEqual([...engines].sort(), [...runtime.playwright.engines].sort(), "multiengine set contains a missing, duplicate or unexpected engine");
  const validated = reports.map((report) => validateReadyBaseline(report, baseline));
  const captures = runtime.playwright.engines.map((engine) => validateCaptureEvidence(engine, capturesByEngine[engine], baseline));
  return { schemaVersion: 1, conclusion: "CONCLUSIVE", engines: validated, rawEvidence: captures };
}

function capturesFromDirectory(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jpg"))
    .map((entry) => {
      const path = join(directory, entry.name);
      const bytes = statSync(path).size;
      return { name: entry.name, bytes, sha256: hash(readFileSync(path)) };
    });
}

export function derivePostIntegrationState({ transition, repository, eventPath, mainRef = "refs/remotes/origin/main" }) {
  assert.equal(transition.status, "READY_FOR_VIA_A_REVIEW", "only a reviewed-ready tree can derive the post-integration state");
  assert.equal(transition.stateMachine.integrationAuthority, "GitHub push event for refs/heads/main plus the resolved refs/heads/main Git ref", "post-integration authority is divergent");
  let event;
  try { event = JSON.parse(readFileSync(eventPath, "utf8")); }
  catch { assert.fail("GitHub main push event is absent, unreadable or malformed"); }
  assert.equal(event?.ref, "refs/heads/main", "GitHub integration event is not for refs/heads/main");
  assert.equal(event?.repository?.full_name, transition.repository, "GitHub integration repository is divergent");
  for (const name of ["before", "after"]) assert.match(event?.[name] ?? "", /^[0-9a-f]{40}$/, `GitHub integration ${name} sha is absent or malformed`);
  const git = (...args) => {
    try { return execFileSync("git", args, { cwd: repository, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
    catch { assert.fail(`post-integration Git authority cannot resolve: git ${args.join(" ")}`); }
  };
  assert.equal(git("rev-parse", mainRef), event.after, "resolved canonical main ref differs from the GitHub push event");
  const [commit, ...parents] = git("rev-list", "--parents", "-n", "1", event.after).split(/\s+/);
  assert.equal(commit, event.after, "resolved main commit differs from the GitHub push event");
  assert.equal(parents.length, 2, "main integration is not a normal two-parent merge");
  assert.equal(parents[0], event.before, "main merge first parent differs from the sealed pre-merge main");
  const treeSha = git("rev-parse", `${event.after}^{tree}`);
  return { state: "F2_01_INTEGRATED_VERIFIED", mergeCommitSha: event.after, baseSha: event.before, headSha: parents[1], treeSha, mainRef };
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
  const completeReports = [];
  try {
  for (const engine of runtime.playwright.engines) {
    const reportPath = join(directory, `${engine}.json`);
    const captureDirectory = join(directory, `${engine}-captures`);
    mkdirSync(captureDirectory, { recursive: true });
    const result = spawnSync(process.execPath, ["--test", transition.f201.responsiveTest.path], {
      cwd: new URL("../../", import.meta.url),
      encoding: "utf8",
      timeout: 180000,
      env: { ...process.env, F2_01_BROWSER: engine, F2_01_REPORT_PATH: reportPath, F2_01_CAPTURE_DIR: captureDirectory },
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
    validateEngineReport(runtime, report, engine, { allowLegacyDevelopmentConclusion: transition.status === "F2_01_AUTHORIZED_IN_DEVELOPMENT", requireGreen: transition.status !== "F2_01_AUTHORIZED_IN_DEVELOPMENT" });
    const captureEvidence = validateCaptureEvidence(engine, capturesFromDirectory(captureDirectory));
    if (["READY_FOR_VIA_A_REVIEW", "F2_01_INTEGRATED_VERIFIED"].includes(transition.status)) validateReadyBaseline(report, targetBaseline);
    assert.deepEqual(Object.fromEntries(report.execution.semanticTests.map(({ name, status }) => [name, status])), expectedStatuses(), `${engine}: semantic result vector divergent`);
    completeReports.push(report);
    reports.push({ engine, browserVersion: report.browser.version, reportSha256: hash(JSON.stringify(report)), rawEvidence: captureEvidence, conclusion: transition.status === "F2_01_AUTHORIZED_IN_DEVELOPMENT" ? "EXPECTED_SEMANTIC_RED" : "GREEN" });
  }
  assert.deepEqual(reports.map(({ engine }) => engine), runtime.playwright.engines, "engine execution set is divergent");
    if (transition.status !== "F2_01_AUTHORIZED_IN_DEVELOPMENT") validateMultiengineReports(runtime, completeReports, {
      baseline: targetBaseline,
      capturesByEngine: Object.fromEntries(runtime.playwright.engines.map((engine) => [engine, capturesFromDirectory(join(directory, `${engine}-captures`))])),
    });
    let postIntegration = null;
    if (transition.status === "READY_FOR_VIA_A_REVIEW" && process.env.GITHUB_EVENT_NAME === "push") {
      postIntegration = derivePostIntegrationState({ transition, repository: new URL("../../", import.meta.url), eventPath: process.env.GITHUB_EVENT_PATH });
    }
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, conclusion: "CONCLUSIVE", status: postIntegration?.state ?? transition.status, storedStatus: transition.status, postIntegration, playwrightVersion: runtime.playwright.version, containerDigest: runtime.container.indexDigest, reports }, null, 2)}\n`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  console.error(`F2-01 readiness verification failed: ${error.message}`);
  process.exitCode = 1;
});

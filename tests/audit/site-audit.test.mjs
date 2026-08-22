import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import test from "node:test";

const contractPath = new URL("../../fixtures/audit/site-contract.json", import.meta.url);
const auditPath = new URL("../../docs/audit/phase-1-audit.md", import.meta.url);
const roadmapPath = new URL("../../docs/audit/target-architecture-roadmap.md", import.meta.url);
const riskPath = new URL("../../docs/audit/risk-register.md", import.meta.url);
const workflowPath = new URL("../../.github/workflows/audit-offline.yml", import.meta.url);
const resultsPath = new URL("../../fixtures/audit/baseline-results.json", import.meta.url);
const manifestPath = new URL("../../fixtures/audit/evidence-manifest.json", import.meta.url);
const redGreenPath = new URL("../../docs/audit/evidence/red-green.md", import.meta.url);
const collectorPath = new URL("./collect-browser-baseline.mjs", import.meta.url);
const negativeControlPath = new URL("../../fixtures/audit/visual-negative-control.json", import.meta.url);
const f201TransitionPath = new URL("../../fixtures/audit/f2-01-transition.json", import.meta.url);

const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));
const hashBytes = (value) => createHash("sha256").update(value).digest("hex");
const shaPattern = /^[0-9a-f]{40}$/;
const blobPattern = /^[0-9a-f]{40,64}$/;

const immutableF201Pins = Object.freeze({
  historicalPhase1: Object.freeze({ path: "fixtures/audit/baseline-results.json", authoritySha: "a47abb9a43248320dfef8449b6a65e187913fd24", gitBlobOid: "2831b40a6ff7976c235f2c1d98832186979921fe", sha256: "6e4be577073d0fe7b665559acf371ee279a815f8b407702dcbc9c697d7c71eae" }),
  responsiveTest: Object.freeze({ path: "tests/audit/f2-01-responsive.test.mjs", gitBlobOid: "ebdd7eb5c1df94b9ab920e48b04205b8b753ded0", sha256: "d1da3f881fa63a3161d81a4612266ee1f0ae0a38cccf9e4d6c8be160028cd9bb" }),
  targetBaseline: Object.freeze({ path: "fixtures/audit/f2-01-baseline-results.json", gitBlobOid: "2cb98083ad0fb4a55511d9e2c5114bab4999b8c8", sha256: "5cdbfb290a975c26511479d8d8b28ee793eb83ebe88a47dde4333a5e3e8aafab" }),
});

function readAuthoritativeGitBlob(repository, authoritySha, expected) {
  assert.match(authoritySha ?? "", shaPattern, "authority sha must be an explicit 40-character commit id");
  assert.match(expected?.gitBlobOid ?? "", blobPattern, "expected Git blob oid must be immutable and explicit");
  assert.match(expected?.sha256 ?? "", /^[0-9a-f]{64}$/, "expected sha256 must be immutable and explicit");
  assert.match(expected?.path ?? "", /^(?![./\\])(?!.+\\)(?!.*(?:^|\/)\.\.(?:\/|$)).+$/, "authoritative path must remain repository-relative");
  try { execFileSync("git", ["cat-file", "-e", `${authoritySha}^{commit}`], { cwd: repository, stdio: "ignore" }); }
  catch { assert.fail(`authority sha is not resolvable: ${authoritySha}`); }
  let actualOid;
  try { actualOid = execFileSync("git", ["rev-parse", `${authoritySha}:${expected.path}`], { cwd: repository, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { assert.fail(`missing authoritative path ${expected.path} at authority sha ${authoritySha}`); }
  assert.equal(actualOid, expected.gitBlobOid, `blob oid mismatch for ${expected.path}`);
  const bytes = execFileSync("git", ["cat-file", "blob", expected.gitBlobOid], { cwd: repository });
  assert.equal(hashBytes(bytes), expected.sha256, `sha256 mismatch for ${expected.path}`);
  return bytes;
}

function resolveAuthoritySha(transition, options = {}) {
  const explicit = Object.hasOwn(options, "explicit") ? options.explicit : process.env.F2_GOV_AUTHORITY_SHA;
  const eventPath = Object.hasOwn(options, "eventPath") ? options.eventPath : process.env.GITHUB_EVENT_PATH;
  let eventHead;
  let eventBase;
  if (eventPath) {
    let event;
    try { event = JSON.parse(readFileSync(eventPath, "utf8")); }
    catch { assert.fail("authority event is absent, unreadable or malformed"); }
    eventHead = event?.pull_request?.head?.sha;
    eventBase = event?.pull_request?.base?.sha;
    assert.match(eventHead ?? "", shaPattern, "authority event head sha is absent or malformed");
    assert.equal(eventBase, transition.baseSha, "authority event base sha differs from the transition contract");
  }
  assert.ok(explicit || eventHead, "authority sha is absent");
  if (explicit && eventHead) assert.equal(explicit, eventHead, "explicit authority sha differs from event head sha");
  const authoritySha = explicit || eventHead;
  assert.match(authoritySha, shaPattern, "authority sha is malformed");
  return authoritySha;
}

function assertExactSemanticTestSet(execution) {
  assert.equal(execution?.complete, true, `execution incomplete${execution?.infrastructureErrors?.length ? `: ${execution.infrastructureErrors.join(", ")}` : ""}`);
  assert.deepEqual(execution.infrastructureErrors, [], `infrastructure error: ${(execution?.infrastructureErrors ?? []).join(", ")}`);
  assert.ok(Array.isArray(execution.semanticTests), "semantic test set is absent");
  const actualNames = execution.semanticTests.map(({ name }) => name);
  assert.deepEqual(actualNames, semanticTestNames, "semantic test set is incomplete, reordered or duplicated");
  for (const result of execution.semanticTests) assert.match(result.status, /^(PASS|FAIL)$/, `semantic test ${result.name} has invalid status`);
}

function assertCompleteReport(transition, report) {
  assert.ok(report && typeof report === "object" && !Array.isArray(report), "report is absent or unreadable");
  assert.equal(report.schemaVersion, 1, "report schema is absent or invalid");
  assert.equal(report.source, transition.baseSha, "report source differs from the transition base");
  assert.match(report.browser?.product ?? "", /(?:Chrome|Chromium)\//, "report browser evidence is absent or invalid");
  assert.deepEqual(report.viewports, transition.f201.matrix.viewports, "report viewport matrix is incomplete or divergent");
  for (const name of transition.f201.expectedDevelopmentRed.requiredEvidence) assert.ok(report[name] !== undefined && report[name] !== null, `required evidence absent: ${name}`);
  assert.equal(report.observations.length, transition.f201.targetBaseline.observationCount, `truncated report observation count: expected ${transition.f201.targetBaseline.observationCount}`);
  assert.equal(report.menuResults.length, transition.f201.targetBaseline.menuExerciseCount, `menu result count incomplete: expected ${transition.f201.targetBaseline.menuExerciseCount}`);
  const expectedObservationKeys = transition.f201.matrix.routes.flatMap((route) => Object.keys(transition.f201.matrix.viewports).map((viewport) => `${route}\0${viewport}`)).sort();
  const actualObservationKeys = report.observations.map(({ route, viewport }) => `${route}\0${viewport}`).sort();
  assert.deepEqual(actualObservationKeys, expectedObservationKeys, "report observation matrix contains missing, duplicate or unknown entries");
  const menuKeys = report.menuResults.map(({ route, viewport }) => `${route}\0${viewport}`);
  assert.equal(new Set(menuKeys).size, menuKeys.length, "menu result matrix contains duplicate entries");
  assertExactSemanticTestSet(report.execution);
}

function assertProcessOutcome(outcome, expectedExitCode) {
  assert.ok(outcome && typeof outcome === "object", "process outcome is absent");
  assert.equal(outcome.exited, true, "process ended prematurely");
  assert.equal(outcome.timedOut, false, "process timeout cannot satisfy transition evidence");
  assert.equal(outcome.signal, null, `process signal cannot satisfy transition evidence: ${outcome.signal}`);
  assert.equal(outcome.exitCode, expectedExitCode, `process error exit code: expected ${expectedExitCode}, got ${outcome.exitCode}`);
}

const menuFailure = ({ focusReached, focusStyle, open, closed, closeButtonClosed, outsideClosed }) =>
  !focusReached || !focusStyle?.visible || focusStyle.style === "none" || focusStyle.width < 2 ||
  open.expanded !== "true" || !open.drawerInside || !open.focusInside || !open.bodyLocked || !open.backgroundInert ||
  !open.closeTarget || open.closeTarget.x < 44 || open.closeTarget.y < 44 || !open.closeTarget.name ||
  closed.expanded !== "false" || !closed.focusReturned || !closed.backgroundRestored || !closed.closed ||
  !closeButtonClosed || !outsideClosed;

function validateStateMachine(transition) {
  const states = ["PHASE_1_HISTORICAL", "F2_01_AUTHORIZED_IN_DEVELOPMENT", "F2_01_INTEGRATED_VERIFIED"];
  assert.ok(transition.status, "state absent");
  assert.ok(states.includes(transition.status), `state unknown: ${transition.status}`);
  assert.deepEqual(transition.stateMachine.states, states, "state set is incomplete or reordered");
  assert.equal(transition.stateMachine.current, transition.status, "state current mismatch");
  const expectedPrevious = { PHASE_1_HISTORICAL: null, F2_01_AUTHORIZED_IN_DEVELOPMENT: "PHASE_1_HISTORICAL", F2_01_INTEGRATED_VERIFIED: "F2_01_AUTHORIZED_IN_DEVELOPMENT" }[transition.status];
  assert.equal(transition.stateMachine.previous, expectedPrevious, "state transition is inverted or regressed");
  assert.deepEqual(transition.stateMachine.transitions, {
    PHASE_1_HISTORICAL: ["F2_01_AUTHORIZED_IN_DEVELOPMENT"],
    F2_01_AUTHORIZED_IN_DEVELOPMENT: ["F2_01_INTEGRATED_VERIFIED"],
    F2_01_INTEGRATED_VERIFIED: [],
  }, "state transition graph is not closed");
  assert.ok(Array.isArray(transition.f201.requiredBrowsers) && transition.f201.requiredBrowsers.length > 0, "mandatory browser set is absent");
}

function deriveF201State(transition, evidence) {
  validateStateMachine(transition);
  if (transition.status === "PHASE_1_HISTORICAL") return transition.status;
  assertCompleteReport(transition, evidence.report);
  if (transition.status === "F2_01_AUTHORIZED_IN_DEVELOPMENT") {
    assertProcessOutcome(evidence.processOutcome, 1);
    assert.equal(evidence.report.execution.semanticTests.find(({ name }) => name === transition.f201.expectedDevelopmentRed.testName)?.status, "FAIL", "contracted semantic RED test did not fail");
    const overflowCount = evidence.report.observations.filter((entry) => entry.overflow).length;
    const smallTargetObservationCount = evidence.report.observations.filter((entry) => entry.smallTargets?.length).length;
    const offViewportDrawerCount = evidence.report.menuResults.filter((entry) => entry.open && !entry.open.drawerInside).length;
    const menuFailureCount = evidence.report.menuResults.filter(menuFailure).length;
    assert.ok(overflowCount >= transition.f201.expectedDevelopmentRed.minimumOverflowCount, "semantic RED lacks overflow evidence");
    assert.ok(smallTargetObservationCount >= transition.f201.expectedDevelopmentRed.minimumSmallTargetObservationCount, "semantic RED lacks undersized target evidence");
    assert.ok(offViewportDrawerCount >= transition.f201.expectedDevelopmentRed.minimumOffViewportDrawerCount, "semantic RED lacks drawer outside viewport evidence");
    assert.ok(menuFailureCount >= transition.f201.expectedDevelopmentRed.minimumMenuFailureCount, "semantic RED lacks menu behavior evidence");
    return transition.status;
  }
  const authoritySha = evidence.authoritySha;
  assertProcessOutcome(evidence.processOutcome, 0);
  assert.match(authoritySha ?? "", shaPattern, "integrated authority sha is absent or malformed");
  assert.ok(evidence.report.execution.semanticTests.every(({ status }) => status === "PASS"), "semantic RED cannot produce integrated state");
  assert.ok(evidence.report.observations.every((entry) => !entry.overflow && (Number(entry.viewport.split("x")[0]) > 768 || !(entry.smallTargets?.length))), "integrated report is not GREEN");
  assert.ok(evidence.report.menuResults.every((entry) => !menuFailure(entry)), "integrated menu report is not GREEN");
  assert.equal(evidence.report.reducedMotion?.matches, true, "integrated reduced-motion evidence is absent");
  assert.ok(evidence.report.reducedMotion.durationsMs.every((duration) => duration <= 1), "integrated reduced-motion evidence is RED");
  for (const browser of transition.f201.requiredBrowsers) assert.equal(evidence.browsers?.[browser], "VERIFIED", `mandatory browser not verified: ${browser}`);
  assert.ok(evidence.liveDiff, "live diff absent");
  assert.equal(evidence.liveDiff.complete, true, "live diff incomplete");
  assert.equal(evidence.liveDiff.authoritySha, authoritySha, "live diff head mismatch");
  assert.ok(Array.isArray(evidence.liveDiff.paths) && evidence.liveDiff.paths.length > 0 && evidence.liveDiff.paths.every((path) => /^(?:[^/]+\.html|src\/(?:css|js)\/)/.test(path)), "live diff paths are absent or outside F2-01");
  assert.ok(evidence.approval, "approval absent");
  assert.equal(evidence.approval.decision, "APPROVED", "approval decision is not APPROVED");
  assert.equal(evidence.approval.independent, true, "approval is not independent");
  assert.equal(evidence.approval.authoritySha, authoritySha, "approval head mismatch");
  const reportWithoutExecution = structuredClone(evidence.report);
  delete reportWithoutExecution.execution;
  assert.deepEqual(reportWithoutExecution, evidence.targetBaseline, "baseline mismatch with integrated report");
  return transition.status;
}

function jpegDimensions(buffer) {
  assert.equal(buffer.subarray(0, 2).toString("hex"), "ffd8", "evidence must be JPEG");
  let offset = 2;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (sof.has(marker)) return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    offset += 2 + length;
  }
  assert.fail("JPEG evidence has no size marker");
}

test("the offline audit contract is complete and production-safe", async () => {
  const contract = await readJson(contractPath);

  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.repository, "branctstudio-rgb/sitebranct");
  assert.equal(contract.baseSha, "da8800cd7669f66a82cbf9cd2e4f22fa99d59320");
  assert.equal(contract.productionMutationAllowed, false);
  assert.equal(contract.liveIntegrationsAllowed, false);
  assert.equal(contract.mergeAllowed, false);
  assert.equal(contract.deployWorkflowMutable, false);

  assert.deepEqual(contract.requiredViewports, [
    "1440x900",
    "1024x768",
    "768x1024",
    "390x844",
    "360x800",
  ]);

  assert.ok(contract.routes.length >= 11);
  assert.ok(contract.auditDomains.includes("accessibility"));
  assert.ok(contract.auditDomains.includes("performance"));
  assert.ok(contract.auditDomains.includes("seo"));
  assert.ok(contract.auditDomains.includes("responsive"));
  assert.ok(contract.auditDomains.includes("motion"));

  for (const route of contract.routes) {
    const html = await readFile(new URL(`../../${route}`, import.meta.url), "utf8");
    assert.match(html, /<title>[^<]+<\/title>/i, `${route} must have a title`);
    assert.equal((html.match(/<h1\b/gi) ?? []).length, 1, `${route} must have one H1`);
    if (route !== "styleguide.html") {
      assert.match(html, /<meta\s+name=["']description["']/i, `${route} must have a description`);
      assert.match(html, /<link\s+rel=["']canonical["']/i, `${route} must have a canonical`);
    }
  }
});

test("F2-GOV-06 transition contract exists before live F2-01 work is admitted", async () => {
  const transition = await readJson(f201TransitionPath);
  const repository = normalize(new URL("../../", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
  const authoritySha = resolveAuthoritySha(transition);
  assert.equal(transition.schemaVersion, 1);
  assert.equal(transition.status, transition.stateMachine.current);
  assert.deepEqual(transition.historicalPhase1, { status: "HISTORICAL_FROZEN", ...immutableF201Pins.historicalPhase1 });
  assert.deepEqual({ path: transition.f201.responsiveTest.path, gitBlobOid: transition.f201.responsiveTest.gitBlobOid, sha256: transition.f201.responsiveTest.copiedSha256 }, immutableF201Pins.responsiveTest);
  assert.deepEqual({ path: transition.f201.targetBaseline.path, gitBlobOid: transition.f201.targetBaseline.gitBlobOid, sha256: transition.f201.targetBaseline.sha256 }, immutableF201Pins.targetBaseline);
  readAuthoritativeGitBlob(repository, transition.historicalPhase1.authoritySha, immutableF201Pins.historicalPhase1);
  readAuthoritativeGitBlob(repository, authoritySha, immutableF201Pins.responsiveTest);
  readAuthoritativeGitBlob(repository, authoritySha, immutableF201Pins.targetBaseline);
  if (transition.status === "PHASE_1_HISTORICAL") {
    assert.equal(deriveF201State(transition, {}), "PHASE_1_HISTORICAL");
    return;
  }
  const reportDir = await mkdtemp(join(tmpdir(), "branct-f2-gov-06-"));
  const reportPath = join(reportDir, "report.json");
  let failure;
  const childEnvironment = { ...process.env, F2_01_REPORT_PATH:reportPath };
  delete childEnvironment.NODE_TEST_CONTEXT;
  try { execFileSync("node", ["--test", transition.f201.responsiveTest.path], { encoding:"utf8", env:childEnvironment }); }
  catch (error) { failure = error; }
  try {
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    if (transition.status === "F2_01_AUTHORIZED_IN_DEVELOPMENT") {
      assert.ok(failure, "development state must prove the specific F2-01 RED");
      const processOutcome = { exited: true, timedOut: failure.killed === true, signal: failure.signal ?? null, exitCode: failure.status };
      assert.equal(deriveF201State(transition, { report, processOutcome }), "F2_01_AUTHORIZED_IN_DEVELOPMENT");
    } else {
      assert.equal(failure, undefined, "integrated state requires the responsive suite to finish GREEN");
      const integratedEvidence = await readJson(new URL(`../../${transition.stateMachine.integratedEvidencePath}`, import.meta.url));
      const targetBaseline = await readJson(new URL(`../../${transition.f201.targetBaseline.path}`, import.meta.url));
      const processOutcome = { exited: true, timedOut: false, signal: null, exitCode: 0 };
      assert.equal(deriveF201State(transition, { ...integratedEvidence, report, targetBaseline, authoritySha, processOutcome }), "F2_01_INTEGRATED_VERIFIED");
    }
  } finally { await rm(reportDir, { recursive:true, force:true }); }
});

test("F2-GOV-06 authority resolver rejects absent, malformed and contradictory PR identity", async () => {
  const transition = await readJson(f201TransitionPath);
  const directory = await mkdtemp(join(tmpdir(), "branct-f2-gov-06-event-"));
  const eventPath = join(directory, "event.json");
  const head = "1".repeat(40);
  try {
    await writeFile(eventPath, JSON.stringify({ pull_request: { head: { sha: head }, base: { sha: transition.baseSha } } }));
    assert.equal(resolveAuthoritySha(transition, { eventPath, explicit: "" }), head);
    assert.equal(resolveAuthoritySha(transition, { eventPath, explicit: head }), head);
    assert.throws(() => resolveAuthoritySha(transition, { eventPath, explicit: "2".repeat(40) }), /differs from event head/i);
    assert.throws(() => resolveAuthoritySha(transition, { explicit: "HEAD", eventPath: "" }), /malformed/i);
    assert.throws(() => resolveAuthoritySha(transition, { explicit: "", eventPath: "" }), /absent/i);
    await writeFile(eventPath, "{");
    assert.throws(() => resolveAuthoritySha(transition, { eventPath, explicit: "" }), /unreadable or malformed/i);
    await writeFile(eventPath, JSON.stringify({ pull_request: { head: { sha: head }, base: { sha: "2".repeat(40) } } }));
    assert.throws(() => resolveAuthoritySha(transition, { eventPath, explicit: "" }), /base sha differs/i);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

const semanticTestNames = [
  "F2-01 matrix has zero overflow and no undersized non-inline targets",
  "F2-01 mobile menu is modal, bounded and closes through every contracted path",
  "F2-01 mobile navigation honors reduced motion",
  "F2-01 responsive report validator rejects every contracted regression",
];

const completeExecution = (statuses) => ({
  complete: true,
  infrastructureErrors: [],
  semanticTests: semanticTestNames.map((name) => ({ name, status: statuses[name] ?? "PASS" })),
});

const developmentReportFrom = (baseline) => {
  const report = structuredClone(baseline);
  report.observations[0].overflow = true;
  report.observations[0].scrollWidth = report.observations[0].clientWidth + 1;
  report.observations[0].smallTargets = [{ selector: ".fixture", width: 43, height: 43 }];
  report.menuResults[0].open.drawerInside = false;
  report.execution = completeExecution({
    [semanticTestNames[0]]: "FAIL",
    [semanticTestNames[1]]: "FAIL",
  });
  return report;
};

test("F2-GOV-06 rejects incomplete execution before classifying a development RED", async (t) => {
  const [transition, baseline] = await Promise.all([readJson(f201TransitionPath), readJson(new URL("../../fixtures/audit/f2-01-baseline-results.json", import.meta.url))]);
  const valid = { report: developmentReportFrom(baseline), processOutcome: { exited: true, timedOut: false, signal: null, exitCode: 1 } };
  assert.equal(deriveF201State(transition, valid), "F2_01_AUTHORIZED_IN_DEVELOPMENT");
  const cases = [
    ["timeout", (value) => { value.processOutcome.timedOut = true; }, /timeout/i],
    ["process error", (value) => { value.processOutcome.exitCode = 2; }, /process error/i],
    ["premature exit", (value) => { value.processOutcome.exited = false; }, /prematurely/i],
    ["truncated report", (value) => { value.report.observations.pop(); }, /truncated report/i],
    ["semantic test not executed", (value) => { value.report.execution.semanticTests.pop(); }, /semantic test set/i],
    ["incomplete menu count", (value) => { value.report.menuResults.pop(); }, /menu result count/i],
    ["duplicate observation", (value) => { value.report.observations[1] = structuredClone(value.report.observations[0]); }, /observation matrix.*duplicate/i],
    ["required evidence absent", (value) => { delete value.report.reducedMotion; }, /required evidence absent/i],
  ];
  for (const [label, mutate, expected] of cases) await t.test(label, () => {
    const value = structuredClone(valid);
    mutate(value);
    assert.throws(() => deriveF201State(transition, value), expected);
  });
});

test("F2-GOV-06 derives integrated state only from complete coherent approved GREEN", async (t) => {
  const [transitionSource, baseline] = await Promise.all([readJson(f201TransitionPath), readJson(new URL("../../fixtures/audit/f2-01-baseline-results.json", import.meta.url))]);
  const transition = structuredClone(transitionSource);
  transition.status = "F2_01_INTEGRATED_VERIFIED";
  transition.stateMachine.current = "F2_01_INTEGRATED_VERIFIED";
  transition.stateMachine.previous = "F2_01_AUTHORIZED_IN_DEVELOPMENT";
  const authoritySha = "1111111111111111111111111111111111111111";
  const evidence = {
    report: { ...structuredClone(baseline), execution: completeExecution({}) },
    processOutcome: { exited: true, timedOut: false, signal: null, exitCode: 0 },
    targetBaseline: baseline,
    authoritySha,
    liveDiff: { complete: true, authoritySha, paths: ["src/css/branct.css"] },
    approval: { decision: "APPROVED", authoritySha, independent: true },
    browsers: { chromium: "VERIFIED", firefox: "NOT_REQUIRED", webkit: "NOT_REQUIRED" },
  };
  const historical = structuredClone(transitionSource);
  historical.status = "PHASE_1_HISTORICAL";
  historical.stateMachine.current = "PHASE_1_HISTORICAL";
  historical.stateMachine.previous = null;
  assert.equal(deriveF201State(historical, {}), "PHASE_1_HISTORICAL");
  assert.equal(deriveF201State(transition, evidence), "F2_01_INTEGRATED_VERIFIED");
  const cases = [
    ["approval absent", (value) => { delete value.approval; }],
    ["approval head mismatch", (value) => { value.approval.authoritySha = "2222222222222222222222222222222222222222"; }],
    ["mandatory browser not verified", (value) => { value.browsers.chromium = "NOT_VERIFIED"; }],
    ["semantic RED", (value) => { value.report.execution.semanticTests[0].status = "FAIL"; }],
    ["baseline mismatch", (value) => { value.report.observations[0].scrollWidth += 1; }],
    ["live diff absent", (value) => { delete value.liveDiff; }],
    ["live diff head mismatch", (value) => { value.liveDiff.authoritySha = "2222222222222222222222222222222222222222"; }],
    ["report truncated", (value) => { value.report.observations.pop(); }],
    ["report absent", (value) => { delete value.report; }],
    ["approval decision", (value) => { value.approval.decision = "CHANGES_REQUIRED"; }],
    ["browser evidence absent", (value) => { delete value.browsers; }],
  ];
  for (const [label, mutate] of cases) await t.test(label, () => {
    const value = structuredClone(evidence);
    mutate(value);
    assert.throws(() => deriveF201State(transition, value), new RegExp(label.split(" ")[0], "i"));
  });
  for (const [label, mutate] of [
    ["state absent", (value) => { delete value.status; }],
    ["state unknown", (value) => { value.status = "UNKNOWN"; }],
    ["state inverted", (value) => { value.stateMachine.previous = "F2_01_INTEGRATED_VERIFIED"; }],
  ]) await t.test(label, () => {
    const value = structuredClone(transition);
    mutate(value);
    assert.throws(() => deriveF201State(value, evidence), /state/i);
  });
});

test("F2-GOV-06 authoritative blob reader is immutable across checkout EOL and HEAD movement", async (t) => {
  const repository = await mkdtemp(join(tmpdir(), "branct-f2-gov-06-git-"));
  const git = (...args) => execFileSync("git", args, { cwd: repository, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    git("init", "--initial-branch=main");
    git("config", "user.name", "F2 GOV test");
    git("config", "user.email", "f2-gov@example.invalid");
    await writeFile(join(repository, ".gitattributes"), "fixture.txt text eol=lf\n");
    await writeFile(join(repository, "fixture.txt"), "alpha\nbeta\ngamma\n");
    git("add", "--", ".gitattributes", "fixture.txt");
    git("commit", "-m", "authoritative fixture");
    const authoritySha = git("rev-parse", "HEAD");
    const blobOid = git("rev-parse", `${authoritySha}:fixture.txt`);
    const sha256 = hashBytes(Buffer.from("alpha\nbeta\ngamma\n"));
    const expected = { path: "fixture.txt", gitBlobOid: blobOid, sha256 };
    assert.equal(hashBytes(readAuthoritativeGitBlob(repository, authoritySha, expected)), sha256);
    await writeFile(join(repository, "fixture.txt"), "alpha\r\nbeta\r\ngamma\r\n");
    assert.equal(hashBytes(readAuthoritativeGitBlob(repository, authoritySha, expected)), sha256, "checkout CRLF must not change the authoritative blob");
    const variants = [
      ["content modified", "alpha\nbeta changed\ngamma\n"],
      ["line removed", "alpha\ngamma\n"],
      ["lines reordered", "beta\nalpha\ngamma\n"],
      ["space added", "alpha \nbeta\ngamma\n"],
    ];
    for (const [label, content] of variants) await t.test(label, async () => {
      await writeFile(join(repository, "fixture.txt"), content);
      git("add", "--", "fixture.txt");
      git("commit", "-m", label);
      const changedSha = git("rev-parse", "HEAD");
      assert.throws(() => readAuthoritativeGitBlob(repository, changedSha, expected), /blob oid mismatch/i);
      assert.equal(hashBytes(readAuthoritativeGitBlob(repository, authoritySha, expected)), sha256, "moving HEAD must not move the authority");
    });
    const syntheticTree = git("write-tree");
    const syntheticMerge = execFileSync("git", ["commit-tree", syntheticTree, "-p", authoritySha, "-p", git("rev-parse", "HEAD")], { cwd: repository, input: "synthetic merge\n", encoding: "utf8" }).trim();
    git("update-ref", "HEAD", syntheticMerge);
    assert.equal(hashBytes(readAuthoritativeGitBlob(repository, authoritySha, expected)), sha256, "synthetic merge HEAD must not replace the explicit authority");
    assert.throws(() => readAuthoritativeGitBlob(repository, syntheticMerge, expected), /blob oid mismatch/i);
    await unlink(join(repository, "fixture.txt"));
    git("add", "--", "fixture.txt");
    git("commit", "-m", "remove fixture");
    assert.throws(() => readAuthoritativeGitBlob(repository, git("rev-parse", "HEAD"), expected), /missing authoritative path/i);
    for (const invalid of [undefined, "", "HEAD", "abc", "f".repeat(40)]) assert.throws(() => readAuthoritativeGitBlob(repository, invalid, expected), /authority sha/i);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});

test("the audited diff cannot mutate live pages or deployment", async () => {
  const contract = await readJson(contractPath);
  const diffBase = process.env.AUDIT_DIFF_BASE ?? contract.baseSha;
  const changed = execFileSync("git", ["diff", "--name-only", diffBase], { encoding: "utf8" })
    .trim().split(/\r?\n/).filter(Boolean);
  const allowed = /^(CLAUDE\.md$|docs\/audit\/|fixtures\/audit\/|tests\/audit\/|\.github\/workflows\/(audit-offline|universal-pr-gate|gate-integrity-sentinel)\.yml$|scripts\/governance\/)/;
  assert.ok(changed.length > 0);
  assert.deepEqual(changed.filter((path) => !allowed.test(path)), []);
  assert.ok(!changed.includes(".github/workflows/deploy.yml"));
});

await import("./phase-2-governance.test.mjs");
await import("./f2-gov-01.test.mjs");
await import("./f2-gov-02a.test.mjs");
await import("./f2-gov-02c.test.mjs");

test("route matrix and visual evidence are complete and tamper-evident", async () => {
  const [contract, results, manifest, negativeControl] = await Promise.all([
    readJson(contractPath), readJson(resultsPath), readJson(manifestPath), readJson(negativeControlPath),
  ]);
  assert.equal(results.entries.length, contract.routes.length * contract.requiredViewports.length);
  for (const route of contract.routes) {
    for (const viewport of contract.requiredViewports) {
      assert.equal(results.entries.filter((entry) => entry.route === route && entry.viewport === viewport).length, 1);
    }
  }
  assert.equal(manifest.files.length, 13);
  const actualFiles = (await readdir(new URL("../../docs/audit/evidence/baseline/", import.meta.url)))
    .filter((name) => name !== ".gitkeep").sort();
  assert.deepEqual(actualFiles, manifest.files.map((item) => item.file).sort(), "manifest must list the exact unique evidence set");
  for (const item of manifest.files) {
    const url = new URL(`../../docs/audit/evidence/baseline/${item.file}`, import.meta.url);
    const bytes = await readFile(url);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), item.sha256);
    assert.deepEqual(jpegDimensions(bytes), { width: item.width, height: item.height });
  }
  const negativeBytes = await readFile(new URL(`../../fixtures/audit/${negativeControl.file}`, import.meta.url));
  assert.equal(negativeControl.expected, "reject");
  assert.equal(createHash("sha256").update(negativeBytes).digest("hex"), negativeControl.sha256);
  assert.deepEqual(jpegDimensions(negativeBytes), { width: negativeControl.width, height: negativeControl.height });
});

test("the audit handoff and CI preserve the offline boundary", async () => {
  const [audit, roadmap, risks, workflow, redGreen, collector] = await Promise.all([
    readFile(auditPath, "utf8"),
    readFile(roadmapPath, "utf8"),
    readFile(riskPath, "utf8"),
    readFile(workflowPath, "utf8"),
    readFile(redGreenPath, "utf8"),
    readFile(collectorPath, "utf8"),
  ]);

  assert.match(audit, /da8800cd7669f66a82cbf9cd2e4f22fa99d59320/);
  assert.match(audit, /390x844/);
  assert.match(roadmap, /A BRANCT/);
  assert.match(risks, /rollback/i);
  assert.match(workflow, /node --test tests\/audit/);
  assert.match(workflow, /paths:/);
  assert.match(workflow, /AUDIT_DIFF_BASE/);
  assert.doesNotMatch(workflow, /github\.head_ref|agent\/phase-1-offline-audit/);
  assert.match(workflow, /34e114876b0b11c390a56381ad16ebd13914f8d5/);
  assert.match(workflow, /49933ea5288caeca8642d1e84afbd3f7d6820020/);
  assert.doesNotMatch(workflow, /FTP_PASSWORD|lftp/i);
  assert.match(redGreen, /ENOENT/);
  assert.match(redGreen, /GREEN/);
  assert.match(collector, /Emulation\.setDeviceMetricsOverride/);
  assert.match(collector, /targetsUnder44/);
  assert.match(workflow, /collect-browser-baseline\.mjs/);
  assert.match(workflow, /check-visual-evidence\.mjs/);
});

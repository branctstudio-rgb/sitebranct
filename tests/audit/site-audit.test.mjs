import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import test from "node:test";
import { validateReadyBaseline as validateReadyBaselineGuard } from "../../scripts/governance/verify-f2-01-readiness.mjs";

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
const f201RuntimePath = new URL("../../fixtures/audit/f2-01-ci-runtime.json", import.meta.url);
const f201BaselineV3Path = new URL("../../fixtures/audit/f2-01-baseline-results-v3.json", import.meta.url);
const f2Gov07FixturePath = new URL("../../fixtures/audit/f2-gov-07-multiengine-fixture.json", import.meta.url);

const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));
const hashBytes = (value) => createHash("sha256").update(value).digest("hex");
const shaPattern = /^[0-9a-f]{40}$/;
const blobPattern = /^[0-9a-f]{40,64}$/;

const immutableF201Pins = Object.freeze({
  historicalPhase1: Object.freeze({ path: "fixtures/audit/baseline-results.json", authoritySha: "a47abb9a43248320dfef8449b6a65e187913fd24", gitBlobOid: "2831b40a6ff7976c235f2c1d98832186979921fe", sha256: "6e4be577073d0fe7b665559acf371ee279a815f8b407702dcbc9c697d7c71eae" }),
  responsiveTest: Object.freeze({ path: "tests/audit/f2-01-responsive.test.mjs", gitBlobOid: "49a9fc3e5e1a98fc595f4ac6842e29b2e20fb1f6", sha256: "986fc138dda7340031f6e90a4a8b2d3394e943e2a40540cfeb6d06bf379b7a4f" }),
  targetBaseline: Object.freeze({ path: "fixtures/audit/f2-01-baseline-results-v3.json", schemaVersion: 3, conclusion: "CONCLUSIVE", gitBlobOid: "525160c6c7b31d3d94e18acb51fcb1802805661f", sha256: "aa7f45b55060fd7785ceb13dac59ba580790b7bf0e9015f69dae237b0cc0b8b5" }),
  previousTargetBaseline: Object.freeze({ status: "SUPERSEDED_IMMUTABLE_V2", path: "fixtures/audit/f2-01-baseline-results.json", schemaVersion: 1, gitBlobOid: "2cb98083ad0fb4a55511d9e2c5114bab4999b8c8", sha256: "5cdbfb290a975c26511479d8d8b28ee793eb83ebe88a47dde4333a5e3e8aafab" }),
  menuEvidenceMatrix: Object.freeze({
    path: "fixtures/audit/f2-01-menu-evidence-matrix.json",
    canonicalization: "UTF-8 JSON.stringify([{evidenceId,route,viewport,actionPhases,developmentSemanticStatus,developmentResult,developmentResultSha256}]) with fixed key order",
    identityAlgorithm: "sha256(JSON.stringify({route,viewport,actionPhases}))",
    resultBindingAlgorithm: "sha256(JSON.stringify({evidenceId,route,viewport,actionSequence,semanticStatus,measuredResult}))",
    digestAlgorithm: "sha256",
    sha256: "0a7ef81ed646e50fd760b04562bb7f2f31d9b60b414fd790f289ee43d8d1db72",
    evidenceCount: 41,
    actionCount: 184,
  }),
});
const canonicalF201Viewports = Object.freeze({
  "320x568": [320, 568],
  "360x800": [360, 800],
  "390x844": [390, 844],
  "412x915": [412, 915],
  "768x1024": [768, 1024],
  "1024x768": [1024, 768],
  "1440x900": [1440, 900],
});
const canonicalDevelopmentRedVector = Object.freeze({
  "F2-01 matrix has zero overflow and no undersized non-inline targets": "FAIL",
  "F2-01 mobile menu is modal, bounded and closes through every contracted path": "FAIL",
  "F2-01 mobile navigation honors reduced motion": "PASS",
  "F2-01 responsive report validator rejects every contracted regression": "PASS",
});
const contractedActionPhases = (route) => ["before-open", "open", "after-open", "escape-close", ...(route === "index.html" ? ["close-button-open", "close-button-close", "outside-open", "outside-close"] : [])];

const canonicalEvidenceTuple = ({ route, viewport, actionPhases }) => ({ route, viewport, actionPhases });
const canonicalEvidenceId = (entry) => `menu-${hashBytes(JSON.stringify(canonicalEvidenceTuple(entry)))}`;
const canonicalMenuMatrixBytes = (entries) => Buffer.from(JSON.stringify(entries.map(({ evidenceId, route, viewport, actionPhases, developmentSemanticStatus, developmentResult, developmentResultSha256 }) => ({ evidenceId, route, viewport, actionPhases, developmentSemanticStatus, developmentResult, developmentResultSha256 }))));
const canonicalActionSequence = ({ actionPhases }) => actionPhases.map((phase, sequence) => ({ sequence, phase, status: "COMPLETED" }));
const exactKeys = (value, keys, context) => {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${context} is absent or invalid`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${context} schema is divergent`);
};
const assertFiniteNumber = (value, context) => assert.ok(typeof value === "number" && Number.isFinite(value), `${context} must be a finite number`);
const canonicalMeasuredResult = (value, context) => {
  exactKeys(value, ["focusReached", "focusStyle", "open", "closed", "closeButtonClosed", "outsideClosed"], context);
  assert.equal(typeof value.focusReached, "boolean", `${context}.focusReached must be boolean`);
  exactKeys(value.focusStyle, ["visible", "style", "width"], `${context}.focusStyle`);
  assert.equal(typeof value.focusStyle.visible, "boolean", `${context}.focusStyle.visible must be boolean`);
  assert.equal(typeof value.focusStyle.style, "string", `${context}.focusStyle.style must be string`);
  assertFiniteNumber(value.focusStyle.width, `${context}.focusStyle.width`);
  exactKeys(value.open, ["expanded", "drawerInside", "focusInside", "bodyLocked", "backgroundInert", "closeTarget"], `${context}.open`);
  assert.equal(typeof value.open.expanded, "string", `${context}.open.expanded must be string`);
  for (const name of ["drawerInside", "focusInside", "bodyLocked", "backgroundInert"]) assert.equal(typeof value.open[name], "boolean", `${context}.open.${name} must be boolean`);
  if (value.open.closeTarget !== null) {
    exactKeys(value.open.closeTarget, ["x", "y", "name"], `${context}.open.closeTarget`);
    assertFiniteNumber(value.open.closeTarget.x, `${context}.open.closeTarget.x`);
    assertFiniteNumber(value.open.closeTarget.y, `${context}.open.closeTarget.y`);
    assert.equal(typeof value.open.closeTarget.name, "string", `${context}.open.closeTarget.name must be string`);
  }
  exactKeys(value.closed, ["expanded", "focusReturned", "backgroundRestored", "closed"], `${context}.closed`);
  assert.equal(typeof value.closed.expanded, "string", `${context}.closed.expanded must be string`);
  for (const name of ["focusReturned", "backgroundRestored", "closed"]) assert.equal(typeof value.closed[name], "boolean", `${context}.closed.${name} must be boolean`);
  assert.equal(typeof value.closeButtonClosed, "boolean", `${context}.closeButtonClosed must be boolean`);
  assert.equal(typeof value.outsideClosed, "boolean", `${context}.outsideClosed must be boolean`);
  return {
    focusReached: value.focusReached,
    focusStyle: { visible: value.focusStyle.visible, style: value.focusStyle.style, width: value.focusStyle.width },
    open: {
      expanded: value.open.expanded,
      drawerInside: value.open.drawerInside,
      focusInside: value.open.focusInside,
      bodyLocked: value.open.bodyLocked,
      backgroundInert: value.open.backgroundInert,
      closeTarget: value.open.closeTarget === null ? null : { x: value.open.closeTarget.x, y: value.open.closeTarget.y, name: value.open.closeTarget.name },
    },
    closed: { expanded: value.closed.expanded, focusReturned: value.closed.focusReturned, backgroundRestored: value.closed.backgroundRestored, closed: value.closed.closed },
    closeButtonClosed: value.closeButtonClosed,
    outsideClosed: value.outsideClosed,
  };
};
const measuredResultFromReport = (entry) => {
  exactKeys(entry, ["evidenceId", "route", "viewport", "focusReached", "focusStyle", "open", "closed", "closeButtonClosed", "outsideClosed"], `canonical menu evidence result ${entry?.route ?? "unknown"} ${entry?.viewport ?? "unknown"}`);
  return canonicalMeasuredResult({
    focusReached: entry.focusReached,
    focusStyle: entry.focusStyle,
    open: entry.open,
    closed: entry.closed,
    closeButtonClosed: entry.closeButtonClosed,
    outsideClosed: entry.outsideClosed,
  }, `canonical menu evidence measured payload ${entry.route} ${entry.viewport}`);
};
const canonicalResultEnvelope = (entry, measuredResult, semanticStatus) => ({
  evidenceId: entry.evidenceId,
  route: entry.route,
  viewport: entry.viewport,
  actionSequence: canonicalActionSequence(entry),
  semanticStatus,
  measuredResult,
});
const canonicalResultDigest = (entry, measuredResult, semanticStatus) => hashBytes(JSON.stringify(canonicalResultEnvelope(entry, measuredResult, semanticStatus)));

function validateCanonicalMenuEvidenceMatrixText(reference, text) {
  assert.equal(typeof text, "string", "canonical menu evidence matrix bytes are absent or unreadable");
  let matrix;
  try { matrix = JSON.parse(text); }
  catch { assert.fail("canonical menu evidence matrix bytes are malformed"); }
  assert.deepEqual(Object.keys(matrix).sort(), ["actionCount", "canonicalization", "digestAlgorithm", "entries", "evidenceCount", "identityAlgorithm", "resultBindingAlgorithm", "schemaVersion", "sha256"].sort(), "canonical menu evidence matrix schema is divergent");
  assert.equal(matrix.schemaVersion, 2, "canonical menu evidence matrix schema version is divergent");
  assert.equal(matrix.canonicalization, reference.canonicalization, "canonical menu evidence matrix canonicalization is divergent");
  assert.equal(matrix.identityAlgorithm, reference.identityAlgorithm, "canonical menu evidence matrix identity algorithm is divergent");
  assert.equal(matrix.resultBindingAlgorithm, reference.resultBindingAlgorithm, "canonical menu evidence result binding algorithm is divergent");
  assert.equal(matrix.digestAlgorithm, "sha256", "canonical menu evidence matrix digest algorithm is divergent");
  assert.ok(Array.isArray(matrix.entries), "canonical menu evidence matrix entries are absent");
  assert.equal(matrix.entries.length, reference.evidenceCount, "canonical menu evidence matrix cardinality is divergent");
  for (const entry of matrix.entries) {
    assert.deepEqual(Object.keys(entry).sort(), ["actionPhases", "developmentResult", "developmentResultSha256", "developmentSemanticStatus", "evidenceId", "route", "viewport"].sort(), "canonical menu evidence matrix entry schema is divergent");
    assert.match(entry.route ?? "", /^[a-z0-9-]+\.html$/, `canonical menu evidence route is invalid: ${entry.route}`);
    assert.ok(Object.hasOwn(canonicalF201Viewports, entry.viewport), `canonical menu evidence viewport is invalid: ${entry.viewport}`);
    assert.ok(Array.isArray(entry.actionPhases) && entry.actionPhases.length > 0, `canonical menu evidence actions are absent: ${entry.route} ${entry.viewport}`);
    assert.deepEqual(entry.actionPhases, contractedActionPhases(entry.route), `canonical menu evidence actions are divergent: ${entry.route} ${entry.viewport}`);
    assert.equal(entry.evidenceId, canonicalEvidenceId(entry), `canonical menu evidence identity is divergent: ${entry.route} ${entry.viewport}`);
    assert.match(entry.developmentSemanticStatus ?? "", /^(PASS|FAIL)$/, `canonical menu evidence semantic status is invalid: ${entry.route} ${entry.viewport}`);
    const result = canonicalMeasuredResult(entry.developmentResult, `canonical menu evidence development result ${entry.route} ${entry.viewport}`);
    const derivedSemanticStatus = menuFailure(result) ? "FAIL" : "PASS";
    assert.equal(entry.developmentSemanticStatus, derivedSemanticStatus, `canonical menu evidence semantic status differs from measured result: ${entry.route} ${entry.viewport}`);
    assert.equal(entry.developmentResultSha256, canonicalResultDigest(entry, result, derivedSemanticStatus), `canonical menu evidence development result digest is divergent: ${entry.route} ${entry.viewport}`);
  }
  const tupleKeys = matrix.entries.map(({ route, viewport }) => `${route}\0${viewport}`);
  assert.equal(new Set(tupleKeys).size, matrix.entries.length, "canonical menu evidence matrix contains duplicate tuples");
  assert.equal(new Set(matrix.entries.map(({ evidenceId }) => evidenceId)).size, matrix.entries.length, "canonical menu evidence matrix contains duplicate identities");
  assert.equal(matrix.actionCount, matrix.entries.reduce((count, entry) => count + entry.actionPhases.length, 0), "canonical menu evidence action cardinality is divergent");
  assert.equal(matrix.actionCount, reference.actionCount, "canonical menu evidence action authority is divergent");
  const digest = hashBytes(canonicalMenuMatrixBytes(matrix.entries));
  assert.equal(matrix.sha256, digest, "canonical menu evidence matrix embedded digest is divergent");
  assert.equal(digest, reference.sha256, "canonical menu evidence matrix digest differs from authority");
  return matrix;
}

function readCanonicalMenuEvidenceMatrix(transition) {
  const reference = transition?.f201?.menuEvidenceMatrix;
  assert.ok(reference, "canonical menu evidence matrix authority is absent");
  assert.deepEqual(reference, immutableF201Pins.menuEvidenceMatrix, "canonical menu evidence matrix authority is divergent");
  let text;
  try { text = readFileSync(new URL(`../../${reference.path}`, import.meta.url), "utf8"); }
  catch { assert.fail(`canonical menu evidence matrix is absent or unreadable: ${reference.path}`); }
  return validateCanonicalMenuEvidenceMatrixText(reference, text);
}

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
    if (event?.pull_request) {
      eventHead = event.pull_request?.head?.sha;
      eventBase = event.pull_request?.base?.sha;
    } else {
      assert.equal(event?.ref, "refs/heads/main", "authority push event is not for main");
      assert.equal(event?.repository?.full_name, transition.repository, "authority push repository is divergent");
      eventHead = event?.after;
      eventBase = event?.before;
    }
    assert.match(eventHead ?? "", shaPattern, "authority event head sha is absent or malformed");
    assert.match(transition.authority?.pullRequestBaseSha ?? "", shaPattern, "authority pull request base sha is absent or malformed");
    assert.equal(eventBase, transition.authority.pullRequestBaseSha, "authority event base sha differs from the transition contract");
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

function assertCompleteDrawerActions(report, matrix) {
  const actions = report.execution?.actions;
  assert.ok(Array.isArray(actions), "drawer action completion set is absent");
  const expectedActions = matrix.entries.flatMap(({ evidenceId, route, viewport, actionPhases }) => actionPhases.map((phase) => ({ evidenceId, route, viewport, phase, status: "COMPLETED" })));
  assert.equal(actions.length, expectedActions.length, `canonical menu evidence action set cardinality differs: expected ${expectedActions.length}, got ${actions.length}`);
  for (const [index, action] of actions.entries()) {
    if (action.status === "TIMEOUT") assert.fail(`drawer action timeout cannot satisfy semantic RED: ${action.route} ${action.viewport} ${action.phase}`);
    assert.equal(action.status, "COMPLETED", `drawer action ${action.status ?? "unfinished"} cannot satisfy semantic RED: ${action.route} ${action.viewport} ${action.phase}`);
    exactKeys(action, ["evidenceId", "route", "viewport", "phase", "status"], `canonical menu evidence action ${index}`);
    assert.deepEqual(action, expectedActions[index], `canonical menu evidence action sequence or identity is divergent at index ${index}`);
  }
}

function assertCanonicalDevelopmentResultBindings(report, matrix) {
  for (const canonical of matrix.entries) {
    const matches = report.menuResults.filter(({ evidenceId }) => evidenceId === canonical.evidenceId);
    assert.equal(matches.length, 1, `canonical menu evidence measured result bijection differs for ${canonical.route} ${canonical.viewport}`);
    const measuredResult = measuredResultFromReport(matches[0]);
    const semanticStatus = menuFailure(measuredResult) ? "FAIL" : "PASS";
    assert.equal(semanticStatus, canonical.developmentSemanticStatus, `canonical menu evidence semantic result differs for ${canonical.route} ${canonical.viewport}`);
    assert.equal(canonicalResultDigest(canonical, measuredResult, semanticStatus), canonical.developmentResultSha256, `canonical menu evidence measured result is transplanted or divergent for ${canonical.route} ${canonical.viewport}`);
  }
}

function assertCompleteReport(transition, report, matrix) {
  assert.ok(report && typeof report === "object" && !Array.isArray(report), "report is absent or unreadable");
  assert.equal(Object.hasOwn(report, "expectedMenuEvidenceMatrix"), false, "canonical menu evidence matrix cannot be redefined by the report");
  assert.equal(Object.hasOwn(report, "menuEvidenceMatrix"), false, "canonical menu evidence matrix cannot be redefined by the report");
  assert.equal(report.schemaVersion, 2, "report schema is absent or invalid");
  assert.equal(report.source, transition.baseSha, "report source differs from the transition base");
  assert.ok(transition.f201.requiredBrowsers.includes(report.browser?.engine), "report browser engine evidence is absent or invalid");
  assert.match(report.browser?.version ?? "", /\d+\.\d+/, "report browser version evidence is absent or invalid");
  assert.deepEqual(report.viewports, transition.f201.matrix.viewports, "report viewport matrix is incomplete or divergent");
  for (const name of transition.f201.expectedDevelopmentRed.requiredEvidence) assert.ok(report[name] !== undefined && report[name] !== null, `required evidence absent: ${name}`);
  assert.equal(report.observations.length, transition.f201.targetBaseline.observationCount, `truncated report observation count: expected ${transition.f201.targetBaseline.observationCount}`);
  assert.equal(report.menuResults.length, matrix.evidenceCount, `canonical menu evidence bijection incomplete: expected ${matrix.evidenceCount}, got ${report.menuResults.length}`);
  const expectedObservationKeys = transition.f201.matrix.routes.flatMap((route) => Object.keys(transition.f201.matrix.viewports).map((viewport) => `${route}\0${viewport}`)).sort();
  const actualObservationKeys = report.observations.map(({ route, viewport }) => `${route}\0${viewport}`).sort();
  assert.deepEqual(actualObservationKeys, expectedObservationKeys, "report observation matrix contains missing, duplicate or unknown entries");
  assert.ok(report.observations.every((entry) => entry.conclusion === "CONCLUSIVE"), "inconclusive observation cannot satisfy transition evidence");
  const expectedMenuIds = matrix.entries.map(({ evidenceId }) => evidenceId).sort();
  const actualMenuIds = report.menuResults.map((entry) => {
    const canonical = matrix.entries.find(({ route, viewport }) => route === entry.route && viewport === entry.viewport);
    assert.ok(canonical, `canonical menu evidence tuple is unknown: ${entry.route} ${entry.viewport}`);
    const derivedId = canonicalEvidenceId(canonical);
    assert.equal(derivedId, canonical.evidenceId, `canonical menu evidence identity cannot be derived: ${entry.route} ${entry.viewport}`);
    assert.equal(entry.evidenceId, derivedId, `canonical menu evidence declared id is absent or differs from tuple: ${entry.route} ${entry.viewport}`);
    measuredResultFromReport(entry);
    return derivedId;
  }).sort();
  assert.deepEqual(actualMenuIds, expectedMenuIds, "canonical menu evidence bijection contains a missing, extra, duplicate or wrongly associated tuple");
  assertExactSemanticTestSet(report.execution);
  assertCompleteDrawerActions(report, matrix);
}

function assertProcessOutcome(outcome, expectedExitCode) {
  assert.ok(outcome && typeof outcome === "object", "process outcome is absent");
  assert.equal(outcome.exited, true, "process ended prematurely");
  assert.equal(outcome.timedOut, false, "process timeout cannot satisfy transition evidence");
  assert.equal(outcome.signal, null, `process signal cannot satisfy transition evidence: ${outcome.signal}`);
  assert.equal(outcome.exitCode, expectedExitCode, `process error exit code: expected ${expectedExitCode}, got ${outcome.exitCode}`);
}

function verifyIntegratedGitEvidence(transition, integration, options = {}) {
  const repository = options.repository;
  assert.ok(repository, "integrated Git repository is absent");
  assert.equal(transition.stateMachine.integrationAuthority, "GitHub push event for refs/heads/main plus the resolved refs/heads/main Git ref", "integrated main authority is divergent");
  const eventPath = options.mainEventPath;
  assert.ok(eventPath, "integrated main event path is absent");
  let event;
  try { event = JSON.parse(readFileSync(eventPath, "utf8")); }
  catch { assert.fail("integrated main event is absent, unreadable or malformed"); }
  assert.equal(event?.ref, "refs/heads/main", "integrated event is not for refs/heads/main");
  assert.equal(event?.repository?.full_name, transition.repository, "integrated event repository is divergent");
  assert.match(event?.before ?? "", shaPattern, "integrated event base sha is absent or malformed");
  assert.match(event?.after ?? "", shaPattern, "integrated event main sha is absent or malformed");
  exactKeys(integration, ["merged", "headSha", "treeSha", "validatedTreeSha"], "integrated Git evidence");
  assert.equal(integration.merged, true, "real merge not confirmed");
  for (const name of ["headSha", "treeSha", "validatedTreeSha"]) assert.match(integration[name] ?? "", shaPattern, `${name} is absent or malformed`);
  const git = (...args) => {
    try { return execFileSync("git", args, { cwd: repository, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
    catch { assert.fail(`integrated Git proof cannot resolve: git ${args.join(" ")}`); }
  };
  for (const sha of [event.after, event.before, integration.headSha]) git("cat-file", "-e", `${sha}^{commit}`);
  const mainRef = options.mainRef ?? "refs/remotes/origin/main";
  assert.equal(git("rev-parse", mainRef), event.after, "resolved canonical main ref differs from the GitHub push event");
  const [commit, ...parents] = git("rev-list", "--parents", "-n", "1", event.after).split(/\s+/);
  assert.equal(commit, event.after, "resolved merge commit differs from the GitHub main event");
  assert.deepEqual(parents, [event.before, integration.headSha], "merge parents do not prove a normal merge of the authorized head onto the sealed main base");
  const actualTree = git("rev-parse", `${event.after}^{tree}`);
  assert.equal(integration.treeSha, actualTree, "integrated tree differs from the real merge tree");
  assert.equal(integration.validatedTreeSha, actualTree, "validated tree differs from the real merge tree");
}

const menuFailure = ({ focusReached, focusStyle, open, closed, closeButtonClosed, outsideClosed }) =>
  !focusReached || !focusStyle?.visible || focusStyle.style === "none" || focusStyle.width < 2 ||
  open.expanded !== "true" || !open.drawerInside || !open.focusInside || !open.bodyLocked || !open.backgroundInert ||
  !open.closeTarget || open.closeTarget.x < 44 || open.closeTarget.y < 44 || !open.closeTarget.name ||
  closed.expanded !== "false" || !closed.focusReturned || !closed.backgroundRestored || !closed.closed ||
  !closeButtonClosed || !outsideClosed;

function validateStateMachine(transition) {
  const states = ["PHASE_1_HISTORICAL", "F2_01_AUTHORIZED_IN_DEVELOPMENT", "READY_FOR_VIA_A_REVIEW", "F2_01_INTEGRATED_VERIFIED"];
  assert.ok(transition.status, "state absent");
  assert.ok(states.includes(transition.status), `state unknown: ${transition.status}`);
  assert.deepEqual(transition.stateMachine.states, states, "state set is incomplete or reordered");
  assert.equal(transition.stateMachine.current, transition.status, "state current mismatch");
  const expectedPrevious = { PHASE_1_HISTORICAL: null, F2_01_AUTHORIZED_IN_DEVELOPMENT: "PHASE_1_HISTORICAL", READY_FOR_VIA_A_REVIEW: "F2_01_AUTHORIZED_IN_DEVELOPMENT", F2_01_INTEGRATED_VERIFIED: "READY_FOR_VIA_A_REVIEW" }[transition.status];
  assert.equal(transition.stateMachine.previous, expectedPrevious, "state transition is inverted or regressed");
  assert.deepEqual(transition.stateMachine.transitions, {
    PHASE_1_HISTORICAL: ["F2_01_AUTHORIZED_IN_DEVELOPMENT"],
    F2_01_AUTHORIZED_IN_DEVELOPMENT: ["READY_FOR_VIA_A_REVIEW"],
    READY_FOR_VIA_A_REVIEW: ["F2_01_INTEGRATED_VERIFIED"],
    F2_01_INTEGRATED_VERIFIED: [],
  }, "state transition graph is not closed");
  assert.ok(Array.isArray(transition.f201.requiredBrowsers) && transition.f201.requiredBrowsers.length > 0, "mandatory browser set is absent");
  assert.deepEqual(transition.f201.matrix.viewports, canonicalF201Viewports, "viewport contract is absent, malformed or divergent");
  assert.equal(transition.f201.targetBaseline.observationCount, transition.f201.matrix.routes.length * Object.keys(canonicalF201Viewports).length, "viewport observation cardinality is divergent");
  assert.deepEqual(transition.f201.expectedDevelopmentRed.semanticVector, canonicalDevelopmentRedVector, "semantic RED vector contract is divergent");
  assert.equal(transition.stateMachine.integrationAuthority, "GitHub push event for refs/heads/main plus the resolved refs/heads/main Git ref", "integrated main authority is absent or divergent");
  const matrix = readCanonicalMenuEvidenceMatrix(transition);
  assert.equal(transition.f201.targetBaseline.menuExerciseCount, matrix.evidenceCount, "canonical menu evidence count differs from target baseline");
  return matrix;
}

function deriveF201State(transition, evidence, options = {}) {
  const matrix = validateStateMachine(transition);
  if (transition.status === "PHASE_1_HISTORICAL") return transition.status;
  assertCompleteReport(transition, evidence.report, matrix);
  if (transition.status === "F2_01_AUTHORIZED_IN_DEVELOPMENT") {
    assertProcessOutcome(evidence.processOutcome, 1);
    assertCanonicalDevelopmentResultBindings(evidence.report, matrix);
    const actualVector = Object.fromEntries(evidence.report.execution.semanticTests.map(({ name, status }) => [name, status]));
    assert.deepEqual(actualVector, canonicalDevelopmentRedVector, "semantic RED vector differs from the exact contracted result");
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
  validateReadyBaselineGuard(evidence.report, evidence.targetBaseline);
  assert.equal(Object.hasOwn(evidence, "approval"), false, "offline evidence must not contain or simulate Via A approval");
  if (transition.status === "READY_FOR_VIA_A_REVIEW") return transition.status;
  assert.ok(evidence.integration, "real merge evidence absent");
  assert.equal(evidence.integration.headSha, authoritySha, "merged head differs from readiness authority");
  verifyIntegratedGitEvidence(transition, evidence.integration, options);
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
  assert.deepEqual({ path: transition.f201.targetBaseline.path, schemaVersion: transition.f201.targetBaseline.schemaVersion, conclusion: transition.f201.targetBaseline.conclusion, gitBlobOid: transition.f201.targetBaseline.gitBlobOid, sha256: transition.f201.targetBaseline.sha256 }, immutableF201Pins.targetBaseline);
  assert.deepEqual(transition.f201.previousTargetBaseline, immutableF201Pins.previousTargetBaseline);
  readAuthoritativeGitBlob(repository, transition.historicalPhase1.authoritySha, immutableF201Pins.historicalPhase1);
  readAuthoritativeGitBlob(repository, authoritySha, immutableF201Pins.responsiveTest);
  readAuthoritativeGitBlob(repository, authoritySha, immutableF201Pins.targetBaseline);
  if (transition.status === "PHASE_1_HISTORICAL") {
    assert.equal(deriveF201State(transition, {}), "PHASE_1_HISTORICAL");
    return;
  }
  const baseline = await readJson(new URL(`../../${transition.f201.previousTargetBaseline.path}`, import.meta.url));
  const report = developmentReportFrom(transition, baseline);
  assert.equal(deriveF201State(transition, { report, processOutcome: { exited: true, timedOut: false, signal: null, exitCode: 1 } }), "F2_01_AUTHORIZED_IN_DEVELOPMENT");
});

test("F2-01 readiness separates offline eligibility from Via A approval and requires three pinned engines", async () => {
  const transition = await readJson(f201TransitionPath);
  assert.deepEqual(transition.stateMachine.states, [
    "PHASE_1_HISTORICAL",
    "F2_01_AUTHORIZED_IN_DEVELOPMENT",
    "READY_FOR_VIA_A_REVIEW",
    "F2_01_INTEGRATED_VERIFIED",
  ]);
  assert.deepEqual(transition.f201.requiredBrowsers, ["chromium", "firefox", "webkit"]);
  assert.equal(transition.stateMachine.approvalAuthority, "GitHub Via A branch protection; never repository evidence");
  assert.equal(transition.stateMachine.readyEvidenceMustContainApproval, false);
  assert.equal(transition.stateMachine.integrationAuthority, "GitHub push event for refs/heads/main plus the resolved refs/heads/main Git ref");
  const runtime = await readJson(f201RuntimePath);
  assert.equal(runtime.playwright.version, "1.62.0");
  assert.deepEqual(runtime.playwright.engines, ["chromium", "firefox", "webkit"]);
  assert.match(runtime.container.indexDigest, /^sha256:[0-9a-f]{64}$/);
  assert.match(runtime.container.linuxAmd64Digest, /^sha256:[0-9a-f]{64}$/);
  const offlineWorkflow = await readFile(workflowPath, "utf8");
  assert.match(offlineWorkflow, /push:\s*\n\s+branches: \[main\]/, "post-integration verifier must run on a real main push");
  assert.match(offlineWorkflow, /AUDIT_DIFF_BASE: \$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.event\.before \}\}/, "main push must bind the sealed pre-merge base");
});

test("F2-01 runtime and engine evidence fail closed on omissions, drift and adulteration", async (t) => {
  const [{ validateRuntimeContract, validateEngineReport, validateReadyBaseline }, runtime, transition, packageJson, packageLock, baselineV3] = await Promise.all([
    import("../../scripts/governance/verify-f2-01-readiness.mjs"),
    readJson(f201RuntimePath),
    readJson(f201TransitionPath),
    readJson(new URL("../../package.json", import.meta.url)),
    readJson(new URL("../../package-lock.json", import.meta.url)),
    readJson(f201BaselineV3Path),
  ]);
  const browserRegistry = { browsers: runtime.playwright.engines.map((name) => ({ name, revision: runtime.playwright.browserBuilds[name].revision, browserVersion: runtime.playwright.browserBuilds[name].version })) };
  const valid = { runtime, transition, packageJson, packageLock, browserRegistry, ci: true, ciDigest: runtime.container.indexDigest };
  assert.doesNotThrow(() => validateRuntimeContract(valid));
  for (const [label, mutate, expected] of [
    ["Firefox absent", (value) => { value.runtime.playwright.engines = value.runtime.playwright.engines.filter((name) => name !== "firefox"); }, /engine set/i],
    ["WebKit absent", (value) => { value.runtime.playwright.engines = value.runtime.playwright.engines.filter((name) => name !== "webkit"); }, /engine set/i],
    ["engine omitted from transition", (value) => { value.transition.f201.requiredBrowsers.pop(); }, /browser set/i],
    ["Playwright version drift", (value) => { value.packageJson.devDependencies.playwright = "1.62.1"; }, /version/i],
    ["container digest drift", (value) => { value.ciDigest = `sha256:${"0".repeat(64)}`; }, /container digest/i],
    ["container digest malformed", (value) => { value.runtime.container.indexDigest = "latest"; }, /digest/i],
  ]) await t.test(label, () => {
    const value = structuredClone(valid);
    mutate(value);
    assert.throws(() => validateRuntimeContract(value), expected);
  });
  const baseline = await readJson(new URL("../../fixtures/audit/f2-01-baseline-results.json", import.meta.url));
  const report = developmentReportFrom(transition, baseline);
  report.browser = { engine: "firefox", version: runtime.playwright.browserBuilds.firefox.version };
  assert.doesNotThrow(() => validateEngineReport(runtime, report, "firefox", { baseline: baselineV3, requireGreen: false }));
  for (const [label, mutate, expected] of [
    ["engine identity adulterated", (value) => { value.browser.engine = "chromium"; }, /engine evidence/i],
    ["result incomplete", (value) => { value.observations.pop(); }, /observation evidence incomplete/i],
    ["menu evidence omitted", (value) => { value.menuResults.pop(); }, /menu evidence incomplete/i],
    ["action evidence omitted", (value) => { value.execution.actions.pop(); }, /action evidence incomplete/i],
    ["execution ignored", (value) => { value.execution.complete = false; }, /execution incomplete/i],
    ["infrastructure substituted", (value) => { value.execution.infrastructureErrors = ["browser missing"]; }, /infrastructure failure/i],
    ["cardinality-only empty observations", (value) => { value.observations = Array.from({ length: 84 }, () => ({})); }, /observation.*(?:inconclusive|bijection)/i],
    ["canonical result transplanted", (value) => { const first = value.menuResults[0]; const second = value.menuResults[1]; value.menuResults[0] = { ...first, focusReached: second.focusReached, focusStyle: second.focusStyle, open: second.open, closed: second.closed, closeButtonClosed: second.closeButtonClosed, outsideClosed: second.outsideClosed }; }, /transplanted|divergent/i],
    ["action tuple copied", (value) => { value.execution.actions[1] = structuredClone(value.execution.actions[0]); }, /action tuple/i],
  ]) await t.test(label, () => {
    const value = structuredClone(report);
    mutate(value);
    assert.throws(() => validateEngineReport(runtime, value, "firefox", { baseline: baselineV3, requireGreen: false }), expected);
  });
  const greenReport = reportForRequiredMatrix(transition, baseline);
  const canonicalMatrix = readCanonicalMenuEvidenceMatrix(transition);
  greenReport.browser = { engine: "firefox", version: runtime.playwright.browserBuilds.firefox.version };
  greenReport.menuResults = baseline.menuResults.map((entry) => ({ evidenceId: canonicalMatrix.entries.find(({ route, viewport }) => route === entry.route && viewport === entry.viewport).evidenceId, ...structuredClone(entry) }));
  greenReport.execution = completeExecution({});
  greenReport.execution.actions = completeActionsFor(transition);
  assert.doesNotThrow(() => validateReadyBaseline(greenReport, baselineV3));
  const webkitSemanticTwin = structuredClone(greenReport);
  webkitSemanticTwin.browser = { engine: "webkit", version: runtime.playwright.browserBuilds.webkit.version };
  assert.doesNotThrow(() => validateReadyBaseline(webkitSemanticTwin, baselineV3), "engine metadata must remain outside the shared semantic baseline");
  for (const [label, mutate] of [
    ["READY observation transplanted", (value) => { value.observations[0] = structuredClone(value.observations[1]); }],
    ["READY menu result adulterated", (value) => { value.menuResults[0].open.drawerInside = false; }],
    ["READY evidence omitted", (value) => { value.menuResults.pop(); }],
    ["READY evidence duplicated", (value) => { value.menuResults[1] = structuredClone(value.menuResults[0]); }],
  ]) await t.test(label, () => {
    const value = structuredClone(greenReport);
    mutate(value);
    assert.throws(() => validateReadyBaseline(value, baselineV3));
  });
});

test("F2-GOV-06 authority resolver rejects absent, malformed and contradictory PR identity", async () => {
  const transition = await readJson(f201TransitionPath);
  const directory = await mkdtemp(join(tmpdir(), "branct-f2-gov-06-event-"));
  const eventPath = join(directory, "event.json");
  const head = "1".repeat(40);
  try {
    await writeFile(eventPath, JSON.stringify({ pull_request: { head: { sha: head }, base: { sha: transition.authority.pullRequestBaseSha } } }));
    assert.equal(resolveAuthoritySha(transition, { eventPath, explicit: "" }), head);
    assert.equal(resolveAuthoritySha(transition, { eventPath, explicit: head }), head);
    assert.throws(() => resolveAuthoritySha(transition, { eventPath, explicit: "2".repeat(40) }), /differs from event head/i);
    assert.throws(() => resolveAuthoritySha(transition, { explicit: "HEAD", eventPath: "" }), /malformed/i);
    assert.throws(() => resolveAuthoritySha(transition, { explicit: "", eventPath: "" }), /absent/i);
    await writeFile(eventPath, "{");
    assert.throws(() => resolveAuthoritySha(transition, { eventPath, explicit: "" }), /unreadable or malformed/i);
    await writeFile(eventPath, JSON.stringify({ pull_request: { head: { sha: head }, base: { sha: "2".repeat(40) } } }));
    assert.throws(() => resolveAuthoritySha(transition, { eventPath, explicit: "" }), /base sha differs/i);
    await writeFile(eventPath, JSON.stringify({ ref: "refs/heads/main", before: transition.authority.pullRequestBaseSha, after: head, repository: { full_name: transition.repository } }));
    assert.equal(resolveAuthoritySha(transition, { eventPath, explicit: "" }), head);
    await writeFile(eventPath, JSON.stringify({ ref: "refs/heads/not-main", before: transition.authority.pullRequestBaseSha, after: head, repository: { full_name: transition.repository } }));
    assert.throws(() => resolveAuthoritySha(transition, { eventPath, explicit: "" }), /not for main/i);
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

const completeActionsFor = (transition) => readCanonicalMenuEvidenceMatrix(transition).entries.flatMap(({ evidenceId, route, viewport, actionPhases }) => actionPhases.map((phase) => ({ evidenceId, route, viewport, phase, status: "COMPLETED" })));
const reportForRequiredMatrix = (transition, baseline) => {
  const report = structuredClone(baseline);
  report.schemaVersion = 2;
  report.conclusion = "CONCLUSIVE";
  report.browser = { engine: "chromium", version: "151.0.7922.34" };
  report.viewports = structuredClone(transition.f201.matrix.viewports);
  report.observations = transition.f201.matrix.routes.flatMap((route) => Object.keys(transition.f201.matrix.viewports).map((viewport) => {
    const existing = baseline.observations.find((entry) => entry.route === route && entry.viewport === viewport);
    if (existing) return { ...structuredClone(existing), conclusion: "CONCLUSIVE" };
    const source = baseline.observations.find((entry) => entry.route === route && entry.viewport === "1440x900");
    return { ...structuredClone(source), viewport, clientWidth: 1024, scrollWidth: 1024, overflow: false, smallTargets: [], conclusion: "CONCLUSIVE" };
  }));
  return report;
};
const developmentReportFrom = (transition, baseline) => {
  const report = reportForRequiredMatrix(transition, baseline);
  const matrix = readCanonicalMenuEvidenceMatrix(transition);
  report.menuResults = matrix.entries.map(({ evidenceId, route, viewport, developmentResult }) => ({ evidenceId, route, viewport, ...structuredClone(developmentResult) }));
  report.observations[0].overflow = true;
  report.observations[0].scrollWidth = report.observations[0].clientWidth + 1;
  report.observations[0].smallTargets = [{ selector: ".fixture", width: 43, height: 43 }];
  report.execution = completeExecution({
    [semanticTestNames[0]]: "FAIL",
    [semanticTestNames[1]]: "FAIL",
  });
  report.execution.actions = completeActionsFor(transition);
  return report;
};

test("F2-GOV-06 rejects incomplete execution before classifying a development RED", async (t) => {
  const [transition, baseline] = await Promise.all([readJson(f201TransitionPath), readJson(new URL("../../fixtures/audit/f2-01-baseline-results.json", import.meta.url))]);
  const valid = { report: developmentReportFrom(transition, baseline), processOutcome: { exited: true, timedOut: false, signal: null, exitCode: 1 } };
  assert.equal(deriveF201State(transition, valid), "F2_01_AUTHORIZED_IN_DEVELOPMENT");
  const cases = [
    ["timeout", (value) => { value.processOutcome.timedOut = true; }, /timeout/i],
    ["process error", (value) => { value.processOutcome.exitCode = 2; }, /process error/i],
    ["premature exit", (value) => { value.processOutcome.exited = false; }, /prematurely/i],
    ["truncated report", (value) => { value.report.observations.pop(); }, /truncated report/i],
    ["semantic test not executed", (value) => { value.report.execution.semanticTests.pop(); }, /semantic test set/i],
    ["incomplete menu count", (value) => { value.report.menuResults.pop(); }, /canonical menu evidence bijection/i],
    ["duplicate observation", (value) => { value.report.observations[1] = structuredClone(value.report.observations[0]); }, /observation matrix.*duplicate/i],
    ["required evidence absent", (value) => { delete value.report.reducedMotion; }, /required evidence absent/i],
    ["completion marker false", (value) => { value.report.execution.complete = false; }, /execution incomplete/i],
    ["infrastructure error", (value) => { value.report.execution.infrastructureErrors = ["browser disconnected"]; }, /execution incomplete|infrastructure error/i],
    ["drawer action missing", (value) => { value.report.execution.actions.pop(); }, /canonical menu evidence action set/i],
    ["drawer action duplicated", (value) => { value.report.execution.actions.push(structuredClone(value.report.execution.actions[0])); }, /canonical menu evidence action set/i],
    ["drawer action cancelled", (value) => { value.report.execution.actions[0].status = "CANCELLED"; }, /cancelled.*cannot satisfy semantic RED/i],
    ["drawer action error", (value) => { value.report.execution.actions[0].status = "ERROR"; }, /error.*cannot satisfy semantic RED/i],
    ["drawer action unfinished", (value) => { delete value.report.execution.actions[0].status; }, /unfinished.*cannot satisfy semantic RED/i],
  ];
  for (const [label, mutate, expected] of cases) await t.test(label, () => {
    const value = structuredClone(valid);
    mutate(value);
    assert.throws(() => deriveF201State(transition, value), expected);
  });
});

test("F2-GOV-06 rejects a forged menu route even when matching actions are forged too", async () => {
  const [transition, baseline] = await Promise.all([readJson(f201TransitionPath), readJson(new URL("../../fixtures/audit/f2-01-baseline-results.json", import.meta.url))]);
  const report = developmentReportFrom(transition, baseline);
  const originalRoute = report.menuResults[1].route;
  const viewport = report.menuResults[1].viewport;
  report.menuResults[1].route = "forged.html";
  for (const action of report.execution.actions) {
    if (action.route === originalRoute && action.viewport === viewport) action.route = "forged.html";
  }
  assert.throws(
    () => deriveF201State(transition, { report, processOutcome: { exited: true, timedOut: false, signal: null, exitCode: 1 } }),
    /canonical menu evidence.*forged\.html/i,
  );
});

test("F2-GOV-06 requires an exact canonical bijection for all 41 menu evidences", async (t) => {
  const [transition, baseline] = await Promise.all([readJson(f201TransitionPath), readJson(new URL("../../fixtures/audit/f2-01-baseline-results.json", import.meta.url))]);
  const valid = { report: developmentReportFrom(transition, baseline), processOutcome: { exited: true, timedOut: false, signal: null, exitCode: 1 } };
  const rewriteActions = (report, from, to) => {
    for (const action of report.execution.actions) {
      if (action.route === from.route && action.viewport === from.viewport) Object.assign(action, to);
    }
  };
  const cases = [
    ["valid route swapped", (value) => {
      const entry = value.report.menuResults[1];
      const from = { route: entry.route, viewport: entry.viewport };
      const to = { route: "website-premium.html", viewport: entry.viewport };
      Object.assign(entry, to);
      rewriteActions(value.report, from, to);
    }],
    ["action forged", (value) => { value.report.execution.actions[0].phase = "forged-action"; }],
    ["valid action swapped", (value) => { value.report.execution.actions[0].phase = value.report.execution.actions[1].phase; }],
    ["viewport swapped", (value) => {
      const entry = value.report.menuResults[1];
      const from = { route: entry.route, viewport: entry.viewport };
      const to = { route: entry.route, viewport: "768x1024" };
      Object.assign(entry, to);
      rewriteActions(value.report, from, to);
    }],
    ["identity duplicated", (value) => { value.report.menuResults[1] = structuredClone(value.report.menuResults[0]); }],
    ["evidence removed", (value) => { value.report.menuResults.pop(); }],
    ["42nd evidence extra", (value) => { value.report.menuResults.push({ ...structuredClone(value.report.menuResults.at(-1)), route: "forged.html" }); }],
    ["declared id absent", (value) => { delete value.report.menuResults[0].evidenceId; }],
    ["declared id differs from tuple", (value) => { value.report.menuResults[0].evidenceId = "menu-forged-identity"; }],
    ["measured payload swapped between valid identities", (value) => {
      const identityKeys = new Set(["evidenceId", "route", "viewport"]);
      const payloads = value.report.menuResults.slice(0, 2).map((entry) => Object.fromEntries(Object.entries(entry).filter(([key]) => !identityKeys.has(key))));
      for (const [index, entry] of value.report.menuResults.slice(0, 2).entries()) {
        for (const key of Object.keys(entry)) if (!identityKeys.has(key)) delete entry[key];
        Object.assign(entry, structuredClone(payloads[1 - index]));
      }
    }],
    ["measured payload circularly permuted across valid identities", (value) => {
      const identityKeys = new Set(["evidenceId", "route", "viewport"]);
      const entries = value.report.menuResults.slice(0, 3);
      const payloads = entries.map((entry) => Object.fromEntries(Object.entries(entry).filter(([key]) => !identityKeys.has(key))));
      for (const [index, entry] of entries.entries()) {
        for (const key of Object.keys(entry)) if (!identityKeys.has(key)) delete entry[key];
        Object.assign(entry, structuredClone(payloads[(index + 1) % payloads.length]));
      }
    }],
    ["measured payload copied onto another valid identity", (value) => {
      const identityKeys = new Set(["evidenceId", "route", "viewport"]);
      const copied = Object.fromEntries(Object.entries(value.report.menuResults[0]).filter(([key]) => !identityKeys.has(key)));
      const target = value.report.menuResults[1];
      for (const key of Object.keys(target)) if (!identityKeys.has(key)) delete target[key];
      Object.assign(target, structuredClone(copied));
    }],
    ["report-controlled digest cannot authorize transplanted evidence", (value) => {
      const identityKeys = new Set(["evidenceId", "route", "viewport"]);
      const source = value.report.menuResults[0];
      const target = value.report.menuResults[1];
      const transplanted = Object.fromEntries(Object.entries(source).filter(([key]) => !identityKeys.has(key)));
      for (const key of Object.keys(target)) if (!identityKeys.has(key)) delete target[key];
      Object.assign(target, structuredClone(transplanted));
      target.resultDigest = hashBytes(JSON.stringify(target));
    }],
    ["action declared id absent", (value) => { delete value.report.execution.actions[0].evidenceId; }],
    ["report redefines expected matrix", (value) => { value.report.expectedMenuEvidenceMatrix = []; }],
  ];
  for (const [label, mutate] of cases) await t.test(label, () => {
    const value = structuredClone(valid);
    mutate(value);
    assert.throws(() => deriveF201State(transition, value), /canonical menu evidence/i);
  });
});

test("F2-GOV-06 fails closed when the canonical menu matrix authority is absent or divergent", async (t) => {
  const [transitionSource, baseline] = await Promise.all([readJson(f201TransitionPath), readJson(new URL("../../fixtures/audit/f2-01-baseline-results.json", import.meta.url))]);
  const evidence = { report: developmentReportFrom(transitionSource, baseline), processOutcome: { exited: true, timedOut: false, signal: null, exitCode: 1 } };
  for (const [label, mutate] of [
    ["authority absent", (value) => { delete value.f201.menuEvidenceMatrix; }],
    ["authority path unreadable", (value) => { value.f201.menuEvidenceMatrix = { path: "fixtures/audit/missing-menu-matrix.json", sha256: "0".repeat(64), evidenceCount: 41, actionCount: 184 }; }],
    ["authority digest divergent", (value) => { value.f201.menuEvidenceMatrix = { path: "fixtures/audit/f2-01-menu-evidence-matrix.json", sha256: "0".repeat(64), evidenceCount: 41, actionCount: 184 }; }],
  ]) await t.test(label, () => {
    const transition = structuredClone(transitionSource);
    mutate(transition);
    assert.throws(() => deriveF201State(transition, evidence), /canonical menu evidence matrix/i);
  });
});

test("F2-GOV-06 rejects absent, malformed and adulterated canonical matrix bytes", async (t) => {
  const transition = await readJson(f201TransitionPath);
  const reference = transition.f201.menuEvidenceMatrix;
  const source = await readJson(new URL(`../../${reference.path}`, import.meta.url));
  for (const [label, input, expected] of [
    ["matrix bytes absent", undefined, /absent or unreadable/i],
    ["matrix bytes malformed", "{", /malformed/i],
    ["matrix route adulterated", JSON.stringify({ ...source, entries: source.entries.map((entry, index) => index === 0 ? { ...entry, route: "forged.html" } : entry) }), /canonical menu evidence (identity|actions|digest)/i],
    ["matrix embedded digest altered", JSON.stringify({ ...source, sha256: "0".repeat(64) }), /embedded digest/i],
  ]) await t.test(label, () => {
    assert.throws(() => validateCanonicalMenuEvidenceMatrixText(reference, input), expected);
  });
});

test("F2-GOV-06 never promotes an internal drawer timeout to semantic RED", async (t) => {
  const [transition, baseline] = await Promise.all([readJson(f201TransitionPath), readJson(new URL("../../fixtures/audit/f2-01-baseline-results.json", import.meta.url))]);
  const processOutcome = { exited: true, timedOut: false, signal: null, exitCode: 1 };
  for (const phase of ["before-open", "open", "after-open"]) await t.test(`timeout ${phase}`, () => {
    const report = developmentReportFrom(transition, baseline);
    report.execution.actions.find((action) => action.route === "index.html" && action.viewport === "320x568" && action.phase === phase).status = "TIMEOUT";
    assert.throws(() => deriveF201State(transition, { report, processOutcome }), /timeout.*cannot satisfy semantic RED/i);
  });
});

test("F2-GOV-06 accepts only the exact contracted semantic RED vector", async (t) => {
  const [transition, baseline] = await Promise.all([readJson(f201TransitionPath), readJson(new URL("../../fixtures/audit/f2-01-baseline-results.json", import.meta.url))]);
  const valid = { report: developmentReportFrom(transition, baseline), processOutcome: { exited: true, timedOut: false, signal: null, exitCode: 1 } };
  const cases = [
    ["menu PASS", (value) => { value.report.execution.semanticTests[1].status = "PASS"; }],
    ["reduced motion FAIL", (value) => { value.report.execution.semanticTests[2].status = "FAIL"; }],
    ["reduced motion absent", (value) => { value.report.execution.semanticTests.splice(2, 1); }],
    ["validator FAIL", (value) => { value.report.execution.semanticTests[3].status = "FAIL"; }],
    ["validator absent", (value) => { value.report.execution.semanticTests.pop(); }],
    ["generic failures", (value) => { value.report.execution.semanticTests[2].status = "FAIL"; value.report.execution.semanticTests[3].status = "FAIL"; }],
    ["all failures", (value) => { for (const result of value.report.execution.semanticTests) result.status = "FAIL"; }],
    ["empty status", (value) => { value.report.execution.semanticTests[1].status = ""; }],
    ["unknown status", (value) => { value.report.execution.semanticTests[1].status = "UNKNOWN"; }],
  ];
  for (const [label, mutate] of cases) await t.test(label, () => {
    const value = structuredClone(valid);
    mutate(value);
    assert.throws(() => deriveF201State(transition, value), /semantic RED vector|semantic test set|invalid status/i);
  });
});

test("F2-GOV-06 requires conclusive numeric 1024x768 evidence", async () => {
  const transition = await readJson(f201TransitionPath);
  assert.deepEqual(transition.f201.matrix.viewports["1024x768"], [1024, 768]);
});

test("F2-GOV-06 derives readiness without self-approval and integration only from a real merged tree", async (t) => {
  const [transitionSource, baseline, baselineV3] = await Promise.all([readJson(f201TransitionPath), readJson(new URL("../../fixtures/audit/f2-01-baseline-results.json", import.meta.url)), readJson(f201BaselineV3Path)]);
  const transition = structuredClone(transitionSource);
  transition.status = "READY_FOR_VIA_A_REVIEW";
  transition.stateMachine.current = "READY_FOR_VIA_A_REVIEW";
  transition.stateMachine.previous = "F2_01_AUTHORIZED_IN_DEVELOPMENT";
  const authoritySha = "1111111111111111111111111111111111111111";
  const futureBaseline = reportForRequiredMatrix(transition, baseline);
  const evidence = {
    report: { ...structuredClone(futureBaseline), execution: completeExecution({}) },
    processOutcome: { exited: true, timedOut: false, signal: null, exitCode: 0 },
    targetBaseline: baselineV3,
    authoritySha,
    liveDiff: { complete: true, authoritySha, paths: ["src/css/branct.css"] },
    browsers: { chromium: "VERIFIED", firefox: "VERIFIED", webkit: "VERIFIED" },
  };
  for (const entry of evidence.report.menuResults) entry.evidenceId = readCanonicalMenuEvidenceMatrix(transition).entries.find(({ route, viewport }) => route === entry.route && viewport === entry.viewport)?.evidenceId;
  evidence.report.execution.actions = completeActionsFor(transition);
  const historical = structuredClone(transitionSource);
  historical.status = "PHASE_1_HISTORICAL";
  historical.stateMachine.current = "PHASE_1_HISTORICAL";
  historical.stateMachine.previous = null;
  assert.equal(deriveF201State(historical, {}), "PHASE_1_HISTORICAL");
  assert.equal(deriveF201State(transition, evidence), "READY_FOR_VIA_A_REVIEW");
  assert.throws(() => deriveF201State(transition, { ...structuredClone(evidence), approval: { decision: "APPROVED", authoritySha, independent: true } }), /must not contain.*approval/i);
  for (const [label, mutate, expected] of [
    ["1024 viewport absent", (value) => { delete value.transition.f201.matrix.viewports["1024x768"]; }, /viewport/i],
    ["1024 dimensions swapped", (value) => { value.transition.f201.matrix.viewports["1024x768"] = [768, 1024]; }, /viewport/i],
    ["1024 dimension partial", (value) => { value.transition.f201.matrix.viewports["1024x768"] = [1024]; }, /viewport/i],
    ["1024 dimension strings", (value) => { value.transition.f201.matrix.viewports["1024x768"] = ["1024", "768"]; }, /viewport/i],
    ["1024 observation absent", (value) => { value.evidence.report.observations = value.evidence.report.observations.filter((entry) => !(entry.viewport === "1024x768" && entry.route === "index.html")); }, /truncated report|observation matrix/i],
    ["1024 observation duplicated", (value) => { const index = value.evidence.report.observations.findIndex((entry) => entry.viewport === "1024x768" && entry.route === "index.html"); value.evidence.report.observations[index] = structuredClone(value.evidence.report.observations.find((entry) => entry.viewport === "1024x768" && entry.route === "crm-gestao.html")); }, /observation matrix/i],
    ["1024 observation inconclusive", (value) => { value.evidence.report.observations.find((entry) => entry.viewport === "1024x768").conclusion = "INCONCLUSIVE"; }, /inconclusive/i],
  ]) await t.test(label, () => {
    const value = { transition: structuredClone(transition), evidence: structuredClone(evidence) };
    mutate(value);
    assert.throws(() => deriveF201State(value.transition, value.evidence), expected);
  });
  const cases = [
    ["mandatory browser not verified", (value) => { value.browsers.chromium = "NOT_VERIFIED"; }],
    ["semantic RED", (value) => { value.report.execution.semanticTests[0].status = "FAIL"; }],
    ["reported overflow mismatch", (value) => { value.report.observations[0].scrollWidth += 1; }],
    ["live diff absent", (value) => { delete value.liveDiff; }],
    ["live diff head mismatch", (value) => { value.liveDiff.authoritySha = "2222222222222222222222222222222222222222"; }],
    ["report truncated", (value) => { value.report.observations.pop(); }],
    ["report absent", (value) => { delete value.report; }],
    ["browser evidence absent", (value) => { delete value.browsers; }],
  ];
  for (const [label, mutate] of cases) await t.test(label, () => {
    const value = structuredClone(evidence);
    mutate(value);
    assert.throws(() => deriveF201State(transition, value), new RegExp(label.split(" ")[0], "i"));
  });
  const integratedTransition = structuredClone(transition);
  integratedTransition.status = "F2_01_INTEGRATED_VERIFIED";
  integratedTransition.stateMachine.current = "F2_01_INTEGRATED_VERIFIED";
  integratedTransition.stateMachine.previous = "READY_FOR_VIA_A_REVIEW";
  const repository = await mkdtemp(join(tmpdir(), "branct-f2-01-integrated-git-"));
  const mainEventPath = join(repository, "github-push-event.json");
  const git = (...args) => execFileSync("git", args, { cwd: repository, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    git("init", "--initial-branch=main");
    git("config", "user.name", "F2 integration proof");
    git("config", "user.email", "f2-integration@example.invalid");
    await writeFile(join(repository, "base.txt"), "base\n");
    git("add", "--", "base.txt");
    git("commit", "-m", "sealed base");
    const baseSha = git("rev-parse", "HEAD");
    git("checkout", "-b", "authorized-head");
    await writeFile(join(repository, "f2-01.txt"), "verified\n");
    git("add", "--", "f2-01.txt");
    git("commit", "-m", "authorized F2-01 head");
    const integratedHeadSha = git("rev-parse", "HEAD");
    git("checkout", "main");
    git("merge", "--no-ff", "authorized-head", "-m", "normal merge");
    const mergeCommitSha = git("rev-parse", "HEAD");
    const treeSha = git("rev-parse", "HEAD^{tree}");
    git("update-ref", "refs/remotes/origin/main", mergeCommitSha);
    await writeFile(mainEventPath, JSON.stringify({ ref: "refs/heads/main", before: baseSha, after: mergeCommitSha, repository: { full_name: integratedTransition.repository } }));
    const { derivePostIntegrationState } = await import("../../scripts/governance/verify-f2-01-readiness.mjs");
    assert.deepEqual(derivePostIntegrationState({ transition, repository, eventPath: mainEventPath }), {
      state: "F2_01_INTEGRATED_VERIFIED",
      mergeCommitSha,
      baseSha,
      headSha: integratedHeadSha,
      treeSha,
      mainRef: "refs/remotes/origin/main",
    });
    git("update-ref", "refs/remotes/origin/main", integratedHeadSha);
    assert.throws(() => derivePostIntegrationState({ transition, repository, eventPath: mainEventPath }), /canonical main ref/i);
    git("update-ref", "refs/remotes/origin/main", mergeCommitSha);
    await writeFile(mainEventPath, JSON.stringify({ ref: "refs/heads/main", before: baseSha, after: "5".repeat(40), repository: { full_name: integratedTransition.repository } }));
    assert.throws(() => derivePostIntegrationState({ transition, repository, eventPath: mainEventPath }), /canonical main ref|cannot resolve/i);
    await writeFile(mainEventPath, JSON.stringify({ ref: "refs/heads/main", before: baseSha, after: mergeCommitSha, repository: { full_name: integratedTransition.repository } }));
    const integratedEvidence = {
      ...structuredClone(evidence),
      authoritySha: integratedHeadSha,
      liveDiff: { ...structuredClone(evidence.liveDiff), authoritySha: integratedHeadSha },
      integration: { merged: true, headSha: integratedHeadSha, treeSha, validatedTreeSha: treeSha },
    };
    const options = { repository, mainEventPath };
    assert.equal(deriveF201State(integratedTransition, integratedEvidence, options), "F2_01_INTEGRATED_VERIFIED");
    git("checkout", "authorized-head");
    assert.equal(deriveF201State(integratedTransition, integratedEvidence, options), "F2_01_INTEGRATED_VERIFIED", "moving HEAD must not change explicit merge authority");
    for (const [label, mutate, expected] of [
      ["real merge evidence absent", (value) => { delete value.integration; }, /merge evidence absent/i],
      ["real merge false", (value) => { value.integration.merged = false; }, /real merge not confirmed/i],
      ["merged head divergent", (value) => { value.integration.headSha = baseSha; value.authoritySha = baseSha; value.liveDiff.authoritySha = baseSha; }, /merge parents/i],
      ["integrated tree unvalidated", (value) => { value.integration.validatedTreeSha = baseSha; }, /validated tree/i],
      ["canonical main ref transplanted", (value, setup) => { setup("update-ref", "refs/remotes/origin/main", integratedHeadSha); }, /canonical main ref/i],
      ["push event merge unresolvable", (value, setup, writeEvent) => { writeEvent({ ref: "refs/heads/main", before: baseSha, after: "5".repeat(40), repository: { full_name: integratedTransition.repository } }); }, /cannot resolve/i],
    ]) await t.test(label, async () => {
      const value = structuredClone(integratedEvidence);
      git("update-ref", "refs/remotes/origin/main", mergeCommitSha);
      await writeFile(mainEventPath, JSON.stringify({ ref: "refs/heads/main", before: baseSha, after: mergeCommitSha, repository: { full_name: integratedTransition.repository } }));
      let pendingEvent;
      mutate(value, git, (event) => { pendingEvent = event; });
      if (pendingEvent) await writeFile(mainEventPath, JSON.stringify(pendingEvent));
      assert.throws(() => deriveF201State(integratedTransition, value, options), expected);
    });
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
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

test("F2-GOV-07 keeps v2 immutable and makes the v3 baseline explicitly conclusive", async () => {
  const [baselineV2, baselineV3] = await Promise.all([
    readJson(new URL("../../fixtures/audit/f2-01-baseline-results.json", import.meta.url)),
    readJson(f201BaselineV3Path),
  ]);
  assert.equal(baselineV2.conclusion, undefined, "the superseded v2 snapshot must remain byte-compatible");
  assert.equal(baselineV3.conclusion, "CONCLUSIVE", "F2-01 baseline v3 conclusion is absent");
});

test("F2-GOV-07 accepts equivalent engine semantics with independently plausible geometry", async () => {
  const [{ validateReadyBaseline }, transition, baseline, baselineV3] = await Promise.all([
    import("../../scripts/governance/verify-f2-01-readiness.mjs"),
    readJson(f201TransitionPath),
    readJson(new URL("../../fixtures/audit/f2-01-baseline-results.json", import.meta.url)),
    readJson(f201BaselineV3Path),
  ]);
  const chromium = reportForRequiredMatrix(transition, baseline);
  const canonicalMatrix = readCanonicalMenuEvidenceMatrix(transition);
  chromium.menuResults = chromium.menuResults.map((entry) => ({
    evidenceId: canonicalMatrix.entries.find(({ route, viewport }) => route === entry.route && viewport === entry.viewport).evidenceId,
    ...entry,
  }));
  chromium.execution = completeExecution({});
  chromium.execution.actions = completeActionsFor(transition);
  const webkit = structuredClone(chromium);
  webkit.browser = { engine: "webkit", version: "26.5" };
  webkit.observations[0].drawer.left = 319.8;
  webkit.observations[0].drawer.right = 595;
  assert.equal(webkit.observations[0].overflow, false);
  assert.doesNotThrow(
    () => validateReadyBaseline(webkit, baselineV3),
    "legitimate engine rounding must be evaluated by semantic predicates, not blind geometry equality",
  );
});

async function f2Gov07GreenBundle() {
  const [{ validateCaptureEvidence, validateEngineReport, validateMultiengineReports, validateBaselineV3 }, runtime, transition, baselineV2, baselineV3, fixture] = await Promise.all([
    import("../../scripts/governance/verify-f2-01-readiness.mjs"),
    readJson(f201RuntimePath),
    readJson(f201TransitionPath),
    readJson(new URL("../../fixtures/audit/f2-01-baseline-results.json", import.meta.url)),
    readJson(f201BaselineV3Path),
    readJson(f2Gov07FixturePath),
  ]);
  const canonicalMatrix = readCanonicalMenuEvidenceMatrix(transition);
  const reports = fixture.engines.map(({ engine, version, geometry }) => {
    const report = reportForRequiredMatrix(transition, baselineV2);
    report.browser = { engine, version };
    report.menuResults = report.menuResults.map((entry) => ({ evidenceId: canonicalMatrix.entries.find(({ route, viewport }) => route === entry.route && viewport === entry.viewport).evidenceId, ...entry }));
    report.execution = completeExecution({});
    report.execution.actions = completeActionsFor(transition);
    const observation = report.observations.find(({ route, viewport }) => route === "index.html" && viewport === "320x568");
    observation.drawer = { left: geometry.drawerLeft, right: geometry.drawerRight, width: geometry.drawerWidth, open: false };
    report.menuResults[0].focusStyle.width = geometry.focusWidth;
    return report;
  });
  const capturesByEngine = Object.fromEntries(fixture.engines.map(({ engine }) => [engine, Object.keys(baselineV3.canonicalMatrix.viewports).flatMap((viewport) => {
    const names = [`home-${engine}-${viewport}-closed.jpg`];
    if (baselineV3.canonicalMatrix.viewports[viewport][0] <= 768) names.push(`home-${engine}-${viewport}-open.jpg`);
    return names.map((name) => ({ name, bytes: 1024 + name.length, sha256: hashBytes(`synthetic:${name}`) }));
  })]));
  return { runtime, transition, baselineV3, fixture, reports, capturesByEngine, guards: { validateCaptureEvidence, validateEngineReport, validateMultiengineReports, validateBaselineV3 } };
}
const cloneF2Gov07Bundle = (value) => ({ ...structuredClone({ runtime: value.runtime, transition: value.transition, baselineV3: value.baselineV3, fixture: value.fixture, reports: value.reports, capturesByEngine: value.capturesByEngine }), guards: value.guards });

test("F2-GOV-07 has twelve explicit positive controls", async (t) => {
  const base = await f2Gov07GreenBundle();
  const byEngine = Object.fromEntries(base.reports.map((report) => [report.browser.engine, report]));
  const cases = [
    ["canonical baseline v3", () => base.guards.validateBaselineV3(base.baselineV3, { runtime: base.runtime, transition: base.transition })],
    ["chromium conclusive report", () => base.guards.validateEngineReport(base.runtime, byEngine.chromium, "chromium", { baseline: base.baselineV3, requireGreen: true })],
    ["firefox conclusive report", () => base.guards.validateEngineReport(base.runtime, byEngine.firefox, "firefox", { baseline: base.baselineV3, requireGreen: true })],
    ["webkit conclusive report", () => base.guards.validateEngineReport(base.runtime, byEngine.webkit, "webkit", { baseline: base.baselineV3, requireGreen: true })],
    ["chromium capture set", () => base.guards.validateCaptureEvidence("chromium", base.capturesByEngine.chromium, base.baselineV3)],
    ["firefox capture set", () => base.guards.validateCaptureEvidence("firefox", base.capturesByEngine.firefox, base.baselineV3)],
    ["webkit capture set", () => base.guards.validateCaptureEvidence("webkit", base.capturesByEngine.webkit, base.baselineV3)],
    ["three-engine aggregate", () => base.guards.validateMultiengineReports(base.runtime, base.reports, { baseline: base.baselineV3, capturesByEngine: base.capturesByEngine })],
    ["84 observations per engine", () => assert.ok(base.reports.every(({ observations }) => observations.length === 84))],
    ["41 canonical menu identities per engine", () => assert.ok(base.reports.every(({ menuResults }) => menuResults.length === 41))],
    ["184 completed actions per engine", () => assert.ok(base.reports.every(({ execution }) => execution.actions.length === 184 && execution.actions.every(({ status }) => status === "COMPLETED")))],
    ["independent geometry remains semantically GREEN", () => assert.equal(new Set(base.reports.map(({ observations }) => observations[0].drawer.left)).size, 3)],
  ];
  assert.equal(cases.length, 12);
  for (const [label, validate] of cases) await t.test(label, () => assert.doesNotThrow(validate));
});

test("F2-GOV-07 validates three conclusive engines without cross-engine geometry equality", async () => {
  const value = await f2Gov07GreenBundle();
  assert.equal(value.guards.validateMultiengineReports(value.runtime, value.reports, { baseline: value.baselineV3, capturesByEngine: value.capturesByEngine }).conclusion, "CONCLUSIVE");
  assert.notEqual(value.reports[0].observations[0].drawer.left, value.reports[2].observations[0].drawer.left);
});

test("F2-GOV-07 fails closed on conclusion, engine and canonical cardinality regressions", async (t) => {
  const base = await f2Gov07GreenBundle();
  const engineCases = [
    ["conclusion absent", (v) => { delete v.reports[0].conclusion; }, /conclusion/i],
    ["conclusion inconclusive", (v) => { v.reports[0].conclusion = "INCONCLUSIVE"; }, /conclusion/i],
    ["conclusion partial", (v) => { v.reports[0].conclusion = "PARTIAL"; }, /conclusion/i],
    ["conclusion unknown", (v) => { v.reports[0].conclusion = "UNKNOWN"; }, /conclusion/i],
    ["engine absent", (v) => { v.reports.pop(); }, /multiengine report cardinality/i],
    ["engine duplicated", (v) => { v.reports[2] = structuredClone(v.reports[0]); }, /multiengine set/i],
    ["engine unexpected", (v) => { v.reports[2].browser.engine = "gecko"; }, /multiengine set/i],
  ];
  for (const [label, mutate, expected] of engineCases) await t.test(label, () => {
    const value = cloneF2Gov07Bundle(base);
    mutate(value);
    assert.throws(() => value.guards.validateMultiengineReports(value.runtime, value.reports, { baseline: value.baselineV3, capturesByEngine: value.capturesByEngine }), expected);
  });
  const reportCases = [
    ["83 observations", (r) => { r.observations.pop(); }, /observation evidence incomplete/i],
    ["observation duplicated", (r) => { r.observations[1] = structuredClone(r.observations[0]); }, /observation bijection/i],
    ["observation unknown", (r) => { r.observations[0].route = "forged.html"; }, /observation bijection/i],
    ["40 menus", (r) => { r.menuResults.pop(); }, /menu evidence incomplete/i],
    ["menu duplicated", (r) => { r.menuResults[1] = structuredClone(r.menuResults[0]); }, /menu tuple|menu evidence bijection/i],
    ["menu route swapped", (r) => { r.menuResults[0].route = r.menuResults[1].route; }, /menu identity|menu evidence bijection/i],
    ["menu viewport swapped", (r) => { r.menuResults[0].viewport = "360x800"; }, /menu identity|menu evidence bijection/i],
    ["183 actions", (r) => { r.execution.actions.pop(); }, /action evidence incomplete/i],
    ["action duplicated", (r) => { r.execution.actions[1] = structuredClone(r.execution.actions[0]); }, /action tuple/i],
    ["action reordered", (r) => { [r.execution.actions[0], r.execution.actions[1]] = [r.execution.actions[1], r.execution.actions[0]]; }, /action tuple/i],
    ["action copied", (r) => { r.execution.actions[8] = structuredClone(r.execution.actions[0]); }, /action tuple/i],
    ["route forged", (r) => { r.menuResults[0].route = "forged.html"; }, /menu tuple/i],
    ["viewport forged", (r) => { r.menuResults[0].viewport = "999x999"; }, /menu tuple/i],
    ["identity forged", (r) => { r.menuResults[0].evidenceId = "menu-forged"; }, /menu identity/i],
  ];
  for (const [label, mutate, expected] of reportCases) await t.test(label, () => {
    const value = cloneF2Gov07Bundle(base);
    mutate(value.reports[0]);
    assert.throws(() => value.guards.validateEngineReport(value.runtime, value.reports[0], "chromium", { baseline: value.baselineV3, requireGreen: true }), expected);
  });
});

test("F2-GOV-07 recalculates semantic predicates from raw evidence", async (t) => {
  const base = await f2Gov07GreenBundle();
  const cases = [
    ["overflow raw width", (r) => { r.observations[0].scrollWidth = r.observations[0].clientWidth + 1; r.observations[0].overflow = true; }, /horizontal overflow/i],
    ["forged overflow PASS", (r) => { r.observations[0].scrollWidth = r.observations[0].clientWidth + 1; r.observations[0].overflow = false; }, /reported overflow/i],
    ["target below 44", (r) => { r.observations[0].smallTargets = [{ selector: ".target", width: 43.9, height: 44 }]; }, /target below 44x44/i],
    ["reduced motion fail", (r) => { r.reducedMotion.durationsMs[0] = 2; }, /reduced-motion semantic/i],
    ["outside click fail", (r) => { r.menuResults[0].outsideClosed = false; }, /menu semantic predicate/i],
    ["Escape fail", (r) => { r.menuResults[0].closed.closed = false; }, /menu semantic predicate/i],
    ["focus return fail", (r) => { r.menuResults[0].closed.focusReturned = false; }, /menu semantic predicate/i],
    ["background inert fail", (r) => { r.menuResults[0].open.backgroundInert = false; }, /menu semantic predicate/i],
    ["scroll lock fail", (r) => { r.menuResults[0].open.bodyLocked = false; }, /menu semantic predicate/i],
    ["timeout", (r) => { r.execution.complete = false; r.execution.infrastructureErrors = ["TIMEOUT"]; }, /execution incomplete|infrastructure/i],
    ["partial with correct counts", (r) => { r.execution.complete = false; }, /execution incomplete/i],
    ["PASS field adulterated", (r) => { r.observations[0].scrollWidth += 1; r.observations[0].overflow = false; r.execution.semanticTests[0].status = "PASS"; }, /reported overflow/i],
  ];
  for (const [label, mutate, expected] of cases) await t.test(label, () => {
    const value = cloneF2Gov07Bundle(base);
    mutate(value.reports[0]);
    assert.throws(() => value.guards.validateEngineReport(value.runtime, value.reports[0], "chromium", { baseline: value.baselineV3, requireGreen: true }), expected);
  });
});

test("F2-GOV-07 rejects implausible geometry and incomplete raw evidence", async (t) => {
  const base = await f2Gov07GreenBundle();
  const geometryCases = [
    ["NaN geometry", (r) => { r.observations[0].drawer.left = Number.NaN; }, /finite number/i],
    ["infinite geometry", (r) => { r.observations[0].drawer.left = Number.POSITIVE_INFINITY; }, /finite number/i],
    ["string geometry", (r) => { r.observations[0].drawer.left = "320"; }, /finite number/i],
    ["negative size", (r) => { r.observations[0].drawer.width = -1; }, /non-negative/i],
    ["inconsistent box", (r) => { r.observations[0].drawer.right += 5; }, /bounding box/i],
  ];
  for (const [label, mutate, expected] of geometryCases) await t.test(label, () => {
    const value = cloneF2Gov07Bundle(base);
    mutate(value.reports[0]);
    assert.throws(() => value.guards.validateEngineReport(value.runtime, value.reports[0], "chromium", { baseline: value.baselineV3, requireGreen: true }), expected);
  });
  for (const [label, mutate, expected] of [
    ["capture absent", (v) => { delete v.capturesByEngine.chromium; }, /capture evidence is absent/i],
    ["capture removed", (v) => { v.capturesByEngine.chromium.pop(); }, /capture evidence set/i],
    ["capture duplicated", (v) => { v.capturesByEngine.chromium[1] = structuredClone(v.capturesByEngine.chromium[0]); }, /capture evidence set/i],
    ["capture empty", (v) => { v.capturesByEngine.chromium[0].bytes = 0; }, /capture is empty/i],
    ["capture digest malformed", (v) => { v.capturesByEngine.chromium[0].sha256 = "self"; }, /capture digest/i],
  ]) await t.test(label, () => {
    const value = cloneF2Gov07Bundle(base);
    mutate(value);
    assert.throws(() => value.guards.validateMultiengineReports(value.runtime, value.reports, { baseline: value.baselineV3, capturesByEngine: value.capturesByEngine }), expected);
  });
});

test("F2-GOV-07 baseline v3 is canonical, pinned and downgrade-resistant", async (t) => {
  const base = await f2Gov07GreenBundle();
  assert.doesNotThrow(() => base.guards.validateBaselineV3(base.baselineV3, { runtime: base.runtime, transition: base.transition }));
  for (const [label, mutate, expected] of [
    ["baseline conclusion absent", (v) => { delete v.conclusion; }, /schema|conclusion/i],
    ["baseline inconclusive", (v) => { v.conclusion = "INCONCLUSIVE"; }, /conclusion/i],
    ["baseline old schema", (v) => { v.schemaVersion = 1; }, /downgrade|schema/i],
    ["baseline matrix producer-controlled", (v) => { v.canonicalMatrix.routes[0] = "forged.html"; }, /route matrix/i],
    ["baseline digest recomputed by attacker", (v) => { v.canonicalMatrix.routes[0] = "forged.html"; const payload = structuredClone(v); delete payload.canonicalPayloadSha256; v.canonicalPayloadSha256 = hashBytes(JSON.stringify(payload)); }, /route matrix/i],
    ["baseline payload digest altered", (v) => { v.canonicalPayloadSha256 = "0".repeat(64); }, /payload digest/i],
    ["baseline engine removed", (v) => { v.engines.pop(); }, /engine authority/i],
  ]) await t.test(label, () => {
    const value = structuredClone(base.baselineV3);
    mutate(value);
    assert.throws(() => base.guards.validateBaselineV3(value, { runtime: base.runtime, transition: base.transition }), expected);
  });
});

test("the audited diff cannot mutate live pages or deployment", async () => {
  const contract = await readJson(contractPath);
  const transition = await readJson(f201TransitionPath);
  const diffBase = process.env.AUDIT_DIFF_BASE ?? contract.baseSha;
  const authoritySha = resolveAuthoritySha(transition);
  const repository = normalize(new URL("../../", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
  const changed = execFileSync("git", ["diff", "--name-only", diffBase, authoritySha], { cwd: repository, encoding: "utf8" })
    .trim().split(/\r?\n/).filter(Boolean);
  const allowed = /^(package(?:-lock)?\.json$|CLAUDE\.md$|docs\/audit\/|docs\/superpowers\/plans\/2026-08-25-f2-gov-07-multiengine-contract\.md$|fixtures\/audit\/|tests\/audit\/|\.github\/workflows\/(audit-offline|universal-pr-gate|gate-integrity-sentinel)\.yml$|scripts\/governance\/)/;
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
  const [audit, roadmap, risks, workflow, redGreen, collector, visualChecker] = await Promise.all([
    readFile(auditPath, "utf8"),
    readFile(roadmapPath, "utf8"),
    readFile(riskPath, "utf8"),
    readFile(workflowPath, "utf8"),
    readFile(redGreenPath, "utf8"),
    readFile(collectorPath, "utf8"),
    readFile(new URL("./check-visual-evidence.mjs", import.meta.url), "utf8"),
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
  assert.match(workflow, /git config --global --add safe\.directory "\$GITHUB_WORKSPACE"/);
  assert.doesNotMatch(workflow, /safe\.directory\s+["']?\*["']?/);
  assert.match(workflow, /name: Verify F2-01 readiness in Chromium, Firefox and WebKit\s+env:\s+HOME: \/root\s+run: node scripts\/governance\/verify-f2-01-readiness\.mjs/);
  assert.doesNotMatch(workflow, /FTP_PASSWORD|lftp/i);
  assert.match(redGreen, /ENOENT/);
  assert.match(redGreen, /GREEN/);
  assert.match(collector, /Emulation\.setDeviceMetricsOverride/);
  assert.match(collector, /targetsUnder44/);
  assert.match(collector, /playwrightChromium\.executablePath\(\)/);
  assert.match(collector, /--disable-dev-shm-usage/);
  assert.match(visualChecker, /playwrightChromium\.executablePath\(\)/);
  assert.match(visualChecker, /--disable-dev-shm-usage/);
  assert.match(workflow, /collect-browser-baseline\.mjs/);
  assert.match(workflow, /check-visual-evidence\.mjs/);
});

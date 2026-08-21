import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classifyRecords } from "../../scripts/governance/classify-pr-paths.mjs";

const root = new URL("../../", import.meta.url);
const packagePath = "fixtures/audit/f2-gov-04-main-activation-package.json";
const validatorPath = "scripts/governance/validate-f2-gov-04.mjs";
const documentPath = "docs/audit/phase-2/governance/f2-gov-04-activation-package.md";
const handoffPath = "docs/audit/phase-2/governance/f2-gov-04-handoff.md";
const expectedBase = "5f0af6759ee221869b3fa35fd124a6dd9aa1328b";

const read = (path) => readFile(new URL(path, root), "utf8");
const readJson = async (path) => JSON.parse(await read(path));
const loadValidator = async () => import(new URL(validatorPath, root));

test("RED: final main activation package must exist", () => {
  for (const path of [packagePath, validatorPath, documentPath, handoffPath]) {
    assert.equal(existsSync(new URL(path, root)), true, `F2-GOV-04 artifact missing: ${path}`);
  }
});

test("package is exact, offline and bound to the rehearsed base", async () => {
  const [{ validateActivationPackage }, activation] = await Promise.all([loadValidator(), readJson(packagePath)]);
  assert.equal(validateActivationPackage(activation), true);
  assert.equal(activation.baseSha, expectedBase);
  assert.equal(activation.status, "ACTIVATION_PACKAGE_NOT_APPLIED");
  assert.equal(activation.authorization.applyProtection, false);
  assert.equal(activation.authorization.changeMergeMethods, false);
  assert.equal(activation.governance.viaBRequiredUntilPostActivationApproval, true);
});

test("canonical protection and merge-method targets are closed", async () => {
  const [{ validatePersonalAccountPayload }, activation] = await Promise.all([
    import("../../scripts/governance/validate-f2-gov-03.mjs"), readJson(packagePath),
  ]);
  assert.equal(validatePersonalAccountPayload(activation.target.branchProtection), true);
  assert.deepEqual(Object.keys(activation.target.branchProtection.required_status_checks).sort(), ["checks", "strict"]);
  assert.deepEqual(activation.target.repositoryMergeMethods, {
    allow_merge_commit:true,
    allow_squash_merge:false,
    allow_rebase_merge:false,
  });
});

test("document embeds the exact structured package", async () => {
  const [{ canonicalDocumentView, extractDocumentPackage }, activation, document] = await Promise.all([
    loadValidator(), readJson(packagePath), read(documentPath),
  ]);
  assert.deepEqual(extractDocumentPackage(document), canonicalDocumentView(activation));
});

test("real classifier and workflows cover legitimate and fail-closed paths", async () => {
  const [activation, universal, sentinel] = await Promise.all([
    readJson(packagePath), read(".github/workflows/universal-pr-gate.yml"), read(".github/workflows/gate-integrity-sentinel.yml"),
  ]);
  assert.doesNotMatch(universal, /^\s+paths(?:-ignore)?:/m);
  assert.match(universal, /^\s+name: Universal PR Gate$/m);
  assert.match(sentinel, /^name: Gate Integrity Sentinel$/m);
  const cases = [
    ["documentation", "docs/audit/future.md", true, false],
    ["tests", "tests/audit/future.test.mjs", true, false],
    ["page", "future.html", true, true],
    ["asset", "src/img/future.svg", true, true],
    ["unknown", "unknown/future.bin", false, false],
  ];
  for (const [id, path, accepted, live] of cases) {
    const result = classifyRecords([{ status:"A", path }]);
    assert.equal(result.checkEmitted, true, `${id}: universal check absent`);
    assert.equal(result.accepted, accepted, `${id}: classifier result`);
    assert.equal(result.suites.includes("browser-baseline"), live, `${id}: browser suite`);
    assert.equal(result.suites.includes("visual-evidence"), live, `${id}: visual suite`);
  }
  assert.deepEqual(activation.simulation.scenarios.map(({ id, terminal }) => ({ id, terminal })), [
    { id:"documentation", terminal:"SUCCESS_AFTER_REVIEW" },
    { id:"tests", terminal:"SUCCESS_AFTER_REVIEW" },
    { id:"page", terminal:"FAILURE_VISUAL_POLICY" },
    { id:"asset", terminal:"FAILURE_VISUAL_POLICY" },
    { id:"unknown", terminal:"FAILURE_UNKNOWN_PATH" },
    { id:"invalid-fixture", terminal:"FAILURE_CONTRACT" },
    { id:"protected-component", terminal:"FAILURE_SENTINEL" },
  ]);
});

test("security and rollback regressions fail for their contracted cause", async (t) => {
  const { validateActivationPackage } = await loadValidator();
  const original = await readJson(packagePath);
  const cases = [
    ["contexts beside checks", (p) => { p.target.branchProtection.required_status_checks.contexts=[]; }, "only strict and checks"],
    ["organization field", (p) => { p.target.branchProtection.required_pull_request_reviews.dismissal_restrictions={}; }, "organization-only"],
    ["restrictions object", (p) => { p.target.branchProtection.restrictions={ users:[] }; }, "organization-only"],
    ["wrong app id", (p) => { p.target.branchProtection.required_status_checks.checks[0].app_id=1; }, "required checks mismatch"],
    ["missing check", (p) => { p.target.branchProtection.required_status_checks.checks.pop(); }, "required checks mismatch"],
    ["duplicate check", (p) => { p.target.branchProtection.required_status_checks.checks.push(structuredClone(p.target.branchProtection.required_status_checks.checks[0])); }, "required checks mismatch"],
    ["extra check", (p) => { p.target.branchProtection.required_status_checks.checks.push({context:"Extra",app_id:15368}); }, "required checks mismatch"],
    ["admins excluded", (p) => { p.target.branchProtection.enforce_admins=false; }, "administrators"],
    ["approval reduced", (p) => { p.target.branchProtection.required_pull_request_reviews.required_approving_review_count=0; }, "approval"],
    ["stale approvals retained", (p) => { p.target.branchProtection.required_pull_request_reviews.dismiss_stale_reviews=false; }, "stale"],
    ["last-push weakened", (p) => { p.target.branchProtection.required_pull_request_reviews.require_last_push_approval=false; }, "last-push"],
    ["bypass introduced", (p) => { p.target.branchProtection.required_pull_request_reviews.bypass_pull_request_allowances={}; }, "organization-only"],
    ["force push allowed", (p) => { p.target.branchProtection.allow_force_pushes=true; }, "force pushes"],
    ["deletion allowed", (p) => { p.target.branchProtection.allow_deletions=true; }, "deletion"],
    ["squash enabled", (p) => { p.target.repositoryMergeMethods.allow_squash_merge=true; }, "squash"],
    ["rebase enabled", (p) => { p.target.repositoryMergeMethods.allow_rebase_merge=true; }, "rebase"],
    ["linear history enabled", (p) => { p.target.branchProtection.required_linear_history=true; }, "non-linear"],
    ["rollback incomplete", (p) => { p.rollback.steps.pop(); }, "rollback steps"],
    ["Via B removed early", (p) => { p.governance.viaBRequiredUntilPostActivationApproval=false; }, "Via B"],
    ["rehearsal reviewer erased", (p) => { p.evidence.realDisposableRehearsal.reviewer=""; }, "real rehearsal evidence"],
    ["rehearsal runs erased", (p) => { p.evidence.realDisposableRehearsal.firstRuns=[]; }, "real rehearsal evidence"],
    ["stale review falsified", (p) => { p.evidence.realDisposableRehearsal.reviewStateAfterNewCommit="APPROVED"; }, "real rehearsal evidence"],
    ["scenario suites falsified", (p) => { p.simulation.scenarios[0].requiredSuites=["fake"]; }, "scenario suites mismatch"],
    ["readback protection weakened", (p) => { p.activation.expectedReadback.branchProtection.enforce_admins.enabled=false; }, "readback administrators"],
    ["readback merge methods weakened", (p) => { p.activation.expectedReadback.repositoryMergeMethods.allow_squash_merge=true; }, "readback merge-method"],
  ];
  for (const [label, mutate, expected] of cases) await t.test(label, () => {
    const candidate = structuredClone(original);
    mutate(candidate);
    assert.throws(() => validateActivationPackage(candidate), (error) => error.message.includes(expected));
  });
});

test("activation and rollback commands are exact but explicitly inert", async () => {
  const activation = await readJson(packagePath);
  assert.deepEqual(activation.activation.order.map(({ id }) => id), [
    "seal-before-state", "reconfirm-gates", "apply-protection", "restrict-merge-methods",
    "independent-readback", "post-activation-pr", "prove-post-activation", "close-trial", "council-via-a-decision",
  ]);
  assert.equal(activation.activation.commandsExecuted, false);
  assert.equal(activation.rollback.commandsExecuted, false);
  assert.equal(activation.rollback.restoresSealedProtection, true);
  assert.equal(activation.rollback.restoresSealedMergeMethods, true);
  assert.match(activation.authorizationText, /head <EXACT_PR_HEAD>/);
  assert.match(activation.authorizationText, new RegExp(`base ${expectedBase}`));
});

test("merge simulation is fail-closed yet permits a bounded gate repair", async () => {
  const { simulateMergeDecision } = await loadValidator();
  const common = { universal:"success", sentinel:"success", approvals:1, approvalOnLatestHead:true, conversationsResolved:true, admin:true };
  const approvalContext = { decision:"APPROVED", actor:"Rafael", ceremonyId:"F2-GATE-CHANGE-REPAIR-1", headSha:"a".repeat(40), baseSha:expectedBase };
  const breakGlass = {
    protectedPathsChanged:[".github/workflows/gate-integrity-sentinel.yml"],
    ceremonyId:approvalContext.ceremonyId,
    humanApproval:{ actor:approvalContext.actor, headSha:approvalContext.headSha, baseSha:approvalContext.baseSha },
    snapshotRecorded:true,
    temporaryChange:["remove Gate Integrity Sentinel only from required checks"],
    retainedChecks:["Universal PR Gate"],
    restorationDeadlineMinutes:60,
    postRestoreTrialsRequired:true,
  };
  assert.deepEqual(simulateMergeDecision(common), { eligible:true, blockers:[] });
  assert.deepEqual(simulateMergeDecision({ ...common, approvalOnLatestHead:false }), { eligible:false, blockers:["latest-head-approval"] });
  assert.deepEqual(simulateMergeDecision({ ...common, universal:"failure" }), { eligible:false, blockers:["Universal PR Gate"] });
  assert.deepEqual(simulateMergeDecision({ ...common, sentinel:"failure" }), { eligible:false, blockers:["Gate Integrity Sentinel"] });
  assert.deepEqual(simulateMergeDecision({ ...common, sentinel:"failure", breakGlass }, approvalContext), { eligible:true, blockers:[] });
  assert.throws(() => simulateMergeDecision({ ...common, sentinel:"failure", breakGlass }), /external approval context required/);
  assert.throws(() => simulateMergeDecision({ ...common, sentinel:"failure", breakGlass }, { ...approvalContext, decision:"PENDING" }), /must be APPROVED/);
  assert.throws(() => simulateMergeDecision({ ...common, sentinel:"failure", breakGlass:{ ...breakGlass, humanApproval:{ ...breakGlass.humanApproval, headSha:"b".repeat(40) } } }, approvalContext), /human approval head mismatch/);
});

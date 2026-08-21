import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { validateGateEvolutionRequest, validatePersonalAccountPayload, validatePersonalAccountReadback } from "./validate-f2-gov-03.mjs";

const BASE = "5f0af6759ee221869b3fa35fd124a6dd9aa1328b";
const CHECKS = ["Gate Integrity Sentinel", "Universal PR Gate"];
const REHEARSAL = {
  issue:43, pr:44, targetBranch:"rehearsal/f2-gov-03-f2-target",
  firstHead:"0a679d2b85a9f6afc615c9a21aed12a0bf834a5b",
  staleProbeHead:"2ff7508ca55698638c566880e64bb5c3c4078021",
  putStatus:200, deleteStatus:204, postDeleteGetStatus:404,
  reviewer:"felipemartinsal-boop", reviewedHead:"0a679d2b85a9f6afc615c9a21aed12a0bf834a5b",
  reviewStateAfterNewCommit:"DISMISSED",
  firstRuns:[32412367414,32412367305,32412367570],
  staleProbeRuns:[32449572713,32449573964,32449574007],
  merged:false, result:"ATIVAVEL",
};
const SCENARIO_SUITES = {
  documentation:["gate-contract","governance-contracts","deploy-protection","audit-contract"],
  tests:["gate-contract","governance-contracts","deploy-protection","audit-contract"],
  page:["browser-baseline","visual-evidence"], asset:["browser-baseline","visual-evidence"],
  unknown:["fail-closed"], "invalid-fixture":["governance-contracts"],
  "protected-component":["Gate Integrity Sentinel"],
};
const SCENARIOS = [
  ["documentation", "SUCCESS_AFTER_REVIEW"],
  ["tests", "SUCCESS_AFTER_REVIEW"],
  ["page", "FAILURE_VISUAL_POLICY"],
  ["asset", "FAILURE_VISUAL_POLICY"],
  ["unknown", "FAILURE_UNKNOWN_PATH"],
  ["invalid-fixture", "FAILURE_CONTRACT"],
  ["protected-component", "FAILURE_SENTINEL"],
];
const ACTIVATION_ORDER = [
  "seal-before-state", "reconfirm-gates", "apply-protection", "restrict-merge-methods",
  "independent-readback", "post-activation-pr", "prove-post-activation", "close-trial", "council-via-a-decision",
];
const ROLLBACK_STEPS = [
  "Freeze merges and record named actor, UTC time, incident, head and base.",
  "Export and hash the active protection and repository merge settings before rollback.",
  "Because the sealed state is unprotected, DELETE only main branch protection and require HTTP 204 followed by GET HTTP 404.",
  "Restore merge methods exactly to merge=true, squash=true, rebase=true from the sealed state.",
  "Confirm main SHA did not change, rulesets remain absent and deployments remain zero.",
  "Keep Via B mandatory and require a new Council decision before any reactivation.",
];
const ROLLBACK_EVIDENCE = [
  "sealed before-state JSON and SHA-256", "active-state JSON and SHA-256", "actor and human decision",
  "HTTP statuses and UTC timestamps", "post-rollback GET and repository settings", "post-activation/rollback trial run IDs",
];
const COMMANDS = {
  applyProtection:'gh api --method PUT -H "X-GitHub-Api-Version: 2022-11-28" repos/branctstudio-rgb/sitebranct/branches/main/protection --input <VALIDATED_BRANCH_PROTECTION_JSON>',
  restrictMergeMethods:'gh api --method PATCH -H "X-GitHub-Api-Version: 2022-11-28" repos/branctstudio-rgb/sitebranct -F allow_merge_commit=true -F allow_squash_merge=false -F allow_rebase_merge=false',
  readProtection:'gh api -H "X-GitHub-Api-Version: 2022-11-28" repos/branctstudio-rgb/sitebranct/branches/main/protection',
  readRepository:'gh api -H "X-GitHub-Api-Version: 2022-11-28" repos/branctstudio-rgb/sitebranct',
};
const ROLLBACK_COMMANDS = {
  restoreProtection:'gh api --method DELETE -H "X-GitHub-Api-Version: 2022-11-28" repos/branctstudio-rgb/sitebranct/branches/main/protection',
  restoreMergeMethods:'gh api --method PATCH -H "X-GitHub-Api-Version: 2022-11-28" repos/branctstudio-rgb/sitebranct -F allow_merge_commit=true -F allow_squash_merge=true -F allow_rebase_merge=true',
};

const equal = (actual, expected, message) => assert.deepEqual(actual, expected, message);
const ok = (value, message) => assert.ok(value, message);

export function canonicalDocumentView(p) {
  return {
    baseSha:p.baseSha,
    status:p.status,
    target:p.target,
    activationCommands:p.activation.commands,
    rollbackCommands:p.rollback.commands,
    viaBRequiredUntilPostActivationApproval:p.governance.viaBRequiredUntilPostActivationApproval,
  };
}

export function extractDocumentPackage(markdown) {
  const start = "<!-- F2_GOV_04_PACKAGE_START -->";
  const end = "<!-- F2_GOV_04_PACKAGE_END -->";
  equal(markdown.split(start).length - 1, 1, "document package START marker must be unique");
  equal(markdown.split(end).length - 1, 1, "document package END marker must be unique");
  const startIndex = markdown.indexOf(start);
  const endIndex = markdown.indexOf(end);
  ok(startIndex < endIndex, "document package markers out of order");
  const block = markdown.slice(startIndex + start.length, endIndex).trim();
  const match = block.match(/^```json\s*([\s\S]*?)\s*```$/);
  ok(match, "document package must be one JSON block");
  return JSON.parse(match[1]);
}

export function simulateMergeDecision(state, approvalContext) {
  ok(state && typeof state === "object", "merge state missing");
  ok(["success", "failure", "pending", "missing"].includes(state.universal), "universal check state invalid");
  ok(["success", "failure", "pending", "missing"].includes(state.sentinel), "sentinel check state invalid");
  ok(Number.isInteger(state.approvals) && state.approvals >= 0, "approval count invalid");
  ok(typeof state.approvalOnLatestHead === "boolean", "latest-head approval state invalid");
  ok(typeof state.conversationsResolved === "boolean", "conversation state invalid");
  ok(typeof state.admin === "boolean", "actor class invalid");
  let sentinelRequired = true;
  if (state.breakGlass !== undefined) {
    validateGateEvolutionRequest(state.breakGlass, approvalContext);
    sentinelRequired = false;
  }
  const blockers = [];
  if (state.universal !== "success") blockers.push("Universal PR Gate");
  if (sentinelRequired && state.sentinel !== "success") blockers.push("Gate Integrity Sentinel");
  if (state.approvals < 1) blockers.push("required-review");
  if (!state.approvalOnLatestHead) blockers.push("latest-head-approval");
  if (!state.conversationsResolved) blockers.push("conversation-resolution");
  return { eligible:blockers.length === 0, blockers };
}

export function validateActivationPackage(p) {
  ok(p && typeof p === "object" && !Array.isArray(p), "activation package must be an object");
  equal(p.schemaVersion, 1, "schema version mismatch");
  equal(p.repository, "branctstudio-rgb/sitebranct", "repository mismatch");
  equal(p.issue, 45, "Issue-lock mismatch");
  equal(p.status, "ACTIVATION_PACKAGE_NOT_APPLIED", "package must remain offline and not applied");
  equal(p.baseSha, BASE, "activation base mismatch");

  equal(p.currentState, {
    mainProtected:false, rulesets:[], requiredChecks:[], protectedBranches:[],
    repositoryMergeMethods:{ allow_merge_commit:true, allow_squash_merge:true, allow_rebase_merge:true },
    productionDeploymentsAtBase:0,
  }, "sealed current state mismatch");
  equal(p.evidence.schemaCorrection, { pr:42, mergeSha:BASE, result:"APPROVED_AND_INTEGRATED" }, "schema correction evidence mismatch");
  equal(p.evidence.realDisposableRehearsal, REHEARSAL, "real rehearsal evidence mismatch");
  equal(p.evidence.universalEightScenarioTrial, {
    prs:[30,31,32,33,34,35,36,37], result:"8_OF_8_MATCHED_EXPECTED_CAUSE",
  }, "universal trial evidence mismatch");

  validatePersonalAccountPayload(p.target.branchProtection);
  equal(p.target.repositoryMergeMethods.allow_merge_commit, true, "normal merge must remain enabled");
  equal(p.target.repositoryMergeMethods.allow_squash_merge, false, "squash merges must be disabled");
  equal(p.target.repositoryMergeMethods.allow_rebase_merge, false, "rebase merges must be disabled");
  equal(p.target.branchProtection.required_linear_history, false, "normal merge requires non-linear history");

  equal(p.simulation.checksBornOnEveryPullRequest, CHECKS, "universal check birth mismatch");
  equal(p.simulation.administrators, "SUBJECT_TO_IDENTICAL_RULES_NO_BYPASS", "administrator bypass detected");
  equal(p.simulation.staleApproval, "DISMISSED_AFTER_NEW_COMMIT", "stale approval contract mismatch");
  equal(p.simulation.scenarios.map(({ id, terminal }) => [id, terminal]), SCENARIOS, "simulation scenarios mismatch");
  for (const scenario of p.simulation.scenarios) equal(scenario.requiredSuites, SCENARIO_SUITES[scenario.id], `scenario suites mismatch: ${scenario.id}`);

  equal(p.governance.viaBRequiredUntilPostActivationApproval, true, "Via B cannot be removed before post-activation approval");
  equal(p.governance.viaARemainsInactive, true, "Via A cannot be claimed active by this package");
  equal(p.governance.noPermanentBypass, true, "permanent bypass forbidden");
  equal(p.governance.breakGlass, {
    automatic:false, requiresNamedHumanDecision:true, requiresExactHeadAndBase:true, retainsUniversalGate:true,
    temporarySentinelRemovalOnly:true, restorationDeadlineMinutes:60, requiresBeforeAfterHashes:true, requiresPostRestoreTrials:true,
  }, "break-glass ceremony mismatch");

  equal(p.authorization, {
    applyProtection:false, changeMergeMethods:false, openPostActivationTrial:false, humanApprovalMustBindExactHeadAndBase:true,
  }, "this package cannot authorize activation");
  equal(p.activation.commandsExecuted, false, "activation commands must remain unexecuted");
  equal(p.activation.apiVersion, "2022-11-28", "API version mismatch");
  equal(p.activation.order.map(({ id }) => id), ACTIVATION_ORDER, "activation order mismatch");
  for (const step of p.activation.order) ok(typeof step.action === "string" && step.action.length >= 40, `activation action incomplete: ${step.id}`);
  equal(p.activation.commands, COMMANDS, "activation commands mismatch");
  validatePersonalAccountReadback(p.activation.expectedReadback.branchProtection);
  equal(p.activation.expectedReadback.branchProtection.required_linear_history?.enabled, false, "readback linear-history mismatch");
  equal(p.activation.expectedReadback.repositoryMergeMethods, {
    allow_merge_commit:true, allow_squash_merge:false, allow_rebase_merge:false,
  }, "readback merge-method mismatch");

  equal(p.rollback.commandsExecuted, false, "rollback commands must remain unexecuted");
  equal(p.rollback.restoresSealedProtection, true, "rollback must restore sealed protection");
  equal(p.rollback.restoresSealedMergeMethods, true, "rollback must restore sealed merge methods");
  equal(p.rollback.availableDuringMergeLockout, true, "rollback must remain API-available during lockout");
  ok(typeof p.rollback.trigger === "string" && p.rollback.trigger.length >= 80, "rollback trigger incomplete");
  equal(p.rollback.steps, ROLLBACK_STEPS, "rollback steps mismatch");
  equal(p.rollback.commands, ROLLBACK_COMMANDS, "rollback commands mismatch");
  equal(p.rollback.evidence, ROLLBACK_EVIDENCE, "rollback evidence mismatch");
  equal(p.authorizationText, `Pessoa: <NAMED_HUMAN>. Decisão: autorizo aplicar o pacote F2-GOV-04 exclusivamente no head <EXACT_PR_HEAD> e base ${BASE}, após reconfirmar ausência de drift. Autorizo somente o PUT exato de branch protection na main e o PATCH merge=true/squash=false/rebase=false descritos no pacote. Via B permanece até o ensaio pós-ativação e nova decisão humana. Qualquer mudança de head, base, checks, app_id, payload ou métodos invalida esta autorização.`, "authorization text mismatch");
  return true;
}

async function main() {
  const root = new URL("../../", import.meta.url);
  const activation = JSON.parse(await readFile(new URL("fixtures/audit/f2-gov-04-main-activation-package.json", root), "utf8"));
  validateActivationPackage(activation);
  process.stdout.write("F2-GOV-04 activation package: VALID, OFFLINE, NOT APPLIED\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`F2-GOV-04 validation failed: ${error.message}`); process.exitCode = 1; });
}

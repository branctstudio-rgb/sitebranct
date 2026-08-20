import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

const EXPECTED_BASE = "3fd31e615a8914aaa1b1d7bcb0a093222eb678ce";
const EXPECTED_COMPATIBILITY_BASE = "32e63a416793a2ba0ca917d71ec652cc6bc22deb";
const EXPECTED_API_VERSION = "2022-11-28";
const EXPECTED_CHECKS = [
  { name:"Gate Integrity Sentinel", workflow:"Gate Integrity Sentinel", event:"pull_request_target", appId:15368, appSlug:"github-actions" },
  { name:"Universal PR Gate", workflow:"Universal PR Gate Candidate", event:"pull_request", appId:15368, appSlug:"github-actions" },
];
const EXPECTED_HASHES = {
  gateEvolutionOptions:"a72ddf204532051b0fcf8b8eb28e02c232f7701c803656deefc97475bd6afae7",
  removalCriteria:"8761d51ab949c8840736a72f2c6968617b78e5220aa33643b30816d210c187bc",
  rollbackSteps:"60a3a16be92a5c3a58049f8597e028c1bddcab4e4adf7df0e0ea7cb18f199e04",
  rollbackEvidence:"6288d7f66baba78116b0bd2a23715b3e63a648360d50af37f4180338f19bfcd7",
};

const equal = (actual, expected, message) => assert.deepEqual(actual, expected, message);
const ok = (value, message) => assert.ok(value, message);
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const EXPECTED_API_CHECKS = EXPECTED_CHECKS.map(({ name, appId }) => ({ context:name, app_id:appId }));
const PERSONAL_REVIEW_KEYS = [
  "dismiss_stale_reviews",
  "require_code_owner_reviews",
  "require_last_push_approval",
  "required_approving_review_count",
];
const PERSONAL_PAYLOAD_KEYS = [
  "allow_deletions",
  "allow_force_pushes",
  "allow_fork_syncing",
  "block_creations",
  "enforce_admins",
  "lock_branch",
  "required_conversation_resolution",
  "required_linear_history",
  "required_pull_request_reviews",
  "required_status_checks",
  "restrictions",
];

function rejectOrganizationCollections(value, location = "apiPayload") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    ok(key !== "dismissal_restrictions", `organization-only field forbidden: ${location}.${key}`);
    ok(key !== "bypass_pull_request_allowances", `organization-only field forbidden: ${location}.${key}`);
    ok(!["users", "teams", "apps"].includes(key), `organization-only collection forbidden: ${location}.${key}`);
    rejectOrganizationCollections(child, `${location}.${key}`);
  }
}

export function validatePersonalAccountPayload(payload) {
  ok(payload && typeof payload === "object" && !Array.isArray(payload), "personal-account payload must be an object");
  rejectOrganizationCollections(payload);
  equal(Object.keys(payload).sort(), PERSONAL_PAYLOAD_KEYS, "personal-account payload contains unknown or missing top-level fields");
  const checks = payload.required_status_checks;
  equal(Object.keys(checks ?? {}).sort(), ["checks", "strict"], "app-bound status checks must contain only strict and checks");
  equal(checks.strict, true, "latest base requirement missing");
  equal(checks.checks, EXPECTED_API_CHECKS, "API payload required checks mismatch");
  for (const check of checks.checks) {
    ok(Number.isInteger(check.app_id) && check.app_id === 15368, `required check app_id invalid: ${check.context ?? "unknown"}`);
  }
  equal(payload.enforce_admins, true, "administrators must remain protected");
  const reviews = payload.required_pull_request_reviews;
  equal(Object.keys(reviews ?? {}).sort(), PERSONAL_REVIEW_KEYS, "personal-account review payload contains unsupported restrictions or bypass");
  equal(reviews.required_approving_review_count, 1, "approval requirement cannot be reduced");
  equal(reviews.dismiss_stale_reviews, true, "stale approvals must be dismissed");
  equal(reviews.require_last_push_approval, true, "last-push approval must remain required");
  equal(reviews.require_code_owner_reviews, false, "code-owner review policy changed");
  equal(payload.restrictions, null, "top-level push restrictions must remain null for a personal repository");
  equal(payload.required_conversation_resolution, true, "conversation resolution must remain required");
  equal(payload.required_linear_history, false, "normal merge requires non-linear history");
  equal(payload.allow_force_pushes, false, "force pushes must remain blocked");
  equal(payload.allow_deletions, false, "branch deletion must remain blocked");
  equal(payload.block_creations, false, "branch creation policy changed");
  equal(payload.lock_branch, false, "branch lock policy changed");
  equal(payload.allow_fork_syncing, false, "fork sync policy changed");
  return true;
}

export function validatePersonalAccountReadback(readback) {
  ok(readback && typeof readback === "object" && !Array.isArray(readback), "personal-account readback must be an object");
  rejectOrganizationCollections(readback, "readback");
  equal(readback.required_status_checks?.strict, true, "readback strict checks mismatch");
  equal(readback.required_status_checks?.checks, EXPECTED_API_CHECKS, "readback required checks mismatch");
  equal(readback.enforce_admins?.enabled, true, "readback administrators are not protected");
  const reviews = readback.required_pull_request_reviews;
  ok(!Object.hasOwn(reviews ?? {}, "dismissal_restrictions"), "readback contains organization dismissal restrictions");
  ok(!Object.hasOwn(reviews ?? {}, "bypass_pull_request_allowances"), "readback contains review bypass allowances");
  equal(reviews?.required_approving_review_count, 1, "readback approval requirement mismatch");
  equal(reviews?.dismiss_stale_reviews, true, "readback stale approval policy mismatch");
  equal(reviews?.require_last_push_approval, true, "readback last-push policy mismatch");
  equal(readback.restrictions, null, "readback top-level restrictions must be null");
  equal(readback.required_conversation_resolution?.enabled, true, "readback conversation policy mismatch");
  equal(readback.allow_force_pushes?.enabled, false, "readback force-push policy mismatch");
  equal(readback.allow_deletions?.enabled, false, "readback deletion policy mismatch");
  return true;
}

export function canonicalProposalView(proposal) {
  return {
    schemaVersion:proposal.schemaVersion,
    repository:proposal.repository,
    status:proposal.status,
    measurementBase:proposal.measurement.baseSha,
    target:{
      branch:proposal.target.branch,
      mechanism:proposal.target.mechanism,
      requiredChecks:proposal.target.requiredChecks,
      rules:proposal.target.rules,
      bypass:proposal.target.bypass,
      mergePolicy:proposal.target.mergePolicy,
      apiCompatibility:proposal.target.apiCompatibility,
      apiPayload:proposal.target.apiPayload,
    },
    gateEvolution:{
      required:proposal.gateEvolution.required,
      recommendedOption:proposal.gateEvolution.recommendedOption,
      optionIds:proposal.gateEvolution.options.map(({ id }) => id),
    },
    activation:{
      authorized:proposal.activation.authorized,
      stageOneRequired:proposal.activation.stageOneDisposableTrial.required,
      stageTwoRequired:proposal.activation.stageTwoMainObservation.required,
    },
    rollbackTrigger:proposal.rollback.trigger,
    pendingCouncilDecisions:proposal.pendingCouncilDecisions,
  };
}

export function extractDocumentContract(markdown) {
  const starts = [...markdown.matchAll(/<!-- F2_GOV_03_CANONICAL_START -->/g)];
  const ends = [...markdown.matchAll(/<!-- F2_GOV_03_CANONICAL_END -->/g)];
  equal(starts.length, 1, "document must contain exactly one canonical start marker");
  equal(ends.length, 1, "document must contain exactly one canonical end marker");
  ok(starts[0].index < ends[0].index, "canonical document markers are reversed");
  const block = markdown.slice(starts[0].index + starts[0][0].length, ends[0].index);
  const json = block.match(/```json\s*([\s\S]*?)\s*```/);
  ok(json, "canonical document JSON block missing");
  return JSON.parse(json[1]);
}

export function validateRequiredCheckObservation(observation) {
  ok(observation?.started === true, "required check did not start");
  ok(EXPECTED_CHECKS.some(({ name }) => name === observation.name), "required check name is not exact");
  equal(observation.appId, 15368, "required check app source must be github-actions");
  equal(observation.appSlug, "github-actions", "required check app source must be github-actions");
  equal(observation.headSha, observation.expectedHeadSha, "required check belongs to another SHA");
  equal(observation.status, "completed", "required check did not complete");
  equal(observation.conclusion, "success", "required check did not conclude success");
  return true;
}

export function validateGateEvolutionRequest(request, approvalContext) {
  ok(approvalContext && typeof approvalContext === "object", "external approval context required");
  equal(approvalContext.decision, "APPROVED", "external human decision must be APPROVED");
  ok(typeof approvalContext.actor === "string" && approvalContext.actor.trim().length >= 2, "named human approval actor required");
  ok(!/^(COUNCIL_DECISION_REQUIRED|PENDING|TBD|UNKNOWN|SYSTEM|AGENT)$/i.test(approvalContext.actor.trim()), "human approval actor cannot be a placeholder");
  ok(Array.isArray(request?.protectedPathsChanged) && request.protectedPathsChanged.length > 0, "protected path inventory required");
  ok(/^F2-GATE-CHANGE-[A-Z0-9-]+$/.test(request.ceremonyId ?? ""), "ceremony identifier required");
  ok(/^[0-9a-f]{40}$/.test(request.humanApproval?.headSha ?? "") && /^[0-9a-f]{40}$/.test(request.humanApproval?.baseSha ?? ""), "human approval must bind head and base");
  equal(request.ceremonyId, approvalContext.ceremonyId, "ceremony identifier does not match external approval");
  equal(request.humanApproval?.actor, approvalContext.actor, "human approval actor mismatch");
  equal(request.humanApproval?.headSha, approvalContext.headSha, "human approval head mismatch");
  equal(request.humanApproval?.baseSha, approvalContext.baseSha, "human approval base mismatch");
  equal(request.snapshotRecorded, true, "pre-change protection snapshot required");
  equal(request.temporaryChange, ["remove Gate Integrity Sentinel only from required checks"], "ceremony may suspend only the Sentinel requirement");
  equal(request.retainedChecks, ["Universal PR Gate"], "retained check set mismatch");
  ok(Number.isInteger(request.restorationDeadlineMinutes) && request.restorationDeadlineMinutes > 0 && request.restorationDeadlineMinutes <= 60, "restoration deadline must be bounded to 60 minutes");
  equal(request.postRestoreTrialsRequired, true, "post-restoration trials required");
  return true;
}

export function validateProposal(proposal) {
  equal(proposal?.schemaVersion, 1, "schema version mismatch");
  equal(proposal.repository, "branctstudio-rgb/sitebranct", "repository mismatch");
  equal(proposal.status, "PROPOSAL_NOT_APPLIED", "proposal must not claim active protection");
  equal(proposal.measurement?.baseSha, EXPECTED_BASE, "measurement base requires new human approval");
  equal(proposal.measurement?.protectionActive, false, "current protection state mismatch");
  equal(proposal.measurement?.rulesets, [], "current rulesets state mismatch");
  equal(proposal.measurement?.requiredChecks, [], "current required checks state mismatch");
  equal(proposal.target?.branch, "main", "target branch mismatch");
  equal(proposal.target?.mechanism, "classic_branch_protection", "target mechanism mismatch");
  equal(proposal.target.requiredChecks.map(({ name }) => name).sort(), EXPECTED_CHECKS.map(({ name }) => name).sort(), "required check inventory mismatch");
  for (const check of proposal.target.requiredChecks) {
    const expected = EXPECTED_CHECKS.find(({ name }) => name === check.name);
    equal({ workflow:check.workflow, event:check.event }, { workflow:expected.workflow, event:expected.event }, `required check provenance mismatch: ${check.name}`);
    equal(check.appId, 15368, "required check app source must be github-actions");
    equal(check.appSlug, "github-actions", "required check app source must be github-actions");
  }
  const rules = proposal.target.rules;
  for (const key of ["requirePullRequest", "dismissStaleApprovals", "requireLastPushApproval", "requireConversationResolution", "blockDirectPush", "blockForcePush", "blockDeletion"]) equal(rules[key], true, `required rule missing: ${key}`);
  equal(rules.includeAdministrators, true, "administrator decision cannot be silently exempt");
  ok([1, 2].includes(rules.recommendedApprovals), "recommended approvals must be one or two");
  equal(rules.requireLinearHistory, false, "normal merge requires non-linear history");
  equal(proposal.target.mergePolicy.recommendedMethods, ["merge_commit"], "normal merge must remain compatible");
  equal(proposal.target.bypass.broad, false, "broad bypass forbidden");
  equal(proposal.target.bypass.permanent, false, "permanent bypass forbidden");
  equal(proposal.target.bypass.createdByThisProposal, false, "proposal cannot create bypass");
  equal(proposal.target.bypass.agentsAllowed, false, "agents cannot bypass protection");
  equal(proposal.target.bypass.breakGlassRequiresSeparateHumanDecision, true, "break-glass requires a separate human decision");
  const payload = proposal.target.apiPayload;
  equal(proposal.target.apiCompatibility, {
    ownerType:"User",
    apiVersion:EXPECTED_API_VERSION,
    measuredAtBase:EXPECTED_COMPATIBILITY_BASE,
    evidenceIssue:40,
    incompatibleRequestFields:[
      "required_status_checks.contexts with app-bound checks",
      "required_pull_request_reviews.dismissal_restrictions",
      "required_pull_request_reviews.bypass_pull_request_allowances",
    ],
    omissionSemantics:"No user, team, app or bypass allowance is granted; omitted organization-only fields are absent permissions.",
  }, "personal-account API compatibility contract mismatch");
  validatePersonalAccountPayload(payload);
  equal(payload.enforce_admins, rules.includeAdministrators, "API payload administrator mismatch");
  equal(payload.required_pull_request_reviews?.required_approving_review_count, rules.recommendedApprovals, "API payload approval count mismatch");
  equal(payload.required_pull_request_reviews?.dismiss_stale_reviews, true, "API payload stale approval mismatch");
  equal(payload.required_pull_request_reviews?.require_last_push_approval, true, "API payload last-push approval mismatch");
  equal(payload.required_conversation_resolution, true, "API payload conversation resolution mismatch");
  equal(payload.required_linear_history, false, "normal merge requires non-linear history");
  equal(payload.allow_force_pushes, false, "force pushes must remain blocked");
  equal(payload.allow_deletions, false, "main deletion must remain blocked");
  equal(proposal.gateEvolution.required, true, "protected gate evolution requires ceremony");
  ok(proposal.gateEvolution.options?.length >= 2, "at least two gate evolution options required");
  equal(proposal.gateEvolution.recommendedOption, "temporary-sentinel-requirement-ceremony", "recommended gate evolution option mismatch");
  equal(hash(proposal.gateEvolution.options), EXPECTED_HASHES.gateEvolutionOptions, "gate evolution options mismatch");
  equal(proposal.activation.authorized, false, "activation not authorized");
  equal(proposal.activation.stageOneDisposableTrial?.required, true, "disposable pre-activation trial required");
  equal(proposal.activation.stageTwoMainObservation?.required, true, "post-activation observation required");
  equal(hash(proposal.activation.removeTemporarilyCriteria), EXPECTED_HASHES.removalCriteria, "temporary removal criteria mismatch");
  ok(proposal.rollback?.steps?.length >= 4 && proposal.rollback?.evidence?.length >= 4, "rollback contract missing");
  equal(hash(proposal.rollback.steps), EXPECTED_HASHES.rollbackSteps, "rollback steps mismatch");
  equal(hash(proposal.rollback.evidence), EXPECTED_HASHES.rollbackEvidence, "rollback evidence mismatch");
  equal([...proposal.pendingCouncilDecisions].sort(), [
    "administrators-subject-to-rules",
    "approver-identities",
    "break-glass-actor",
    "gate-evolution-authorization",
    "merge-methods",
    "one-or-two-approvals",
    "required-check-identities",
  ], "Council decisions must remain explicit");
  return true;
}

async function main() {
  const root = new URL("../../", import.meta.url);
  const proposal = JSON.parse(await readFile(new URL("fixtures/audit/f2-gov-03-protection-proposal.json", root), "utf8"));
  const document = await readFile(new URL("docs/audit/phase-2/governance/f2-gov-03-proposal.md", root), "utf8");
  validateProposal(proposal);
  equal(extractDocumentContract(document), canonicalProposalView(proposal), "document, fixture and payload diverge");
  console.log("F2-GOV-03 proposal: VALID, OFFLINE, NOT APPLIED");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`F2-GOV-03 validation failed: ${error.message}`); process.exitCode = 1; });
}

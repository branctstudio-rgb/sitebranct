import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const expectedBase = "dce434dd3fe863a724ce8ea879d29093473dde4c";
const realChecks = ["contract", "Verificar escopo do deploy"];
const expectedInventory = [
  {
    name: "contract",
    workflow: "Offline audit contract",
    observedSha: "c0f2abcfdbf028e90a5041501b1def21aa5608ca",
    runsOnEveryPullRequest: false,
    pathScope: "docs/audit/**, fixtures/audit/**, tests/audit/**, audit workflow",
  },
  {
    name: "Verificar escopo do deploy",
    workflow: "Deploy para Hostinger (FTP)",
    observedSha: "949524e131c45478d3c531ec103d74fae73b1537",
    runsOnEveryPullRequest: false,
    pathScope: "published paths and deploy-protection paths",
  },
];
const auditWorkflow = await readFile(new URL(".github/workflows/audit-offline.yml", root), "utf8");
const deployWorkflow = await readFile(new URL(".github/workflows/deploy.yml", root), "utf8");

if (process.env.F2_GOV_TARGET === "current") {
  const current = await readJson("fixtures/audit/f2-gov-01-current-state.json");
  const requirements = [
    ["pull request required", "requirePullRequest"],
    ["direct push blocked", "directPushBlocked"],
    ["force push blocked", "forcePushBlocked"],
    ["deletion blocked", "deletionBlocked"],
    ["current checks required", "requiredStatusChecks", (value) => value.length > 0],
    ["stale approval dismissed", "dismissStaleApprovals"],
    ["material conversations resolved", "requireConversationResolution"],
    ["bypass restricted", "bypassRestricted"],
  ];
  for (const [label, key, predicate = Boolean] of requirements) test(`current governance RED: ${label}`, () => {
    assert.ok(predicate(current.protection[key]), `current main does not satisfy ${key}`);
  });
} else {
  const loadProposal = () => readJson("fixtures/audit/f2-gov-01-ruleset-proposal.json");

  const validateProposal = (proposal) => {
    assert.equal(proposal.schemaVersion, 1, "schemaVersion");
    assert.equal(proposal.repository, "branctstudio-rgb/sitebranct", "repository");
    assert.equal(proposal.measurementBase, expectedBase, "measurement base mismatch");
    assert.equal(proposal.status, "PROPOSAL_NOT_ACTIVE", "proposal must not claim active protection");
    assert.equal(proposal.target.branch, "main", "target branch");
    assert.equal(proposal.target.mechanism, "branch_protection", "mechanism");
    for (const key of ["requirePullRequest", "blockDirectPush", "blockForcePush", "blockDeletion", "dismissStaleApprovals", "requireConversationResolution", "includeAdministrators"]) {
      assert.equal(proposal.rules[key], true, `required protection removed: ${key}`);
    }
    assert.equal(proposal.rules.requireLinearHistory, false, "linear history conflicts with merge commits");
    const payload = proposal.classicBranchProtectionApiPayload;
    assert.equal(payload.enforce_admins, proposal.rules.includeAdministrators, "API payload enforce_admins mismatch");
    assert.equal(payload.required_pull_request_reviews?.dismiss_stale_reviews, proposal.rules.dismissStaleApprovals, "API payload stale-review mismatch");
    assert.equal(payload.required_pull_request_reviews?.require_last_push_approval, proposal.rules.requireLastPushApproval, "API payload last-push approval mismatch");
    assert.equal(payload.required_pull_request_reviews?.required_approving_review_count, proposal.rules.requiredApprovingReviewCount, "API payload review count mismatch");
    assert.equal(payload.required_conversation_resolution, proposal.rules.requireConversationResolution, "API payload conversation-resolution mismatch");
    assert.equal(payload.required_linear_history, proposal.rules.requireLinearHistory, "API payload linear-history mismatch");
    assert.equal(payload.allow_force_pushes, false, "API payload must block force pushes");
    assert.equal(payload.allow_deletions, false, "API payload must block deletion");
    assert.equal(payload.required_status_checks, null, "API payload must not require conditional checks");
    assert.deepEqual(proposal.repositoryProcedure.authorizedMergeMethods, ["merge_commit"], "only normal merge is procedurally authorized");
    assert.equal(proposal.repositoryProcedure.squashAuthorized, false, "squash must remain unauthorized");
    assert.equal(proposal.repositoryProcedure.rebaseAuthorized, false, "rebase must remain unauthorized");
    assert.equal(proposal.bypass.agentsAllowed, false, "agent bypass must be forbidden");
    assert.equal(proposal.bypass.broadAdministrativeBypass, false, "broad bypass forbidden");
    assert.equal(proposal.bypass.ownerCanAlterOrRemoveRule, true, "owner removability cannot be denied without proof");
    assert.equal(proposal.activation.activationAuthorized, false, "activation is not authorized");
    assert.equal(proposal.activation.blockedPendingUniversalCheck, true, "unsafe conditional checks must block full activation");
    assert.deepEqual(proposal.checks.inventory, expectedInventory, "real check provenance mismatch");
    assert.deepEqual(proposal.checks.requiredNow, [], "conditional checks cannot be required now");
    assert.deepEqual(proposal.checks.deferred.map(({ name }) => name).sort(), [...realChecks].sort(), "every real conditional check must be deferred explicitly");
    assert.ok(proposal.rollback?.steps?.length >= 3, "rollback missing");
    assert.ok(proposal.antiLockout?.trialScenarios?.includes("documentation-only pull request"), "documentation trial missing");
    assert.ok(proposal.antiLockout?.trialScenarios?.includes("live-file pull request"), "live-file trial missing");
    return true;
  };

  test("F2-GOV-01 proposal is exact, offline and fail-closed", async () => validateProposal(await loadProposal()));

  test("observed conditional checks remain anchored to the real workflows", () => {
    assert.match(auditWorkflow, /^name: Offline audit contract$/m, "audit workflow name changed");
    assert.match(auditWorkflow, /^\s+contract:$/m, "contract check job changed");
    for (const path of ["docs/audit/**", "fixtures/audit/**", "tests/audit/**"]) {
      assert.ok(auditWorkflow.includes(`"${path}"`) || auditWorkflow.includes(`'${path}'`), `audit workflow path scope missing: ${path}`);
    }
    assert.match(deployWorkflow, /^name: Deploy para Hostinger \(FTP\)$/m, "deploy workflow name changed");
    assert.match(deployWorkflow, /^\s+verify-scope:$/m, "deploy scope job changed");
    assert.match(deployWorkflow, /^\s+name: Verificar escopo do deploy$/m, "deploy check display name changed");
    assert.match(auditWorkflow, /^\s+pull_request:$/m, "audit workflow is not PR-triggered");
    assert.match(deployWorkflow, /^\s+pull_request:$/m, "deploy verifier is not PR-triggered");
    assert.match(auditWorkflow, /pull_request:\s*\r?\n\s+paths:/, "audit check must remain path-filtered in this measurement");
    assert.match(deployWorkflow, /pull_request:\s*\r?\n\s+paths:/, "deploy verifier must remain path-filtered in this measurement");
  });

  test("proposal negatives reject security and provenance regressions", async (t) => {
    const proposal = await loadProposal();
    const cases = [
      ["required protection removed", (p) => { p.rules.blockForcePush = false; }, "required protection removed: blockForcePush"],
      ["invented check", (p) => { p.checks.inventory.push({ name:"invented-ci", runsOnEveryPullRequest:true }); }, "real check provenance mismatch"],
      ["real check omitted", (p) => { p.checks.inventory.shift(); }, "real check provenance mismatch"],
      ["linear history enabled", (p) => { p.rules.requireLinearHistory = true; }, "linear history conflicts"],
      ["squash authorized", (p) => { p.repositoryProcedure.squashAuthorized = true; }, "squash must remain unauthorized"],
      ["rebase authorized", (p) => { p.repositoryProcedure.rebaseAuthorized = true; }, "rebase must remain unauthorized"],
      ["broad bypass", (p) => { p.bypass.broadAdministrativeBypass = true; }, "broad bypass forbidden"],
      ["owner falsely immutable", (p) => { p.bypass.ownerCanAlterOrRemoveRule = false; }, "owner removability cannot be denied"],
      ["rollback absent", (p) => { delete p.rollback; }, "rollback missing"],
      ["claims active", (p) => { p.status = "ACTIVE"; }, "proposal must not claim active protection"],
      ["wrong measurement base", (p) => { p.measurementBase = "0000000000000000000000000000000000000000"; }, "measurement base mismatch"],
      ["admin API bypass", (p) => { p.classicBranchProtectionApiPayload.enforce_admins = false; }, "API payload enforce_admins mismatch"],
      ["API allows force push", (p) => { p.classicBranchProtectionApiPayload.allow_force_pushes = true; }, "API payload must block force pushes"],
      ["API allows deletion", (p) => { p.classicBranchProtectionApiPayload.allow_deletions = true; }, "API payload must block deletion"],
      ["API omits review gate", (p) => { p.classicBranchProtectionApiPayload.required_pull_request_reviews = null; }, "API payload stale-review mismatch"],
      ["check falsely universal", (p) => { p.checks.inventory[0].runsOnEveryPullRequest = true; }, "real check provenance mismatch"],
      ["check workflow altered", (p) => { p.checks.inventory[0].workflow = "Invented workflow"; }, "real check provenance mismatch"],
      ["check scope altered", (p) => { p.checks.inventory[1].pathScope = "all pull requests"; }, "real check provenance mismatch"],
      ["check observation SHA altered", (p) => { p.checks.inventory[1].observedSha = expectedBase; }, "real check provenance mismatch"],
    ];
    for (const [label, mutate, expected] of cases) await t.test(label, () => {
      const copy = structuredClone(proposal);
      mutate(copy);
      assert.throws(() => validateProposal(copy), (error) => error.message.includes(expected));
    });
  });
}

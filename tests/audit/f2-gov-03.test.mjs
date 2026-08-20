import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const proposalPath = "fixtures/audit/f2-gov-03-protection-proposal.json";
const validatorPath = "scripts/governance/validate-f2-gov-03.mjs";
const documentPath = "docs/audit/phase-2/governance/f2-gov-03-proposal.md";
const supportingDocuments = [
  "docs/audit/phase-2/governance/f2-gov-03-threat-matrix.md",
  "docs/audit/phase-2/governance/f2-gov-03-activation-plan.md",
  "docs/audit/phase-2/governance/f2-gov-03-handoff.md",
  "docs/audit/phase-2/governance/f2-gov-03-implementation-plan.md",
];
const expectedBase = "3fd31e615a8914aaa1b1d7bcb0a093222eb678ce";
const exactChecks = ["Gate Integrity Sentinel", "Universal PR Gate"];

const read = (path) => readFile(new URL(path, root), "utf8");
const readJson = async (path) => JSON.parse(await read(path));
const loadValidator = async () => import(new URL(validatorPath, root));

test("base RED: a verifiable F2-GOV-03 proposal contract must exist", () => {
  for (const path of [proposalPath, validatorPath, documentPath, ...supportingDocuments]) {
    assert.equal(existsSync(new URL(path, root)), true, `F2-GOV-03 contract missing: ${path}`);
  }
});

test("proposal is exact, offline, merge-commit compatible and not active", async () => {
  const [{ validateProposal }, proposal] = await Promise.all([loadValidator(), readJson(proposalPath)]);
  assert.equal(validateProposal(proposal), true);
  assert.equal(proposal.measurement.baseSha, expectedBase);
  assert.equal(proposal.status, "PROPOSAL_NOT_APPLIED");
  assert.deepEqual(proposal.target.requiredChecks.map(({ name }) => name).sort(), exactChecks);
  assert.equal(proposal.target.apiPayload.required_linear_history, false);
  assert.deepEqual(proposal.target.mergePolicy.recommendedMethods, ["merge_commit"]);
  assert.equal(proposal.activation.authorized, false);
});

test("document, fixture and proposed API payload remain structurally identical", async () => {
  const [{ canonicalProposalView, extractDocumentContract }, proposal, document] = await Promise.all([
    loadValidator(), readJson(proposalPath), read(documentPath),
  ]);
  assert.deepEqual(extractDocumentContract(document), canonicalProposalView(proposal));
});

test("supporting documents keep decisions, threats, activation and limits explicit", async () => {
  const [threats, activation, handoff, plan] = await Promise.all(supportingDocuments.map(read));
  assert.match(threats, /lockout/i);
  assert.match(threats, /administrador/i);
  assert.match(threats, /force-push/i);
  assert.match(activation, /Etapa 1[\s\S]*branch descartável/i);
  assert.match(activation, /Etapa 2[\s\S]*main/i);
  assert.match(activation, /Gate Integrity Sentinel[\s\S]*temporariamente/i);
  assert.match(handoff, /PROPOSTA_APTA_PARA_DECISAO|CHANGES_REQUIRED/);
  assert.match(handoff, /Via B continua obrigatória/);
  assert.match(plan, /não autoriza a sua própria execução/i);
});

test("future activation evidence must be on the exact head and explicitly successful", async () => {
  const { validateRequiredCheckObservation } = await loadValidator();
  const valid = { name:"Universal PR Gate", appId:15368, appSlug:"github-actions", headSha:"a".repeat(40), expectedHeadSha:"a".repeat(40), status:"completed", conclusion:"success", started:true };
  assert.equal(validateRequiredCheckObservation(valid), true);
  for (const [label, mutate, message] of [
    ["skipped", (o) => { o.conclusion = "skipped"; }, "required check did not conclude success"],
    ["not started", (o) => { o.started = false; }, "required check did not start"],
    ["old SHA", (o) => { o.headSha = "b".repeat(40); }, "required check belongs to another SHA"],
    ["approximate name", (o) => { o.name = "Universal PR Gate Candidate"; }, "required check name is not exact"],
  ]) test(label, () => {
    const copy = structuredClone(valid);
    mutate(copy);
    assert.throws(() => validateRequiredCheckObservation(copy), (error) => error.message.includes(message));
  });
});

test("proposal negatives fail closed for security, lockout and provenance regressions", async (t) => {
  const { validateProposal } = await loadValidator();
  const proposal = await readJson(proposalPath);
  const cases = [
    ["required check absent", (p) => { p.target.requiredChecks.pop(); }, "required check inventory mismatch"],
    ["wrong check name", (p) => { p.target.requiredChecks[0].name += " Candidate"; }, "required check inventory mismatch"],
    ["API payload diverges", (p) => { p.target.apiPayload.required_status_checks.checks.pop(); }, "API payload required checks mismatch"],
    ["check app source unbound", (p) => { p.target.requiredChecks[0].appId = -1; }, "required check app source must be github-actions"],
    ["base changed", (p) => { p.measurement.baseSha = "0".repeat(40); }, "measurement base requires new human approval"],
    ["gate change without ceremony", (p) => { p.gateEvolution.required = false; }, "protected gate evolution requires ceremony"],
    ["broad bypass", (p) => { p.target.bypass.broad = true; }, "broad bypass forbidden"],
    ["permanent bypass", (p) => { p.target.bypass.permanent = true; }, "permanent bypass forbidden"],
    ["agent bypass", (p) => { p.target.bypass.agentsAllowed = true; }, "agents cannot bypass protection"],
    ["break-glass implicit", (p) => { p.target.bypass.breakGlassRequiresSeparateHumanDecision = false; }, "break-glass requires a separate human decision"],
    ["API review bypass", (p) => { p.target.apiPayload.required_pull_request_reviews.bypass_pull_request_allowances = { users:["attacker"] }; }, "API payload review bypass must be empty"],
    ["admin silently exempt", (p) => { p.target.rules.includeAdministrators = false; }, "administrator decision cannot be silently exempt"],
    ["force push allowed", (p) => { p.target.apiPayload.allow_force_pushes = true; }, "force pushes must remain blocked"],
    ["deletion allowed", (p) => { p.target.apiPayload.allow_deletions = true; }, "main deletion must remain blocked"],
    ["linear history enabled", (p) => { p.target.apiPayload.required_linear_history = true; }, "normal merge requires non-linear history"],
    ["normal merge removed", (p) => { p.target.mergePolicy.recommendedMethods = ["squash"]; }, "normal merge must remain compatible"],
    ["lockout trial absent", (p) => { p.activation.stageOneDisposableTrial.required = false; }, "disposable pre-activation trial required"],
    ["post-activation trial absent", (p) => { p.activation.stageTwoMainObservation.required = false; }, "post-activation observation required"],
    ["rollback absent", (p) => { delete p.rollback; }, "rollback contract missing"],
    ["removal criteria hollow", (p) => { p.activation.removeTemporarilyCriteria = Array(5).fill("x"); }, "temporary removal criteria mismatch"],
    ["rollback steps hollow", (p) => { p.rollback.steps = Array(4).fill("x"); }, "rollback steps mismatch"],
    ["rollback evidence hollow", (p) => { p.rollback.evidence = Array(4).fill("x"); }, "rollback evidence mismatch"],
    ["recommended evolution empty", (p) => { p.gateEvolution.options[0].steps = []; }, "gate evolution options mismatch"],
    ["recommended fail-closed empty", (p) => { p.gateEvolution.options[0].failClosed = ""; }, "gate evolution options mismatch"],
    ["claims active", (p) => { p.status = "ACTIVE"; }, "proposal must not claim active protection"],
    ["activation authorized", (p) => { p.activation.authorized = true; }, "activation not authorized"],
  ];
  for (const [label, mutate, expected] of cases) await t.test(label, () => {
    const copy = structuredClone(proposal);
    mutate(copy);
    assert.throws(() => validateProposal(copy), (error) => error.message.includes(expected));
  });
});

test("protected gate changes require a bounded human ceremony", async () => {
  const { validateGateEvolutionRequest } = await loadValidator();
  const approvalContext = {
    decision:"APPROVED",
    actor:"Rafael",
    ceremonyId:"F2-GATE-CHANGE-2026-001",
    headSha:"a".repeat(40),
    baseSha:expectedBase,
  };
  const valid = {
    protectedPathsChanged:["tests/audit/f2-gov-02c.test.mjs"],
    ceremonyId:"F2-GATE-CHANGE-2026-001",
    humanApproval:{ actor:"Rafael", headSha:"a".repeat(40), baseSha:expectedBase },
    snapshotRecorded:true,
    temporaryChange:["remove Gate Integrity Sentinel only from required checks"],
    retainedChecks:["Universal PR Gate"],
    restorationDeadlineMinutes:60,
    postRestoreTrialsRequired:true,
  };
  assert.equal(validateGateEvolutionRequest(valid, approvalContext), true);
  for (const [label, mutate, expected] of [
    ["no ceremony", (v) => { v.ceremonyId = ""; }, "ceremony identifier required"],
    ["unbound approval", (v) => { v.humanApproval.headSha = ""; }, "human approval must bind head and base"],
    ["broad suspension", (v) => { v.temporaryChange.push("disable all protection"); }, "ceremony may suspend only the Sentinel requirement"],
    ["no restoration", (v) => { v.postRestoreTrialsRequired = false; }, "post-restoration trials required"],
    ["placeholder actor", (v) => { v.humanApproval.actor = "COUNCIL_DECISION_REQUIRED"; }, "human approval actor mismatch"],
    ["ceremony context mismatch", (v) => { v.ceremonyId = "F2-GATE-CHANGE-2026-999"; }, "ceremony identifier does not match external approval"],
    ["head context mismatch", (v) => { v.humanApproval.headSha = "b".repeat(40); }, "human approval head mismatch"],
    ["base context mismatch", (v) => { v.humanApproval.baseSha = "b".repeat(40); }, "human approval base mismatch"],
    ["extra retained check", (v) => { v.retainedChecks.push("Approximate Check"); }, "retained check set mismatch"],
  ]) test(label, () => {
    const copy = structuredClone(valid);
    mutate(copy);
    assert.throws(() => validateGateEvolutionRequest(copy, approvalContext), (error) => error.message.includes(expected));
  });
  assert.throws(() => validateGateEvolutionRequest(valid), (error) => error.message.includes("external approval context required"));
  assert.throws(
    () => validateGateEvolutionRequest(valid, { ...approvalContext, decision:"PENDING" }),
    (error) => error.message.includes("external human decision must be APPROVED"),
  );
});

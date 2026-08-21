import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
const canonicalGitHash = (path) => createHash("sha256").update(execFileSync("git", ["show", `HEAD:${path}`])).digest("hex");
const hashBytes = (value) => createHash("sha256").update(value).digest("hex");

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
  assert.equal(transition.schemaVersion, 1);
  assert.equal(transition.status, "F2_01_AUTHORIZED_IN_DEVELOPMENT");
  assert.equal(transition.historicalPhase1.path, "fixtures/audit/baseline-results.json");
  assert.equal(canonicalGitHash(transition.historicalPhase1.path), transition.historicalPhase1.sha256);
  assert.equal(canonicalGitHash(transition.f201.responsiveTest.path), transition.f201.responsiveTest.copiedSha256);
  assert.equal(canonicalGitHash(transition.f201.targetBaseline.path), transition.f201.targetBaseline.sha256);
  const reportDir = await mkdtemp(join(tmpdir(), "branct-f2-gov-06-"));
  const reportPath = join(reportDir, "report.json");
  let failure;
  const childEnvironment = { ...process.env, F2_01_REPORT_PATH:reportPath };
  delete childEnvironment.NODE_TEST_CONTEXT;
  try { execFileSync("node", ["--test", transition.f201.responsiveTest.path], { encoding:"utf8", env:childEnvironment }); }
  catch (error) { failure = error; }
  try {
    assert.ok(failure, "development state must prove the specific F2-01 RED");
    const output = `${failure.stdout ?? ""}\n${failure.stderr ?? ""}`;
    assert.match(output, /timeout waiting for settled drawer open/, "generic test failures cannot count as expected RED");
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    assert.ok(Array.isArray(report.observations) && report.observations.length >= 1, "RED report must be readable and non-empty");
    assert.ok(report.observations.filter((entry) => entry.overflow).length >= transition.f201.expectedDevelopmentRed.minimumOverflowCount, "RED must prove horizontal overflow");
  } finally { await rm(reportDir, { recursive:true, force:true }); }
});

test("F2-GOV-06 canonical Git hashes ignore checkout EOL but reject semantic byte changes", () => {
  const path = "fixtures/audit/baseline-results.json";
  const blob = execFileSync("git", ["show", `HEAD:${path}`]);
  const expected = canonicalGitHash(path);
  assert.equal(hashBytes(blob), expected, "canonical Git blob must be the hash authority");
  const lf = blob.toString("utf8").replace(/\r\n/g, "\n");
  const crlf = lf.replace(/\n/g, "\r\n");
  assert.equal(canonicalGitHash(path), expected, "LF and CRLF checkouts must resolve the same Git blob");
  for (const [label, mutated] of [
    ["content altered", lf.replace("\"schemaVersion\": 1", "\"schemaVersion\": 2")],
    ["line removed", lf.replace(/^  \"source\":.*\n/m, "")],
    ["lines reordered", lf.replace(/(  \"schemaVersion\": 1,\n)(  \"source\":.*\n)/, "$2$1")],
    ["space altered", lf.replace("\"schemaVersion\": 1", "\"schemaVersion\":  1")],
  ]) {
    assert.notEqual(mutated, lf, `${label}: mutation must change bytes`);
    assert.notEqual(hashBytes(Buffer.from(mutated)), expected, `${label}: canonical hash must reject semantic byte change`);
  }
  assert.notEqual(hashBytes(Buffer.from(crlf)), expected, "checkout CRLF bytes are not substituted for the canonical Git blob");
  assert.throws(() => canonicalGitHash("fixtures/audit/absent-baseline.json"), /fatal|not a valid object name|exists/, "missing blob must fail closed");
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

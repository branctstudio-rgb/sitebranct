import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const readJson = async (path) => JSON.parse(await read(path));
const sentinelPath = ".github/workflows/gate-integrity-sentinel.yml";

function validateSentinel(source) {
  assert.match(source, /^name: Gate Integrity Sentinel$/m, "stable sentinel workflow name missing");
  assert.match(source, /^\s+pull_request_target:\s*$/m, "pull_request_target trigger missing");
  assert.doesNotMatch(source, /^\s+pull_request:\s*$/m, "sentinel must use the base-only event");
  assert.doesNotMatch(source, /^\s+paths(?:-ignore)?:/m, "sentinel path filter forbidden");
  assert.doesNotMatch(source, /^\s+workflow_dispatch:|^\s+push:/m, "sentinel manual or push trigger forbidden");
  assert.match(source, /^permissions:\s*\r?\n\s+contents: read\s*$/m, "sentinel permissions must be contents read only");
  assert.match(source, /^\s+name: Gate Integrity Sentinel$/m, "stable sentinel check name missing");
  const jobHeader = source.slice(source.indexOf("  gate-integrity-sentinel:"), source.indexOf("    steps:"));
  assert.doesNotMatch(jobHeader, /^\s+if:/m, "sentinel job-level condition forbidden");
  assert.doesNotMatch(source, /actions\/checkout|\buses:|secrets\.|github\.token|GITHUB_TOKEN|pull_request\.head|merge_commit_sha|child_process|\beval\s*\(|\bexec\s*\(|\bspawn\s*\(/i, "sentinel must not checkout, execute PR content or access credentials");
  assert.match(source, /api\.github\.com/, "sentinel must inspect public PR metadata");
  assert.match(source, /per_page=100/, "sentinel pagination missing");
  assert.match(source, /page > 30/, "sentinel must fail closed at the API file limit");
  for (const path of [
    ".github/workflows/universal-pr-gate.yml",
    ".github/workflows/gate-integrity-sentinel.yml",
    "scripts/governance/classify-pr-paths.mjs",
  ]) assert.ok(source.includes(`\"${path}\"`), `protected gate path missing: ${path}`);
  assert.match(source, /protected gate component changed/, "protected change failure missing");
  return true;
}

function protectedGatePaths(source) {
  validateSentinel(source);
  const block = source.match(/const protectedPaths = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(block, "protected gate set missing");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function assertSentinelAllows(source, paths) {
  const protectedPaths = new Set(protectedGatePaths(source));
  const blocked = paths.filter((path) => protectedPaths.has(path));
  if (blocked.length) throw new Error(`protected gate component changed: ${blocked.join(", ")}`);
  return true;
}

function validateHistoricalIsolation(source) {
  assert.doesNotMatch(source, /execFileSync\("git", \["diff", "--name-only", base\]/, "historical allowlist still evaluates every current PR diff");
  return true;
}

test("F2-GOV-02B evidence is permanent and records the real failures", async () => {
  const evidence = await readJson("fixtures/audit/f2-gov-02b-observed-results.json");
  assert.equal(evidence.baseSha, "c169aa4cb727a50f9b304f3119305ffe6e630a71");
  assert.deepEqual(evidence.scenarios.map(({ pr }) => pr), [16, 17, 18, 19, 20, 21, 22]);
  assert.deepEqual(evidence.scenarios.map(({ run }) => run), [32280148501, 32280152068, 32280154314, 32280157648, 32280574153, 32280164068, 32280167732]);
  assert.deepEqual(evidence.scenarios.filter(({ expected, observed }) => expected !== observed).map(({ id }) => id), ["documentation-pr", "tests-pr", "workflow-pr"]);
});

test("future seven-scenario repetition has exact post-fix outcomes but is not authorized", async () => {
  const expected = await readJson("fixtures/audit/f2-gov-02c-expected-results.json");
  assert.equal(expected.status, "CONTRACT_ONLY_DO_NOT_RUN_REAL_REHEARSALS");
  assert.deepEqual(expected.scenarios.map(({ id, expected }) => [id, expected]), [
    ["documentation-pr", "SUCCESS"], ["tests-pr", "SUCCESS"],
    ["live-page-pr", "FAILURE"], ["asset-pr", "FAILURE"],
    ["workflow-pr", "SUCCESS"], ["unknown-path-pr", "FAILURE"],
    ["deliberately-invalid-pr", "FAILURE"], ["protected-gate-change", "FAILURE"],
  ]);
  for (const id of ["live-page-pr", "asset-pr"]) {
    const scenario = expected.scenarios.find((item) => item.id === id);
    assert.ok(scenario.requiredSteps.includes("browser-baseline"));
    assert.ok(scenario.requiredSteps.includes("visual-evidence"));
    assert.equal(scenario.forbiddenFailure, "historical F2-00 allowlist");
  }
  assert.equal(expected.realPullRequestsAuthorized, false);
  assert.equal(expected.technicalProtectionActivationAuthorized, false);
});

test("F2-00 historical scope is closed data, not a global PR diff allowlist", async () => {
  const [contract, governanceTest] = await Promise.all([
    readJson("docs/audit/phase-2/f2-00-contract.json"),
    read("tests/audit/phase-2-governance.test.mjs"),
  ]);
  assert.deepEqual(contract.delivery.files, [
    "CLAUDE.md",
    "docs/audit/phase-2/component-catalog.md",
    "docs/audit/phase-2/f2-00-contract.json",
    "docs/audit/phase-2/f2-00-handoff.md",
    "docs/audit/phase-2/f2-01-implementation-plan.md",
    "docs/audit/phase-2/f2-01-specification.md",
    "docs/audit/phase-2/governance-decision.md",
    "docs/audit/phase-2/visual-constitution.md",
    "tests/audit/phase-2-governance.test.mjs",
    "tests/audit/site-audit.test.mjs"
  ]);
  assert.equal(validateHistoricalIsolation(governanceTest), true);
  const reintroduced = `${governanceTest}\nexecFileSync("git", ["diff", "--name-only", base]);`;
  assert.throws(() => validateHistoricalIsolation(reintroduced), /historical allowlist still evaluates every current PR diff/);
});

test("live suites run even when an earlier applicable check fails", async () => {
  const workflow = await read(".github/workflows/universal-pr-gate.yml");
  assert.match(workflow, /name: Reproduce browser baseline\s*\r?\n\s*if: always\(\) && steps\.classify\.outputs\.run_browser == 'true'/);
  assert.match(workflow, /name: Reject empty visual evidence\s*\r?\n\s*if: always\(\) && steps\.classify\.outputs\.run_visual == 'true'/);
  assert.doesNotMatch(workflow.replace("always() && steps.classify.outputs.run_browser", "steps.classify.outputs.run_browser"), /name: Reproduce browser baseline\s*\r?\n\s*if: always\(\)/, "browser masking mutation must be observable");
  assert.doesNotMatch(workflow.replace("always() && steps.classify.outputs.run_visual", "steps.classify.outputs.run_visual"), /name: Reject empty visual evidence\s*\r?\n\s*if: always\(\)/, "visual masking mutation must be observable");
});

test("base-only sentinel protects gate components without executing PR content", async () => {
  assert.equal(validateSentinel(await read(sentinelPath)), true);
});

test("sentinel inline program is valid Node syntax", async () => {
  const source = await read(sentinelPath);
  const program = source.match(/node <<'NODE'\r?\n([\s\S]*?)\r?\n\s+NODE/);
  assert.ok(program, "sentinel inline Node program missing");
  const dedented = program[1].split(/\r?\n/).map((line) => line.replace(/^ {10}/, "")).join("\n");
  const checked = spawnSync(process.execPath, ["--check"], { input: dedented, encoding: "utf8" });
  assert.equal(checked.status, 0, `sentinel inline Node syntax invalid: ${checked.stderr}`);
});

test("sentinel contract rejects neutralization and privilege expansion", async (t) => {
  const source = await read(sentinelPath);
  const cases = [
    ["sentinel removed", () => "", "stable sentinel workflow name missing"],
    ["job renamed", (s) => s.replace("name: Gate Integrity Sentinel", "name: Renamed Sentinel"), "stable sentinel workflow name missing"],
    ["paths added", (s) => s.replace("  pull_request_target:", "  pull_request_target:\n    paths: [docs/**]"), "sentinel path filter forbidden"],
    ["paths-ignore added", (s) => s.replace("  pull_request_target:", "  pull_request_target:\n    paths-ignore: [docs/**]"), "sentinel path filter forbidden"],
    ["job condition added", (s) => s.replace("    runs-on: ubuntu-latest", "    if: github.actor != 'attacker'\n    runs-on: ubuntu-latest"), "sentinel job-level condition forbidden"],
    ["checkout added", (s) => `${s}\n# uses: actions/checkout@v4`, "sentinel must not checkout"],
    ["PR head executed", (s) => s + '\n# ${{ github.event.pull_request.head.sha }}', "sentinel must not checkout"],
    ["secret added", (s) => s + '\n# ${{ secrets.DEPLOY_TOKEN }}', "sentinel must not checkout"],
    ["write permission", (s) => s.replace("contents: read", "contents: write"), "sentinel permissions must be contents read only"],
    ["universal workflow unprotected", (s) => s.replace('            ".github/workflows/universal-pr-gate.yml",\n', ""), "protected gate path missing"],
    ["sentinel unprotected", (s) => s.replace('            ".github/workflows/gate-integrity-sentinel.yml",\n', ""), "protected gate path missing"],
    ["classifier unprotected", (s) => s.replace('            "scripts/governance/classify-pr-paths.mjs",\n', ""), "protected gate path missing"],
  ];
  for (const [label, mutate, expected] of cases) await t.test(label, () => {
    assert.throws(() => validateSentinel(mutate(source)), (error) => error.message.includes(expected));
  });
});

test("current classifier remains sole authority for common and protected workflow paths", async () => {
  const { classifyRecords } = await import("../../scripts/governance/classify-pr-paths.mjs");
  for (const [path, category] of [
    ["docs/audit/new-legitimate.md", "documentation"],
    ["tests/audit/new-legitimate.test.mjs", "tests"],
    [".github/workflows/common.yml", "workflow"],
  ]) {
    const result = classifyRecords([{ status: "A", path }]);
    assert.equal(result.accepted, true, `${path}: legitimate path rejected`);
    assert.deepEqual(result.categories, [category]);
  }
  const common = classifyRecords([{ status: "A", path: ".github/workflows/common.yml" }]);
  assert.equal(common.accepted, true);
  assert.deepEqual(common.categories, ["workflow"]);
  const unknown = classifyRecords([{ status: "A", path: "unknown/gov-trial.bin" }]);
  assert.equal(unknown.accepted, false);
  const sentinel = await read(sentinelPath);
  assert.equal(assertSentinelAllows(sentinel, [".github/workflows/common.yml"]), true);
  for (const path of protectedGatePaths(sentinel)) {
    assert.throws(() => assertSentinelAllows(sentinel, [path]), (error) => error.message.includes(path));
  }
});

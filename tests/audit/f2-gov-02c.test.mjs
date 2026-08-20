import assert from "node:assert/strict";
// F2-GOV-02E protected-component rehearsal only; do not merge.
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
  for (const path of [...new Set([sentinelPath, ...Object.values(trustClasses).flat()])])
    assert.ok(source.includes(`\"${path}\"`), `protected gate path missing: ${path}`);
  assert.match(source, /protected gate component changed/, "protected change failure missing");
  return true;
}

function protectedGatePaths(source) {
  validateSentinel(source);
  const block = source.match(/const protectedPaths = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(block, "protected gate set missing");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function sentinelProgram(source) {
  const match = source.match(/node <<'NODE'\r?\n([\s\S]*?)\r?\n\s+NODE/);
  assert.ok(match, "sentinel inline Node program missing");
  return match[1].split(/\r?\n/).map((line) => line.replace(/^ {10}/, "")).join("\n");
}

function runSentinelAgainstPages(source, pages, changedFiles) {
  const harness = `
const Module = require("node:module");
const { EventEmitter } = require("node:events");
const pages = JSON.parse(process.env.TEST_PAGES);
const originalLoad = Module._load;
Module._load = (request, parent, isMain) => request === "node:https" ? ({ get(options, callback) {
  const page = Number(new URL("https://api.github.com" + options.path).searchParams.get("page"));
  const spec = pages[page - 1] ?? { items: [], link: "" };
  const response = new EventEmitter(); response.statusCode = 200; response.headers = { link: spec.link }; response.setEncoding = () => {};
  process.nextTick(() => { callback(response); response.emit("data", JSON.stringify(spec.items)); response.emit("end"); });
  return { setTimeout() {}, on() {}, destroy() {} };
} }) : originalLoad(request, parent, isMain);
`;
  return spawnSync(process.execPath, ["-e", harness + sentinelProgram(source)], {
    encoding: "utf8",
    env: { ...process.env, REPOSITORY: "branctstudio-rgb/sitebranct", PR_NUMBER: "24", CHANGED_FILES: String(changedFiles), TEST_PAGES: JSON.stringify(pages) },
  });
}

const trustClasses = {
  workflows: [".github/workflows/universal-pr-gate.yml", ".github/workflows/audit-offline.yml", ".github/workflows/deploy.yml"],
  executors: ["scripts/governance/classify-pr-paths.mjs", "scripts/deploy/build-publish-payload.mjs"],
  tests: ["tests/audit/f2-gov-02a.test.mjs", "tests/audit/f2-gov-02c.test.mjs", "tests/audit/phase-2-governance.test.mjs", "tests/audit/f2-gov-01.test.mjs", "tests/deploy/deploy-scope.test.mjs", "tests/audit/site-audit.test.mjs"],
  browserVisual: ["tests/audit/collect-browser-baseline.mjs", "tests/audit/check-visual-evidence.mjs"],
  authorities: ["deploy/publish-manifest.json", "fixtures/audit/site-contract.json", "fixtures/audit/baseline-results.json", "fixtures/audit/evidence-manifest.json", "docs/audit/phase-2/f2-00-contract.json"],
};

function assertSentinelAllows(source, paths) {
  const protectedPaths = new Set(protectedGatePaths(source));
  const blocked = paths.filter((path) => protectedPaths.has(path));
  if (blocked.length) throw new Error(`protected gate component changed: ${blocked.join(", ")}`);
  return true;
}

function replaceExactLine(source, line, replacement = "") {
  const escaped = line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|\\r?\\n)${escaped}(?=\\r?\\n|$)`);
  const mutated = source.replace(pattern, (_, prefix) => `${prefix}${replacement}`);
  assert.notEqual(mutated, source, `mutation target missing: ${line.trim()}`);
  return mutated;
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

test("sentinel blocks transitively executed gate authorities", async () => {
  const sentinel = await read(sentinelPath);
  for (const mutation of [
    ["M", "tests/deploy/deploy-scope.test.mjs"],
    ["D", "tests/audit/phase-2-governance.test.mjs"],
    ["R100", "tests/audit/f2-gov-01.test.mjs", "tests/audit/f2-gov-01-empty.test.mjs"],
  ]) {
    const paths = mutation.slice(1);
    assert.throws(() => assertSentinelAllows(sentinel, paths), /protected gate component changed/);
  }
});

test("closed trust set covers every decision class and remains self-protected", async () => {
  const sentinel = await read(sentinelPath);
  const protectedPaths = protectedGatePaths(sentinel);
  assert.equal(new Set(protectedPaths).size, protectedPaths.length, "duplicate protected trust path");
  for (const [className, paths] of Object.entries(trustClasses)) {
    for (const path of paths) assert.ok(protectedPaths.includes(path), `${className} trust path missing: ${path}`);
  }
  assert.ok(protectedPaths.includes(sentinelPath), "trust-set definition must protect itself");
});

test("protected changes fail for modification, deletion, empty replacement and both rename names", async () => {
  const sentinel = await read(sentinelPath);
  const protectedPath = "tests/deploy/deploy-scope.test.mjs";
  for (const paths of [[protectedPath], [protectedPath], [protectedPath], [protectedPath, "tests/deploy/empty.test.mjs"], ["tests/deploy/old.test.mjs", protectedPath]]) {
    assert.throws(() => assertSentinelAllows(sentinel, paths), (error) => error.message.includes(protectedPath));
  }
  for (const allowed of ["docs/legitimate-note.md", "index.html", ".github/workflows/common.yml"]) {
    assert.equal(assertSentinelAllows(sentinel, [allowed]), true, `${allowed} must remain a common change`);
  }
});

test("sentinel inline program is valid Node syntax", async () => {
  const source = await read(sentinelPath);
  const checked = spawnSync(process.execPath, ["--check"], { input: sentinelProgram(source), encoding: "utf8" });
  assert.equal(checked.status, 0, `sentinel inline Node syntax invalid: ${checked.stderr}`);
});

test("sentinel rejects incomplete or contradictory API pagination", async () => {
  const source = await read(sentinelPath);
  const records = Array.from({ length: 100 }, (_, index) => ({ filename: `docs/item-${index}.md`, status: "modified" }));
  const truncated = runSentinelAgainstPages(source, [{ items: records, link: "" }], 101);
  assert.notEqual(truncated.status, 0, "full page without Link must not hide a second page");
  assert.match(truncated.stderr, /file count does not match pull request metadata/);
  const malformed = runSentinelAgainstPages(source, [{ items: records, link: "not-a-link" }], 100);
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /incomplete pagination metadata/);
  const complete = runSentinelAgainstPages(source, [{ items: records, link: "" }], 100);
  assert.equal(complete.status, 0, complete.stderr);
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
    ["universal workflow unprotected", (s) => replaceExactLine(s, '            ".github/workflows/universal-pr-gate.yml",'), "protected gate path missing"],
    ["sentinel unprotected", (s) => replaceExactLine(s, '            ".github/workflows/gate-integrity-sentinel.yml",'), "protected gate path missing"],
    ["classifier unprotected", (s) => replaceExactLine(s, '            "scripts/governance/classify-pr-paths.mjs",'), "protected gate path missing"],
    ["executed test unprotected", (s) => replaceExactLine(s, '            "tests/deploy/deploy-scope.test.mjs",'), "protected gate path missing"],
    ["browser verifier unprotected", (s) => replaceExactLine(s, '            "tests/audit/collect-browser-baseline.mjs",'), "protected gate path missing"],
    ["authority manifest unprotected", (s) => replaceExactLine(s, '            "deploy/publish-manifest.json",'), "protected gate path missing"],
    ["GitHub token added", (s) => s + '\n# ${{ github.token }}', "sentinel must not checkout"],
    ["environment token added", (s) => s + '\n# GITHUB_TOKEN=x', "sentinel must not checkout"],
  ];
  for (const [label, mutate, expected] of cases) await t.test(label, () => {
    assert.throws(() => validateSentinel(mutate(source)), (error) => error.message.includes(expected));
  });
});

test("exact-line mutations are portable across EOL representations", () => {
  const target = '            "protected/path.mjs",';
  for (const [label, source] of [
    ["LF final", `before\n${target}\nafter\n`],
    ["CRLF final", `before\r\n${target}\r\nafter\r\n`],
    ["mixed", `before\r\n${target}\nafter\r\n`],
    ["LF no final", `before\n${target}\nafter`],
  ]) {
    const mutated = replaceExactLine(source, target);
    assert.notEqual(mutated, source, `${label}: mutation must change text`);
    assert.equal(mutated.includes(target), false, `${label}: target must be removed`);
  }
  assert.throws(() => replaceExactLine("before\nafter", target), /mutation target missing/);
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

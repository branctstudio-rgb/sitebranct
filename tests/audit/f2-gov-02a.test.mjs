import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const readJson = async (path) => JSON.parse(await read(path));

if (process.env.F2_GOV_02A_TARGET === "current") {
  test("RED: a universal pull-request workflow exists", async () => {
    await access(new URL(".github/workflows/universal-pr-gate.yml", root));
  });

  test("RED evidence: existing audit check is path-filtered", async () => {
    assert.match(await read(".github/workflows/audit-offline.yml"), /pull_request:[\s\S]*?paths:/);
  });

  test("RED evidence: existing deploy verifier is path-filtered", async () => {
    assert.match(await read(".github/workflows/deploy.yml"), /pull_request:[\s\S]*?paths:/);
  });

  test("RED evidence: main is measured unprotected with no required checks", async () => {
    const state = await readJson("fixtures/audit/f2-gov-01-current-state.json");
    assert.equal(state.protection.active, false);
    assert.deepEqual(state.protection.requiredStatusChecks, []);
  });
} else {
  const workflowPath = ".github/workflows/universal-pr-gate.yml";
  const workflow = await read(workflowPath);
  const matrix = await readJson("fixtures/audit/f2-gov-02a-path-matrix.json");
  const trial = await readJson("fixtures/audit/f2-gov-02b-trial-contract.json");
  const publishManifest = await readJson("deploy/publish-manifest.json");
  const { classifyRecords, parseNameStatusZ } = await import("../../scripts/governance/classify-pr-paths.mjs");

  const normalizeWorkflowEol = (source) => {
    assert.equal(typeof source, "string", "malformed workflow content: expected text");
    assert.doesNotMatch(source, /\0/, "malformed workflow content: NUL byte forbidden");
    return source.replace(/\r\n|\r/g, "\n");
  };

  const addPullRequestPathFilter = (source) => {
    const normalized = normalizeWorkflowEol(source);
    const marker = /^  pull_request:\s*$/gm;
    assert.equal([...normalized.matchAll(marker)].length, 1, "pull_request trigger must be unique before mutation");
    return normalized.replace(/^  pull_request:\s*$/m, "  pull_request:\n    paths:\n      - docs/**");
  };

  const validateWorkflow = (input) => {
    const source = normalizeWorkflowEol(input);
    assert.match(source, /^name: Universal PR Gate Candidate$/m, "stable workflow name missing");
    assert.match(source, /^\s+pull_request:\s*$/m, "pull_request trigger missing");
    assert.match(source, /^\s+merge_group:\s*$/m, "merge_group trigger missing");
    assert.doesNotMatch(source, /^\s+paths(?:-ignore)?:/m, "path filter forbidden");
    assert.doesNotMatch(source, /^\s+workflow_dispatch:/m, "workflow_dispatch forbidden");
    assert.doesNotMatch(source, /^\s+push:/m, "push trigger forbidden");
    assert.match(source, /^permissions:\s*\r?\n\s+contents: read\s*\r?\n\s*\r?\nconcurrency:$/m, "permissions must be contents read only");
    assert.doesNotMatch(source, /^\s+\w[\w-]*: write$/m, "write permission forbidden");
    assert.match(source, /^\s+universal-pr-gate:\s*\r?\n\s+name: Universal PR Gate$/m, "stable job/check identity missing");
    const job = source.slice(source.indexOf("  universal-pr-gate:"));
    assert.doesNotMatch(job.slice(0, job.indexOf("    steps:")), /^\s+if:/m, "job-level condition forbidden");
    assert.match(job, /^\s+timeout-minutes: 30$/m, "job timeout missing or lacks measured multiengine margin");
    assert.match(source, /^concurrency:\s*$/m, "safe concurrency missing");
    assert.match(source, /^\s+cancel-in-progress: true$/m, "stale run cancellation missing");
    const actions = [...source.matchAll(/uses:\s*([^\s#]+)/g)].map((match) => match[1]);
    assert.deepEqual(actions, [
      "actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5",
      "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
    ], "required Action inventory mismatch");
    for (const action of actions) {
      assert.match(action, /^[\w-]+\/[\w-]+@[0-9a-f]{40}$/, `Action must be SHA-pinned: ${action}`);
    }
    const jobKeys = [...source.slice(source.indexOf("jobs:") + 5).matchAll(/^  ([\w-]+):\s*$/gm)].map((match) => match[1]);
    assert.deepEqual(jobKeys, ["universal-pr-gate"], "exactly one universal job is allowed");
    assert.doesNotMatch(source, /\bsecrets\b|FTP_PASSWORD|lftp|mirror\s+--reverse|deployments?:\s*write|\bcurl\b|\bwget\b|\bgit\s+push\b|\bgh\s+api\b|\bnpm\s+publish\b/i, "secret, deploy or external mutation primitive forbidden");
    assert.match(source, /persist-credentials: false/, "checkout credentials must not persist");
    assert.doesNotMatch(source, /safe\.directory\s+["']?\*["']?/, "wildcard safe directory forbidden");
    assert.match(source, /git config --global --add safe\.directory "\$GITHUB_WORKSPACE"/, "container checkout trust must be limited to GITHUB_WORKSPACE");
    assert.match(source, /image: mcr\.microsoft\.com\/playwright:v1\.62\.0-noble@sha256:baed2032d533817f3dbe6425de795788430ba345e819a1201337009ba17c9d07/, "immutable Playwright container missing");
    assert.match(source, /git cat-file blob "\$\{BASE_SHA\}:package-lock\.json"/, "base-only lockfile materialization missing");
    assert.match(source, /npm ci --ignore-scripts --prefix "\$trusted_deps"/, "exact base lockfile install missing");
    assert.match(source, /name: Run base-only F2-GOV-08 enforcement/, "base-only enforcement step missing");
    assert.match(source, /git cat-file blob "\$\{BASE_SHA\}:scripts\/governance\/validate-f2-gov-08\.mjs"/, "base-only consumer bootstrap missing");
    assert.match(source, /--event-path "\$GITHUB_EVENT_PATH"/, "trusted GitHub event is not bound to the enforcement");
    assert.match(source, /--trusted-node-modules "\$F2_GOV_TRUSTED_NODE_MODULES"/, "trusted dependency root is not bound to the enforcement");
    assert.match(source, /node scripts\/governance\/verify-f2-01-readiness\.mjs/, "three-engine readiness runner missing");
    assert.match(source, /name: Verify F2-01 readiness in Chromium, Firefox and WebKit\s+env:\s+HOME: \/root\s+run: node scripts\/governance\/verify-f2-01-readiness\.mjs/, "Firefox-compatible root HOME is missing from the isolated readiness step");
    assert.match(source, /node scripts\/governance\/classify-pr-paths\.mjs/, "real classifier is not invoked");
    for (const command of [
      "tests/audit/f2-gov-02a.test.mjs",
      "tests/audit/phase-2-governance.test.mjs",
      "tests/audit/f2-gov-01.test.mjs",
      "tests/deploy/deploy-scope.test.mjs",
    ]) assert.ok(source.includes(command), `minimum suite missing: ${command}`);
    assert.match(source, /name: Gate terminal result[\s\S]*?if: always\(\)/, "explicit terminal result missing");
    return true;
  };

  test("candidate workflow emits one stable universal check without production reach", () => validateWorkflow(workflow));

  test("workflow validation is EOL-portable without weakening semantic negatives", async (t) => {
    const lf = normalizeWorkflowEol(workflow);
    const lines = lf.split("\n");
    const variants = [
      ["LF with final newline", lf.endsWith("\n") ? lf : `${lf}\n`],
      ["LF without final newline", lf.replace(/\n$/, "")],
      ["CRLF with final newline", `${lf.replace(/\n$/, "").replace(/\n/g, "\r\n")}\r\n`],
      ["CRLF without final newline", lf.replace(/\n$/, "").replace(/\n/g, "\r\n")],
      ["mixed LF and CRLF", lines.map((line, index) => `${line}${index === lines.length - 1 ? "" : index % 2 ? "\r\n" : "\n"}`).join("")],
    ];
    for (const [label, source] of variants) await t.test(label, () => {
      assert.equal(validateWorkflow(source), true, `${label}: equivalent workflow rejected`);
      assert.throws(
        () => validateWorkflow(addPullRequestPathFilter(source)),
        (error) => error.message.includes("path filter forbidden"),
        `${label}: semantic path-filter tamper was not rejected`,
      );
    });
    await t.test("malformed content remains rejected", () => {
      assert.throws(() => validateWorkflow(`${lf}\0`), /malformed workflow content: NUL byte forbidden/);
    });
  });

  test("path matrix is deterministic and fail-closed", async (t) => {
    assert.equal(matrix.schemaVersion, 1);
    assert.equal(matrix.workflowName, "Universal PR Gate Candidate");
    assert.equal(matrix.checkName, "Universal PR Gate");
    const required = ["documentation", "tests", "fixtures", "html", "css", "javascript", "fonts", "translations", "images", "video", "workflow", "manifest", "create", "modify", "delete", "rename", "mixed-live-internal", "unknown", "runtime-lock", "gate-self"];
    assert.deepEqual(matrix.scenarios.map(({ id }) => id), required);
    for (const scenario of matrix.scenarios) await t.test(scenario.id, () => {
      const first = classifyRecords(scenario.changes);
      const second = classifyRecords(structuredClone(scenario.changes));
      assert.deepEqual(first, second, `${scenario.id}: classification is not deterministic`);
      assert.deepEqual(first, scenario.expected, `${scenario.id}: unexpected classification`);
      assert.equal(first.checkEmitted, true, `${scenario.id}: check missing`);
      assert.ok(first.suites.length > 0, `${scenario.id}: no verification selected`);
      assert.equal(first.deploy, false, `${scenario.id}: deploy selected`);
    });
  });

  test("NUL-safe Git parser covers add, modify, delete and rename", () => {
    const encoded = Buffer.from("A\0novo.html\0M\0src/css/branct.css\0D\0old.html\0R100\0old.js\0src/js/branct.js\0");
    assert.deepEqual(parseNameStatusZ(encoded), [
      { status:"A", path:"novo.html" },
      { status:"M", path:"src/css/branct.css" },
      { status:"D", path:"old.html" },
      { status:"R100", oldPath:"old.js", path:"src/js/branct.js" },
    ]);
  });

  test("every currently published file is a known live path", () => {
    assert.equal(publishManifest.files.length, 56);
    for (const path of publishManifest.files) {
      const result = classifyRecords([{ status:"M", path }]);
      assert.equal(result.accepted, true, `published path classified unknown: ${path}`);
      assert.ok(result.suites.includes("browser-baseline"), `published path lacks browser verification: ${path}`);
      assert.ok(result.suites.includes("visual-evidence"), `published path lacks visual verification: ${path}`);
    }
  });

  test("Playwright lockfiles and readiness runner are classified as protected gate internals", () => {
    for (const path of ["package.json", "package-lock.json", "scripts/governance/verify-f2-01-readiness.mjs"]) {
      const result = classifyRecords([{ status: "M", path }]);
      assert.equal(result.accepted, true, `${path}: protected runtime path rejected`);
      assert.deepEqual(result.categories, ["gate-internal"]);
      assert.ok(result.suites.includes("audit-contract"), `${path}: audit verification not selected`);
    }
  });

  test("workflow negatives reject disappearance and unsafe reach", async (t) => {
    const cases = [
      ["workflow renamed", (s) => s.replace("name: Universal PR Gate Candidate", "name: Renamed"), "stable workflow name missing"],
      ["PR trigger removed", (s) => s.replace(/^  pull_request:.*\r?\n/m, ""), "pull_request trigger missing"],
      ["path filter added", addPullRequestPathFilter, "path filter forbidden"],
      ["job condition added", (s) => s.replace("    name: Universal PR Gate", "    name: Universal PR Gate\n    if: github.event_name == 'pull_request'"), "job-level condition forbidden"],
      ["write permission added", (s) => s.replace("contents: read", "contents: write"), "permissions must be contents read only"],
      ["secret added", (s) => s + "\n# ${{ secrets.FTP_PASSWORD }}", "secret, deploy or external mutation primitive forbidden"],
      ["deploy added", (s) => `${s}\n# lftp mirror --reverse`, "secret, deploy or external mutation primitive forbidden"],
      ["unpinned Action", (s) => s.replace(/actions\/checkout@[0-9a-f]{40}/, "actions/checkout@v4"), "required Action inventory mismatch"],
      ["terminal result removed", (s) => s.replace("name: Gate terminal result", "name: Removed terminal"), "explicit terminal result missing"],
      ["checkout credentials restored", (s) => s.replace("persist-credentials: false", "persist-credentials: true"), "checkout credentials must not persist"],
      ["checkout trust broadened", (s) => s.replace('safe.directory "$GITHUB_WORKSPACE"', 'safe.directory "*"'), "wildcard safe directory forbidden"],
      ["Firefox runtime HOME removed", (s) => s.replace(/^\s+HOME: \/root\s*\r?\n/m, ""), "Firefox-compatible root HOME is missing"],
      ["base bootstrap removed", (s) => s.replace(/git cat-file blob "\$\{BASE_SHA\}:scripts\/governance\/validate-f2-gov-08\.mjs"/, "git cat-file blob scripts/governance/validate-f2-gov-08.mjs"), "base-only consumer bootstrap missing"],
      ["trusted event replaced", (s) => s.replace('--event-path "$GITHUB_EVENT_PATH"', '--event-path event-from-head.json'), "trusted GitHub event is not bound"],
      ["required Action removed", (s) => s.replace(/^\s+- name: Prepare Node\.js[\s\S]*?node-version: 22\s*\r?\n/m, ""), "required Action inventory mismatch"],
      ["extra permission", (s) => s.replace("  contents: read", "  contents: read\n  issues: read"), "permissions must be contents read only"],
      ["second job", (s) => `${s}\n  shadow-job:\n    runs-on: ubuntu-latest\n    steps: []\n`, "exactly one universal job is allowed"],
      ["external mutation command", (s) => `${s}\n# git push origin main\n`, "secret, deploy or external mutation primitive forbidden"],
    ];
    for (const [label, mutate, expected] of cases) await t.test(label, () => {
      assert.throws(() => validateWorkflow(mutate(workflow)), (error) => error.message.includes(expected));
    });
  });

  test("classifier rejects malformed, duplicate, traversal and silent unknown input", async (t) => {
    const cases = [
      ["empty", [], "no changed paths"],
      ["duplicate", [{ status:"M", path:"index.html" }, { status:"M", path:"index.html" }], "duplicate path"],
      ["traversal", [{ status:"M", path:"../index.html" }], "unsafe path"],
      ["absolute", [{ status:"M", path:"/index.html" }], "unsafe path"],
      ["backslash", [{ status:"M", path:"src\\js\\branct.js" }], "unsafe path"],
      ["invalid status", [{ status:"X", path:"index.html" }], "unsupported Git status"],
      ["rename score above 100", [{ status:"R101", oldPath:"src/js/old.js", path:"src/js/new.js" }], "unsupported Git status"],
      ["rename score noncanonical", [{ status:"R1", oldPath:"src/js/old.js", path:"src/js/new.js" }], "unsupported Git status"],
      ["copy score above 100", [{ status:"C999", oldPath:"src/js/old.js", path:"src/js/new.js" }], "unsupported Git status"],
    ];
    for (const [label, records, expected] of cases) await t.test(label, () => {
      assert.throws(() => classifyRecords(records), (error) => error.message.includes(expected));
    });
    const unknown = classifyRecords([{ status:"A", path:"unknown/arbitrary.bin" }]);
    assert.equal(unknown.accepted, false);
    assert.deepEqual(unknown.suites, ["fail-closed"]);
  });

  test("future disposable trial is complete but explicitly not authorized", () => {
    assert.equal(trial.schemaVersion, 1);
    assert.equal(trial.status, "CONTRACT_ONLY_NOT_AUTHORIZED");
    assert.equal(trial.baseRequired, "universal gate integrated in main");
    assert.deepEqual(trial.scenarios.map(({ id }) => id), ["documentation-pr", "tests-pr", "live-page-pr", "asset-pr", "workflow-pr", "unknown-path-pr", "deliberately-invalid-pr"]);
    for (const scenario of trial.scenarios) {
      assert.equal(scenario.expectedCheck, "Universal PR Gate");
      assert.ok(["SUCCESS", "FAILURE"].includes(scenario.expectedConclusion));
      assert.ok(scenario.cleanup.length > 0);
    }
    const invalid = trial.scenarios.find(({ id }) => id === "deliberately-invalid-pr");
    assert.equal(invalid.fixturePath, "fixtures/audit/f2-gov-02a-path-matrix.json");
    assert.equal(invalid.mutation, "set checkName to an unexpected value");
    assert.equal(trial.createRealPullRequestsAuthorized, false);
    assert.equal(trial.activateProtectionAuthorized, false);
  });
}

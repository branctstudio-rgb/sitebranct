import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  CANONICAL_AUTHORITY_PATHS,
  runBaseOnlyGitSimulation,
  runBaseOnlySimulation,
  verifyMaterializedAuthoritySnapshot,
} from "../../scripts/governance/validate-f2-gov-08.mjs";

const root = new URL("../../", import.meta.url);
const canonicalPaths = Object.values(CANONICAL_AUTHORITY_PATHS);
const html = (title, width = 44, height = 44) => `<!doctype html><html data-drawer-capable="true" data-focus-capable="true" data-target-width="${width}" data-target-height="${height}" data-focus-target-width="48" data-focus-target-height="48"><title>${title}</title></html>`;

async function write(repository, path, bytes) {
  const target = join(repository, ...path.split("/"));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

async function createRepository() {
  const repository = await mkdtemp(join(tmpdir(), "branct-f2-gov-08-f1-"));
  const git = (...args) => execFileSync("git", args, { cwd: repository, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.email", "f2-gov-08@example.invalid");
  git("config", "user.name", "F2-GOV-08 fixture");
  for (const path of canonicalPaths) await write(repository, path, readFileSync(new URL(path, root)));
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
    assert.throws(() => run(fixture), /head changed a non-live or protected authority path/i);
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
    assert.throws(() => run(fixture), /head changed a non-live or protected authority path/i);
  } finally { await rm(fixture.repository, { recursive: true, force: true }); }
});

test("F2-GOV-08 rejects alternate imports in the consumer authority", async () => {
  const source = readFileSync(new URL(CANONICAL_AUTHORITY_PATHS.consumer, root), "utf8");
  const localImports = [...source.matchAll(/from\s+["'](\.\/[^"']+)["']/g)].map((match) => match[1]);
  assert.deepEqual(localImports, ["./f2-gov-08-static-server.mjs"]);
  assert.doesNotMatch(source, /import\s*\(|require\s*\(/);
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
  ["executable mode", "100755", readFileSync(new URL(CANONICAL_AUTHORITY_PATHS.consumer, root)), /canonical consumer has unexpected Git mode/i],
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
    const bytes = readFileSync(new URL(CANONICAL_AUTHORITY_PATHS.consumer, root));
    await writeFile(target, bytes);
    const manifest = JSON.parse(readFileSync(new URL(CANONICAL_AUTHORITY_PATHS.manifest, root), "utf8"));
    const pin = manifest.files.find(({ role }) => role === "consumer");
    const files = new Map([["consumer", { bytes, pin }]]);
    const materialized = new Map([["consumer", target]]);
    assert.doesNotThrow(() => verifyMaterializedAuthoritySnapshot(files, materialized));
    await writeFile(target, "process.exit(0);\n");
    assert.throws(() => verifyMaterializedAuthoritySnapshot(files, materialized), /TOCTOU|size changed after validation/i);
  } finally { await rm(directory, { recursive: true, force: true }); }
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

test("F2-GOV-08 records simulator limits instead of claiming workflow enforcement", () => {
  const contract = JSON.parse(readFileSync(new URL(CANONICAL_AUTHORITY_PATHS.contract, root), "utf8"));
  assert.equal(contract.limitations.workflowEnforcement, "NOT_VERIFIED");
  assert.equal(contract.limitations.operationalIsolation, "NOT_VERIFIED");
  assert.equal(contract.limitations.browserNetworkIsolation, "NOT_VERIFIED");
  assert.equal(contract.status, "OFFLINE_SIMULATOR_ONLY");
});

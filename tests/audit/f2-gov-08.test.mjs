import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  runBaseOnlySimulation,
  runBaseOnlyGitSimulation,
  sha256,
} from "../../scripts/governance/validate-f2-gov-08.mjs";

const root = new URL("../../", import.meta.url);
const contract = JSON.parse(readFileSync(new URL("fixtures/audit/f2-gov-08-base-only-contract.json", root), "utf8"));
const matrix = [
  { engine: "chromium", route: "index.html", viewport: [390, 844], action: "open-drawer" },
  { engine: "firefox", route: "index.html", viewport: [390, 844], action: "escape-close" },
  { engine: "webkit", route: "index.html", viewport: [1024, 768], action: "focus-navigation" },
  { engine: "chromium", route: "politica-privacidade.html", viewport: [360, 800], action: "open-drawer" },
];
const expectations = [
  { semanticResult: "PASS", raw: { complete: true, drawerOpen: true, focusInside: true, targetWidth: 44, targetHeight: 44 } },
  { semanticResult: "PASS", raw: { complete: true, drawerOpen: false, focusInside: false, targetWidth: 44, targetHeight: 44 } },
  { semanticResult: "PASS", raw: { complete: true, drawerOpen: false, focusInside: true, targetWidth: 48, targetHeight: 48 } },
  { semanticResult: "PASS", raw: { complete: true, drawerOpen: true, focusInside: true, targetWidth: 44, targetHeight: 44 } },
];
const authorityFiles = [
  { path: "trusted/consumer.mjs", mode: "100644", type: "blob", bytes: "export const authority = base-only-consumer-v1;\n" },
  { path: "trusted/matrix.json", mode: "100644", type: "blob", bytes: JSON.stringify(matrix) },
  { path: "trusted/expectations.json", mode: "100644", type: "blob", bytes: JSON.stringify(expectations) },
  { path: "trusted/static-server.mjs", mode: "100644", type: "blob", bytes: "export const server = isolated-loopback-v1;\n" },
];
const candidateEntries = [
  { path: "index.html", mode: "100644", type: "blob", filesystemType: "file", bytes: "<!doctype html><title>candidate</title>" },
  { path: "politica-privacidade.html", mode: "100644", type: "blob", filesystemType: "file", bytes: "<!doctype html><title>privacy</title>" },
  { path: "src/css/branct.css", mode: "100644", type: "blob", filesystemType: "file", bytes: ".menu{display:block}" },
  { path: "src/js/branct.js", mode: "100644", type: "blob", filesystemType: "file", bytes: "document.documentElement.dataset.ready='true';" },
];

const clone = (value) => structuredClone(value);
const tupleKey = ({ engine, route, viewport, action }) => JSON.stringify([engine, route, viewport, action]);
const expectedByTuple = new Map(matrix.map((entry, index) => [tupleKey(entry), expectations[index].raw]));

function validInput() {
  return {
    contract: clone(contract),
    baseSha: contract.simulation.baseSha,
    headSha: contract.simulation.headSha,
    authorityFiles: clone(authorityFiles),
    candidateEntries: clone(candidateEntries),
    origin: contract.simulation.origin,
    environment: {},
    networkRequests: matrix.map(() => `${contract.simulation.origin}/index.html`),
    readRaw: (canonicalCase) => clone(expectedByTuple.get(tupleKey(canonicalCase))),
  };
}

function mutateAuthority(input, role, mutate, { updateDigest = false } = {}) {
  const pin = input.contract.authority.files.find((entry) => entry.role === role);
  const file = input.authorityFiles.find((entry) => entry.path === pin.path);
  mutate(file, pin);
  if (updateDigest) pin.sha256 = sha256(file.bytes);
}

test("F2-GOV-08 accepts one complete legitimate base-only measurement", () => {
  const result = runBaseOnlySimulation(validInput());
  assert.equal(result.decision, "PASS");
  assert.equal(result.evidence.length, matrix.length);
  assert.equal(new Set(result.evidence.map(({ identity }) => identity)).size, matrix.length);
  assert.ok(result.evidence.every(({ digest, semanticResult }) => /^[0-9a-f]{64}$/.test(digest) && semanticResult === "PASS"));
  assert.equal(result.authority.baseSha, contract.simulation.baseSha);
  assert.equal(result.authority.headSha, contract.simulation.headSha);
});

test("F2-GOV-08 rejects OBSERVATION_PAYLOAD_SWAP", () => {
  const input = validInput();
  input.readRaw = (canonicalCase) => clone(expectations[(matrix.findIndex((entry) => tupleKey(entry) === tupleKey(canonicalCase)) + 1) % matrix.length].raw);
  assert.throws(() => runBaseOnlySimulation(input), /OBSERVATION_PAYLOAD_SWAP|semantic expectation differs/i);
});

test("F2-GOV-08 rejects KEYED_PRODUCER_TRANSPLANT", () => {
  const input = validInput();
  input.readRaw = (canonicalCase) => ({ ...clone(expectedByTuple.get(tupleKey(canonicalCase))), key: "producer-key", digest: "0".repeat(64) });
  assert.throws(() => runBaseOnlySimulation(input), /KEYED_PRODUCER_TRANSPLANT|producer-forbidden field/i);
});

for (const [label, transform, expected] of [
  ["simple result swap", (input) => { input.readRaw = (c) => clone(expectations[(matrix.findIndex((entry) => tupleKey(entry) === tupleKey(c)) + 1) % 2].raw); }, /semantic expectation differs/i],
  ["circular result swap", (input) => { input.readRaw = (c) => clone(expectations[(matrix.findIndex((entry) => tupleKey(entry) === tupleKey(c)) + 1) % matrix.length].raw); }, /semantic expectation differs/i],
  ["copied result", (input) => { input.readRaw = () => clone(expectations[0].raw); }, /semantic expectation differs/i],
  ["omitted result", (input) => { input.readRaw = (c) => tupleKey(c) === tupleKey(matrix[2]) ? undefined : clone(expectedByTuple.get(tupleKey(c))); }, /raw observation.*absent|incomplete/i],
  ["partial report", (input) => { input.readRaw = (c) => { const raw = clone(expectedByTuple.get(tupleKey(c))); delete raw.targetHeight; return raw; }; }, /raw observation schema.*incomplete|exact/i],
  ["content identity claim", (input) => { input.readRaw = (c) => ({ ...clone(expectedByTuple.get(tupleKey(c))), identity: "forged" }); }, /producer-forbidden field.*identity/i],
  ["content envelope claim", (input) => { input.readRaw = (c) => ({ ...clone(expectedByTuple.get(tupleKey(c))), envelope: {} }); }, /producer-forbidden field.*envelope/i],
  ["content digest claim", (input) => { input.readRaw = (c) => ({ ...clone(expectedByTuple.get(tupleKey(c))), digest: "0".repeat(64) }); }, /producer-forbidden field.*digest/i],
  ["content semantic result claim", (input) => { input.readRaw = (c) => ({ ...clone(expectedByTuple.get(tupleKey(c))), semanticResult: "PASS" }); }, /producer-forbidden field.*semanticResult/i],
  ["content PASS claim", (input) => { input.readRaw = (c) => ({ ...clone(expectedByTuple.get(tupleKey(c))), pass: true }); }, /producer-forbidden field.*pass/i],
  ["route supplied by content", (input) => { input.readRaw = (c) => ({ ...clone(expectedByTuple.get(tupleKey(c))), route: c.route }); }, /producer-forbidden field.*route/i],
  ["viewport supplied by content", (input) => { input.readRaw = (c) => ({ ...clone(expectedByTuple.get(tupleKey(c))), viewport: c.viewport }); }, /producer-forbidden field.*viewport/i],
  ["engine supplied by content", (input) => { input.readRaw = (c) => ({ ...clone(expectedByTuple.get(tupleKey(c))), engine: c.engine }); }, /producer-forbidden field.*engine/i],
  ["action supplied by content", (input) => { input.readRaw = (c) => ({ ...clone(expectedByTuple.get(tupleKey(c))), action: c.action }); }, /producer-forbidden field.*action/i],
]) {
  test(`F2-GOV-08 rejects ${label}`, () => {
    const input = validInput();
    transform(input);
    assert.throws(() => runBaseOnlySimulation(input), expected);
  });
}

for (const [label, transform, expected] of [
  ["base SHA drift", (input) => { input.baseSha = "3".repeat(40); }, /base SHA.*divergent/i],
  ["head SHA drift", (input) => { input.headSha = "4".repeat(40); }, /head SHA.*divergent/i],
  ["malformed base SHA", (input) => { input.baseSha = "main"; }, /base SHA.*malformed/i],
  ["consumer alteration", (input) => mutateAuthority(input, "consumer", (file) => { file.bytes += "tampered"; }), /consumer.*digest/i],
  ["matrix alteration", (input) => mutateAuthority(input, "matrix", (file) => { file.bytes = file.bytes.replace("index.html", "forged.html"); }), /matrix.*digest/i],
  ["expectation alteration", (input) => mutateAuthority(input, "expectations", (file) => { file.bytes = file.bytes.replace("44", "43"); }), /expectations.*digest/i],
  ["static server alteration", (input) => mutateAuthority(input, "static-server", (file) => { file.bytes += "tampered"; }), /static-server.*digest/i],
  ["matrix duplicate with recomputed attacker digest", (input) => { mutateAuthority(input, "matrix", (file) => { const value = JSON.parse(file.bytes); value[1] = clone(value[0]); file.bytes = JSON.stringify(value); }, { updateDigest: true }); input.contract.authority.setSha256 = sha256(JSON.stringify(input.contract.authority.files)); }, /canonical matrix.*duplicate/i],
  ["matrix route swapped with recomputed attacker digest", (input) => mutateAuthority(input, "matrix", (file) => { const value = JSON.parse(file.bytes); [value[0].route, value[3].route] = [value[3].route, value[0].route]; file.bytes = JSON.stringify(value); }, { updateDigest: true }), /authority digest set|contract digest|matrix.*expectation/i],
]) {
  test(`F2-GOV-08 fails closed for ${label}`, () => {
    const input = validInput();
    transform(input);
    assert.throws(() => runBaseOnlySimulation(input), expected);
  });
}

for (const [label, entry, expected] of [
  ["symlink", { path: "src/css/link.css", mode: "120000", type: "blob", bytes: "../../secret" }, /symlink|mode 120000|unexpected Git mode/i],
  ["submodule", { path: "src/js/vendor", mode: "160000", type: "commit", bytes: "" }, /submodule|unexpected Git (mode|type)/i],
  ["executable blob", { path: "src/js/run.js", mode: "100755", type: "blob", bytes: "echo unsafe" }, /unexpected Git mode/i],
  ["path traversal", { path: "src/css/../../secret.txt", mode: "100644", type: "blob", bytes: "secret" }, /path traversal|unsafe candidate path/i],
  ["absolute path", { path: "/tmp/secret.txt", mode: "100644", type: "blob", bytes: "secret" }, /absolute|unsafe candidate path/i],
  ["backslash path", { path: "src\\css\\branct.css", mode: "100644", type: "blob", bytes: "bad" }, /backslash|unsafe candidate path/i],
  ["outside allowlist", { path: "scripts/evil.mjs", mode: "100644", type: "blob", bytes: "bad" }, /outside.*allowlist/i],
  ["excluded video", { path: "src/img/video.mp4", mode: "100644", type: "blob", bytes: "bad" }, /excluded|outside.*allowlist/i],
]) {
  test(`F2-GOV-08 rejects candidate ${label}`, () => {
    const input = validInput();
    input.candidateEntries.push({ filesystemType: "file", ...entry });
    assert.throws(() => runBaseOnlySimulation(input), expected);
  });
}

test("F2-GOV-08 rejects a materialized junction or reparse point", () => {
  const input = validInput();
  input.candidateEntries[2].filesystemType = "junction";
  assert.throws(() => runBaseOnlySimulation(input), /junction|reparse|filesystem type/i);
});

test("F2-GOV-08 rejects a required canonical route omitted from the candidate", () => {
  const input = validInput();
  input.candidateEntries = input.candidateEntries.filter(({ path }) => path !== "politica-privacidade.html");
  assert.throws(() => runBaseOnlySimulation(input), /canonical route.*absent/i);
});

test("F2-GOV-08 rejects a duplicate candidate path", () => {
  const input = validInput();
  input.candidateEntries.push(clone(input.candidateEntries[0]));
  assert.throws(() => runBaseOnlySimulation(input), /duplicate candidate path/i);
});

test("F2-GOV-08 rejects every external network request", () => {
  const input = validInput();
  input.networkRequests.push("https://example.com/tracker.gif");
  assert.throws(() => runBaseOnlySimulation(input), /external network.*example\.com/i);
});

test("F2-GOV-08 rejects a second loopback port", () => {
  const input = validInput();
  input.networkRequests.push("http://127.0.0.1:9999/probe");
  assert.throws(() => runBaseOnlySimulation(input), /network origin.*divergent/i);
});

test("F2-GOV-08 rejects an inconclusive raw observation", () => {
  const input = validInput();
  input.readRaw = (c) => ({ ...clone(expectedByTuple.get(tupleKey(c))), complete: false });
  assert.throws(() => runBaseOnlySimulation(input), /inconclusive|complete/i);
});

test("F2-GOV-08 exposes no token or secret to the trusted server and browser", () => {
  const input = validInput();
  input.environment.GITHUB_TOKEN = "forbidden";
  assert.throws(() => runBaseOnlySimulation(input), /credential|secret|GITHUB_TOKEN/i);
});

test("F2-GOV-08 requires the future job permission to remain read-only", () => {
  const input = validInput();
  input.contract.environment.futureJobPermissions.contents = "write";
  assert.throws(() => runBaseOnlySimulation(input), /permissions.*read-only|contents.*read/i);
});

test("F2-GOV-08 records simulator limitations without claiming operational enforcement", () => {
  assert.equal(contract.limitations.workflowEnforcement, "NOT_VERIFIED");
  assert.equal(contract.limitations.operationalIsolation, "NOT_VERIFIED");
  assert.equal(contract.limitations.requiresFutureProtectedCeremony, true);
  assert.equal(contract.status, "OFFLINE_SIMULATOR_ONLY");
});

async function createGitAuthorityRepository() {
  const repository = await mkdtemp(join(tmpdir(), "branct-f2-gov-08-git-"));
  const git = (...args) => execFileSync("git", args, { cwd: repository, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--quiet");
  git("config", "user.email", "f2-gov-08@example.invalid");
  git("config", "user.name", "F2-GOV-08 fixture");
  for (const file of [...authorityFiles, ...candidateEntries]) {
    const path = join(repository, ...file.path.split("/"));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.bytes, "utf8");
  }
  git("add", ".");
  git("commit", "--quiet", "-m", "trusted base");
  const baseSha = git("rev-parse", "HEAD");
  await writeFile(join(repository, "index.html"), "<!doctype html><title>candidate head</title>", "utf8");
  git("add", "index.html");
  git("commit", "--quiet", "-m", "candidate live head");
  const headSha = git("rev-parse", "HEAD");
  return { repository, git, baseSha, headSha };
}

function gitSimulationInput(repository, baseSha, headSha) {
  return {
    contract: clone(contract), repository, baseSha, headSha,
    origin: contract.simulation.origin, environment: {},
    networkRequests: matrix.map(() => `${contract.simulation.origin}/index.html`),
    readRaw: (canonicalCase) => clone(expectedByTuple.get(tupleKey(canonicalCase))),
  };
}

test("F2-GOV-08 loads consumer, server, matrix and expectations from exact Git base blobs", async () => {
  const fixture = await createGitAuthorityRepository();
  try {
    const result = runBaseOnlyGitSimulation(gitSimulationInput(fixture.repository, fixture.baseSha, fixture.headSha));
    assert.equal(result.decision, "PASS");
    assert.equal(result.authority.baseSha, fixture.baseSha);
    assert.ok(Object.values(result.authority.origins).every(({ baseSha }) => baseSha === fixture.baseSha));
    fixture.git("commit", "--allow-empty", "--quiet", "-m", "move HEAD only");
    assert.equal(runBaseOnlyGitSimulation(gitSimulationInput(fixture.repository, fixture.baseSha, fixture.headSha)).decision, "PASS", "moving HEAD must not change explicit base/head authority");
  } finally {
    await rm(fixture.repository, { recursive: true, force: true });
  }
});

test("F2-GOV-08 rejects an authority blob altered in the candidate head", async () => {
  const fixture = await createGitAuthorityRepository();
  try {
    await writeFile(join(fixture.repository, "trusted", "consumer.mjs"), "tampered candidate consumer\n", "utf8");
    fixture.git("add", "trusted/consumer.mjs");
    fixture.git("commit", "--quiet", "-m", "tamper protected consumer");
    const tamperedHead = fixture.git("rev-parse", "HEAD");
    assert.throws(() => runBaseOnlyGitSimulation(gitSimulationInput(fixture.repository, fixture.baseSha, tamperedHead)), /head changed.*protected authority.*trusted\/consumer/i);
  } finally {
    await rm(fixture.repository, { recursive: true, force: true });
  }
});

test("F2-GOV-08 rejects an adulterated or missing authority blob at the selected base", async (t) => {
  const fixture = await createGitAuthorityRepository();
  try {
    fixture.git("checkout", "--quiet", "-b", "tampered-base", fixture.baseSha);
    await writeFile(join(fixture.repository, "trusted", "matrix.json"), JSON.stringify([{ engine: "chromium", route: "forged.html", viewport: [1, 1], action: "forge" }]), "utf8");
    fixture.git("add", "trusted/matrix.json");
    fixture.git("commit", "--quiet", "-m", "tampered base matrix");
    const tamperedBase = fixture.git("rev-parse", "HEAD");
    await writeFile(join(fixture.repository, "index.html"), "changed from tampered base", "utf8");
    fixture.git("add", "index.html");
    fixture.git("commit", "--quiet", "-m", "head over tampered base");
    const tamperedHead = fixture.git("rev-parse", "HEAD");
    await t.test("adulterated base blob", () => assert.throws(() => runBaseOnlyGitSimulation(gitSimulationInput(fixture.repository, tamperedBase, tamperedHead)), /matrix authority digest is divergent/i));

    fixture.git("checkout", "--quiet", "-b", "missing-base", fixture.baseSha);
    fixture.git("rm", "--quiet", "trusted/static-server.mjs");
    fixture.git("commit", "--quiet", "-m", "remove base server");
    const missingBase = fixture.git("rev-parse", "HEAD");
    await writeFile(join(fixture.repository, "index.html"), "changed from missing base", "utf8");
    fixture.git("add", "index.html");
    fixture.git("commit", "--quiet", "-m", "head over missing base");
    const missingHead = fixture.git("rev-parse", "HEAD");
    await t.test("missing base blob", () => assert.throws(() => runBaseOnlyGitSimulation(gitSimulationInput(fixture.repository, missingBase, missingHead)), /static-server authority Git blob is absent/i));
  } finally {
    await rm(fixture.repository, { recursive: true, force: true });
  }
});

test("F2-GOV-08 rejects non-live candidate changes before measurement", async () => {
  const fixture = await createGitAuthorityRepository();
  try {
    await mkdir(join(fixture.repository, "scripts"), { recursive: true });
    await writeFile(join(fixture.repository, "scripts", "producer-command.mjs"), "process.exit(0);\n", "utf8");
    fixture.git("add", "scripts/producer-command.mjs");
    fixture.git("commit", "--quiet", "-m", "candidate command");
    const commandHead = fixture.git("rev-parse", "HEAD");
    assert.throws(() => runBaseOnlyGitSimulation(gitSimulationInput(fixture.repository, fixture.baseSha, commandHead)), /head changed a non-live.*scripts\/producer-command/i);
  } finally {
    await rm(fixture.repository, { recursive: true, force: true });
  }
});

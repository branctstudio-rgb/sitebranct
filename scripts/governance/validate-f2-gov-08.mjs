import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const CANONICAL_AUTHORITY_PATHS = Object.freeze({
  contract: "fixtures/audit/f2-gov-08-base-only-contract.json",
  manifest: "fixtures/audit/f2-gov-08-authority-manifest.json",
  consumer: "scripts/governance/f2-gov-08-consumer.mjs",
  matrix: "fixtures/audit/f2-gov-08-matrix.json",
  expectations: "fixtures/audit/f2-gov-08-expectations.json",
  staticServer: "scripts/governance/f2-gov-08-static-server.mjs",
});

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const exactKeys = (value, keys, label) => {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} is absent or malformed`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} schema is not exact`);
};
const validSha = (value, label) => assert.match(value ?? "", /^[0-9a-f]{40}$/, `${label} SHA is malformed`);

function splitNulBuffers(bytes, label) {
  assert.ok(Buffer.isBuffer(bytes), `${label} is not binary Git output`);
  if (bytes.length === 0) return [];
  assert.equal(bytes.at(-1), 0, `${label} is not NUL terminated`);
  const fields = [];
  for (let start = 0; start < bytes.length - 1;) {
    const end = bytes.indexOf(0, start);
    assert.notEqual(end, -1, `${label} contains a truncated NUL field`);
    assert.notEqual(end, start, `${label} contains an empty field`);
    fields.push(bytes.subarray(start, end));
    start = end + 1;
  }
  return fields;
}

function decodeAscii(bytes, label) {
  assert.ok([...bytes].every((byte) => byte <= 0x7f), `${label} is not ASCII`);
  return bytes.toString("ascii");
}

export function validatePortableGitPathBytes(pathBytes, label = "portable Git path") {
  assert.ok(Buffer.isBuffer(pathBytes), `${label} is not a byte sequence`);
  let path;
  try { path = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(pathBytes); }
  catch { assert.fail(`${label} is not canonical UTF-8`); }
  assert.equal(Buffer.from(path, "utf8").equals(pathBytes), true, `${label} UTF-8 round-trip is divergent`);
  assert.equal(path.includes("\uFFFD"), false, `${label} contains a forbidden replacement character`);
  assert.ok([...pathBytes].every((byte) => byte <= 0x7f), `${label} is not ASCII; current path grammar is ASCII-only`);
  safeRelativePath(path, label);
  return path;
}

const decodeGitPath = validatePortableGitPathBytes;

// Portable v1 grammar: ASCII bytes only; `/`-separated segments made from
// A-Z, a-z, 0-9, `.`, `_`, and `-`. Additional checks below reject traversal,
// Windows device names, trailing dot/space, absolute forms, ADS and case-fold
// collisions before any trusted or candidate blob is materialized.
function safeRelativePath(value, label = "path") {
  assert.equal(typeof value, "string", `${label} is not a string`);
  assert.ok(value.length > 0 && !value.includes("\0"), `unsafe empty or NUL ${label}`);
  assert.ok(!value.startsWith("\\\\"), `unsafe UNC ${label}: ${value}`);
  assert.ok(!value.includes("\\"), `unsafe backslash in ${label}: ${value}`);
  assert.ok(!value.startsWith("/") && !/^[A-Za-z]:/.test(value), `unsafe absolute or drive ${label}: ${value}`);
  const segments = value.split("/");
  assert.ok(segments.every((segment) => segment && segment !== "." && segment !== ".."), `unsafe ${label} traversal or empty segment: ${value}`);
  for (const segment of segments) {
    assert.doesNotMatch(segment, /[. ]$/, `${label} segment has trailing dot or space: ${segment}`);
    assert.doesNotMatch(segment, /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i, `${label} uses a reserved Windows device: ${segment}`);
  }
  assert.match(value, /^[A-Za-z0-9._/-]+$/, `${label} contains a forbidden portable character or alternate data stream marker: ${value}`);
}

function git(repository, args, options = {}) {
  try {
    return execFileSync("git", args, { cwd: repository, encoding: options.buffer ? null : "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const detail = error?.stderr?.toString().trim();
    assert.fail(`Git authority cannot resolve: git ${args.join(" ")}${detail ? `: ${detail}` : ""}`);
  }
}

function resolveCommit(repository, sha, label) {
  validSha(sha, label);
  const resolved = git(repository, ["rev-parse", "--verify", `${sha}^{commit}`]).trim();
  assert.equal(resolved, sha, `${label} SHA resolves to a different commit`);
}

function resolveRef(repository, ref, expected, label) {
  const resolved = git(repository, ["rev-parse", "--verify", `${ref}^{commit}`]).trim();
  assert.equal(resolved, expected, `${label} ref is divergent from the trusted event`);
}

function treeEntry(repository, sha, path, label) {
  safeRelativePath(path, label);
  const records = splitNulBuffers(git(repository, ["ls-tree", "-z", sha, "--", path], { buffer: true }), `${label} Git tree output`);
  assert.equal(records.length, 1, `${label} Git entry is absent or ambiguous at exact base SHA: ${path}`);
  const separator = records[0].indexOf(9);
  assert.ok(separator > 0, `${label} Git entry has no binary path delimiter`);
  const match = decodeAscii(records[0].subarray(0, separator), `${label} Git entry header`).match(/^(\d{6}) (\w+) ([0-9a-f]+)$/);
  assert.ok(match, `${label} Git entry is malformed: ${path}`);
  const pathBytes = records[0].subarray(separator + 1);
  const decodedPath = decodeGitPath(pathBytes, `${label} Git path`);
  assert.equal(pathBytes.equals(Buffer.from(path, "ascii")), true, `${label} canonical path bytes are redirected`);
  assert.equal(decodedPath, path, `${label} Git path is redirected`);
  return { mode: match[1], type: match[2], oid: match[3], path: decodedPath, pathBytes };
}

function readBaseBlob(repository, baseSha, path, label) {
  const entry = treeEntry(repository, baseSha, path, label);
  assert.equal(entry.mode, "100644", `${label} has unexpected Git mode`);
  assert.equal(entry.type, "blob", `${label} has unexpected Git type`);
  const bytes = git(repository, ["cat-file", "blob", entry.oid], { buffer: true });
  return { ...entry, bytes };
}

function parseJson(bytes, label) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { assert.fail(`${label} is unreadable or malformed`); }
}

function loadTrustedEvent(eventPath) {
  assert.equal(typeof eventPath, "string", "trusted GitHub event path is absent");
  const metadata = lstatSync(eventPath);
  assert.equal(metadata.isSymbolicLink(), false, "trusted GitHub event path is a symlink");
  assert.equal(metadata.isFile(), true, "trusted GitHub event path is not a regular file");
  const event = parseJson(readFileSync(eventPath), "trusted GitHub event");
  assert.ok(event?.pull_request, "trusted GitHub event is not a pull_request event");
  const baseSha = event.pull_request?.base?.sha;
  const headSha = event.pull_request?.head?.sha;
  const baseRef = event.pull_request?.base?.ref;
  const headRef = event.pull_request?.head?.ref;
  validSha(baseSha, "trusted event base");
  validSha(headSha, "trusted event head");
  assert.match(baseRef ?? "", /^[A-Za-z0-9._/-]+$/, "trusted event base ref is absent or malformed");
  assert.match(headRef ?? "", /^[A-Za-z0-9._/-]+$/, "trusted event head ref is absent or malformed");
  safeRelativePath(baseRef, "trusted event base ref");
  safeRelativePath(headRef, "trusted event head ref");
  return { event, baseSha, headSha, baseRef, headRef };
}

function allowedCandidatePath(path, contract) {
  if (contract.candidate.excluded.includes(path)) return false;
  if (!path.includes("/") && path.endsWith(".html")) return true;
  return ["src/css/", "src/js/", "src/fonts/", "src/i18n/", "src/img/"].some((prefix) => path.startsWith(prefix) && path.length > prefix.length);
}

function treeEntries(repository, sha) {
  return splitNulBuffers(git(repository, ["ls-tree", "-rz", "--full-tree", sha], { buffer: true }), "recursive Git tree output").map((record) => {
    const separator = record.indexOf(9);
    assert.ok(separator > 0, "Git tree record has no binary path delimiter");
    const match = decodeAscii(record.subarray(0, separator), "Git tree record header").match(/^(\d{6}) (\w+) ([0-9a-f]+)$/);
    assert.ok(match, "Git tree record is malformed");
    const pathBytes = record.subarray(separator + 1);
    const path = decodeGitPath(pathBytes, "recursive Git path");
    return { mode: match[1], type: match[2], oid: match[3], path, pathBytes };
  });
}

function validatePortableGitTree(entries) {
  const destinations = new Map();
  for (const entry of entries) {
    const path = validatePortableGitPathBytes(entry.pathBytes, "recursive Git path");
    assert.equal(path, entry.path, `recursive Git path bytes and text differ: ${entry.path}`);
    const destinationKey = path.toLowerCase();
    const previous = destinations.get(destinationKey);
    assert.equal(previous, undefined, `portable path collision: ${previous} and ${path}`);
    destinations.set(destinationKey, path);
  }
  const canonicalIndex = entries.find(({ pathBytes }) => pathBytes.equals(Buffer.from("index.html", "ascii")));
  assert.ok(canonicalIndex, "canonical live path index.html is absent or has different bytes/capitalization");
  assert.equal(canonicalIndex.path, "index.html", "canonical live path index.html is redirected");
  assert.equal(canonicalIndex.mode, "100644", "canonical live path index.html has unexpected Git mode");
  assert.equal(canonicalIndex.type, "blob", "canonical live path index.html has unexpected Git type");
  return entries;
}

function gitObjectType(repository, oid) {
  if (/^0+$/.test(oid)) return "absent";
  return git(repository, ["cat-file", "-t", oid]).trim();
}

function parseRawDiff(repository, baseSha, headSha, renameDetection) {
  const args = ["diff", "--raw", "-z", "--abbrev=40"];
  if (renameDetection) args.push("--find-renames=1%", "--find-copies=1%", "--find-copies-harder");
  else args.push("--no-renames");
  args.push(baseSha, headSha, "--");
  const fields = splitNulBuffers(git(repository, args, { buffer: true }), "structural Git diff");
  const changes = [];
  for (let index = 0; index < fields.length;) {
    const header = decodeAscii(fields[index++], "structural Git diff header");
    const match = header.match(/^:(\d{6}) (\d{6}) ([0-9a-f]{40}) ([0-9a-f]{40}) ([A-Z])(\d{0,3})$/);
    assert.ok(match, `structural Git diff header is malformed: ${JSON.stringify(header)}`);
    const [, oldMode, newMode, oldOid, newOid, status, score] = match;
    const firstPathBytes = fields[index++];
    assert.notEqual(firstPathBytes, undefined, "structural Git diff path is truncated");
    const firstPath = decodeGitPath(firstPathBytes, "structural Git path");
    let oldPath = status === "A" ? null : firstPath;
    let newPath = status === "D" ? null : firstPath;
    let oldPathBytes = status === "A" ? null : firstPathBytes;
    let newPathBytes = status === "D" ? null : firstPathBytes;
    if (status === "R" || status === "C") {
      oldPath = firstPath;
      oldPathBytes = firstPathBytes;
      newPathBytes = fields[index++];
      assert.notEqual(newPathBytes, undefined, "structural Git diff rename/copy destination is truncated");
      newPath = decodeGitPath(newPathBytes, "structural Git rename/copy destination");
    }
    changes.push({
      status,
      score: score === "" ? null : Number(score),
      oldPath,
      newPath,
      oldPathBytes,
      newPathBytes,
      oldMode,
      newMode,
      oldType: gitObjectType(repository, oldOid),
      newType: gitObjectType(repository, newOid),
      oldOid,
      newOid,
    });
  }
  return changes;
}

function protectedAuthorityEntries(authority) {
  return new Map([
    [CANONICAL_AUTHORITY_PATHS.contract, authority.contractBlob],
    [CANONICAL_AUTHORITY_PATHS.manifest, authority.manifestBlob],
    ...[...authority.files.values()].map((file) => [file.pin.path, file]),
  ]);
}

function validateHeadStructuralIntegrity(repository, baseSha, headSha, authority) {
  const protectedEntries = protectedAuthorityEntries(authority);
  for (const [path, baseEntry] of protectedEntries) {
    const label = Object.entries(CANONICAL_AUTHORITY_PATHS).find(([, canonicalPath]) => canonicalPath === path)?.[0] ?? path;
    const headEntry = treeEntry(repository, headSha, path, `canonical ${label} at head`);
    assert.equal(headEntry.mode, "100644", `canonical ${label} at head has unexpected Git mode`);
    assert.equal(headEntry.type, "blob", `canonical ${label} at head has unexpected Git type`);
    assert.equal(headEntry.oid, baseEntry.oid, `canonical ${label} at head changed, moved or was replaced`);
  }

  const noRenameChanges = parseRawDiff(repository, baseSha, headSha, false);
  const detectedChanges = parseRawDiff(repository, baseSha, headSha, true);
  const protectedOids = new Set([...protectedEntries.values()].map(({ oid }) => oid));
  for (const change of [...noRenameChanges, ...detectedChanges]) {
    for (const path of [change.oldPath, change.newPath].filter((value) => value !== null)) {
      assert.ok(allowedCandidatePath(path, authority.contract), `head changed a non-live or protected authority path: ${path}`);
    }
    assert.equal(change.oldMode === "000000" ? change.oldType : gitObjectType(repository, change.oldOid), change.oldType, "structural Git old type is divergent");
    assert.equal(change.newMode === "000000" ? change.newType : gitObjectType(repository, change.newOid), change.newType, "structural Git new type is divergent");
    if (change.newPath && protectedOids.has(change.newOid)) {
      assert.fail(`protected authority blob was transplanted to an allowed path: ${change.newPath}`);
    }
  }
  return { noRenameChanges, detectedChanges };
}

function validateContract(contract) {
  exactKeys(contract, ["schemaVersion", "status", "repository", "canonicalAuthority", "trustedEvent", "candidate", "measurement", "environment", "limitations"], "F2-GOV-08 contract");
  assert.equal(contract.schemaVersion, 2, "F2-GOV-08 contract schema is divergent");
  assert.equal(contract.status, "OFFLINE_SIMULATOR_ONLY", "F2-GOV-08 must remain an offline simulator");
  assert.equal(contract.canonicalAuthority.source, "exact-base-sha-git-objects", "authority source is not exact-base-sha Git objects");
  for (const [role, path] of Object.entries(CANONICAL_AUTHORITY_PATHS)) {
    if (role === "contract") continue;
    const key = role === "manifest" ? "manifestPath" : `${role}Path`;
    assert.equal(contract.canonicalAuthority[key], path, `canonical ${role} path is redirected`);
  }
  assert.match(contract.canonicalAuthority.manifestSha256, /^[0-9a-f]{64}$/, "canonical manifest digest is invalid");
  assert.equal(contract.trustedEvent.eventName, "pull_request", "trusted event identity is divergent");
  assert.equal(contract.trustedEvent.baseRef, "main", "trusted base ref is divergent");
  assert.equal(contract.trustedEvent.requireExactRemoteRefs, true, "trusted remote refs must be exact");
  assert.equal(contract.trustedEvent.requireBaseAncestorOfHead, true, "trusted base ancestry must be required");
  assert.equal(contract.candidate.commandsAllowed, false, "candidate commands must be forbidden");
  assert.equal(contract.candidate.dependenciesAllowed, false, "candidate dependencies must be forbidden");
  assert.equal(contract.measurement.producerMaySupplyResults, false, "producer result injection must be forbidden");
  assert.equal(contract.environment.futureJobPermissions.contents, "read", "future job permission must remain contents read-only");
  assert.deepEqual(contract.environment.exposedToBrowserOrServer, [], "browser or server credential exposure must remain empty");
  assert.equal(contract.limitations.workflowEnforcement, "NOT_VERIFIED", "workflow enforcement must remain NOT_VERIFIED");
  assert.equal(contract.limitations.operationalIsolation, "NOT_VERIFIED", "operational isolation must remain NOT_VERIFIED");
}

function loadAuthority(repository, baseSha) {
  const contractBlob = readBaseBlob(repository, baseSha, CANONICAL_AUTHORITY_PATHS.contract, "canonical contract");
  const contract = parseJson(contractBlob.bytes, "canonical contract");
  validateContract(contract);
  const manifestBlob = readBaseBlob(repository, baseSha, CANONICAL_AUTHORITY_PATHS.manifest, "canonical manifest");
  assert.equal(sha256(manifestBlob.bytes), contract.canonicalAuthority.manifestSha256, "canonical manifest digest is divergent");
  const manifest = parseJson(manifestBlob.bytes, "canonical manifest");
  exactKeys(manifest, ["schemaVersion", "files"], "canonical manifest");
  assert.equal(manifest.schemaVersion, 1, "canonical manifest schema is divergent");
  const roles = ["consumer", "matrix", "expectations", "staticServer"];
  assert.deepEqual(manifest.files.map(({ role }) => role), roles, "canonical manifest roles are missing, duplicated or reordered");
  const files = new Map();
  for (const pin of manifest.files) {
    exactKeys(pin, ["role", "path", "gitMode", "gitType", "size", "sha256"], `canonical ${pin?.role ?? "unknown"} pin`);
    assert.equal(pin.path, CANONICAL_AUTHORITY_PATHS[pin.role], `canonical ${pin.role} path is redirected`);
    assert.equal(pin.gitMode, "100644", `canonical ${pin.role} pin mode is divergent`);
    assert.equal(pin.gitType, "blob", `canonical ${pin.role} pin type is divergent`);
    const blob = readBaseBlob(repository, baseSha, pin.path, `canonical ${pin.role}`);
    assert.equal(blob.mode, pin.gitMode, `canonical ${pin.role} Git mode is divergent`);
    assert.equal(blob.type, pin.gitType, `canonical ${pin.role} Git type is divergent`);
    assert.equal(blob.bytes.length, pin.size, `canonical ${pin.role} size is divergent`);
    assert.equal(sha256(blob.bytes), pin.sha256, `canonical ${pin.role} digest is divergent`);
    files.set(pin.role, { ...blob, pin });
  }
  return { contract, contractBlob, manifest, manifestBlob, files };
}

export function materializePortableBlob(root, path, bytes) {
  safeRelativePath(path, "materialized authority path");
  const rootMetadata = lstatSync(root);
  assert.equal(rootMetadata.isSymbolicLink(), false, "trusted materialization root is a symlink");
  assert.equal(rootMetadata.isDirectory(), true, "trusted materialization root is not a directory");
  const trustedRoot = realpathSync(root);
  const target = resolve(trustedRoot, ...path.split("/"));
  assert.ok(target.startsWith(`${trustedRoot}${sep}`), "materialized authority path escapes trusted root");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  const metadata = lstatSync(target);
  assert.equal(metadata.isSymbolicLink(), false, `materialized authority is a symlink: ${path}`);
  assert.equal(metadata.isFile(), true, `materialized authority is not a regular file: ${path}`);
  return target;
}

const materializeBlob = materializePortableBlob;

export function verifyMaterializedAuthoritySnapshot(files, materialized) {
  for (const [role, file] of files) {
    const target = materialized.get(role);
    const metadata = lstatSync(target);
    assert.equal(metadata.isSymbolicLink(), false, `materialized ${role} changed to a symlink`);
    assert.equal(metadata.isFile(), true, `materialized ${role} is not a regular file`);
    assert.equal(metadata.size, file.pin.size, `materialized ${role} size changed after validation`);
    assert.equal(sha256(readFileSync(target)), file.pin.sha256, `TOCTOU: materialized ${role} changed after validation`);
  }
}

function materializeCandidate(repository, headSha, contract, root, headEntries) {
  const seen = new Set();
  const payload = [];
  for (const entry of headEntries.filter(({ path }) => allowedCandidatePath(path, contract))) {
    safeRelativePath(entry.path, "candidate path");
    assert.equal(seen.has(entry.path), false, `duplicate candidate path: ${entry.path}`);
    seen.add(entry.path);
    assert.equal(entry.mode, contract.candidate.gitMode, `candidate ${entry.path} has unexpected Git mode`);
    assert.equal(entry.type, contract.candidate.gitType, `candidate ${entry.path} has unexpected Git type`);
    const bytes = git(repository, ["cat-file", "blob", entry.oid], { buffer: true });
    if (/\.(?:html|css|js)$/i.test(entry.path)) {
      const text = bytes.toString("utf8");
      assert.doesNotMatch(text, /\b(?:fetch|WebSocket|EventSource)\s*\(|\bXMLHttpRequest\b|navigator\.sendBeacon\s*\(/i, `external network intent is forbidden in the offline candidate: ${entry.path}`);
      assert.doesNotMatch(text, /data-(?:authority-key|expected-identity|envelope|digest|semantic-result|pass)=/i, `KEYED_PRODUCER_TRANSPLANT: candidate attempts to provide authority output: ${entry.path}`);
    }
    materializeBlob(root, entry.path, bytes);
    payload.push({ path: entry.path, sha256: sha256(bytes) });
  }
  payload.sort((left, right) => left.path.localeCompare(right.path));
  return { payload, payloadDigest: sha256(canonicalJson(payload)) };
}

function validateConsumerReport(report, authority, baseSha, headSha, payloadDigest) {
  exactKeys(report, ["complete", "evidence"], "trusted consumer report");
  assert.equal(report.complete, true, "trusted consumer report is incomplete");
  const matrix = parseJson(authority.files.get("matrix").bytes, "canonical matrix");
  const expectations = parseJson(authority.files.get("expectations").bytes, "canonical expectations");
  assert.equal(report.evidence.length, matrix.length, "trusted consumer report is partial");
  const matrixDigest = authority.files.get("matrix").pin.sha256;
  const identities = new Set();
  for (const [index, canonicalCase] of matrix.entries()) {
    const evidence = report.evidence[index];
    exactKeys(evidence, ["baseSha", "headSha", "matrixDigest", "engine", "route", "viewport", "action", "payloadDigest", "identity", "rawObservation", "semanticResult", "digest"], `trusted evidence ${index}`);
    const binding = { baseSha, headSha, matrixDigest, engine: canonicalCase.engine, route: canonicalCase.route, viewport: canonicalCase.viewport, action: canonicalCase.action, payloadDigest };
    const identity = sha256(canonicalJson(binding));
    assert.equal(evidence.identity, identity, `trusted evidence identity differs at ${index}`);
    assert.equal(identities.has(identity), false, `trusted evidence identity is duplicated: ${identity}`);
    identities.add(identity);
    for (const key of Object.keys(binding)) assert.deepEqual(evidence[key], binding[key], `trusted evidence ${key} differs at ${index}`);
    assert.deepEqual(evidence.rawObservation, expectations[index].raw, `OBSERVATION_PAYLOAD_SWAP: semantic observation differs at ${index}`);
    assert.equal(evidence.semanticResult, expectations[index].semanticResult, `trusted semantic result differs at ${index}`);
    const envelope = { ...binding, identity, rawObservation: evidence.rawObservation, semanticResult: evidence.semanticResult };
    assert.equal(evidence.digest, sha256(canonicalJson(envelope)), `trusted evidence digest differs at ${index}`);
  }
  return report.evidence;
}

export function runBaseOnlyGitSimulation(input) {
  exactKeys(input, ["repository", "eventPath"], "trusted harness input");
  const repository = realpathSync(input.repository);
  const { event, baseSha, headSha, baseRef, headRef } = loadTrustedEvent(input.eventPath);
  resolveCommit(repository, baseSha, "trusted event base");
  resolveCommit(repository, headSha, "trusted event head");
  const authority = loadAuthority(repository, baseSha);
  assert.equal(event.repository?.full_name, authority.contract.repository, "trusted event repository is divergent");
  assert.equal(baseRef, authority.contract.trustedEvent.baseRef, "trusted event base ref is divergent");
  assert.notEqual(headRef, baseRef, "trusted event head ref cannot equal the base ref");
  resolveRef(repository, `refs/remotes/origin/${baseRef}`, baseSha, "trusted base");
  resolveRef(repository, `refs/remotes/origin/${headRef}`, headSha, "trusted head");
  try { git(repository, ["merge-base", "--is-ancestor", baseSha, headSha]); }
  catch { assert.fail("trusted operational base is not an ancestor of head"); }

  const headEntries = validatePortableGitTree(treeEntries(repository, headSha));
  validateHeadStructuralIntegrity(repository, baseSha, headSha, authority);

  const trustedRoot = mkdtempSync(join(tmpdir(), "branct-f2-gov-08-trusted-"));
  const authorityRoot = join(trustedRoot, "authority");
  const candidateRoot = join(trustedRoot, "candidate");
  mkdirSync(authorityRoot, { mode: 0o700 });
  mkdirSync(candidateRoot, { mode: 0o700 });
  try {
    const materialized = new Map();
    for (const [role, file] of authority.files) materialized.set(role, materializeBlob(authorityRoot, file.pin.path, file.bytes));
    const candidate = materializeCandidate(repository, headSha, authority.contract, candidateRoot, headEntries);
    verifyMaterializedAuthoritySnapshot(authority.files, materialized);
    const requestPath = join(trustedRoot, "request.json");
    const responsePath = join(trustedRoot, "response.json");
    const request = { baseSha, headSha, candidateRoot, matrixPath: materialized.get("matrix"), expectationsPath: materialized.get("expectations"), matrixDigest: authority.files.get("matrix").pin.sha256, payloadDigest: candidate.payloadDigest };
    writeFileSync(requestPath, JSON.stringify(request), { flag: "wx", mode: 0o600 });
    execFileSync(process.execPath, [materialized.get("consumer"), requestPath, responsePath], { cwd: authorityRoot, env: {}, timeout: 15000, stdio: ["ignore", "pipe", "pipe"] });
    verifyMaterializedAuthoritySnapshot(authority.files, materialized);
    for (const [role, file] of authority.files) {
      const reread = readBaseBlob(repository, baseSha, file.pin.path, `post-execution ${role}`);
      assert.equal(sha256(reread.bytes), file.pin.sha256, `post-execution ${role} Git blob is divergent`);
    }
    const report = parseJson(readFileSync(responsePath), "trusted consumer response");
    const evidence = validateConsumerReport(report, authority, baseSha, headSha, candidate.payloadDigest);
    return {
      decision: "PASS",
      authority: {
        baseSha,
        headSha,
        contract: { path: CANONICAL_AUTHORITY_PATHS.contract, oid: authority.contractBlob.oid, sha256: sha256(authority.contractBlob.bytes) },
        manifest: { path: CANONICAL_AUTHORITY_PATHS.manifest, oid: authority.manifestBlob.oid, sha256: sha256(authority.manifestBlob.bytes) },
        origins: Object.fromEntries([...authority.files].map(([role, file]) => [role, { baseSha, path: file.pin.path, oid: file.oid, sha256: file.pin.sha256 }])),
        payloadDigest: candidate.payloadDigest,
      },
      evidence,
    };
  } finally {
    rmSync(trustedRoot, { recursive: true, force: true });
  }
}

export function runBaseOnlySimulation() {
  assert.fail("caller-controlled authority API was removed; use exact Git base objects and a trusted event");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stderr.write("F2-GOV-08 is an import-only offline simulator; run its node:test contract.\n");
  process.exitCode = 2;
}

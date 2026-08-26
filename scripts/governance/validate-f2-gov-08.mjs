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

function safeRelativePath(value, label = "path") {
  assert.equal(typeof value, "string", `${label} is not a string`);
  assert.ok(value.length > 0 && !value.includes("\0") && !value.includes("\\"), `unsafe ${label}: ${value}`);
  assert.ok(!value.startsWith("/") && !/^[A-Za-z]:/.test(value), `unsafe absolute ${label}: ${value}`);
  assert.ok(value.split("/").every((segment) => segment && segment !== "." && segment !== ".."), `unsafe ${label} traversal: ${value}`);
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
  const output = git(repository, ["ls-tree", "-z", sha, "--", path]);
  const records = output.split("\0").filter(Boolean);
  assert.equal(records.length, 1, `${label} Git entry is absent or ambiguous at exact base SHA: ${path}`);
  const match = records[0].match(/^(\d{6}) (\w+) ([0-9a-f]+)\t(.+)$/s);
  assert.ok(match, `${label} Git entry is malformed: ${path}`);
  assert.equal(match[4], path, `${label} Git path is redirected`);
  return { mode: match[1], type: match[2], oid: match[3], path: match[4] };
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
  return git(repository, ["ls-tree", "-rz", "--full-tree", sha], { buffer: true }).toString("utf8").split("\0").filter(Boolean).map((record) => {
    const match = record.match(/^(\d{6}) (\w+) ([0-9a-f]+)\t(.+)$/s);
    assert.ok(match, `Git tree record is malformed: ${record}`);
    return { mode: match[1], type: match[2], oid: match[3], path: match[4] };
  });
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
  const fields = git(repository, args, { buffer: true }).toString("utf8").split("\0");
  if (fields.at(-1) === "") fields.pop();
  const changes = [];
  for (let index = 0; index < fields.length;) {
    const header = fields[index++];
    const match = header.match(/^:(\d{6}) (\d{6}) ([0-9a-f]{40}) ([0-9a-f]{40}) ([A-Z])(\d{0,3})$/);
    assert.ok(match, `structural Git diff header is malformed: ${JSON.stringify(header)}`);
    const [, oldMode, newMode, oldOid, newOid, status, score] = match;
    const firstPath = fields[index++];
    assert.notEqual(firstPath, undefined, "structural Git diff path is truncated");
    let oldPath = status === "A" ? null : firstPath;
    let newPath = status === "D" ? null : firstPath;
    if (status === "R" || status === "C") {
      oldPath = firstPath;
      newPath = fields[index++];
      assert.notEqual(newPath, undefined, "structural Git diff rename/copy destination is truncated");
    }
    if (oldPath !== null) safeRelativePath(oldPath, "structural Git old path");
    if (newPath !== null) safeRelativePath(newPath, "structural Git new path");
    changes.push({
      status,
      score: score === "" ? null : Number(score),
      oldPath,
      newPath,
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

function materializeBlob(root, path, bytes) {
  safeRelativePath(path, "materialized authority path");
  const target = resolve(root, ...path.split("/"));
  assert.ok(target.startsWith(`${resolve(root)}${sep}`), "materialized authority path escapes trusted root");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  const metadata = lstatSync(target);
  assert.equal(metadata.isSymbolicLink(), false, `materialized authority is a symlink: ${path}`);
  assert.equal(metadata.isFile(), true, `materialized authority is not a regular file: ${path}`);
  return target;
}

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

function materializeCandidate(repository, headSha, contract, root) {
  const seen = new Set();
  const payload = [];
  for (const entry of treeEntries(repository, headSha).filter(({ path }) => allowedCandidatePath(path, contract))) {
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

  validateHeadStructuralIntegrity(repository, baseSha, headSha, authority);

  const trustedRoot = mkdtempSync(join(tmpdir(), "branct-f2-gov-08-trusted-"));
  const authorityRoot = join(trustedRoot, "authority");
  const candidateRoot = join(trustedRoot, "candidate");
  mkdirSync(authorityRoot, { mode: 0o700 });
  mkdirSync(candidateRoot, { mode: 0o700 });
  try {
    const materialized = new Map();
    for (const [role, file] of authority.files) materialized.set(role, materializeBlob(authorityRoot, file.pin.path, file.bytes));
    const candidate = materializeCandidate(repository, headSha, authority.contract, candidateRoot);
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

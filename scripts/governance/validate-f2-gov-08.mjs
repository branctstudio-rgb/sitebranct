import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function exactKeys(value, keys, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} is absent or malformed`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} schema is not exact`);
}

function validSha(value, label) {
  assert.match(value ?? "", /^[0-9a-f]{40}$/, `${label} SHA is malformed`);
}

function safeRelativePath(path) {
  assert.equal(typeof path, "string", "unsafe candidate path is not a string");
  assert.ok(path.length > 0 && !path.includes("\0"), `unsafe candidate path: ${path}`);
  assert.ok(!path.includes("\\"), `unsafe candidate path contains a backslash: ${path}`);
  assert.ok(!path.startsWith("/") && !/^[A-Za-z]:/.test(path), `unsafe absolute candidate path: ${path}`);
  const segments = path.split("/");
  assert.ok(segments.every((segment) => segment && segment !== "." && segment !== ".."), `unsafe candidate path traversal: ${path}`);
}

function allowedCandidatePath(path, contract) {
  if (contract.candidate.excluded.includes(path)) return false;
  if (!path.includes("/") && path.endsWith(".html")) return true;
  return ["src/css/", "src/js/", "src/fonts/", "src/i18n/", "src/img/"].some((prefix) => path.startsWith(prefix) && path.length > prefix.length);
}

function validateAuthority(contract, baseSha, authorityFiles) {
  validSha(baseSha, "base");
  assert.equal(baseSha, contract.simulation.baseSha, "base SHA is divergent from the sealed authority");
  assert.equal(contract.authority.source, "exact-base-sha-only", "authority source is not exact-base-sha-only");
  assert.equal(sha256(JSON.stringify(contract.authority.files)), contract.authority.setSha256, "authority digest set is divergent");
  assert.equal(authorityFiles.length, contract.authority.files.length, "base authority file set is incomplete or contains extras");

  const byPath = new Map();
  for (const file of authorityFiles) {
    exactKeys(file, ["path", "mode", "type", "bytes"], `base authority file ${file?.path ?? "unknown"}`);
    assert.equal(file.mode, "100644", `base authority ${file.path} has unexpected Git mode`);
    assert.equal(file.type, "blob", `base authority ${file.path} has unexpected Git type`);
    assert.ok(!byPath.has(file.path), `base authority contains duplicate path: ${file.path}`);
    byPath.set(file.path, file);
  }

  const origins = {};
  for (const pin of contract.authority.files) {
    exactKeys(pin, ["role", "path", "sha256"], `authority pin ${pin?.role ?? "unknown"}`);
    const file = byPath.get(pin.path);
    assert.ok(file, `${pin.role} authority is absent at ${pin.path}`);
    assert.equal(sha256(file.bytes), pin.sha256, `${pin.role} authority digest is divergent`);
    origins[pin.role] = { baseSha, path: pin.path, sha256: pin.sha256 };
  }
  return { byPath, origins };
}

function validateCandidate(contract, headSha, entries) {
  validSha(headSha, "head");
  assert.equal(headSha, contract.simulation.headSha, "head SHA is divergent from the sealed candidate");
  assert.equal(contract.candidate.commandsAllowed, false, "candidate commands must be forbidden");
  assert.equal(contract.candidate.dependenciesAllowed, false, "candidate dependencies must be forbidden");
  const seen = new Set();
  const payload = [];
  for (const entry of entries) {
    exactKeys(entry, ["path", "mode", "type", "filesystemType", "bytes"], `candidate entry ${entry?.path ?? "unknown"}`);
    safeRelativePath(entry.path);
    assert.ok(!seen.has(entry.path), `duplicate candidate path: ${entry.path}`);
    seen.add(entry.path);
    if (entry.mode === "120000") assert.fail(`candidate symlink mode 120000 is forbidden: ${entry.path}`);
    if (entry.mode === "160000" || entry.type === "commit") assert.fail(`candidate submodule has unexpected Git mode or type: ${entry.path}`);
    assert.equal(entry.mode, contract.candidate.gitMode, `candidate ${entry.path} has unexpected Git mode`);
    assert.equal(entry.type, contract.candidate.gitType, `candidate ${entry.path} has unexpected Git type`);
    assert.equal(entry.filesystemType, "file", `candidate ${entry.path} has forbidden junction, reparse point or filesystem type`);
    assert.ok(allowedCandidatePath(entry.path, contract), `candidate path is outside the allowlist or explicitly excluded: ${entry.path}`);
    assert.equal(typeof entry.bytes, "string", `candidate blob is unreadable: ${entry.path}`);
    payload.push({ path: entry.path, sha256: sha256(entry.bytes) });
  }
  payload.sort((left, right) => left.path.localeCompare(right.path));
  return { payload, payloadDigest: sha256(canonicalJson(payload)) };
}

function parseCanonicalAuthorities(contract, authority) {
  const matrixPin = contract.authority.files.find(({ role }) => role === "matrix");
  const expectationsPin = contract.authority.files.find(({ role }) => role === "expectations");
  let matrix;
  let expectations;
  try { matrix = JSON.parse(authority.byPath.get(matrixPin.path).bytes); }
  catch { assert.fail("canonical matrix authority is malformed"); }
  try { expectations = JSON.parse(authority.byPath.get(expectationsPin.path).bytes); }
  catch { assert.fail("canonical expectations authority is malformed"); }
  assert.ok(Array.isArray(matrix) && matrix.length > 0, "canonical matrix is absent or empty");
  assert.ok(Array.isArray(expectations) && expectations.length === matrix.length, "canonical matrix and expectation cardinality differ");
  const tuples = new Set();
  for (const [index, entry] of matrix.entries()) {
    exactKeys(entry, ["engine", "route", "viewport", "action"], `canonical matrix case ${index}`);
    assert.ok(["chromium", "firefox", "webkit"].includes(entry.engine), `canonical matrix engine is unknown: ${entry.engine}`);
    safeRelativePath(entry.route);
    assert.ok(!entry.route.includes("/"), `canonical matrix route is outside the root HTML surface: ${entry.route}`);
    assert.match(entry.route, /^[a-z0-9-]+\.html$/, `canonical matrix route is invalid: ${entry.route}`);
    assert.ok(Array.isArray(entry.viewport) && entry.viewport.length === 2 && entry.viewport.every(Number.isInteger), `canonical matrix viewport is invalid at ${index}`);
    assert.match(entry.action, /^[a-z][a-z0-9-]+$/, `canonical matrix action is invalid at ${index}`);
    const tuple = canonicalJson(entry);
    assert.ok(!tuples.has(tuple), `canonical matrix contains duplicate tuple at ${index}`);
    tuples.add(tuple);
    exactKeys(expectations[index], ["semanticResult", "raw"], `canonical expectation ${index}`);
    assert.equal(expectations[index].semanticResult, "PASS", `canonical expectation result is unsupported at ${index}`);
  }
  return { matrix, expectations, matrixDigest: sha256(authority.byPath.get(matrixPin.path).bytes) };
}

function validateNetwork(contract, origin, requests) {
  assert.equal(origin, contract.simulation.origin, "trusted static server origin is divergent");
  const allowed = new URL(origin).origin;
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname), "trusted server is not loopback-only");
  for (const request of requests) {
    let parsed;
    try { parsed = new URL(request); }
    catch { assert.fail(`external network request is malformed: ${request}`); }
    assert.equal(parsed.origin, allowed, `external network or network origin is divergent: ${request}`);
  }
}

function validateEnvironment(contract, environment) {
  exactKeys(contract.environment.futureJobPermissions, ["contents"], "future job permissions");
  assert.equal(contract.environment.futureJobPermissions.contents, "read", "future job permissions must remain contents read-only");
  assert.deepEqual(contract.environment.exposedToBrowserOrServer, [], "browser or server credential exposure must remain empty");
  assert.ok(environment && typeof environment === "object" && !Array.isArray(environment), "browser/server environment is malformed");
  for (const name of contract.environment.forbiddenNames) {
    assert.equal(Object.hasOwn(environment, name), false, `credential or secret exposed to browser/server: ${name}`);
  }
  assert.deepEqual(Object.keys(environment), [], "browser/server environment must be empty");
}

function validateRaw(contract, raw, label) {
  assert.ok(raw && typeof raw === "object" && !Array.isArray(raw), `raw observation is absent or incomplete: ${label}`);
  for (const forbidden of contract.rawObservation.producerForbiddenKeys) {
    assert.equal(Object.hasOwn(raw, forbidden), false, `KEYED_PRODUCER_TRANSPLANT: producer-forbidden field ${forbidden}: ${label}`);
  }
  assert.deepEqual(Object.keys(raw).sort(), [...contract.rawObservation.exactKeys].sort(), `raw observation schema is not exact or is incomplete: ${label}`);
  for (const name of ["complete", "drawerOpen", "focusInside"]) assert.equal(typeof raw[name], "boolean", `raw observation ${name} is invalid: ${label}`);
  for (const name of ["targetWidth", "targetHeight"]) assert.ok(Number.isFinite(raw[name]) && raw[name] >= 0, `raw observation ${name} is invalid: ${label}`);
  assert.equal(raw.complete, true, `raw observation is inconclusive because complete is false: ${label}`);
}

export function runBaseOnlySimulation(input) {
  exactKeys(input, ["contract", "baseSha", "headSha", "authorityFiles", "candidateEntries", "origin", "environment", "networkRequests", "readRaw"], "simulation input");
  const { contract, baseSha, headSha, authorityFiles, candidateEntries, origin, environment, networkRequests, readRaw } = input;
  assert.equal(contract.schemaVersion, 1, "F2-GOV-08 contract schema is divergent");
  assert.equal(contract.status, "OFFLINE_SIMULATOR_ONLY", "F2-GOV-08 must remain an offline simulator");
  assert.equal(contract.limitations.workflowEnforcement, "NOT_VERIFIED", "workflow enforcement must remain NOT_VERIFIED");
  assert.equal(contract.limitations.operationalIsolation, "NOT_VERIFIED", "operational isolation must remain NOT_VERIFIED");
  assert.equal(typeof readRaw, "function", "trusted measurement adapter is absent");
  assert.ok(Array.isArray(authorityFiles) && Array.isArray(candidateEntries) && Array.isArray(networkRequests), "simulation collections are absent or malformed");

  const authority = validateAuthority(contract, baseSha, authorityFiles);
  const candidate = validateCandidate(contract, headSha, candidateEntries);
  const canonical = parseCanonicalAuthorities(contract, authority);
  const candidatePaths = new Set(candidate.payload.map(({ path }) => path));
  for (const route of new Set(canonical.matrix.map(({ route }) => route))) assert.ok(candidatePaths.has(route), `canonical route is absent from candidate: ${route}`);
  validateNetwork(contract, origin, networkRequests);
  validateEnvironment(contract, environment);

  const evidence = [];
  const identities = new Set();
  for (const [index, canonicalCase] of canonical.matrix.entries()) {
    const label = `${canonicalCase.engine} ${canonicalCase.route} ${canonicalCase.viewport.join("x")} ${canonicalCase.action}`;
    const rawObservation = readRaw(structuredClone(canonicalCase));
    validateRaw(contract, rawObservation, label);
    const semanticResult = canonicalJson(rawObservation) === canonicalJson(canonical.expectations[index].raw) ? "PASS" : "FAIL";
    assert.equal(semanticResult, canonical.expectations[index].semanticResult, `OBSERVATION_PAYLOAD_SWAP: semantic expectation differs: ${label}`);
    const binding = { baseSha, headSha, matrixDigest: canonical.matrixDigest, engine: canonicalCase.engine, route: canonicalCase.route, viewport: canonicalCase.viewport, action: canonicalCase.action, payloadDigest: candidate.payloadDigest };
    const identity = sha256(canonicalJson(binding));
    assert.ok(!identities.has(identity), `trusted consumer produced duplicate identity: ${identity}`);
    identities.add(identity);
    const envelope = { ...binding, identity, rawObservation, semanticResult };
    evidence.push({ ...envelope, digest: sha256(canonicalJson(envelope)) });
  }
  assert.equal(evidence.length, canonical.matrix.length, "trusted measurement report is partial");
  assert.equal(identities.size, canonical.matrix.length, "trusted measurement identity bijection is incomplete");
  return {
    decision: "PASS",
    authority: { baseSha, headSha, origins: authority.origins, matrixDigest: canonical.matrixDigest, payloadDigest: candidate.payloadDigest },
    evidence,
  };
}

function git(repository, args, encoding = "utf8") {
  try {
    return execFileSync("git", args, { cwd: repository, encoding, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    assert.fail(`Git authority cannot resolve: git ${args.join(" ")}`);
  }
}

function resolveCommit(repository, sha, label) {
  validSha(sha, label);
  const resolved = git(repository, ["rev-parse", "--verify", `${sha}^{commit}`]).trim();
  assert.equal(resolved, sha, `${label} SHA resolves to a different commit`);
}

function treeEntries(repository, sha) {
  const output = git(repository, ["ls-tree", "-rz", "--full-tree", sha]);
  return output.split("\0").filter(Boolean).map((record) => {
    const match = record.match(/^(\d{6}) (\w+) ([0-9a-f]+)\t(.+)$/s);
    assert.ok(match, `Git tree record is malformed: ${record}`);
    return { mode: match[1], type: match[2], oid: match[3], path: match[4] };
  });
}

export function runBaseOnlyGitSimulation({ contract, repository, baseSha, headSha, origin, environment, networkRequests, readRaw }) {
  assert.equal(typeof repository, "string", "Git repository path is absent");
  resolveCommit(repository, baseSha, "base");
  resolveCommit(repository, headSha, "head");

  const changed = git(repository, ["diff", "--name-only", "-z", baseSha, headSha]).split("\0").filter(Boolean);
  for (const path of changed) {
    safeRelativePath(path);
    assert.ok(allowedCandidatePath(path, contract), `head changed a non-live or protected authority path: ${path}`);
  }

  const baseTree = new Map(treeEntries(repository, baseSha).map((entry) => [entry.path, entry]));
  const authorityFiles = contract.authority.files.map((pin) => {
    const entry = baseTree.get(pin.path);
    assert.ok(entry, `${pin.role} authority Git blob is absent at exact base SHA: ${pin.path}`);
    return { path: pin.path, mode: entry.mode, type: entry.type, bytes: git(repository, ["cat-file", "blob", entry.oid]) };
  });

  const candidateEntries = treeEntries(repository, headSha)
    .filter(({ path }) => allowedCandidatePath(path, contract))
    .map((entry) => ({
      path: entry.path,
      mode: entry.mode,
      type: entry.type,
      filesystemType: entry.mode === "120000" ? "symlink" : "file",
      bytes: git(repository, ["cat-file", "blob", entry.oid]),
    }));

  const boundContract = structuredClone(contract);
  boundContract.simulation.baseSha = baseSha;
  boundContract.simulation.headSha = headSha;
  return runBaseOnlySimulation({ contract: boundContract, baseSha, headSha, authorityFiles, candidateEntries, origin, environment, networkRequests, readRaw });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stderr.write("F2-GOV-08 is an import-only offline simulator; run its node:test contract.\n");
  process.exitCode = 2;
}

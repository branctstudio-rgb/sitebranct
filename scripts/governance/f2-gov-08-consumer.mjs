import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { readTrustedStaticRoute } from "./f2-gov-08-static-server.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const exactKeys = (value, keys, label) => {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} is absent or malformed`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} schema is not exact`);
};

function measuredObservation(candidateRoot, canonicalCase) {
  const html = readTrustedStaticRoute(candidateRoot, canonicalCase.route);
  const focusTarget = canonicalCase.action === "focus-navigation";
  const width = Number(html.match(new RegExp(`data-${focusTarget ? "focus-" : ""}target-width=["'](\\d+)["']`))?.[1]);
  const height = Number(html.match(new RegExp(`data-${focusTarget ? "focus-" : ""}target-height=["'](\\d+)["']`))?.[1]);
  return {
    complete: /^<!doctype html>/i.test(html),
    drawerOpen: canonicalCase.action === "open-drawer" && /data-drawer-capable=["']true["']/.test(html),
    focusInside: canonicalCase.action !== "escape-close" && /data-focus-capable=["']true["']/.test(html),
    targetWidth: width,
    targetHeight: height,
  };
}

export function consumeTrustedMeasurement(request) {
  exactKeys(request, ["baseSha", "headSha", "candidateRoot", "matrixPath", "expectationsPath", "matrixDigest", "payloadDigest"], "trusted consumer request");
  const matrixBytes = readFileSync(request.matrixPath, "utf8");
  const expectationBytes = readFileSync(request.expectationsPath, "utf8");
  assert.equal(sha256(matrixBytes), request.matrixDigest, "trusted consumer matrix digest is divergent");
  const matrix = JSON.parse(matrixBytes);
  const expectations = JSON.parse(expectationBytes);
  assert.equal(matrix.length, expectations.length, "trusted consumer authority cardinality differs");
  const identities = new Set();
  const evidence = matrix.map((canonicalCase, index) => {
    const rawObservation = measuredObservation(request.candidateRoot, canonicalCase);
    const semanticResult = canonicalJson(rawObservation) === canonicalJson(expectations[index].raw) ? "PASS" : "FAIL";
    const binding = { baseSha: request.baseSha, headSha: request.headSha, matrixDigest: request.matrixDigest, engine: canonicalCase.engine, route: canonicalCase.route, viewport: canonicalCase.viewport, action: canonicalCase.action, payloadDigest: request.payloadDigest };
    const identity = sha256(canonicalJson(binding));
    assert.equal(identities.has(identity), false, `trusted consumer duplicate identity: ${identity}`);
    identities.add(identity);
    const envelope = { ...binding, identity, rawObservation, semanticResult };
    return { ...envelope, digest: sha256(canonicalJson(envelope)) };
  });
  return { complete: true, evidence };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv.length, 4, "trusted consumer requires exact request and response paths");
  const request = JSON.parse(readFileSync(process.argv[2], "utf8"));
  writeFileSync(process.argv[3], JSON.stringify(consumeTrustedMeasurement(request)), { encoding: "utf8", flag: "wx" });
}

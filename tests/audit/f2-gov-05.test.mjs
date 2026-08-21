import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url);
const GOVERNANCE_DECISION = "docs/audit/phase-2/governance-decision.md";
const TRUST_SURFACE = "docs/audit/phase-2/governance/gate-trust-surface.md";
const CURRENT_RECORD = "docs/audit/phase-2/governance/f2-gov-05-current-governance.md";
const FIXTURE = "fixtures/audit/f2-gov-05-current-governance.json";
const CURRENT_START = "<!-- CURRENT_GOVERNANCE_START -->";
const CURRENT_END = "<!-- CURRENT_GOVERNANCE_END -->";
const HISTORY_START = "<!-- HISTORICAL_GOVERNANCE_SNAPSHOT_START -->";
const HISTORY_END = "<!-- HISTORICAL_GOVERNANCE_SNAPSHOT_END -->";

const expectedCurrent = Object.freeze({
  viaA: "PRIMARY_ACTIVE",
  viaB: "CONTINGENCY_BREAK_GLASS_ROLLBACK",
  viaBRequired: false,
  mainProtected: true,
  requiredChecks: [
    { context: "Gate Integrity Sentinel", appId: 15368 },
    { context: "Universal PR Gate", appId: 15368 },
  ],
  mergeMethods: { merge: true, squash: false, rebase: false },
});

const expectedHistoricalHashes = Object.freeze({
  [GOVERNANCE_DECISION]: "755e3c60b806d1b92d9f3c124a04255d1c8159a31ddf3a1e6d7abb8ae626335c",
  [TRUST_SURFACE]: "186daed0c0ae5ff1f212abfceb7f4d549caba47a21d31a14eb4727c2b2499dcb",
});

const read = (path) => readFileSync(new URL(path, ROOT), "utf8");
const normalizeEol = (value) => value.replace(/\r\n?/g, "\n");
const hash = (value) => createHash("sha256").update(normalizeEol(value)).digest("hex");

function extractExactlyOne(source, start, end, label) {
  const starts = source.split(start).length - 1;
  const ends = source.split(end).length - 1;
  assert.equal(starts, 1, `${label}: expected exactly one START marker`);
  assert.equal(ends, 1, `${label}: expected exactly one END marker`);
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);
  assert.ok(endIndex > startIndex, `${label}: END marker must follow START marker`);
  return source.slice(startIndex + start.length, endIndex).replace(/^\r?\n|\r?\n$/g, "");
}

function parseJsonBlock(source, label) {
  const block = extractExactlyOne(source, CURRENT_START, CURRENT_END, label);
  const match = block.match(/```json\s*([\s\S]*?)\s*```/);
  assert.ok(match, `${label}: current block must contain one JSON object`);
  return JSON.parse(match[1]);
}

function assertCurrentRecord(value, label) {
  assert.deepEqual(value.current, expectedCurrent, `${label}: current governance differs`);
  assert.equal(value.status, "CURRENT_OPERATIONAL_GOVERNANCE", `${label}: status must be current`);
  assert.equal(value.effectiveMainSha, "066b85f5c7471b15acba236353c2734098a2cd8a", `${label}: effective main SHA differs`);
  assert.equal(value.productionAuthorized, false, `${label}: production must remain unauthorized`);
  assert.equal(value.f201Started, false, `${label}: F2-01 must remain unstarted`);
}

function assertNoHistoricalClaimOutsideSnapshot(source, label) {
  const historical = extractExactlyOne(source, HISTORY_START, HISTORY_END, `${label} history`);
  const outside = source.replace(`${HISTORY_START}\n${historical}\n${HISTORY_END}`, "");
  for (const stale of ["PENDING_HUMAN_DECISION", "Via B continua obrigatória", "NÃO ATIVÁVEL"]) {
    assert.equal(outside.includes(stale), false, `${label}: stale current claim outside historical snapshot: ${stale}`);
  }
  return historical;
}

test("canonical current-governance fixture and document agree exactly", () => {
  const fixture = JSON.parse(read(FIXTURE));
  const document = parseJsonBlock(read(CURRENT_RECORD), CURRENT_RECORD);
  assert.deepEqual(document, fixture, "canonical document JSON must equal fixture");
  assertCurrentRecord(fixture, FIXTURE);
});

test("superseded documents expose current status while preserving historical bytes", () => {
  for (const path of [GOVERNANCE_DECISION, TRUST_SURFACE]) {
    const source = read(path);
    const current = parseJsonBlock(source, path);
    assertCurrentRecord(current, path);
    const historical = assertNoHistoricalClaimOutsideSnapshot(source, path);
    assert.equal(hash(historical), expectedHistoricalHashes[path], `${path}: historical snapshot changed`);
  }
});

test("current governance is fail-closed against stale or permissive mutations", () => {
  const source = read(CURRENT_RECORD);
  const fixture = JSON.parse(read(FIXTURE));
  const mutations = [
    ["Via B made mandatory again", source.replace('"viaBRequired": false', '"viaBRequired": true')],
    ["Via A no longer primary", source.replace('"viaA": "PRIMARY_ACTIVE"', '"viaA": "PENDING"')],
    ["production implicitly authorized", source.replace('"productionAuthorized": false', '"productionAuthorized": true')],
    ["required check removed", source.replace(/,\s*\{\s*"context": "Universal PR Gate",\s*"appId": 15368\s*\}/, "")],
  ];
  for (const [label, mutated] of mutations) {
    assert.notEqual(mutated, source, `${label}: mutation must change source`);
    assert.throws(() => {
      const parsed = parseJsonBlock(mutated, label);
      assert.deepEqual(parsed, fixture, `${label}: current record mismatch`);
    }, { message: /current record mismatch/ });
  }
});

test("markers and historical classification fail closed", () => {
  const source = read(GOVERNANCE_DECISION);
  const mutations = [
    ["current START removed", source.replace(CURRENT_START, "")],
    ["current START duplicated", source.replace(CURRENT_START, `${CURRENT_START}\n${CURRENT_START}`)],
    ["history END removed", source.replace(HISTORY_END, "")],
    ["stale claim escaped history", `PENDING_HUMAN_DECISION\n${source}`],
  ];
  for (const [label, mutated] of mutations) {
    assert.notEqual(mutated, source, `${label}: mutation must change source`);
    assert.throws(() => {
      parseJsonBlock(mutated, label);
      assertNoHistoricalClaimOutsideSnapshot(mutated, label);
    }, { message: /expected exactly one|stale current claim/ });
  }
});

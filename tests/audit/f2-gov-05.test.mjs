import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url);
const GOVERNANCE_DECISION = "docs/audit/phase-2/governance-decision.md";
const TRUST_SURFACE = "docs/audit/phase-2/governance/gate-trust-surface.md";
const CURRENT_RECORD = "docs/audit/phase-2/governance/f2-gov-05-current-governance.md";
const FIXTURE = "fixtures/audit/f2-gov-05-current-governance.json";
const OPERATIONAL_MEMORY = "CLAUDE.md";
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

function locateExactlyOne(source, start, end, label) {
  const normalized = normalizeEol(source);
  const starts = normalized.split(start).length - 1;
  const ends = normalized.split(end).length - 1;
  assert.equal(starts, 1, `${label}: expected exactly one START marker`);
  assert.equal(ends, 1, `${label}: expected exactly one END marker`);
  const startIndex = normalized.indexOf(start);
  const endIndex = normalized.indexOf(end);
  assert.ok(endIndex > startIndex, `${label}: END marker must follow START marker`);
  for (const [marker, index, type] of [[start, startIndex, "START"], [end, endIndex, "END"]]) {
    assert.ok(index === 0 || normalized[index - 1] === "\n", `${label}: ${type} marker must begin on its own line`);
    const after = index + marker.length;
    assert.ok(after === normalized.length || normalized[after] === "\n", `${label}: ${type} marker must end on its own line`);
  }
  return {
    source: normalized,
    startIndex,
    endIndex,
    afterEnd: endIndex + end.length,
    content: normalized.slice(startIndex + start.length, endIndex).replace(/^\n|\n$/g, ""),
  };
}

function extractExactlyOne(source, start, end, label) {
  return locateExactlyOne(source, start, end, label).content;
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
  const history = locateExactlyOne(source, HISTORY_START, HISTORY_END, `${label} history`);
  const current = locateExactlyOne(source, CURRENT_START, CURRENT_END, `${label} current`);
  const disjoint = current.afterEnd <= history.startIndex || history.afterEnd <= current.startIndex;
  assert.equal(disjoint, true, `${label}: current and historical blocks must not overlap`);
  const outside = `${history.source.slice(0, history.startIndex)}${history.source.slice(history.afterEnd)}`;
  for (const stale of ["PENDING_HUMAN_DECISION", "Via B continua obrigatória", "NÃO ATIVÁVEL"]) {
    assert.equal(outside.includes(stale), false, `${label}: stale current claim outside historical snapshot: ${stale}`);
  }
  return history.content;
}

test("canonical current-governance fixture and document agree exactly", () => {
  const fixture = JSON.parse(read(FIXTURE));
  const document = parseJsonBlock(read(CURRENT_RECORD), CURRENT_RECORD);
  assert.deepEqual(document, fixture, "canonical document JSON must equal fixture");
  assertCurrentRecord(fixture, FIXTURE);
});

test("operational memory reports the active technical protection", () => {
  const memory = read(OPERATIONAL_MEMORY);
  assert.match(memory, /A `main` possui proteção técnica ativa/);
  assert.match(memory, /Via A é a proteção principal ativa/);
  assert.match(memory, /Via B permanece somente como contingência, break-glass humano e rollback/);
  assert.doesNotMatch(memory, /A `main` não possui proteção técnica de branch comprovada/);
  assert.doesNotMatch(memory, /enquanto não existir proteção técnica da `main`/);
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

test("historical classification is portable across EOL representations", async (t) => {
  const lf = normalizeEol(read(GOVERNANCE_DECISION)).replace(/\n$/, "");
  const lines = lf.split("\n");
  let mixedIndex = 0;
  const mixed = lf.replace(/\n/g, (match, offset, source) => {
    if (source[offset - 1] === "\n" || source[offset + 1] === "\n") return "\r\n";
    return ["\n", "\r\n", "\r"][mixedIndex++ % 3];
  });
  const variants = new Map([
    ["LF with final newline", `${lf}\n`],
    ["LF without final newline", lf],
    ["CRLF with final newline", `${lines.join("\r\n")}\r\n`],
    ["CRLF without final newline", lines.join("\r\n")],
    ["CR with final newline", `${lines.join("\r")}\r`],
    ["CR without final newline", lines.join("\r")],
    ["mixed EOL", mixed],
  ]);
  for (const [label, source] of variants) {
    await t.test(label, () => {
      const historical = assertNoHistoricalClaimOutsideSnapshot(source, label);
      assert.equal(hash(historical), expectedHistoricalHashes[GOVERNANCE_DECISION], `${label}: historical snapshot changed`);
    });
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
  const inverted = source
    .replace(HISTORY_START, "HISTORY_START_PLACEHOLDER")
    .replace(HISTORY_END, HISTORY_START)
    .replace("HISTORY_START_PLACEHOLDER", HISTORY_END);
  const overlap = source
    .replace(HISTORY_START, "")
    .replace(CURRENT_END, `${HISTORY_START}\n${CURRENT_END}`);
  const mutations = [
    ["current START removed", source.replace(CURRENT_START, "")],
    ["current START duplicated", source.replace(CURRENT_START, `${CURRENT_START}\n${CURRENT_START}`)],
    ["history START removed", source.replace(HISTORY_START, "")],
    ["history START duplicated", source.replace(HISTORY_START, `${HISTORY_START}\n${HISTORY_START}`)],
    ["history END removed", source.replace(HISTORY_END, "")],
    ["history END duplicated", source.replace(HISTORY_END, `${HISTORY_END}\n${HISTORY_END}`)],
    ["history markers inverted", inverted],
    ["current and history overlap", overlap],
    ["history marker malformed", source.replace(HISTORY_START, "<!-- HISTORICAL_GOVERNANCE_SNAPSHOT_START --")],
    ["stale claim escaped history", `PENDING_HUMAN_DECISION\n${source}`],
  ];
  for (const [label, mutated] of mutations) {
    assert.notEqual(mutated, source, `${label}: mutation must change source`);
    assert.throws(() => {
      parseJsonBlock(mutated, label);
      assertNoHistoricalClaimOutsideSnapshot(mutated, label);
    }, { message: /expected exactly one|must follow|must not overlap|must (begin|end) on its own line|stale current claim/ });
  }
});

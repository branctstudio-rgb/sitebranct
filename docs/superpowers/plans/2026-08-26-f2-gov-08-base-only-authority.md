# F2-GOV-08 Base-only Authority Implementation Plan

> **For BRANCT Web Agent:** Execute this plan test-first. Stop before any protected ceremony or merge.

**Goal:** Produce an offline, executable and fail-closed simulator proving that an untrusted pull-request producer cannot control or transplant measurement authority.

**Architecture:** A base-owned contract seals the authority paths and canonical matrix. A trusted simulator loads those values for an exact base SHA, validates a closed candidate Git tree, drives canonical cases, accepts only primitive raw readings, and derives identities, results, envelopes, digests, and the final decision after measurement.

**Technology:** Node.js 22 standard library, `node:test`, JSON contracts, Git plumbing in temporary repositories.

---

### Task 1: Seal the design and RED attacks

**Files:**
- Create: `docs/superpowers/specs/2026-08-26-f2-gov-08-base-only-authority-design.md`
- Create: `tests/audit/f2-gov-08.test.mjs`

1. Add historical reproducers for `OBSERVATION_PAYLOAD_SWAP` and `KEYED_PRODUCER_TRANSPLANT`.
2. Add expected API tests for a trusted base loader, candidate tree validator, raw observation boundary, canonical measurement loop, and final decision.
3. Run `node --test tests/audit/f2-gov-08.test.mjs` and record semantic RED labels rather than module, timeout, or infrastructure failures.

### Task 2: Implement the closed contract and simulator

**Files:**
- Create: `fixtures/audit/f2-gov-08-base-only-contract.json`
- Create: `scripts/governance/validate-f2-gov-08.mjs`

1. Define exact authority roles, allowed candidate paths and Git type, loopback-only network policy, canonical cases, raw-reading schema, and fail-closed result.
2. Implement canonical JSON hashing, strict SHA/path/type validation, authority digest validation, and exact candidate materialization planning.
3. Implement the trusted measurement consumer so tuple selection and binding remain inside the consumer.
4. Reject producer-supplied identity, result, key, envelope, digest, expected set, or PASS.
5. Run the new test until the legitimate path is GREEN and every attack fails for its contracted reason.

### Task 3: Make the regressions permanent

**Files:**
- Modify: `tests/audit/site-audit.test.mjs`

1. Import the F2-GOV-08 test module from the integrated audit entrypoint.
2. Run the new module directly and through the integrated suite.
3. Run the suite in independent LF and CRLF worktrees and verify identical conclusions.

### Task 4: Document handoff and future ceremony

**Files:**
- Create: `docs/audit/phase-2/governance/f2-gov-08-trust-model.md`
- Create: `docs/audit/phase-2/governance/f2-gov-08-handoff.md`

1. Record producer/consumer/base/artifact/key/digest/decision ownership.
2. Record the exact offline proof, attacks, limitations, and future workflow design.
3. State explicitly that workflow enforcement and operational isolation remain NOT_VERIFIED.
4. Prepare a nominal protected-evolution proposal without executing it.

### Task 5: Validate, review, and publish draft

**Files:**
- All seven new files plus the one integrated-test modification.

1. Run F2-GOV-08, integrated governance/audit, deploy payload, DOM, visual evidence, JSON/YAML, and `git diff --check`.
2. Confirm no live pages, CSS, JavaScript, assets, workflows, deploy, manifest, or production files changed.
3. Commit and push the branch only after local GREEN.
4. Open a draft PR linked to Issue #60.
5. Wait for exact-head CI and request an independent adversarial review.
6. If any Critical or Important finding exists, stop without ceremony or merge.

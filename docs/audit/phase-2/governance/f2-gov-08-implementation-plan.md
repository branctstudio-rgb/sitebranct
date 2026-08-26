# F2-GOV-08 Base-only Authority Implementation Plan

> **For BRANCT Web Agent:** Execute this plan test-first. Stop before any protected ceremony or merge.

**Goal:** Produce an offline, executable and fail-closed simulator proving that an untrusted pull-request producer cannot control or transplant measurement authority.

**Architecture:** Fixed bootstrap paths discover a base-owned contract and manifest from the exact event base. The manifest pins the executable consumer, server, matrix and expectations. The simulator accepts no caller authority or SHA inputs, validates exact refs and ancestry, materializes the base consumer and executes that same file against a closed candidate tree.

**Technology:** Node.js 22 standard library, `node:test`, JSON contracts, Git plumbing in temporary repositories.

---

### Task 1: Seal the design and RED attacks

**Files:**
- Create: `docs/audit/phase-2/governance/f2-gov-08-design.md`
- Create: `tests/audit/f2-gov-08.test.mjs`

1. Add historical reproducers for `OBSERVATION_PAYLOAD_SWAP` and `KEYED_PRODUCER_TRANSPLANT`.
2. Add expected API tests for a trusted base loader, candidate tree validator, raw observation boundary, canonical measurement loop, and final decision.
3. Run `node --test tests/audit/f2-gov-08.test.mjs` and record semantic RED labels rather than module, timeout, or infrastructure failures.

### Task 2: Implement the closed contract, executable consumer and simulator

**Files:**
- Create: `fixtures/audit/f2-gov-08-base-only-contract.json`
- Create: `fixtures/audit/f2-gov-08-authority-manifest.json`
- Create: `fixtures/audit/f2-gov-08-matrix.json`
- Create: `fixtures/audit/f2-gov-08-expectations.json`
- Create: `scripts/governance/f2-gov-08-consumer.mjs`
- Create: `scripts/governance/f2-gov-08-static-server.mjs`
- Create: `scripts/governance/validate-f2-gov-08.mjs`

1. Compile the contract/manifest paths into the trusted harness; do not accept them as parameters.
2. Resolve base/head only from a trusted event and exact remote refs, with repository and ancestry validation.
3. Validate and materialize the base blobs, execute the exact materialized consumer, and verify the snapshot before and after execution.
4. Reject producer-supplied authority, identities, results, keys, envelopes, digests, expected sets, PASS or callbacks.
5. Run the new test until the legitimate path is GREEN and every attack fails for its contracted reason.

### Task 3: Evolve F2-GOV-06 without erasing history

**Files:**
- Modify: `fixtures/audit/f2-01-transition.json`
- Modify: `tests/audit/site-audit.test.mjs`

1. Preserve `4ffdff43…` as version-1 historical anchor.
2. Register `1f7e953…` as version-2 minimum operational base.
3. Require historical → minimum → event base → head ancestry and reject downgrade or silent substitution.
4. Import F2-GOV-08 from the integrated audit entrypoint and verify LF/CRLF independently.

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
- Four documents, six base-only authority artefacts/scripts, the simulator/test, and two F2-GOV-06 protected transition files: 14 paths total.

1. Run F2-GOV-08, integrated governance/audit, deploy payload, DOM, visual evidence, JSON/YAML, and `git diff --check`.
2. Confirm no live pages, CSS, JavaScript, assets, workflows, deploy, manifest, or production files changed.
3. Commit and push the branch only after local GREEN.
4. Open a draft PR linked to Issue #60.
5. Wait for exact-head CI and request an independent adversarial review.
6. If any Critical or Important finding exists, stop without ceremony or merge.

# F2-GOV-02A Universal Gate Candidate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use test-driven development and execute each task in order. This plan does not authorize activation or merge.

**Goal:** Deliver one stable pull-request check that is emitted for every PR and classifies every changed path deterministically without deploying.

**Architecture:** A pure Node classifier consumes NUL-safe Git name-status records and returns a closed classification plus required offline suites. A single workflow without path filters always starts the same job, runs the classifier, executes the selected deterministic suites, and emits an explicit terminal summary. Fixtures define both the path matrix and the future disposable trial; tests bind policy, script, workflow and fixtures.

**Tech Stack:** GitHub Actions YAML, Node.js 22 standard library, `node:test`, JSON fixtures.

**Spec:** `docs/audit/phase-2/governance/f2-gov-02a-gate-contract.md`

## Global constraints

- Base is `d09838956bbf455d728f7e75952cd9ec41498376`.
- Workflow/check identity is immutable within this mission.
- No path filters, job-level condition, secrets, deployment, external mutation or protection activation.
- Unknown paths fail closed.
- `merge_group` is modeled but merge queue is not activated.

### Task 1: Executable RED and closed classifier

**Files:** create `tests/audit/f2-gov-02a.test.mjs`, `fixtures/audit/f2-gov-02a-path-matrix.json`, `scripts/governance/classify-pr-paths.mjs`.

- [ ] Write tests that require the stable workflow/job, closed categories and scenario matrix.
- [ ] Run against `F2_GOV_02A_TARGET=current` and confirm failures for missing universal check and conditional existing checks.
- [ ] Implement parsing for add/modify/delete/rename and reject malformed, traversal, duplicate or unknown paths.
- [ ] Run all classifier cases and isolated negatives.

### Task 2: Universal workflow candidate

**Files:** create `.github/workflows/universal-pr-gate.yml`; modify `tests/audit/f2-gov-02a.test.mjs`.

- [ ] Add failing structural tests for missing triggers, filters, job conditions, mutable Actions, permissions, timeout, concurrency, secrets and deploy primitives.
- [ ] Add the minimal PR + `merge_group` workflow with one unconditional `universal-pr-gate` job.
- [ ] Bind changed-file classification and selected suites to explicit steps; add an `always()` terminal summary.
- [ ] Confirm the job identity is `Universal PR Gate Candidate / Universal PR Gate`.

### Task 3: Governance and disposable-trial contract

**Files:** create `fixtures/audit/f2-gov-02b-trial-contract.json`, `docs/audit/phase-2/governance/f2-gov-02a-gate-contract.md`, `f2-gov-02a-path-matrix.md`, `f2-gov-02b-trial-plan.md`, `f2-gov-02a-handoff.md`.

- [ ] Test the seven future trial scenarios, expected check identity/result and cleanup criteria.
- [ ] Document measured RED, GREEN, threat boundaries, selection policy and explicit non-activation.
- [ ] Keep Via B mandatory until 02B and a separate activation decision succeed.

### Task 4: Integration and evidence

**Files:** minimally modify `tests/audit/site-audit.test.mjs` and `tests/audit/phase-2-governance.test.mjs`.

- [ ] Import the new contract into the integrated suite and extend only its offline allowlist.
- [ ] Run gate, governance, audit, deploy, DOM, visual, JSON/YAML and diff checks.
- [ ] Request independent adversarial review and fix material findings through a new RED→GREEN cycle.
- [ ] Open a draft PR, verify the exact check identity on its head and stop before merge.

## Rollback

Before merge, close the draft PR. After a separately authorized merge, use `git revert -m 1 <merge_sha>`. This removes the candidate workflow and classifier but does not alter branch-protection settings.

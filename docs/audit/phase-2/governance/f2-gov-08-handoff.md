# F2-GOV-08 handoff

## Scope

- Issue-lock: #60
- Branch: `agent/f2-gov-08-base-only-authority`
- Base: `1f7e95315e518a4ea0a5f1668db67e5b18a69087`
- PR #59 remains frozen at `9f710304980d9987ae63f50ef2a48cdf389c0d28` and is not an authority for this package.
- Selected architecture: future base-only trusted harness inside the Universal PR Gate.

## RED

The legacy producer-authoritative model accepted both attacks after the producer recalculated its own digest:

```text
OBSERVATION_PAYLOAD_SWAP=ACCEPTED
KEYED_PRODUCER_TRANSPLANT=ACCEPTED
process exit=1
```

The defect is architectural: hashing a producer-supplied envelope does not make the observation independent.

## F1 root cause and GREEN contract

The rejected head accepted joint replacement of contract/pins, never executed the blob it called the consumer, accepted caller-selected base/head, and confused the historical F2-GOV-06 base with every later operational PR base.

F1 removes those inputs. The public harness accepts only repository plus trusted-event path. Fixed paths load contract and manifest from the event base; pins load consumer/server/matrix/expectations from that same commit. Exact remote refs and ancestry bind the head. The exact validated consumer is materialized, executed and reverified. Forty permanent F2-GOV-08 tests include a complete PASS and the required authority, event, ref, mode, symlink, blob, TOCTOU, network, payload-swap and keyed-transplant negatives.

F2-GOV-06 keeps `4ffdff435f90612b9d46051110bd87b2afc40d17` as `HISTORICAL_ANCHOR` and records `1f7e95315e518a4ea0a5f1668db67e5b18a69087` as the version-2 `MINIMUM_OPERATIONAL_BASE`. The active event base must be its descendant, and the head must descend from that event base.

## Protected surface and expected Sentinel result

This package changes two existing protected components: `fixtures/audit/f2-01-transition.json` and `tests/audit/site-audit.test.mjs`. The real workflow and Sentinel are not modified. Therefore the Sentinel must fail only for those two paths. The six new authority artefacts/scripts also require a separate future `anchors-evolution` before operational gate integration; this PR does not silently claim they are already protected.

A future nominal ceremony is required only after an exact head, green non-Sentinel checks, a favorable independent review, and formal human approval.

## Limitations

The package remains `OFFLINE_SIMULATOR_ONLY`. Git blob authority is verified in controlled temporary repositories. Workflow enforcement, GitHub-runner materialization, runner-level isolation, and real browser network blocking are `NOT_VERIFIED`. The package does not authorize workflow changes, protection changes, merge, F2-01 integration, deploy, secrets, or production.

## Rollback

Before merge: close the draft PR and preserve the branch for audit. After a separately authorized future merge: use a normal protected PR containing `git revert -m 1 <merge_sha>`; never push directly to `main`.

## Future ceremony proposal (not authorized)

- Ceremony ID: `F2-GATE-CHANGE-F2-GOV-08-PR61-<FINAL_HEAD>`
- Existing protected files changed: `fixtures/audit/f2-01-transition.json`, `tests/audit/site-audit.test.mjs`.
- Future anchor-evolution set (not part of this ceremony): contract, manifest, consumer, server, matrix, expectations and validator paths introduced by F2-GOV-08, plus the workflow/Sentinel changes required to execute and protect them.
- Temporary exception: none is proposed until the final head and CI are known.
- Required controls: external approval on the exact head, sealed protection snapshot, at most 15 minutes if a required-check exception is later approved, immediate full restoration, independent readback, post-restoration disposable rehearsal, and content rollback through a normal PR.
- Absolute limits: no FTP, deploy, `workflow_dispatch`, secrets, production, or F2-01 integration.

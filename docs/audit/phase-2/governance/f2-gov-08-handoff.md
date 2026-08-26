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

## GREEN contract

The offline consumer owns tuple selection, raw-reading validation, semantic derivation, identity, envelope, digest, and final decision. It obtains its matrix, expectations, consumer pin, and server pin from an exact simulated base SHA. The candidate supplies only a closed set of live regular blobs.

The 49 permanent tests include a legitimate PASS path and fail-closed negatives for payload swaps, keyed transplant, tuple swaps, copied/omitted/duplicate/partial results, authority drift, Git/path/filesystem violations, external network, secret exposure, and candidate-authored result metadata. Controlled temporary Git repositories prove that authorities are read from explicit base blobs, candidate live blobs from the explicit head, `HEAD` movement is irrelevant, and altered or removed base authority blobs fail closed.

## Protected surface and expected Sentinel result

This package changes the existing protected entrypoint `tests/audit/site-audit.test.mjs` so the new contract runs in the current offline audit. The real workflow and Sentinel are not modified. Therefore the Gate Integrity Sentinel is expected to fail on the protected test change. That result must not be bypassed or neutralized.

A future nominal ceremony is required only after an exact head, green non-Sentinel checks, a favorable independent review, and formal human approval.

## Limitations

The package remains `OFFLINE_SIMULATOR_ONLY`. Git blob authority is verified in controlled temporary repositories. Workflow enforcement, GitHub-runner materialization, runner-level isolation, and real browser network blocking are `NOT_VERIFIED`. The package does not authorize workflow changes, protection changes, merge, F2-01 integration, deploy, secrets, or production.

## Rollback

Before merge: close the draft PR and preserve the branch for audit. After a separately authorized future merge: use a normal protected PR containing `git revert -m 1 <merge_sha>`; never push directly to `main`.

## Future ceremony proposal (not authorized)

- Ceremony ID: `F2-GATE-CHANGE-F2-GOV-08-PR<TBD>`
- Exact protected files: to be derived from the final PR head and Sentinel trust-set impact.
- Temporary exception: none is proposed until the final head and CI are known.
- Required controls: external approval on the exact head, sealed protection snapshot, at most 15 minutes if a required-check exception is later approved, immediate full restoration, independent readback, post-restoration disposable rehearsal, and content rollback through a normal PR.
- Absolute limits: no FTP, deploy, `workflow_dispatch`, secrets, production, or F2-01 integration.

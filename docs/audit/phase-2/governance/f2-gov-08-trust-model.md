# F2-GOV-08 — Independent base-only measurement authority

## Decision

Option 1 is selected as the future architecture: a trusted harness loaded from the exact pull-request base commit and later integrated into the existing Universal PR Gate. This delivery is only an offline simulator, contract, test suite, documentation, and protected-evolution proposal.

It does not change or activate a workflow. It does not prove workflow enforcement, runner isolation, browser sandboxing, or filesystem behavior on GitHub Actions.

## Formal ownership

| Object | Producer | Consumer | Authoritative origin | Integrity |
| --- | --- | --- | --- | --- |
| Base SHA | GitHub pull-request metadata | trusted bootstrap | exact PR base commit | 40-hex equality and Git resolution |
| Head SHA | GitHub pull-request metadata | trusted bootstrap | exact PR head commit | 40-hex equality and Git resolution |
| Consumer | base maintainer through protected evolution | trusted bootstrap | blob at exact base SHA | recorded path, role, blob type and SHA-256 |
| Static server | base maintainer through protected evolution | trusted consumer | blob at exact base SHA | recorded path, role, blob type and SHA-256 |
| Matrix | base maintainer through protected evolution | trusted consumer | blob at exact base SHA | recorded digest plus exact schema and unique tuples |
| Expectations | base maintainer through protected evolution | trusted consumer | blob at exact base SHA | recorded digest and cardinality equal to matrix |
| Live candidate files | pull-request author | trusted server/browser | allowlisted regular blobs at exact head SHA | Git mode/type/path and payload digest |
| Raw DOM readings | evaluated page observed by Playwright | trusted consumer | direct browser read | exact primitive schema; complete only |
| Identity | trusted consumer | trusted decision | canonical base tuple plus payload digest | SHA-256 after measurement |
| Envelope and digest | trusted consumer | trusted decision | canonical binding plus raw reading and result | SHA-256 after measurement |
| PASS/FAIL | trusted decision | Universal PR Gate in a future mission | exact bijection and semantic expectations | fail closed |

There is no producer key. The producer receives no runtime authority object, expected identity, envelope authority, or ability to declare PASS. The repository matrix is inspectable and is not treated as a secret; the protection comes from loading its immutable bytes from the exact base SHA and preventing candidate replacement.

## Closed candidate surface

The simulated candidate contains only regular `100644` Git blobs matching the live-file allowlist:

- root HTML;
- `src/css/**`;
- `src/js/**`;
- `src/fonts/**`;
- `src/i18n/**`;
- `src/img/**`, except `src/img/video.mp4`.

The trusted consumer rejects executable blobs, symlinks, submodules, junctions/reparse points, absolute paths, traversal, backslashes, duplicates, unknown directories, excluded files, unreadable blobs, and missing canonical routes. It never invokes an installer, build, dependency, script, or command from the candidate.

## Measurement lifecycle

1. Seal exact base and head SHAs from trusted event metadata.
2. Load the consumer, matrix, expectations, and static server exclusively from the base commit.
3. Verify their paths, Git types, and recorded digests before evaluating the candidate.
4. Inspect the exact head tree and construct an isolated candidate root from allowlisted regular blobs only.
5. Start the base-owned static server with an empty environment.
6. Allow browser requests only to the server's exact loopback origin.
7. Iterate canonical engine, route, viewport, and action tuples in the trusted consumer.
8. Read only primitive raw state; reject candidate-supplied identity, matrix, key, result, PASS, envelope, or digest fields.
9. Derive the semantic result, identity, envelope, and digest in the consumer after each reading.
10. Require a complete one-to-one set and exact semantic expectations before PASS.

## Attack outcomes

The executable contract rejects:

- `OBSERVATION_PAYLOAD_SWAP`;
- `KEYED_PRODUCER_TRANSPLANT`;
- simple and circular swaps;
- copied, missing, partial, duplicate, or inconclusive evidence;
- candidate-controlled identity, route, viewport, engine, action, result, PASS, envelope, or digest;
- consumer, server, matrix, or expectation drift;
- base or head drift;
- matrix duplicates and mutated authority pins;
- symlinks, submodules, executable blobs, junctions/reparse points, traversal, absolute paths, backslashes, excluded files, and unknown paths;
- external network requests or a second loopback port;
- browser/server exposure of a token or secret;
- future job permissions broader than `contents: read`.

A complete legitimate path also returns PASS, demonstrating that the contract is not a deny-all construction.

The Git-backed tests create controlled repositories with separate base and head commits. They load the four authority blobs through `git ls-tree`/`git cat-file` at the explicit base SHA, enumerate candidate blobs at the explicit head SHA, prove that moving `HEAD` does not change either authority, and reject altered, removed, or head-modified authority blobs.

## Future protected evolution

The Universal PR Gate and Gate Integrity Sentinel remain byte-unchanged in this mission. A later nominal ceremony must:

1. add a base-only bootstrap to the Universal Gate;
2. anchor the consumer, server, matrix, expectations, and bootstrap in the Sentinel trust set;
3. obtain base and head solely from trusted event metadata;
4. fetch and execute only the base-owned harness;
5. materialize head blobs without checking out or executing candidate tooling;
6. enforce loopback-only networking and an empty browser/server environment;
7. exercise attacks in real disposable PRs;
8. receive independent review before required-check use.

No ceremony is authorized by this document.

## Explicit limitations

- `WORKFLOW_ENFORCEMENT = NOT_VERIFIED`
- `OPERATIONAL_ISOLATION = NOT_VERIFIED`
- `TEMP_REPOSITORY_GIT_BLOB_AUTHORITY = VERIFIED`
- `GITHUB_RUNNER_GIT_OBJECT_MATERIALIZATION = NOT_VERIFIED`
- `REAL_BROWSER_NETWORK_BLOCK = NOT_VERIFIED`
- `REQUIRED_CHECK_ACTIVATION = NOT_AUTHORIZED`

The simulator proves the contract logic only. It must not be cited as proof that the current workflow already provides this boundary.

Candidate content can still branch on observable route, viewport, engine, timing, or user-agent properties. This package blocks transplanted evidence and producer-authored decisions, but does not prove behavior outside the canonical measurements. That residual risk must remain visible in the future operational rehearsal.

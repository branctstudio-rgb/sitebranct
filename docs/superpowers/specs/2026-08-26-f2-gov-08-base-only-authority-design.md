# F2-GOV-08 — Base-only measurement authority design

## Status and boundary

This document specifies an offline candidate. It does not change the Universal PR Gate, Gate Integrity Sentinel, repository protection, deployment, or production. It does not prove workflow-level enforcement or operating-system isolation.

The candidate is intended for a later protected evolution in which the Universal PR Gate loads the measurement authority from the exact pull-request base commit. Until that ceremony is integrated and rehearsed, this package is evidence only.

## Threat model

The evaluated pull-request producer controls its proposed live HTML, CSS, JavaScript, fonts, translations, and image assets. Repository contracts are inspectable; the design never relies on the matrix or expectations remaining secret from a human author. It must prevent the producer from controlling or injecting the runtime authority objects. The producer must not control:

- the consumer or static server;
- the canonical route, viewport, engine, action, or expectation matrix;
- identity derivation, semantic decision rules, envelope creation, or digests;
- a key, expected identity, runtime matrix object, or PASS declaration;
- browser credentials, privileged tokens, secrets, or external communication.

The attacks in scope include `OBSERVATION_PAYLOAD_SWAP`, `KEYED_PRODUCER_TRANSPLANT`, simple and circular result swaps, copied results, omitted or duplicate results, report truncation, tuple substitution, authority drift, candidate-controlled envelopes and digests, unexpected Git object types, path traversal, and external network attempts.

## Authority map

| Element | Owner | Source | Trust rule |
| --- | --- | --- | --- |
| Base SHA | GitHub PR metadata | exact 40-hex commit | must resolve and equal the sealed value |
| Consumer | trusted base | Git blob at the base SHA | path and digest sealed before candidate evaluation |
| Static server | trusted base | Git blob at the base SHA | never loaded from the candidate head |
| Matrix and expectations | trusted base | Git blobs at the base SHA | exact schema, digest, and tuple set |
| Candidate site | untrusted head | allowlisted live Git blobs only | materialized into an isolated directory after type/path checks |
| Browser actions | trusted consumer | canonical base matrix | candidate cannot select or reorder them |
| Raw readings | trusted browser boundary | direct return to consumer | exact primitive schema; no identity, result, envelope, digest, or key fields |
| Identity and result | trusted consumer | derived after each measurement | bound to base, head, matrix, engine, route, viewport, action, and payload |
| Envelope and digest | trusted consumer | created after complete measurement | candidate never supplies either value |
| Decision | trusted consumer | exact bijection plus semantic rules | any absence, drift, unknown value, or inconclusion fails closed |

## Selected architecture

The future Universal PR Gate will use its existing unprivileged `pull_request` context. A trusted bootstrap must retrieve the exact base commit before any candidate code runs, verify the base-owned anchors, and start the base-owned consumer. The consumer will inspect the head tree with Git plumbing and materialize only allowlisted regular blobs in an isolated target directory. It will not execute candidate scripts, builds, installers, dependencies, or commands.

The static server and Playwright controller come from the base. Browser routing denies every request except the random loopback origin allocated for the isolated server. The environment exposed to the server and browser is explicitly empty of repository tokens, credentials, and secrets. A future workflow token is read-only and is used only by the trusted bootstrap to read repository contents.

The consumer iterates the canonical cases itself. Each case invocation carries the trusted tuple in a closure unavailable to page content. Page content may expose only raw DOM state through normal browser reads. The consumer rejects extra fields and then derives semantic status, identity, envelope, and digest. It performs an exact one-to-one comparison against the base-owned expected set before deciding PASS.

## Git and filesystem boundary

Candidate entries are accepted only when all of the following are true:

- the path is normalized POSIX relative syntax;
- it has no empty, dot, dot-dot, absolute, drive-qualified, backslash, or NUL segment;
- it matches the closed live-file allowlist;
- the Git mode is a regular non-executable blob (`100644`);
- the object resolves as a blob under the exact head SHA;
- the materialized path remains within the isolated target directory;
- no component is a symlink, junction, reparse point, or submodule.

The simulator models these checks and includes permanent negatives. The later operational harness must implement them against real Git objects and the target filesystem; this package does not claim that operational proof.

## Measurement binding

For every canonical case, the trusted consumer constructs:

`{baseSha, headSha, matrixDigest, engine, route, viewport, action, payloadDigest, rawObservation, semanticResult}`

The evidence identity is the SHA-256 digest of the canonical tuple without `rawObservation` or `semanticResult`. The completed envelope digest covers the identity and every bound field including the raw reading and derived semantic result. The expected tuple set comes only from the base matrix; it is never accepted from a report.

No producer-controlled key is used. A producer response containing an identity, key, digest, envelope, semantic result, PASS field, route, viewport, engine, action, or expected set is invalid rather than authoritative. The published matrix may be inspected by an author; security comes from base ownership and direct measurement, not obscurity.

## Network and credential boundary

Only the exact loopback origin chosen by the trusted server is allowed. DNS names, additional ports, WebSockets outside that origin, service workers, remote fonts, analytics, beacons, and all other HTTP(S) requests are rejected. A rejected request makes the measurement inconclusive and therefore FAIL.

The future job must use `permissions: contents: read`, persist no checkout credentials, and expose no secrets to the server, browser, or candidate content. This offline package checks the declared policy but does not activate it.

## Fail-closed decision

PASS requires all of these conditions:

1. exact sealed base and head SHAs resolve;
2. every base-owned authority path and digest matches;
3. the candidate tree contains only allowed regular blobs;
4. the server uses the trusted base implementation and isolated root;
5. external network attempts are absent;
6. every canonical case is measured exactly once and conclusively;
7. each raw reading has the exact primitive schema;
8. identities, semantic results, envelopes, and digests are derived by the trusted consumer;
9. the measured set is an exact bijection with the canonical set;
10. every semantic expectation matches.

Any missing, extra, duplicate, malformed, divergent, partial, unknown, or inconclusive value is a hard failure.

## Alternatives rejected

- `workflow_run`: status association and artifact provenance introduce ambiguity and do not by themselves establish a base-only execution boundary.
- `pull_request_target`: unsafe for executing or checking out candidate code and explicitly outside this mission.
- external GitHub App or remote verifier: adds credentials and external infrastructure, both prohibited here.
- producer-signed/keyed report: the producer can transplant or recompute it and therefore remains self-authoritative.

## Activation boundary

A later protected ceremony is required to change the Universal Gate and Sentinel anchors. That mission must implement the real base bootstrap, verify Git object and filesystem behavior on GitHub-hosted runners, prove browser network isolation, rehearse candidate attacks in real PRs, and obtain an independent review. This document grants none of those permissions.

Residual risk remains that hostile live content can branch on observable browser properties and behave differently outside the measured cases. Base-only authority prevents evidence transplant and self-declared PASS; it does not prove all possible runtime behavior. A later operational design must retain broad canonical coverage and adversarial disposable trials without claiming cryptographic equivalence to production behavior.

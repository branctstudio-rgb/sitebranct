# WEBSITE-DIAGNOSTICO-E-FECHO-29

## Current controller30 — offline-ready, future execution not authorized

This section supersedes both historical preparation sections below. Milestone
425b0f31902fc475817ae4d5cf6dc59b1d146fc6 remains in append-only history. The new
controller completes the separate admission domain; no further offline permission
is needed to inspect/test/package it. Publication/browser/CI execution still needs
one separate nominal authorization bound to the packaged final SHA.

- Exact new ref: refs/heads/agent/website-sampling-boundary-30.
- Workflow: .github/workflows/website-sampling-boundary-30.yml.
- Workflow identity: Website sampling boundary measurement 30.
- Only initial push: created=true,deleted=false,forced=false,before allzero,
  payload.after=GITHUB_SHA,payload.ref=GITHUB_REF,run_attempt=1.
- GITHUB_WORKFLOW_SHA must equal GITHUB_SHA and workflow/ref/repository must match.
- Checkout control uses github.sha,not main or moving branch resolution. Candidate26
  and test563 have their immutable separate checkouts. Historical27 is loaded
  from62104c9c2d41aff296643aa4af8e067433a1673f,not controller28/29/30.
- The host requires main851c1723119b62193623fa24e67090afd18b39f1 and a singleton
  workflow30 history for this exact run/head/attempt/event/ref/path. Pagination,
  HTTP errors or unknown identities fail before reserving a measurement.

The source directory still has the29 name for a small auditable delta. Domain,
workflow,concurrency,container names/labels,owner receipt and artifact directory
are30. No domain30 call accepts29's ref or workflow. Historical workflow29 remains
byte-identical and is not a trigger for the new branch. Do not reuse its ref/run.

The host materializes executor/browser/instrument/diagnostics/runner from Git blobs
of the pushed head into the readonly control mount, enforcing exact100644 entries.
controller30.json records domain,head,milestone425b,controller29,complement27,
diagnosticSchema2 and each module's Git blob,size,SHA256. Missing Git objects are
rejected with GIT_NO_LAZY_FETCH=1; no network fallback is used for controller objects.
The container recomputes and compares this receipt and all five materialized files
against refs/heads/control in the host-created object repository before candidate
execution. Those bytes are the same paths subsequently imported/executed. This is
provenance of a trusted controller, not a signature or defense against a malicious
host/runner. The host independently compares child provenance with its event SHA.

Export remains exactly metadata.json,results.json,hashes.json,retention7days.
Metadata schema2 separates expected controller provenance from observed MATCH,
MISSING or INVALID. Only a matching process receipt may populate observed; missing
or invalid never becomes a successful run. Results require diagnostic schema2,
including the new sampling boundaries. The unchanged27 validator still recomputes
the complete84/41/184 semantic evidence for all3engines. Counts/diagnostics alone
do not grant acceptance or release. No raw site content,error text,logs or tokens
are uploaded. Partial results remain explicitly incomplete.

Image,pinned runtime/lock,limits,semantics and2500/3000ms remain exactly as below.
Public API/image/package preparation would require network only in a future
authorized run. Measurement remains network=none,readonly,nonroot,no credentials,
capdropALL,no-new-privileges. No publication/install/container/browser occurred
during this offline preparation.

Offline validation (four affected suites only):

    node --test scripts/governance/website-measurement-29/controller30.test.mjs scripts/governance/website-measurement-29/pipeline.test.mjs scripts/governance/website-measurement-29/contracts.test.mjs scripts/governance/website-measurement-29/sampling.test.mjs

Admission tests exercise real functions with events/histories,wrong ref/SHA/rerun,
Git materialization and substitutions,incomplete export,preparation failure and
cleanup. VM mutation controls remove workflow-SHA and module-digest guards in
LF/CRLF. Scheduler tests remain simulations,never WebKit/Linux runtime proof.

Future single act after nominal authorization: preflight exact local SHA/clean
tree,remote main,absence of new ref and zero history for workflow30,source pins and
all workflow triggers; then normal nonforced push of only that SHA to the newref.
That initial push itself can start the one run; it is not staging. Observe attempt1
without rerun/dispatch/reopen/emptycommit. Readback controller and workflow SHAs,
domain30,all stages,threeengine results and cleanup. Failure/missing/queue/policy
issues stop; never adapt/retry automatically. Check launch-policy compatibility
and Actions availability immediately beforehand; they were not queried offline.

Rollback: before publication,leave candidate unused. After authorized measurement,
stop only owned domain30 containers,confirm stopped,preserve attempt/artifacts and
do not change main/protection/site. No content integration is implied. The full
package includes exact final SHA,normal push command and nominal text; nothing in
this README authorizes executing them now.

## Historical milestone425b diagnostic-only preparation (superseded above)

## Offline delta30 — diagnostic boundary, not a WebKit repair

This section supersedes the publication instructions below **for this branch**.
Published29 at0ac5802a4a06a8cc75925f9f58a566b1553a60cb and run35506181696
are immutable historical evidence; attempt29 is consumed. Branch
agent/website-sampling-boundary-30 is an unpublished diagnostic candidate only.
Its inherited runner/workflow remain pinned to29 and MUST NOT be reused to run30.
No new workflow, trigger, browser execution, container, install or external call
is part of this delta. A separately reviewed/authorized30 admission domain is
needed before a single future Linux measurement; never rerun29 or update its ref.

Run29 distinguished the inner DRAWER_DEADLINE at DRAWER_SAMPLE (action2,
after-open,2501ms), not post-settlement measurement. WebKit accepted one sample,
visible=true,active=false,stable=false; Chromium/Firefox completed84/41/184.
The code proves `samples` counts accepted samples after the deadline check,
not evaluate calls, rAF callbacks, compositor frames or actual paint. The first
sample must be unstable because no previous rectangle exists. It does not prove
the rectangle moved. rAF itself is not proof that pixels were painted.

Three controlled histories reproduce that same old WebKit summary: first return
at10ms then pending; first return at2490ms then pending; first return at10ms and
second return exactly2500ms discarded by the canonical deadline check. These are
executable counterexamples to inferring a unique cause, **not reproductions of
WebKit scheduling**. Renderer delay, callback delivery, transport delay, visibility,
focus and repaint remain unproven. No candidate26 or canonical563 repair is made.

Schema2 adds host-side evaluation started/returned/rejected/pending counts,
first/last start/return offsets from action start, last round-trip duration, and
returns at/after the canonical deadline. Counters freeze at action termination:
pending means unresolved **then**, not a claim about process state at export.
No per-sample disk write is added. Rejection is rethrown unchanged; late completion
cannot change the action outcome. Times are rounded/bounded at900000ms.
The existing page callback additionally returns a bounded rAF wait duration,
captured at callback entry BEFORE querying DOM/layout/style, and
closed visibility/focus fields. These are page-reported, supplementary, possibly
unknown diagnostics; they are never authoritative timing or PASS evidence.
The host owns action identity and the acceptance predicate remains canonical.

Removing marked insertions still recovers exact563 bytes. Two samples, visibility,
animation/stability predicates,2500/3000ms,engines and84/41/184 are unchanged.
Additional promise/clock work can perturb timing: zero-overhead equivalence is
NOT claimed. Schema1 historical artifacts must be inspected with historical29;
schema2 does not rewrite or silently upgrade old evidence. Runtime impact and
actual Linux/WebKit root cause remain NOT_VERIFIED.

Offline commands (no browser):

    node --test scripts/governance/website-measurement-29/sampling.test.mjs
    node --test scripts/governance/website-measurement-29/contracts.test.mjs scripts/governance/website-measurement-29/pipeline.test.mjs

The first suite exercises exact instrumented563 functions and its actual callback
under a controlled VM scheduler. It rejects ambiguous/malformed diagnostics,
preserves strict settlement, checks late/rejected evaluation and a load-bearing
observation-hook mutation in LF/CRLF. Other suites cover the affected diagnostic
consumer/export boundary. Intact27/site/browser suites are not repeated.

Next experiment proposal, only after distinct30 trigger preparation/review and
nominal authorization: one Linux image-pinned attempt with unchanged26/563/27 and
these diagnostics. If firstReturn is late, bound the first evaluation; if first
return is prompt and pending=1, localize to the next outstanding evaluation; if
afterDeadline>0, identify discarded return. A large page-reported rAF wait suggests
callback scheduling, while a large host round-trip with small rAF wait suggests
delay outside the measured callback interval. Neither establishes repaint or
engine internals; unknown/contradictory results stop for review. No timeout increase,
automatic retry, geometry correction or acceptance relaxation follows implicitly.

Rollback: leave this isolated local commit unused. No remote/site/protection state
changed and no historical package/ref needs to be reverted or deleted.

Status: offline preparation; **new publication/measurement NOT AUTHORIZED**.
This is not BASE_WEBSITE_ACEITA, a production change, or a renewal of attempt28.

## Historical evidence, not new measurement

Run35145827016 attempt1, controller45e6f084d033f6cbe8c9cf466ebb4236d03dc85b:
prepare exit0; measurement exit1; cleanup STOPPED_OR_EXITED; upload succeeded.
Exported metadata/results/hashes only. Chromium and Firefox reported84 observations,
41menus,184 completed actions,infra0. WebKit reported1 observation,0menus,
COMPLETED/COMPLETED/TIMEOUT,infra1. These counts are not a semantic or visual acceptance.
The raw WebKit report (2769 bytes,SHA256
869427f30c014bb49910efe090111d1d6245bab94b14ef24ea549d565a7927c0) is absent.
A digest cannot recover those missing bytes.

The exact test source563f3c13665347b2a8578110e519ebaf13f356e8 loops viewport-first,
320x568 first, then site.routes with index.html first. First menu actions are
before-open/open/after-open/escape-close. Thus the third action maps to after-open
on index.html/320x568 by code and progression, not by an exported identity field.
It first calls waitForDrawerSettled, then evaluates geometry/focus/inert/scroll lock.
Settlement requires a visible drawer, no running/pending subtree animation and
two rectangle samples differing by less than.01 per coordinate. It does not
repair focus or demand correct geometry. The runner owns the previous rectangle.

There are two competing bounds:2500ms for settlement (including a pending
requestAnimationFrame sample) and3000ms for the complete action. The outer bound
also includes the post-settlement evaluation. Navigation(load,10000ms) and fonts.ready
precede the observation and those three actions. The summary cannot distinguish
inner deadline, outer deadline, scheduling/evaluation delay or last sample state.
No CSS/media/engine/infra root cause is claimed. Functional26 is unchanged.

## Demonstrated defect and implemented delta

The old projection deliberately discarded all action phase/error information;
two distinct canonical timeouts became identical exported objects. The offline
regression reproduces this loss.29 adds a host-owned diagnostic sidecar:

- closed stage/category enums, bounded action index/count/duration;
- last sample visibility/animation/stability booleans, no rectangles/site text;
- first failure retained across semantic assertions and cleanup;
- explicit finished marker and browser/server close-event confirmation;
- missing/invalid reports represented as unavailable, never zero failures;
- raw errors,HTML,URLs,keys from the site,logs,cookies and credentials not exported.

The source563 blob remains immutable. instrument.mjs accepts its exact SHA256 only
and inserts marked host diagnostics. Removing every insertion must recover exact
original bytes. No assertion, deadline, viewport, route, engine or84/41/184 criterion
is removed or changed. Execution uses the transformed copy, so it is **not** called
byte-identical execution: original and executed digests are recorded, verified in
the child and recomputed by the host verifier. The inserted module lives in the
read-only trusted/control mount, never in the page realm.

Categories do not prove causation. DRAWER_DEADLINE names the emitting timer/throw;
ACTION_DEADLINE names the outer action timer. Last sample booleans are only last
observations; they cannot prove what happened after that sample. Unknown failures
remain OPERATION_ERROR, never PASS. Diagnostic write overhead is not a correction
to browser timing and remains a new-measurement limit.

The immutable27 validator still recomputes semantic results, exact identities,
84 observations,41 menus,184 actions and3 engines.29 additionally requires complete,
closed,phase-correlated diagnostics and recorded transformed-test provenance.
Diagnostic success alone cannot approve anything. A failed child stops the run;
no internal retry, extra engine pass or fallback exists.

## Offline validation

Run only these affected tests (no browsers/containers):

    node --test scripts/governance/website-measurement-29/*.test.mjs

The real instrumented canonical wait/action functions run under page/scheduler
stubs. Tests distinguish inner/outer/post-settlement timeouts and preserve the
successful stability path. They exercise the real host verifier with synthetic
reports, corruption,missing diagnostics,missing completion,wrong phases,semantic
failure,overflow,provenance tampering,cleanup failures and secret sentinels.
Mutation checks remove independent enum/completion guards in LF andCRLF.
Synthetic reports must never be uploaded as real measurements.

## One future Linux measurement — separate decision

Publication target: a **new** branch agent/website-diagnostic-measurement-29 in
branctstudio-rgb/sitebranct, at the exact final controller SHA in the package.
Workflow website-diagnostic-measurement-29.yml uses only the initial push event,
created=true,nonforced,before all-zero,attempt1. No dispatch or merge is required.
An update/rerun/PR event is ineligible. Host preflight requires this run to be the
sole workflow history and main still851c1723119b62193623fa24e67090afd18b39f1.
The push itself publishes/registers the workflow from the pushed ref and can
start its run; it is not a harmless staging step before a later dispatch.
GitHub documents push workflows outside the default branch:
https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#push
Before any future authorization is consumed, check ref absence, workflow history,
repository Actions policy and the exact tree's other triggers. In this tree,
Offline/FTP push triggers target main, Universal/Sentinel target PR events,
28 targets its separate ref, and13/21 require dispatch. None matches this new
branch push. If remote policy/registration/queue fails, stop without retry,
registering on main, creating a PR or changing protections.

Inputs remain candidate26 2fbce7cdd1ff87f9a54d8c9190ffd1f349a8fe9d,
canonical test563f3c13665347b2a8578110e519ebaf13f356e8,
historical complement62104c9c2d41aff296643aa4af8e067433a1673f.
The single explicit pins.complement supplies both historical27 materialization
and metadata.complement. metadata.controller28 separately records the ancestral
controller45e6f084d033f6cbe8c9cf466ebb4236d03dc85b; metadata.wrapper is the actual
new authorized controller29 commit, not either historical pin. Receipt fields
cannot override these provenance fields. The29a regression executes the real
materialization and collection code with Git blobs and filesystem artifacts,
and rejects the old swapped-pin mutation in both LF and CRLF.
No site branch/content/PR63/PR67/main/protection mutation is required.

Runtime remains Playwright1.62.0/core1.62.0; Chromium151.0.7922.34,
Firefox153.0,WebKit26.5; authenticated173-file package tree from27 and lockfile.
Image: mcr.microsoft.com/playwright@sha256:02bbb2155cd7109e3e9c741941097ed1608cf8b6fa44ee2595896da2bdc1f471.
Ubuntu24.04 Linuxamd64 host; public metadata+image pull+locked npm ci in preparation,
scripts disabled; no site network. Measurement container --network=none,nonroot,
read-only,cap-drop=ALL,no-new-privileges. No token/secret mounted into measurement.

Budgets unchanged: job100min; primary step85min; prepare15min/2GiB/2CPU/256pids;
measure46min/4GiB/2CPU/512pids/1GiBshm/1GiBtmp; child15min each. Cleanup step3min.
No increase to inner2500ms or action3000ms. Host requires2CPU,5GiB free RAM,
12GiB disk,cgroup2. A preflight failure consumes no measurement, but does not
authorize another push/rerun. Coordination must decide the next action.

Export exactly metadata.json,results.json,hashes.json; retention7days.
results now includes a validated diagnostic per engine plus explicit unavailable
states. metadata separates prepare/measure return status,error/signal booleans,
proof recomputation and owned-container cleanup. hashes includes raw report and
diagnostic hashes, not raw report/log content. Browser absence/hard kill may leave
unfinished PREPARATION/action diagnostics; it is not a zero-error completion.
Host disappearance can prevent collection/cleanup; no absolute guarantee is made.
The separate workflow recovery branch attempts export even if owned-container
stop/inspect fails, records cleanup FAILED and remains nonzero. Existing primary
evidence is untouched on normal recovery; on cleanup failure its prior outcome
is retained as a closed enum while remaining diagnostics are collected.

## Readback and rollback

After separately authorized execution, inspect exact ref/SHA,event,attempt,one run,
image/version receipt,all three semantic proofs and cleanup. A timeout/failure or
missing evidence stays failure/inconclusive. No automatic retry or correction.
The command to publish must use the packaged exact SHA, normal non-forced push to
the new ref only; do not execute it under this offline mandate.

Rollback now: leave this isolated unpublished branch/package unused; no main or
protection rollback is needed. After future measurement, stop only owned labelled
containers,confirm not running,preserve attempts/artifacts. No force-push/deletion
of historical packages. Future content integration would require separate authority.
Visual acceptance,screenshots and browser runtime29 remain NOT_VERIFIED. E-commerce,
MOMENT and3D stay after explicit base acceptance.

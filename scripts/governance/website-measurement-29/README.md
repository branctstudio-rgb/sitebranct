# WEBSITE-DIAGNOSTICO-E-FECHO-29

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

Inputs remain candidate26 2fbce7cdd1ff87f9a54d8c9190ffd1f349a8fe9d,
canonical test563f3c13665347b2a8578110e519ebaf13f356e8,
historical complement62104c9c2d41aff296643aa4af8e067433a1673f.
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

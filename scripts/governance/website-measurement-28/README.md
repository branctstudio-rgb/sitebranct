# WEBSITE-MEDICAO-CANONICA-28 — isolated proposed run

Status: local implementation; no push, run, dispatch, download or installation in this preparation. Not BASE_WEBSITE_ACEITA, READY, Via A approval or publication. No authorization from WebKit21 or PR66 is reused.

## Exact source graph

* main reference: `851c1723119b62193623fa24e67090afd18b39f1`.
* PR67 untouched: `33829b3ce21ff3032ca2efc02d4a06aa7b39d759`.
* complement27: `62104c9c2d41aff296643aa4af8e067433a1673f`.
* application26: `2fbce7cdd1ff87f9a54d8c9190ffd1f349a8fe9d`, tree `a29075560b9c97fce9a65bccd328cfb8082a25f1`.
* trusted canonical test563: `563f3c13665347b2a8578110e519ebaf13f356e8`; exact test blob `8cc07c7f4c0937677f4f2357d6b8c687e87a41ec`.

Technical28 descends from complement27, not from the functional candidate. New paths only: this directory and `.github/workflows/website-canonical-measurement-28.yml`. Old workflow21, source563, all historical guards/baselines, deploy and live pages remain unchanged.

## Concrete publication route (requires separate nominal authorization)

1. Reconfirm exact main/PR67, final reviewed technical28 SHA, candidate26 SHA, clean worktrees, absent destination refs and remote rules. Any drift or branch-creation restriction stops; never weaken protection.
2. Push candidate26 SHA normally to `refs/heads/measurement/website26-2fbce7c`. No PR. This makes all candidate Git objects available without putting live code on main. This source tree contains no new28 workflow. Its existing workflows have no matching non-main push trigger.
3. Push only the reviewed technical28 SHA normally to `refs/heads/agent/website-canonical-measurement-28`. No PR. This initial branch push runs the new workflow from that branch, not from main. GitHub explicitly supports push workflows not merged into default branch: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#push . No registration/dispatch/merge on main is required.
4. Observe exactly one automatic run. No rerun, later push, close/reopen, dispatch or fabricated event. Guard requires created=true, forced=false, deleted=false, before=zero, exact branch/repo, attempt=1 and a complete public workflow history containing only this run. A metadata 403, missing source, digest mismatch, unavailable engine, timeout or absent artifact is INCONCLUSIVE/FAIL, not retry authority.
5. Read/download only its three named sanitized artifacts; compare run head and artifact hashes to receipt. Report all3 engines and per-engine84 observations/41 menu identities/184 actions. A successful workflow still says MEASURED_NOT_RELEASED. Any measured failure stays a failure; no patch in the publication permission.

The final delivery outside Git contains the exact reviewed technical28 SHA and literal push commands, avoiding a self-referential SHA inside its own commit. A GitHub Actions token is not the pusher; use the separately authorized human/operator Git credential. Push authorization does not include creation of any PR.

## Existing triggers and effects

Both exact non-main pushes: Offline Audit (push main only), Universal Gate (PR/merge_group), Sentinel (PR target), deploy (push main/live paths or dispatch) and diagnostics13/21 (dispatch) do not match. New28 matches only the technical branch. Opening a PR later would run existing universal/offline/Sentinel gates; no duplicate28 measurement, because no PR event is registered. The inherited protected site-audit delta remains protected. No exception or required-check change is supplied. A future functional main merge may trigger FTP under the current deploy workflow; this package grants no such merge/publication.

## Runtime, namespaces, permissions and budget

One ubuntu-24.04 Linux x64 hosted runner; no matrix or service. Host runner/Node is GitHub-managed (not an immutable OS image); wrapper requires Linux24.04, enough disk/RAM/CPU, DockerLinux/cgroupv2. Measurement runtime is fixed:

`mcr.microsoft.com/playwright@sha256:02bbb2155cd7109e3e9c741941097ed1608cf8b6fa44ee2595896da2bdc1f471`

Actions checkout `34e114876b0b11c390a56381ad16ebd13914f8d5`; upload-artifact `ea165f8d65b6e75b540449e92b4886f43607fa02`. Contents read only, no environments/secrets inputs. Checkout does not persist credentials. No token/environment credential forwarded to subprocesses/containers.

Future prepare phase alone can pull this image and `npm ci --ignore-scripts --no-audit --no-fund` from the existing exact base package/lock. No evaluated site is executed there. PW/core1.62.0 and all173 package bytes must match complement27's lock-authenticated digest `160598f6c3cbeb77da23e5d5aa7bc901ccf22eecae6c84c1574a2393f07cf381`. No browser install/fallback/latest. Image inspect must confirm exact digest/linux/amd64.

Fresh `/var/tmp/website28-<runid>`: sanitized bare Git object repository (local fetch of exact known source/test/control SHAs; no remote credentials), control27 materialized from exact Git blobs, deps, outputs. Nothing from candidate commands/scripts/build/install is executed on host. Container mounts only sanitized objects RO at /repository, five exact control27 files RO at /control, verified deps RO at /deps, output RW at /outputs. No Docker socket, credentials, hostIPC or hostnetwork. UID/GID non-root, cap-dropALL, no-new-privileges, readonly root; tmpfs1GiB, shm1GiB, 4GiB RAM,2CPUs,512pids, network=none. Browser/server execute inside that network namespace with only loopback available. CSP/request interception add defense but do not replace network namespace.

Unchanged executor27 materializes exactly56 candidate payload blobs plus8 trusted authority/test files. Trusted test563 is executed, not the stale test inside candidate26. Engines sequential: Chromium151.0.7922.34, Firefox153.0, WebKit26.5. Max15min each,45min engine total; outer measurement46min. Preparation image pull10min plus npm15min, host checks/object preparation budget covered by outer85min step; job100min reserves cleanup/upload. Single concurrency group, cancel-in-progress false. Upper bound100 Linux runner-minutes (not a currency quote); no automatic repetitions; storage artifact retention7days. Actual billed cost depends on account plan and runtime.

## Finish, proof and recovery

Exit0 alone is insufficient: revalidate source/runtime provenance, exact engine process set, zero errors/signals, all11 expected output files, full canonical reports, zero isolation findings and recompute result.json. Old report `source` label is historical a47; actual candidate provenance is pinned separately, never rewritten. Runtime proof is valid only for these tuples/flows, not all application behaviors.

Finally stop only containers whose run label, image, name, creation time and mount match owner receipt. Timeout kills Docker client; finally/always recovery stops remaining owned container, then readback State.Running=false. No broad rm/prune. Hard host loss/job cancellation can prevent cleanup/upload; hosted runner destruction is the final platform boundary, NOT a claim of observed cleanup. Such a run is INCONCLUSIVE and requires a new human decision, not a silent retry.

Upload only metadata.json, results.json and hashes.json. No raw HTML, screenshots, browser strings, URLs, workspace, environment, npm/Docker output, credentials or logs. Missing artifact errors; missing proof never success. Success receipt includes revalidated counts/hash per engine; diagnostics project only closed statuses/counts. Raw measurement remains on ephemeral runner and its raw-report hash is recorded. Retain/download the sanitized artifact within7days. If expired/lost, evidence is unavailable; a new authorized measurement is necessary.

Local tests exercise the real launcher state machine/argument compiler/validators with only process boundaries replaced. They do NOT claim Docker, Linux isolation, Actions upload or engine execution. Existing27 contract validation remains unchanged. No old120 measurements repeated. No new release baseline.

Rollback before publication: preserve local branches/packages. After hypothetical isolated run: stop only owned run resources, retain evidence and branches; no main change to revert. Future code integration requires separate protected PR/review; any eventual revert is a new normal protected PR. No authorization to merge, activate anything or deploy.

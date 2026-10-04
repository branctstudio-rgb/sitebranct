# WEBSITE35 — publication candidate, not permission to publish

The candidate starts at remote main851c1723119b62193623fa24e67090afd18b39f1.
It selects the complete synthetic generator/reference/verifier package from
34@1243bc914a6066683676a5d3943abde0715bbc24, without merging the historical
26/31/32/34 chain or any live HTML/CSS/JS changes. Existing PRs are untouched.

## Composition and public-clone independence

The existing classifier recognizes `fixtures/**`, `tests/**`, `docs/**` and
workflows, but not `scripts/website-base/**` or `templates/website-base/**`.
The generator, verifier and CSS therefore live under `fixtures/website-base/`.
This is packaging of offline references, not modification/bypass of the classifier.

The approved navigation output is an isolated resource in the same directory;
its bytes and every generated resource are pinned by `provenance.json`. The
font/image blobs at public main851c172 are identical to those previously read
from the unmerged local31 SHA. No31 object is needed in a future CI clone.
Only the generated manifest's sourceCommit changes; reference rendering stays
byte-identical. Main pages, assets, deployment manifest, dependencies and all
existing workflows remain unmodified.

## One WEBSITE campaign per ordinary candidate revision

The sole workflow is `.github/workflows/website-base-references.yml`:

- Trigger only `pull_request` **opened/synchronize**, relevant package paths.
- No push, ready_for_review, reopened, edited, dispatch, schedule or workflow_run.
- One job, no strategy matrix/reusable duplicate. One invocation of the verifier,
  all three engines sequentially. Exact PR head checkout; credentials not persisted.
- `run_attempt == 1`; synchronize without a changed head is not a second campaign.
- Concurrency key includes PR number and head. Do not create another PR for the
  same revision or close/reopen/rerun to try to manufacture a new measurement.

For the authorized publication sequence (one branch push, then one draft PR),
there is **one** WEBSITE72-case campaign, not a push+PR double campaign. This is
an event policy, not a distributed exactly-once guarantee against arbitrary
GitHub event replay, service retries or deliberate new PR creation. Any duplicate
run must be reported and must not be double-counted or presented as fresh consent.
No skipped job/rerun constitutes successful measurement; require the actual
report for the exact head, all72 cases and36 captures.

Event semantics follow [GitHub's workflow event reference](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request)
and [`github.run_attempt` context](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context).
The local event-policy test exercises the chosen subset of expressions, not the
GitHub Actions service itself; the first authorized CI run remains the real proof.

## Cost and other existing workflows

| Operation | Expected automatic jobs under the inspected main configuration |
| --- | --- |
| Push the new non-main branch before opening a PR | No automatic job |
| Open the single draft PR | WEBSITE references, Universal PR Gate, Gate Integrity Sentinel |
| New commit to that PR | One new WEBSITE campaign, plus existing Universal/Sentinel |
| Mark ready | No new WEBSITE campaign; Sentinel may run under its own policy |

WEBSITE: **one Linux job, timeout20 minutes**, three engine processes sequentially,
24 cases each, total72 and36 captures. It first runs lightweight generator/contract
tests, then actual browser QA. Image/dependencies are obtained only in future CI:
existing project Playwright1.62.0 lockfile, `npm ci --ignore-scripts`, browser downloads
disabled, `/ms-playwright`, immutable project image digest. No local install now.
Artifact retention14 days; collection uses `always()` and keeps failure evidence.
Hard job cancellation can prevent finalization/upload; that is inconclusive, not PASS.

The **existing Universal Gate** has timeout15 minutes and an unconditional
multiengine F2-01 readiness step. That is a different governance measurement,
not another run of the generated references. Sentinel has timeout5 minutes.
Conservative declared job-time ceiling: **20+15+5=40 runner-minutes per revision**,
before infrastructure queue/wall-clock uncertainty; not a currency/billing quote.
These gates are neither disabled nor edited. Offline Audit and Deploy do not
match this candidate's paths, so no FTP job is expected even to be created.
Unexpected extra workflows/cost must be reported before further action.

## Acceptance, logs and evidence

Only a new exact-head report with PASS72/72 in Chromium, Firefox and WebKit,
36 hash-checked captures, complete cleanup and zero errors/external attempts is
browser acceptance. Missing engines/cases or failures return nonzero. Log/report
and source/manifest hashes are retained. Local subprocess simulations are explicitly
SIMULATION_PASS, never browser evidence. Old48 browser cases remain historical.

Publication is not merge authorization. All existing required checks and an
eligible human review remain mandatory. Human consent and review fields below
are deliberately blank; no offline test simulates or grants approval.

- Human publication consent:
- Authorized candidate head:
- Authorized base:
- Formal external review:

## Future commands, only after separate authorization

From the candidate worktree, first reconfirm remote main, local head, clean status
and the exact closed diff in the delivered receipt. Then use a normal non-forced
push of that explicit head to `agent/website-base-publication-35`, and create one
draft PR against main. No empty commit, rerun, reopen or manual trigger.

CI command: `node fixtures/website-base/verify.mjs "$RUNNER_TEMP/website-base-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"`.
The entry reuses the existing generator/harness, rather than a second browser service.

If CI fails, preserve artifacts and report the reason; do not infer browser PASS
from local tests. Rollback after a future merge would be a protected revert PR;
before publication, retain this isolated branch and do not touch32/34 or the preview.

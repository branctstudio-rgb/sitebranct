# One verification entry — WEBSITE34, publication candidate35

Local developer tooling for the **synthetic Cedro/Linha references**, not a new
generator, browser harness, service or required governance check. It imports
`fixtures/website-base/generate.mjs` and invokes `tests/website-base-browser.mjs`
once per engine, sequentially. Nothing is installed by this command.

## Use

From this checkout, with Playwright 1.62.0 and its matching engines already installed:

```powershell
$env:WEBSITE_PLAYWRIGHT_ROOT = (Get-Location).Path
node fixtures/website-base/verify.mjs C:/absolute/existing-parent/new-verification
```

Linux, inside the existing project's pinned Playwright container:

```sh
export WEBSITE_PLAYWRIGHT_ROOT="$PWD"
export PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
node fixtures/website-base/verify.mjs /tmp/new-website-base-verification
```

The output must be new and its parent must exist. Existing outputs, linked
ancestors, unknown or repeated engines are rejected. No overwrite or cleanup
of previous evidence occurs. Normal harness completion closes its own browsers
and loopback server; no preview process is stopped. A hard process/runner kill
cannot attest cleanup and is not acceptable evidence.

Optional `--engines=chromium,webkit` is diagnostic only: the command reports
`PARTIAL` and exits nonzero because Firefox is missing. Complete acceptance
requires **72 unique cases: 24 per engine**, with two identities, two routes and
six viewports (320×568, 360×800, 390×844, 768×1024, 1024×768, 1440×900).
This is the reference32 matrix, not the operational F2-01 matrix.

## What it checks

- Both canonical configurations pass the existing generator validator.
- Each output has exactly 12 files; all 22 resources, their lengths/digests,
  local links, anchors, CSS resources and per-brand metadata agree.
- Both fresh manifests and all verifier inputs remain unchanged throughout QA.
- Each child returns exit 0, a readable PASS report from this invocation, correct
  head, manifest hashes, Playwright/browser versions, exact case/capture sets,
  zero errors/external attempts/non-200 local resources, and completed cleanup.
- Failed, missing, duplicate, extra, partial, old or wrong-engine reports do not
  pass. All selected engines are collected even after one fails; stdout/stderr,
  original reports and captures remain alongside `verification.json`.

The checkout and verifier are trusted developer tooling, not a hostile-head
attestation boundary. The Git head plus actual checkout source hashes are
recorded; dirty sources are not mislabeled as committed bytes. This is not a
full HTML parser or generalized site crawler: link checking covers only the
closed output grammar produced by the existing generator.

## Controlled local tests are not browser executions

```sh
node --test tests/website-base-generator.test.mjs tests/website-base-verification.test.mjs
```

Tests substitute only the process boundary with explicitly controlled Node
subprocesses; real generation, resource validation, aggregation and failure
handling execute. A substituted launcher is always recorded as
`CONTROLLED_SIMULATION` / `SIMULATION_PASS`, with `browserCasesPassed: 0`.
The CLI exposes no launcher override or old-report import. These tests prove
orchestration, not browser behavior or an operational security sandbox.

## Linux CI candidate — materialized locally, not published

`.github/workflows/website-base-references.yml` materializes the34 proposal as
one workflow in this local candidate. The obsolete proposal copy is not shipped;
there is only one configuration to publish. No remote workflow has been changed.
It reuses the project's Playwright 1.62.0 lockfile and existing container digest
from `fixtures/audit/f2-01-ci-runtime.json`, not another repository's image.
The compatibility is checked statically; actual Linux execution/image retrieval
is **NOT_VERIFIED** locally. The inherited pin is not re-certified by this mission.

The existing Offline Audit and Universal/Sentinel jobs are governance gates,
not extension points for this local prototype. `website-linux-diagnostic-13`
is tied to a consumed nominal authorization and historical application SHA;
changing it would broaden its authority. Hence this small isolated proposal
reuses checkout/setup/upload pins and runtime, but does not edit those workflows.

Future CI runs only on relevant PR opened/synchronize events, read-only permissions, no deployment,
no dispatch and no stored checkout credentials. Its ordinary dependency setup
is explicit `npm ci --ignore-scripts`; browser download is disabled. The same
single entry runs all three engines; artifact collection runs even on failure.
A missing engine/case/report fails the job. It has no relationship to main's
required checks and grants no merge or publication authority.

## Evidence and adoption limits

WEBSITE32's Chromium 24/24 and WebKit 24/24, and WEBSITE33's 22 checked resources,
remain historical evidence with their original hashes and heads. They are not
imported into a new PASS report or added to34's simulated cases. Firefox Windows
remains NOT_VERIFIED after the prior diagnosed pre-navigation process failure;
34 does not relaunch or install it. The preview on port62947 and32/33 artifacts
remain untouched. New Linux evidence must be produced by the real command.

Adoption: preserve the reference32 branch; review this delta; obtain separate
authorization before publishing this candidate. See `publication.md` for triggers,
existing checks and cost. No new ZIP is needed. Rollback is a normal revert of
the35 candidate commit; do not reset historical branches or delete evidence.
This adds no live page, integration, CRM or deployment.

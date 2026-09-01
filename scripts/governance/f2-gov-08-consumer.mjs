import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { readTrustedStaticRoute, startTrustedStaticServer } from "./f2-gov-08-static-server.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const exactKeys = (value, keys, label) => {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} is absent or malformed`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} schema is not exact`);
};
const NETWORK_CONTROL_ACTIONS = Object.freeze([
  "fetch", "fetch-computed", "XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon",
  "serviceWorker.register", "script", "dynamic-import", "frame", "image", "window.open",
  "location.assign", "location.replace", "location.href", "resource-hint-preconnect",
  "resource-hint-dns-prefetch", "consent-loader", "form-submit",
]);
const RESOURCE_HINT_ACTIONS = new Set(["resource-hint-preconnect", "resource-hint-dns-prefetch"]);
const TRUSTED_LOCAL_CANCELLATION_REASONS = new Set(["Load request cancelled", "net::ERR_ABORTED"]);
const networkControlStatus = (action) => RESOURCE_HINT_ACTIONS.has(action)
  ? "DETECTED_AND_REJECTED_EGRESS_NOT_PROVEN"
  : "BLOCKED_AND_RECORDED";
const networkControlDisposition = (action) => RESOURCE_HINT_ACTIONS.has(action)
  ? "DETECTED_AFTER_DOM_INSERTION"
  : "BLOCKED_BEFORE_EGRESS";
const readJson = (path, label) => {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { assert.fail(`${label} is absent, unreadable or malformed`); }
};

export function validateTrustedPlaywrightInstallation(runtime, installedVersion, executablePaths) {
  assert.equal(installedVersion, runtime.playwright?.version, "trusted Playwright package version is divergent");
  assert.deepEqual(runtime.playwright?.engines, ["chromium", "firefox", "webkit"], "trusted Playwright engine set is divergent");
  const configuredCache = runtime.container?.browsersPath;
  assert.equal(typeof configuredCache, "string", "trusted Playwright browser cache path is absent");
  assert.equal(isAbsolute(configuredCache), true, "trusted Playwright browser cache path is not absolute");
  let cacheRoot;
  try { cacheRoot = realpathSync(configuredCache); }
  catch { assert.fail("trusted Playwright browser cache is absent or unreadable"); }
  assert.deepEqual(Object.keys(executablePaths).sort(), [...runtime.playwright.engines].sort(), "trusted Playwright executable set is incomplete or divergent");
  for (const engine of runtime.playwright.engines) {
    const executable = executablePaths[engine];
    assert.equal(typeof executable, "string", `${engine}: trusted Playwright executable path is absent`);
    let metadata;
    let resolved;
    try {
      metadata = lstatSync(executable);
      resolved = realpathSync(executable);
    } catch {
      assert.fail(`${engine}: trusted Playwright executable is absent from the canonical cache`);
    }
    assert.equal(metadata.isSymbolicLink(), false, `${engine}: trusted Playwright executable is a symlink`);
    assert.equal(metadata.isFile(), true, `${engine}: trusted Playwright executable is not a regular file`);
    const displacement = relative(cacheRoot, resolved);
    assert.ok(displacement && displacement !== ".." && !displacement.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(displacement), `${engine}: trusted Playwright executable escapes the canonical cache`);
  }
}

function measuredSimulationObservation(candidateRoot, canonicalCase) {
  const html = readTrustedStaticRoute(candidateRoot, canonicalCase.route);
  const focusTarget = canonicalCase.action === "focus-navigation";
  const width = Number(html.match(new RegExp(`data-${focusTarget ? "focus-" : ""}target-width=["'](\\d+)["']`))?.[1]);
  const height = Number(html.match(new RegExp(`data-${focusTarget ? "focus-" : ""}target-height=["'](\\d+)["']`))?.[1]);
  return {
    complete: /^<!doctype html>/i.test(html),
    drawerOpen: canonicalCase.action === "open-drawer" && /data-drawer-capable=["']true["']/.test(html),
    focusInside: canonicalCase.action !== "escape-close" && /data-focus-capable=["']true["']/.test(html),
    targetWidth: width,
    targetHeight: height,
  };
}

function consumeSimulation(request, matrix, expectations) {
  assert.equal(matrix.schemaVersion, 2, "simulation matrix schema is divergent");
  assert.equal(expectations.schemaVersion, 2, "simulation expectations schema is divergent");
  assert.equal(matrix.simulation.length, expectations.simulation.length, "simulation authority cardinality differs");
  const identities = new Set();
  const evidence = matrix.simulation.map((canonicalCase, index) => {
    const rawObservation = measuredSimulationObservation(request.candidateRoot, canonicalCase);
    const semanticResult = canonicalJson(rawObservation) === canonicalJson(expectations.simulation[index].raw) ? "PASS" : "FAIL";
    const binding = { baseSha: request.baseSha, headSha: request.headSha, matrixDigest: request.matrixDigest, engine: canonicalCase.engine, route: canonicalCase.route, viewport: canonicalCase.viewport, action: canonicalCase.action, payloadDigest: request.payloadDigest };
    const identity = sha256(canonicalJson(binding));
    assert.equal(identities.has(identity), false, `trusted consumer duplicate identity: ${identity}`);
    identities.add(identity);
    const envelope = { ...binding, identity, rawObservation, semanticResult };
    return { ...envelope, digest: sha256(canonicalJson(envelope)) };
  });
  return { complete: true, executionMode: "SIMULATION", capabilityInventory: request.capabilityInventory, evidence };
}

const selectorMetrics = `(() => {
  const visible = (element) => { const style=getComputedStyle(element), rect=element.getBoundingClientRect(); return style.display!=='none' && style.visibility!=='hidden' && rect.width>0 && rect.height>0; };
  const smallTargets = [...document.querySelectorAll('a,button,input,select,textarea,[role="button"],[tabindex]')].filter((element) => {
    if (!visible(element) || element.disabled || element.getAttribute('aria-hidden')==='true') return false;
    const rect=element.getBoundingClientRect(), style=getComputedStyle(element);
    return style.display!=='inline' && (rect.width<44 || rect.height<44);
  }).map((element) => { const rect=element.getBoundingClientRect(); return { tag:element.tagName.toLowerCase(), name:element.getAttribute('aria-label')||element.textContent?.trim().slice(0,80)||'', width:Number(rect.width.toFixed(2)), height:Number(rect.height.toFixed(2)) }; });
  return { readyState:document.readyState, clientWidth:document.documentElement.clientWidth, scrollWidth:document.documentElement.scrollWidth, overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1, smallTargets };
})()`;

function evidenceEnvelope(request, matrixDigest, engine, kind, route, viewport, action, rawObservation, semanticResult) {
  const binding = { baseSha: request.baseSha, headSha: request.headSha, matrixDigest, payloadDigest: request.payloadDigest, engine, kind, route, viewport, action };
  const identity = sha256(canonicalJson(binding));
  const envelope = { ...binding, identity, rawObservation, semanticResult };
  return { ...envelope, digest: sha256(canonicalJson(envelope)) };
}

async function bounded(label, milliseconds, operation) {
  let timer;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`trusted measurement timeout: ${label}`)), milliseconds); }),
    ]);
  } finally { clearTimeout(timer); }
}

async function navigate(page, origin, route, viewportName, dimensions) {
  await page.setViewportSize({ width: dimensions[0], height: dimensions[1] });
  const response = await bounded(`navigation ${route} ${viewportName}`, 15000, () => page.goto(`${origin}/${route}`, { waitUntil: "load", timeout: 14000 }));
  assert.equal(response?.status(), 200, `trusted navigation failed: ${route} ${viewportName}`);
  await page.waitForFunction(() => document.readyState === "complete", undefined, { timeout: 5000 });
  await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
}

async function measureMenuCase(page, origin, entry, dimensions, actions, setNetworkScope) {
  await navigate(page, origin, entry.route, entry.viewport, dimensions);
  const result = { focusReached: false, focusStyle: false, open: null, closed: null, closeButtonClosed: null, outsideClosed: null };
  let openInvoked = false;
  const action = async (phase, operation) => {
    setNetworkScope({ phase: "measured-flow", action: phase, route: entry.route, viewport: entry.viewport });
    const startedAt = Date.now();
    try {
      const measured = await bounded(`${phase} ${entry.route} ${entry.viewport}`, 5000, operation);
      actions.push({ evidenceId: entry.evidenceId, route: entry.route, viewport: entry.viewport, phase, status: "COMPLETED", durationMs: Date.now() - startedAt, measured });
      return measured;
    } catch (error) {
      actions.push({ evidenceId: entry.evidenceId, route: entry.route, viewport: entry.viewport, phase, status: "ERROR", durationMs: Date.now() - startedAt, message: error.message });
      throw error;
    }
  };
  for (const phase of entry.actionPhases) {
    if (phase === "before-open") {
      const before = await action(phase, () => page.evaluate(() => {
        const toggle=document.querySelector('.mobile-toggle'), drawer=document.querySelector('.mobile-drawer');
        if (toggle) toggle.focus();
        const style=toggle?getComputedStyle(toggle):null;
        return { toggle:!!toggle, drawer:!!drawer, closed:!drawer?.classList.contains('is-open'), focusReached:document.activeElement===toggle, focusStyle:!!style && (style.outlineStyle!=='none'||style.boxShadow!=='none') };
      }));
      result.focusReached = before.focusReached;
      result.focusStyle = before.focusStyle;
    } else if (["open", "close-button-open", "outside-open"].includes(phase)) {
      const opened = await action(phase, async () => {
        const invoked = await page.evaluate(() => { const toggle=document.querySelector('.mobile-toggle'); if (!toggle) return false; toggle.click(); return true; });
        if (invoked) await page.waitForTimeout(80);
        return page.evaluate(() => document.querySelector('.mobile-drawer')?.classList.contains('is-open') ?? false);
      });
      if (phase === "open") openInvoked = opened;
    } else if (phase === "after-open") {
      result.open = await action(phase, () => page.evaluate((opened) => {
          const drawer=document.querySelector('.mobile-drawer'), toggle=document.querySelector('.mobile-toggle'), main=document.querySelector('main');
          if (!drawer || !toggle) return { expanded:null, drawerInside:false, focusInside:false, bodyLocked:false, backgroundInert:false, closeTarget:null };
          const rect=drawer.getBoundingClientRect(), close=drawer.querySelector('.drawer-close,[data-drawer-close]');
          const closeRect=close?.getBoundingClientRect();
          return { expanded:toggle.getAttribute('aria-expanded'), drawerInside:rect.left>=-.5&&rect.right<=document.documentElement.clientWidth+.5, focusInside:drawer.contains(document.activeElement), bodyLocked:getComputedStyle(document.body).overflowY==='hidden'||getComputedStyle(document.body).overflow==='hidden', backgroundInert:!main||main.inert, closeTarget:closeRect?{width:closeRect.width,height:closeRect.height,name:close.getAttribute('aria-label')||close.textContent.trim()}:null, opened };
        }, openInvoked));
    } else if (phase === "escape-close") {
      result.closed = await action(phase, async () => { await page.keyboard.press("Escape"); await page.waitForTimeout(80); return page.evaluate(() => ({ closed:!document.querySelector('.mobile-drawer')?.classList.contains('is-open'), focusReturned:document.activeElement===document.querySelector('.mobile-toggle') })); });
    } else if (phase === "close-button-close") {
      result.closeButtonClosed = await action(phase, async () => { const invoked=await page.evaluate(() => { const close=document.querySelector('.mobile-drawer .drawer-close,.mobile-drawer [data-drawer-close]'); if(!close)return false; close.click(); return true; }); await page.waitForTimeout(80); return { invoked, closed:!await page.evaluate(() => document.querySelector('.mobile-drawer')?.classList.contains('is-open')) }; });
    } else if (phase === "outside-close") {
      result.outsideClosed = await action(phase, async () => { const invoked=await page.evaluate(() => { const overlay=document.querySelector('.drawer-overlay,[data-drawer-overlay]'); if(!overlay)return false; overlay.click(); return true; }); await page.waitForTimeout(80); return { invoked, closed:!await page.evaluate(() => document.querySelector('.mobile-drawer')?.classList.contains('is-open')) }; });
    } else assert.fail(`canonical menu action is unknown: ${phase}`);
  }
  return result;
}

function menuPass(result) {
  return result.focusReached === true && result.focusStyle === true && result.open?.expanded === "true" && result.open.drawerInside === true && result.open.focusInside === true && result.open.bodyLocked === true && result.open.backgroundInert === true && result.open.closeTarget?.width >= 44 && result.open.closeTarget?.height >= 44 && result.closed?.closed === true && result.closed?.focusReturned === true && (result.closeButtonClosed === null || result.closeButtonClosed?.invoked === true && result.closeButtonClosed?.closed === true) && (result.outsideClosed === null || result.outsideClosed?.invoked === true && result.outsideClosed?.closed === true);
}

function externalAttemptMessage(attempt) {
  return `observed external network attempt: ${attempt.mechanism} ${attempt.engine} ${attempt.action} ${attempt.url}`;
}

function expectedNetworkControl(action) {
  const target = action === "WebSocket" ? "wss://f2-gov-09.invalid/socket" : `https://f2-gov-09.invalid/${encodeURIComponent(action)}`;
  if (action === "fetch-computed") return { mechanism: "fetch", url: "https://f2-gov-09.invalid/computed", route: "about:blank" };
  if (action === "dynamic-import") return { mechanism: "script", url: target, route: "about:blank" };
  if (["location.assign", "location.replace", "location.href"].includes(action)) return { mechanism: "navigation", url: target, route: "about:blank" };
  if (["resource-hint-preconnect", "resource-hint-dns-prefetch"].includes(action)) return { mechanism: "resource-hint", url: target, route: "about:blank" };
  if (action === "consent-loader") return { mechanism: "script", url: "https://connect.facebook.net/en_US/fbevents.js", route: "crm-gestao.html" };
  if (action === "form-submit") return { mechanism: "fetch", url: "https://n8n.branct.com/webhook/site-lead", route: "contactos.html" };
  return { mechanism: action, url: target, route: action === "serviceWorker.register" ? "src/i18n/pt.json" : "about:blank" };
}

export function assertExpectedNetworkControl(observed, engine, action, probeId) {
  assert.equal(observed.length, 1, `${engine}: trusted control observation cardinality is divergent: ${action}`);
  const expected = expectedNetworkControl(action);
  assert.deepEqual(observed[0], {
    ...expected,
    origin: new URL(expected.url).origin,
    phase: "control-probe",
    engine,
    action,
    viewport: "control",
    disposition: networkControlDisposition(action),
    probeId,
  }, `${engine}: trusted control observation is divergent: ${action}`);
}

export function assertExpectedNetworkControlVector(controls, engine) {
  assert.deepEqual(
    controls.map(({ action, status }) => [action, status]),
    NETWORK_CONTROL_ACTIONS.map((action) => [action, networkControlStatus(action)]),
    `${engine}: trusted runtime network controls are incomplete`,
  );
}

export function assertNoObservedExternalAttempts(reports) {
  for (const report of reports) {
    const attempt = report.networkIsolation.flowAttempts[0];
    assert.equal(attempt, undefined, attempt ? externalAttemptMessage(attempt) : `${report.engine}: observed external network attempt`);
  }
}

export function assertTrustedLocalResponseStatus(status, url) {
  assert.ok(Number.isInteger(status), `trusted local response status is malformed: ${url}`);
  assert.ok(status === 200 || status === 206, `trusted local response status ${status}: ${url}`);
}

export function createTrustedCollectionLifecycle(label) {
  assert.equal(typeof label, "string", "trusted collection lifecycle label is absent");
  let state = "OPEN";
  let eventCount = 0;
  let stableSamples = 0;
  let lastFingerprint = null;
  let sealedFingerprint = null;
  let violation = null;
  const snapshot = () => ({ label, state, eventCount, stableSamples, fingerprint: lastFingerprint, sealedFingerprint, violation });
  return {
    snapshot,
    recordEvent: (kind) => {
      assert.equal(typeof kind, "string", `${label}: trusted collection event kind is absent`);
      if (["SEALED", "VERIFIED", "REJECTED"].includes(state)) {
        violation = `${label}: late event after seal: ${kind}`;
        state = "REJECTED";
        throw new Error(violation);
      }
      eventCount += 1;
      stableSamples = 0;
      lastFingerprint = null;
      return snapshot();
    },
    beginQuiescence: () => {
      assert.equal(state, "OPEN", `${label}: collection cannot enter quiescence from ${state}`);
      state = "QUIESCING";
      return snapshot();
    },
    observeQuiescence: (fingerprint) => {
      assert.equal(state, "QUIESCING", `${label}: collection is not quiescing`);
      assert.equal(typeof fingerprint, "string", `${label}: quiescence fingerprint is absent`);
      stableSamples = fingerprint === lastFingerprint ? stableSamples + 1 : 1;
      lastFingerprint = fingerprint;
      return snapshot();
    },
    seal: (fingerprint) => {
      assert.equal(state, "QUIESCING", `${label}: collection cannot seal before quiescence`);
      assert.equal(fingerprint, lastFingerprint, `${label}: collection changed before seal`);
      assert.ok(stableSamples >= 1, `${label}: collection has no stable quiescence sample`);
      sealedFingerprint = fingerprint;
      state = "SEALED";
      return snapshot();
    },
    verify: (fingerprint) => {
      assert.notEqual(state, "REJECTED", violation ?? `${label}: collection was rejected`);
      assert.equal(state, "SEALED", `${label}: collection must be sealed before verification`);
      assert.equal(fingerprint, sealedFingerprint, `${label}: collection changed after seal`);
      state = "VERIFIED";
      return snapshot();
    },
  };
}

export function assertTrustedJournalBijection({ engine, windowId, localRequests, localResponses, localFailures, journal, journalRejections = [] }) {
  assert.match(windowId ?? "", /^[0-9a-f]{64}$|^window-[A-Za-z0-9._-]+$/, `${engine}: trusted journal window identity is absent`);
  for (const [value, label] of [[localRequests, "requests"], [localResponses, "responses"], [localFailures, "failures"], [journal, "journal"], [journalRejections, "journal rejections"]]) {
    assert.ok(Array.isArray(value), `${engine}: trusted local ${label} are malformed`);
  }
  const requestById = new Map();
  for (const request of localRequests) {
    assert.match(request.requestId ?? "", /^[0-9a-f]{64}$/, `${engine}: trusted local request identity is absent`);
    assert.equal(requestById.has(request.requestId), false, `${engine}: trusted local request identity is duplicated`);
    requestById.set(request.requestId, request);
  }
  const journalByRequest = new Map();
  const journalById = new Map();
  const journalIds = new Set();
  const journalSequences = new Set();
  for (const record of journal) {
    assert.equal(record.windowId, windowId, `${engine}: trusted journal window is divergent`);
    assert.match(record.journalId ?? "", /^[0-9a-f]{64}$/, `${engine}: trusted journal identity is absent or malformed`);
    assert.equal(journalIds.has(record.journalId), false, `${engine}: trusted journal identity is duplicated`);
    journalIds.add(record.journalId);
    journalById.set(record.journalId, record);
    assert.ok(Number.isSafeInteger(record.sequence) && record.sequence >= 0, `${engine}: trusted journal sequence is malformed`);
    assert.equal(journalSequences.has(record.sequence), false, `${engine}: trusted journal sequence is duplicated`);
    journalSequences.add(record.sequence);
    if (record.method !== undefined) assert.equal(record.method, "GET", `${engine}: trusted journal method is divergent`);
    assert.equal(record.finished, true, `${engine}: trusted journal response is incomplete`);
    assertTrustedLocalResponseStatus(record.status, record.absoluteUrl);
    assert.ok(Number.isSafeInteger(record.bytes) && record.bytes > 0, `${engine}: trusted journal byte count is invalid`);
    if (record.status === 206) {
      assert.ok(Number.isSafeInteger(record.rangeStart) && Number.isSafeInteger(record.rangeEnd) && Number.isSafeInteger(record.totalBytes), `${engine}: trusted journal byte range is malformed`);
      assert.equal(record.bytes, record.rangeEnd - record.rangeStart + 1, `${engine}: trusted journal byte count is divergent`);
    }
    if (record.requestId !== null) {
      assert.match(record.requestId ?? "", /^[0-9a-f]{64}$/, `${engine}: trusted journal request identity is malformed`);
      const request = requestById.get(record.requestId);
      assert.ok(request, `${engine}: trusted journal has an unknown request identity: ${record.requestId}`);
      assert.equal(journalByRequest.has(record.requestId), false, `${engine}: trusted journal request binding is duplicated`);
      journalByRequest.set(record.requestId, record);
    }
  }
  const validObservationByRequest = new Map();
  const validObservationByJournal = new Map();
  const indeterminateObservations = [];
  const indeterminateObservationByRequest = new Map();
  const refusalObservationByRejection = new Map();
  for (const response of localResponses) {
    if (response.rejectionId !== undefined || response.status === 403) {
      assert.equal(response.status, 403, `${engine}: trusted refused local response status is divergent`);
      assert.equal(response.requestId, null, `${engine}: trusted refused local response unexpectedly carries a consumer identity`);
      assert.match(response.rejectionId ?? "", /^[0-9a-f]{64}$/, `${engine}: trusted local refusal identity is absent or malformed`);
      assert.equal(refusalObservationByRejection.has(response.rejectionId), false, `${engine}: trusted local refusal identity is duplicated`);
      refusalObservationByRejection.set(response.rejectionId, response);
      continue;
    }
    if (response.status === 0) {
      assert.equal(response.journalId ?? null, null, `${engine}: indeterminate local response must not claim a trusted journal identity`);
      assert.fail(`${engine}: trusted local response status 0 is invalid`);
    }
    assertTrustedLocalResponseStatus(response.status, response.url);
    assert.match(response.journalId ?? "", /^[0-9a-f]{64}$/, `${engine}: trusted local response journal identity is absent or malformed`);
    assert.equal(validObservationByJournal.has(response.journalId), false, `${engine}: trusted local response journal identity is duplicated`);
    validObservationByJournal.set(response.journalId, response);
    if (response.requestId !== null) {
      const request = requestById.get(response.requestId);
      assert.ok(request, `${engine}: trusted local response has an unknown request identity`);
      assert.equal(response.url, request.url, `${engine}: trusted local response URL is divergent`);
      assert.equal(response.route, request.route, `${engine}: trusted local response route is divergent`);
      assert.equal(response.range, request.range, `${engine}: trusted local response range is divergent`);
      assert.equal(validObservationByRequest.has(response.requestId), false, `${engine}: trusted local response cardinality is not exactly one for ${response.requestId}`);
      validObservationByRequest.set(response.requestId, response);
    }
  }

  const trustedResponseByRequest = new Map();
  const boundRequestByJournal = new Map();
  for (const record of journal) {
    const observation = validObservationByJournal.get(record.journalId);
    const requestId = record.requestId;
    assert.match(requestId ?? "", /^[0-9a-f]{64}$/, `${engine}: trusted journal contains an extra or unattributed record: ${record.route}`);
    const request = requestById.get(requestId);
    assert.ok(request, `${engine}: trusted journal has an unknown request identity: ${requestId}`);
    assert.equal(trustedResponseByRequest.has(requestId), false, `${engine}: trusted server response cardinality is not exactly one for ${requestId}`);
    assert.equal(boundRequestByJournal.has(record.journalId), false, `${engine}: trusted journal response binding is duplicated`);
    assert.equal(record.absoluteUrl, request.url, `${engine}: trusted journal request URL is divergent`);
    assert.equal(record.route, request.route, `${engine}: trusted journal request route is divergent`);
    assert.equal(record.range, request.range, `${engine}: trusted journal request range is divergent`);
    if (observation) {
      if (observation.requestId !== null) assert.equal(observation.requestId, requestId, `${engine}: trusted journal request identity is divergent from its response`);
      assert.equal(observation.url, record.absoluteUrl, `${engine}: trusted local response URL is divergent from the journal`);
      assert.equal(observation.route, record.route, `${engine}: trusted local response route is divergent from the journal`);
      assert.equal(observation.range, record.range, `${engine}: trusted local response range is divergent from the journal`);
      assert.equal(observation.status, record.status, `${engine}: trusted local response status is divergent from the journal`);
    }
    const trusted = { requestId, url: record.absoluteUrl, route: record.route, range: record.range, status: record.status, journalId: record.journalId };
    trustedResponseByRequest.set(requestId, trusted);
    boundRequestByJournal.set(record.journalId, requestId);
  }
  for (const request of localRequests) assert.ok(trustedResponseByRequest.has(request.requestId), `${engine}: trusted server response cardinality is not exactly one for ${request.requestId}`);
  for (const response of validObservationByJournal.values()) assert.ok(boundRequestByJournal.has(response.journalId), `${engine}: trusted local response has no bound journal record`);
  for (const response of indeterminateObservations) assert.ok(trustedResponseByRequest.has(response.requestId), `${engine}: indeterminate local response has no completed server-owned record`);

  const rejectionIds = new Set();
  for (const rejection of journalRejections) {
    assert.equal(rejection.windowId, windowId, `${engine}: trusted refusal window is divergent`);
    assert.match(rejection.rejectionId ?? "", /^[0-9a-f]{64}$/, `${engine}: trusted refusal identity is absent or malformed`);
    assert.equal(rejectionIds.has(rejection.rejectionId), false, `${engine}: trusted refusal identity is duplicated`);
    rejectionIds.add(rejection.rejectionId);
    assert.equal(rejection.authorized, false, `${engine}: trusted refusal was not denied by the server`);
    assert.equal(rejection.requestId, null, `${engine}: trusted refusal unexpectedly carries a consumer identity`);
    assert.equal(rejection.status, 403, `${engine}: trusted refusal status is divergent`);
    assert.equal(rejection.finished, true, `${engine}: trusted refusal response is incomplete`);
    assert.equal(rejection.bytes, 0, `${engine}: trusted refusal transferred candidate bytes`);
    assert.match(rejection.absoluteUrl ?? "", /^http:\/\/127\.0\.0\.1:[0-9]+\//, `${engine}: trusted refusal URL is absent or non-local`);
    assert.equal(typeof rejection.route, "string", `${engine}: trusted refusal route is absent`);
    const observation = refusalObservationByRejection.get(rejection.rejectionId);
    if (observation) {
      assert.equal(observation.url, rejection.absoluteUrl, `${engine}: trusted refusal URL is divergent`);
      assert.equal(observation.route, rejection.route, `${engine}: trusted refusal route is divergent`);
      assert.equal(observation.range, rejection.range, `${engine}: trusted refusal range is divergent`);
    }
  }
  for (const [rejectionId] of refusalObservationByRejection) assert.ok(rejectionIds.has(rejectionId), `${engine}: trusted local refusal has no server-owned rejection record`);

  const trustedResponses = [...trustedResponseByRequest.values()];
  for (const failure of localFailures) {
    assert.ok(requestById.has(failure.requestId), `${engine}: trusted local failure has an unknown request identity`);
    const response = trustedResponseByRequest.get(failure.requestId);
    assert.ok(response, `${engine}: trusted local failure has no bound response`);
    if (failure.journalId !== undefined) assert.equal(failure.journalId, response.journalId, `${engine}: trusted local failure journal identity is divergent`);
  }
  const sequences = journal.map(({ sequence }) => sequence);
  const journalWindow = { start: Math.min(...sequences), end: Math.max(...sequences) };
  if (journal.length === 0) {
    journalWindow.start = 0;
    journalWindow.end = -1;
  }
  assertTrustedLocalFailureCorrelations({ engine, failures: localFailures, responses: trustedResponses, journal, journalWindow });
  return {
    correlatedFailures: localFailures.length,
    boundRequests: localRequests.length,
    journalRecords: journal.length,
    internalRecords: journal.filter(({ requestId }) => requestId === null).length,
    trustedResponses: trustedResponses.length,
    indeterminateBrowserResponses: indeterminateObservations.length,
    refusedInternalRequests: journalRejections.length,
  };
}

export function assertTrustedLocalFailureCorrelations({ engine, failures, responses, journal, journalWindow }) {
  assert.ok(Array.isArray(failures), `${engine}: trusted local failures are malformed`);
  assert.ok(Array.isArray(responses), `${engine}: trusted local responses are malformed`);
  assert.ok(Array.isArray(journal), `${engine}: trusted server journal is malformed`);
  assert.ok(Number.isSafeInteger(journalWindow?.start) && Number.isSafeInteger(journalWindow?.end), `${engine}: trusted server journal window is malformed`);
  const seen = new Set();
  for (const failure of failures) {
    assert.match(failure.requestId ?? "", /^[0-9a-f]{64}$/, `${engine}: failed local request identity is absent`);
    assert.equal(seen.has(failure.requestId), false, `${engine}: failed local request identity is duplicated`);
    seen.add(failure.requestId);
    assert.ok(TRUSTED_LOCAL_CANCELLATION_REASONS.has(failure.reason), `${engine}: local request failure reason ${JSON.stringify(failure.reason ?? null)} is not an authorized cancellation`);
    const matchingResponses = responses.filter(({ requestId }) => requestId === failure.requestId);
    assert.equal(matchingResponses.length, 1, `${engine}: trusted local response cardinality is not exactly one for ${failure.requestId}`);
    const [response] = matchingResponses;
    assertTrustedLocalResponseStatus(response.status, response.url);
    assert.equal(response.status, 206, `${engine}: cancelled local request did not receive a verified 206 response`);
    assert.equal(response.url, failure.url, `${engine}: trusted local response URL is divergent`);
    assert.equal(response.route, failure.route, `${engine}: trusted local response route is divergent`);
    assert.equal(response.range, failure.range, `${engine}: trusted local response range is divergent`);
    assert.match(response.journalId ?? "", /^[0-9a-f]{64}$/, `${engine}: failed local response journal identity is absent`);
    const allJournalMatches = journal.filter(({ journalId }) => journalId === response.journalId);
    assert.equal(allJournalMatches.length, 1, `${engine}: trusted server journal cardinality is not exactly one for ${failure.requestId}`);
    const [record] = allJournalMatches;
    if (record.requestId !== null) assert.equal(record.requestId, failure.requestId, `${engine}: trusted server journal request identity is divergent`);
    assert.ok(record.sequence >= journalWindow.start && record.sequence <= journalWindow.end, `${engine}: trusted server journal record is outside the measurement window`);
    assert.equal(record.absoluteUrl, failure.url, `${engine}: trusted server journal URL is divergent`);
    assert.equal(record.route, failure.route, `${engine}: trusted server journal route is divergent`);
    assert.equal(record.range, failure.range, `${engine}: trusted server journal range is divergent`);
    assert.equal(record.status, 206, `${engine}: trusted server journal status is not 206`);
    assert.equal(record.finished, true, `${engine}: trusted server journal response is incomplete`);
    assert.ok(Number.isSafeInteger(record.rangeStart) && Number.isSafeInteger(record.rangeEnd) && Number.isSafeInteger(record.totalBytes), `${engine}: trusted server journal byte range is malformed`);
    assert.ok(record.rangeStart >= 0 && record.rangeEnd >= record.rangeStart && record.rangeEnd < record.totalBytes, `${engine}: trusted server journal byte range is invalid`);
    assert.equal(record.bytes, record.rangeEnd - record.rangeStart + 1, `${engine}: trusted server journal byte count is divergent`);
    const requested = /^bytes=([0-9]+)-([0-9]*)$/.exec(failure.range ?? "");
    assert.ok(requested, `${engine}: failed local request byte range is malformed`);
    assert.equal(record.rangeStart, Number(requested[1]), `${engine}: trusted server journal range start is divergent`);
    assert.equal(record.rangeEnd, requested[2] === "" ? record.totalBytes - 1 : Number(requested[2]), `${engine}: trusted server journal range end is divergent`);
  }
  return { correlatedFailures: failures.length };
}

export async function installRuntimeNetworkPolicy(context, server, engine, channel, probeId = null) {
  assert.ok(["candidate-flow", "control-probe"].includes(channel), `${engine}: trusted network channel is invalid`);
  if (channel === "control-probe") assert.match(probeId ?? "", /^[0-9a-f]{64}$/, `${engine}: trusted control probe identity is absent`);
  else assert.equal(probeId, null, `${engine}: candidate flow cannot carry a control probe identity`);
  const flowAttempts = [];
  const controlAttempts = [];
  const localRequests = [];
  const localResponses = [];
  const localFailures = [];
  const localViolations = [];
  const recordedRequests = new WeakSet();
  const requestMetadata = new WeakMap();
  const journalWindow = server.openJournalWindow();
  await context.addCookies([journalWindow.continuationCookie]);
  const collection = createTrustedCollectionLifecycle(`${engine} ${channel}`);
  let localSequence = 0;
  let finalized = null;
  let scope = { phase: "initialization", action: "context-start", route: null, viewport: null };
  const setScope = (next) => { scope = { ...scope, ...next }; };
  const recordLifecycleEvent = (kind) => {
    try { collection.recordEvent(kind); }
    catch (error) { localViolations.push({ url: null, reason: error.message, phase: scope.phase, action: scope.action }); }
  };
  const record = (detail, disposition = "BLOCKED_BEFORE_EGRESS") => {
    let parsed;
    try { parsed = new URL(detail.url); }
    catch { parsed = { href: String(detail.url), origin: "INVALID" }; }
    const attempt = {
      mechanism: detail.mechanism,
      url: parsed.href,
      origin: parsed.origin,
      phase: scope.phase,
      engine,
      action: scope.action,
      route: scope.route,
      viewport: scope.viewport,
      disposition,
      probeId,
    };
    (channel === "control-probe" ? controlAttempts : flowAttempts).push(attempt);
    return attempt;
  };
  const recordTrustedControl = (action, url) => {
    assert.equal(channel, "control-probe", `${engine}: only a trusted control probe may record a browser-rejected attempt`);
    assert.equal(scope.action, action, `${engine}: trusted browser-rejected control action is divergent`);
    const expected = expectedNetworkControl(action);
    assert.equal(url, expected.url, `${engine}: trusted browser-rejected control URL is divergent`);
    return record({ mechanism: expected.mechanism, url }, networkControlDisposition(action));
  };
  const recordExternalRequest = (request) => {
    if (recordedRequests.has(request)) return;
    recordedRequests.add(request);
    const url = new URL(request.url());
    if (url.origin === server.origin) return;
    const expected = channel === "control-probe" ? expectedNetworkControl(scope.action) : null;
    record({ mechanism: expected?.mechanism ?? (request.resourceType() === "document" ? "navigation" : request.resourceType()), url: url.href });
  };
  const auditExternalResourceHints = async (page) => {
    const hints = await page.locator("link[rel]").evaluateAll((nodes) => nodes.flatMap((node) => {
      const rel = (node.getAttribute("rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      if (!rel.some((value) => value === "preconnect" || value === "dns-prefetch")) return [];
      return [node.href];
    }));
    for (const href of hints) {
      const url = new URL(href);
      if (url.origin !== server.origin) recordTrustedControl(scope.action, url.href);
    }
  };

  context.on("request", (request) => {
    recordLifecycleEvent(`request:${request.resourceType()}`);
    recordExternalRequest(request);
  });

  await context.route("**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === server.origin) {
      try {
        const validated = server.validateRequest(url.href);
        const headers = await request.allHeaders();
        for (const name of Object.keys(headers)) if (name.toLowerCase() === "x-branct-trusted-request-id") delete headers[name];
        const range = headers.range ?? null;
        const requestId = sha256(canonicalJson({ engine, channel, probeId, sequence: localSequence++, url: url.href, range, phase: scope.phase, action: scope.action }));
        const metadata = { requestId, url: url.href, route: validated.route, range, resourceType: request.resourceType(), phase: scope.phase, action: scope.action };
        requestMetadata.set(request, metadata);
        localRequests.push(metadata);
        headers["x-branct-trusted-request-id"] = requestId;
        return route.continue({ headers: journalWindow.authorizeHeaders(headers) });
      } catch (error) {
        localViolations.push({ url: url.href, reason: error.message, phase: scope.phase, action: scope.action });
        return route.abort("blockedbyclient");
      }
    }
    recordExternalRequest(request);
    return route.abort("blockedbyclient");
  });
  assert.equal(typeof context.routeWebSocket, "function", `${engine}: trusted WebSocket blocker is unavailable`);
  await context.routeWebSocket("**", (socket) => {
    record({ mechanism: "WebSocket", url: socket.url() });
    socket.close({ code: 1008, reason: "external network blocked" });
  });
  context.on("response", (response) => {
    recordLifecycleEvent("response");
    const url = new URL(response.url());
    if (url.origin === server.origin) {
      const metadata = requestMetadata.get(response.request());
      const responseHeaders = response.headers();
      const journalId = responseHeaders["x-branct-trusted-journal-id"] ?? null;
      const rejectionId = responseHeaders["x-branct-trusted-rejection-id"] ?? undefined;
      const serverRequestId = responseHeaders["x-branct-trusted-request-id"] ?? null;
      const status = response.status();
      let validated;
      try { validated = server.validateRequest(url.href); }
      catch (error) {
        localViolations.push({ url: url.href, reason: error.message, phase: scope.phase, action: scope.action });
        return;
      }
      const range = metadata?.range ?? response.request().headers().range ?? null;
      if (!metadata && serverRequestId) localRequests.push({ requestId: serverRequestId, url: url.href, route: validated.route, range, resourceType: response.request().resourceType(), phase: scope.phase, action: scope.action, identityOwner: "server" });
      const observation = { requestId: metadata?.requestId ?? serverRequestId, url: url.href, route: metadata?.route ?? validated.route, range, status, journalId, rejectionId, resourceType: response.request().resourceType() };
      localResponses.push(observation);
      if (![200, 206, 403].includes(status)) localViolations.push({ url: url.href, reason: `trusted local response status ${status}`, phase: scope.phase, action: scope.action });
    }
  });
  context.on("requestfailed", (request) => {
    recordLifecycleEvent("requestfailed");
    const url = new URL(request.url());
    if (url.origin !== server.origin) return;
    const metadata = requestMetadata.get(request);
    if (!metadata) {
      localViolations.push({ url: url.href, reason: "failed local request has no consumer-owned identity", phase: scope.phase, action: scope.action });
      return;
    }
    localFailures.push({ ...metadata, reason: request.failure()?.errorText ?? "UNKNOWN_LOCAL_REQUEST_FAILURE" });
  });

  const finalizeLocalFailureCorrelations = async () => {
    assert.equal(finalized, null, `${engine}: trusted collection was finalized more than once`);
    collection.beginQuiescence();
    journalWindow.beginQuiescence();
    const deadline = Date.now() + 1500;
    let stable = 0;
    let fingerprint = null;
    while (Date.now() < deadline && stable < 4) {
      const snapshot = journalWindow.snapshot();
      const next = sha256(canonicalJson({
        events: collection.snapshot().eventCount,
        requests: localRequests,
        responses: localResponses,
        failures: localFailures,
        violations: localViolations,
        journal: snapshot.records,
        journalRejections: snapshot.rejections,
      }));
      const observed = collection.observeQuiescence(next);
      fingerprint = next;
      stable = observed.stableSamples;
      if (stable < 4) await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    }
    assert.equal(stable, 4, `${engine}: trusted collection did not reach deterministic quiescence`);
    collection.seal(fingerprint);
    journalWindow.seal();
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 75));
    const sealedSnapshot = journalWindow.snapshot();
    const sealedFingerprint = sha256(canonicalJson({
      events: collection.snapshot().eventCount,
      requests: localRequests,
      responses: localResponses,
      failures: localFailures,
      violations: localViolations,
      journal: sealedSnapshot.records,
      journalRejections: sealedSnapshot.rejections,
    }));
    assert.equal(sealedFingerprint, fingerprint, `${engine}: trusted collection changed after seal`);
    assert.notEqual(sealedSnapshot.state, "REJECTED", sealedSnapshot.violation ?? `${engine}: trusted server journal was rejected`);
    assert.deepEqual(localViolations, [], `${engine}: trusted local request violation observed`);
    const correlation = assertTrustedJournalBijection({
      engine,
      windowId: journalWindow.windowId,
      localRequests,
      localResponses,
      localFailures,
      journal: sealedSnapshot.records,
      journalRejections: sealedSnapshot.rejections,
    });
    journalWindow.verify();
    collection.verify(fingerprint);
    finalized = { ...correlation, fingerprint, windowId: journalWindow.windowId };
    return structuredClone(finalized);
  };

  const assertStillVerified = () => {
    assert.ok(finalized, `${engine}: trusted collection has not been finalized`);
    assert.equal(collection.snapshot().state, "VERIFIED", `${engine}: trusted collection is no longer verified`);
    assert.equal(journalWindow.snapshot().state, "VERIFIED", `${engine}: trusted server journal is no longer verified`);
    assert.deepEqual(localViolations, [], `${engine}: trusted local request violation observed after finalization`);
    return true;
  };

  return { flowAttempts, controlAttempts, localRequests, localResponses, localFailures, localViolations, setScope, recordTrustedControl, auditExternalResourceHints, finalizeLocalFailureCorrelations, assertStillVerified };
}

export async function drainTrustedPage(page) {
  assert.ok(page && typeof page.evaluate === "function", "trusted drain page is absent");
  try {
    await page.evaluate(() => globalThis.stop());
  } catch (error) {
    if (!/Execution context was destroyed|Target page, context or browser has been closed/.test(error?.message ?? "")) throw error;
  }
}

async function waitForControlAttempt(policy, action, before) {
  await bounded(`network control ${action}`, 3000, async () => {
    while (policy.controlAttempts.length === before) await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  });
  const observed = policy.controlAttempts.slice(before);
  assert.ok(observed.length > 0, `trusted network control was not observed: ${action}`);
  return observed;
}

async function assertNoControlAttempt(policy, action, before, phase) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 120));
  assert.equal(policy.controlAttempts.length, before, `trusted network control attempted external access during ${phase}: ${action}`);
}

async function runNetworkControl(page, policy, engine, action, origin, probeId) {
  const url = action === "WebSocket" ? "wss://f2-gov-09.invalid/socket" : `https://f2-gov-09.invalid/${encodeURIComponent(action)}`;
  policy.setScope({ phase: "control-probe", action, route: "about:blank", viewport: "control" });
  const before = policy.controlAttempts.length;
  if (action === "consent-loader") {
    policy.setScope({ phase: "control-probe", action, route: "crm-gestao.html", viewport: "control" });
    await page.goto(`${origin}/crm-gestao.html`, { waitUntil: "load" });
    await assertNoControlAttempt(policy, action, before, "no consent decision");
    await page.locator("#consent-reject").click();
    await assertNoControlAttempt(policy, action, before, "explicit consent refusal");
    await page.evaluate(() => localStorage.removeItem("branct_consent"));
    await page.reload({ waitUntil: "load" });
    await assertNoControlAttempt(policy, action, before, "consent withdrawal");
    await page.locator("#consent-accept").click();
  } else if (action === "form-submit") {
    policy.setScope({ phase: "control-probe", action, route: "contactos.html", viewport: "control" });
    await page.goto(`${origin}/contactos.html`, { waitUntil: "load" });
    await page.evaluate(() => {
      const form=document.querySelector('form[data-lead-form]');
      if (!form) throw new Error("trusted form-submit control cannot find the form");
      for (const field of form.querySelectorAll('[required]')) {
        if (field instanceof HTMLSelectElement) field.selectedIndex=Math.min(1, field.options.length-1);
        else if (field.type === 'email') field.value='test@example.invalid';
        else if (field.type === 'tel') field.value='000000000';
        else field.value='Offline probe';
      }
      form.dispatchEvent(new Event("submit", { bubbles:true, cancelable:true }));
    });
  } else {
    if (action === "serviceWorker.register") {
      policy.setScope({ phase: "control-probe", action, route: "src/i18n/pt.json", viewport: "control" });
      await page.goto(`${origin}/src/i18n/pt.json`, { waitUntil: "load" });
    }
    else await page.goto("about:blank");
  }
  if (["consent-loader", "form-submit"].includes(action)) {
    const observed = await waitForControlAttempt(policy, action, before);
    assertExpectedNetworkControl(observed, engine, action, probeId);
    if (action === "consent-loader") {
      await page.evaluate(() => localStorage.removeItem("branct_consent"));
      await page.reload({ waitUntil: "load" });
      await assertNoControlAttempt(policy, action, before + 1, "consent withdrawal after valid consent");
    }
    await page.goto("about:blank");
    return { action, status: networkControlStatus(action), probeId, observed };
  }
  await page.evaluate(async ({ action: control, url: target }) => {
    try {
      if (control === "fetch") await fetch(target);
      else if (control === "fetch-computed") await fetch(["https://", "f2-gov-09.invalid", "/computed"].join(""));
      else if (control === "XMLHttpRequest") { const xhr=new XMLHttpRequest(); xhr.open("GET", target); xhr.send(); }
      else if (control === "WebSocket") new WebSocket(target);
      else if (control === "EventSource") new EventSource(target);
      else if (control === "sendBeacon") navigator.sendBeacon(target, "probe");
      else if (control === "serviceWorker.register") await navigator.serviceWorker.register(target);
      else if (control === "script") { const element=document.createElement("script"); element.src=target; document.head.append(element); }
      else if (control === "dynamic-import") await import(target);
      else if (control === "frame") { const element=document.createElement("iframe"); element.src=target; document.body.append(element); }
      else if (control === "image") { const element=new Image(); element.src=target; document.body.append(element); }
      else if (control === "window.open") window.open(target, "_blank");
      else if (control === "location.assign") location.assign(target);
      else if (control === "location.replace") location.replace(target);
      else if (control === "location.href") location.href=target;
      else if (control === "resource-hint-preconnect" || control === "resource-hint-dns-prefetch") { const element=document.createElement("link"); element.rel=control.replace("resource-hint-", ""); element.href=target; document.head.append(element); }
      else throw new Error(`unknown trusted network control: ${control}`);
    } catch {}
  }, { action, url }).catch(() => {});
  if (action === "serviceWorker.register" && policy.controlAttempts.length === before) policy.recordTrustedControl(action, url);
  if (["resource-hint-preconnect", "resource-hint-dns-prefetch"].includes(action)) await policy.auditExternalResourceHints(page);
  const observed = await waitForControlAttempt(policy, action, before);
  assertExpectedNetworkControl(observed, engine, action, probeId);
  return { action, status: networkControlStatus(action), probeId, observed };
}

async function measureEngine(request, matrix, menuAuthority, playwright, engine) {
  const browserType = playwright[engine];
  assert.ok(browserType?.launch, `trusted Playwright engine is unavailable: ${engine}`);
  const browser = await browserType.launch({ headless: true, env: { HOME: request.browserHome, TMPDIR: request.browserHome, TEMP: request.browserHome, TMP: request.browserHome } });
  const context = await browser.newContext({ serviceWorkers: "block" });
  let measuredContextClosed = false;
  const observations = [];
  const menuResults = [];
  const actions = [];
  const evidence = [];
  const consoleIssues = [];
  let server;
  try {
    server = await startTrustedStaticServer(request.candidateRoot, request.candidatePayload, 4173);
    const initialState = await context.storageState();
    assert.equal(initialState.cookies.length, 0, `${engine}: trusted browser context starts with cookies`);
    assert.equal(initialState.origins.length, 0, `${engine}: trusted browser context starts with storage`);
    assert.equal(context.serviceWorkers().length, 0, `${engine}: trusted browser context starts with service workers`);
    const networkPolicy = await installRuntimeNetworkPolicy(context, server, engine, "candidate-flow");
    await context.addInitScript(() => {
      const blockedRtc = class { constructor() { throw new Error("external network blocked"); } };
      Object.defineProperty(globalThis, "RTCPeerConnection", { value: blockedRtc, configurable: false, writable: false });
      Object.defineProperty(globalThis, "webkitRTCPeerConnection", { value: blockedRtc, configurable: false, writable: false });
    });
    const page = await context.newPage();
    page.on("console", (message) => { if (["error", "warning"].includes(message.type())) consoleIssues.push({ type: message.type(), text: message.text().slice(0, 300) }); });
    for (const [viewport, dimensions] of Object.entries(matrix.viewports)) {
      for (const route of matrix.routes) {
        networkPolicy.setScope({ phase: "measured-flow", action: "measure-responsive", route, viewport });
        await navigate(page, server.origin, route, viewport, dimensions);
        await networkPolicy.auditExternalResourceHints(page);
        const raw = await page.evaluate(selectorMetrics);
        const observation = { route, viewport, conclusion: "CONCLUSIVE", ...raw };
        observations.push(observation);
        evidence.push(evidenceEnvelope(request, request.matrixDigest, engine, "observation", route, viewport, "measure-responsive", observation, raw.overflow || raw.smallTargets.length ? "FAIL" : "PASS"));
      }
    }
    for (const entry of menuAuthority.entries) {
      networkPolicy.setScope({ phase: "measured-flow", action: "menu-sequence", route: entry.route, viewport: entry.viewport });
      const result = await measureMenuCase(page, server.origin, entry, matrix.viewports[entry.viewport], actions, networkPolicy.setScope);
      await networkPolicy.auditExternalResourceHints(page);
      const semanticResult = menuPass(result) ? "PASS" : "FAIL";
      menuResults.push({ evidenceId: entry.evidenceId, route: entry.route, viewport: entry.viewport, actionSequence: entry.actionPhases, semanticResult, measuredResult: result });
      evidence.push(evidenceEnvelope(request, request.matrixDigest, engine, "menu", entry.route, entry.viewport, entry.actionPhases.join("+"), { actionSequence: entry.actionPhases, measuredResult: result }, semanticResult));
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    networkPolicy.setScope({ phase: "measured-flow", action: "reduced-motion", route: "index.html", viewport: "390x844" });
    await navigate(page, server.origin, "index.html", "390x844", matrix.viewports["390x844"]);
    await networkPolicy.auditExternalResourceHints(page);
    const reducedMotion = await page.evaluate(() => {
      const element=document.querySelector('.mobile-drawer,.mobile-toggle'), style=element?getComputedStyle(element):null;
      const durations=(style?.transitionDuration||'0s').split(',').map((value)=>value.trim().endsWith('ms')?parseFloat(value):parseFloat(value)*1000);
      return { matches:matchMedia('(prefers-reduced-motion: reduce)').matches, maxDurationMs:Math.max(0,...durations.filter(Number.isFinite)) };
    });
    assertNoObservedExternalAttempts([{ engine, networkIsolation: { flowAttempts: networkPolicy.flowAttempts } }]);
    networkPolicy.setScope({ phase: "quiescence", action: "drain-page", route: null, viewport: null });
    await drainTrustedPage(page);
    await networkPolicy.finalizeLocalFailureCorrelations();
    await page.close();
    await context.close();
    measuredContextClosed = true;
    networkPolicy.assertStillVerified();
    assert.deepEqual(networkPolicy.localViolations, [], `${engine}: trusted local request violation observed`);
    const controls = [];
    for (const action of NETWORK_CONTROL_ACTIONS) {
      const probeId = sha256(canonicalJson({ baseSha: request.baseSha, headSha: request.headSha, payloadDigest: request.payloadDigest, engine, action }));
      const probeContext = await browser.newContext({ serviceWorkers: "block" });
      let probeContextClosed = false;
      try {
        const probePolicy = await installRuntimeNetworkPolicy(probeContext, server, engine, "control-probe", probeId);
        const probePage = await probeContext.newPage();
        controls.push(await runNetworkControl(probePage, probePolicy, engine, action, server.origin, probeId));
        probePolicy.setScope({ phase: "quiescence", action: "drain-page", route: null, viewport: null });
        await drainTrustedPage(probePage);
        await probePolicy.finalizeLocalFailureCorrelations();
        await probePage.close();
        await probeContext.close();
        probeContextClosed = true;
        probePolicy.assertStillVerified();
        assert.deepEqual(probePolicy.localViolations, [], `${engine}: trusted control local request violation observed: ${action}`);
      } finally { if (!probeContextClosed) await probeContext.close(); }
    }
    networkPolicy.assertStillVerified();
    assertExpectedNetworkControlVector(controls, engine);
    assert.ok(networkPolicy.localResponses.some(({ route, status }) => route.startsWith("src/i18n/") && status === 200), `${engine}: local i18n fetch was not served from a verified candidate blob`);
    const summary = {
      overflowCount: observations.filter(({ overflow }) => overflow).length,
      smallTargetObservationCount: observations.filter(({ smallTargets }) => smallTargets.length).length,
      menuFailureCount: menuResults.filter(({ semanticResult }) => semanticResult !== "PASS").length,
      reducedMotionDurationMs: reducedMotion.maxDurationMs,
      consoleIssueCount: consoleIssues.length,
    };
    return {
      engine,
      version: browser.version(),
      observations,
      menuResults,
      actions,
      reducedMotion,
      networkIsolation: {
        policy: "LOCAL_VERIFIED_BLOBS_AND_RUNTIME_EXTERNAL_FAIL",
        cleanContext: { cookies: 0, storageOrigins: 0, serviceWorkers: 0 },
        localRequestCount: networkPolicy.localRequests.length,
        localI18nSuccessCount: networkPolicy.localResponses.filter(({ route, status }) => route.startsWith("src/i18n/") && status === 200).length,
        localViolations: networkPolicy.localViolations,
        flowAttempts: networkPolicy.flowAttempts,
        controls,
      },
      consoleIssues,
      summary,
      evidence,
    };
  } finally {
    if (server) await server.close();
    if (!measuredContextClosed) await context.close();
    await browser.close();
  }
}

function operationalConclusion(expectations, reports) {
  const total = (key) => reports.reduce((sum, report) => sum + report.summary[key], 0);
  const reducedPass = reports.every((report) => report.reducedMotion.matches === true && report.summary.reducedMotionDurationMs <= expectations.operational.readyMaximums.reducedMotionDurationMs);
  assertNoObservedExternalAttempts(reports);
  for (const report of reports) assertExpectedNetworkControlVector(report.networkIsolation.controls, report.engine);
  const networkPass = reports.every((report) => report.networkIsolation.localI18nSuccessCount > 0);
  const ready = total("overflowCount") === 0 && total("smallTargetObservationCount") === 0 && total("menuFailureCount") === 0 && reducedPass && networkPass;
  const development = total("overflowCount") >= expectations.operational.developmentMinimums.overflowCount && total("smallTargetObservationCount") >= expectations.operational.developmentMinimums.smallTargetObservationCount && total("menuFailureCount") >= expectations.operational.developmentMinimums.menuFailureCount && reducedPass && networkPass;
  assert.ok(ready || development, "trusted measurement is neither the exact READY GREEN nor contracted semantic RED");
  return ready ? "READY_GREEN" : "EXPECTED_SEMANTIC_RED";
}

async function consumeOperational(request, matrix, expectations) {
  assert.deepEqual(matrix.engines, ["chromium", "firefox", "webkit"], "trusted engine matrix is divergent");
  assert.equal(matrix.routes.length * Object.keys(matrix.viewports).length, matrix.observationCountPerEngine, "trusted observation matrix cardinality is divergent");
  const menuAuthority = readJson(request.menuEvidencePath, "trusted menu evidence authority");
  const menuEvidencePayload = menuAuthority.entries.map(({ evidenceId, route, viewport, actionPhases, developmentSemanticStatus, developmentResult, developmentResultSha256 }) => ({ evidenceId, route, viewport, actionPhases, developmentSemanticStatus, developmentResult, developmentResultSha256 }));
  assert.equal(sha256(JSON.stringify(menuEvidencePayload)), menuAuthority.sha256, "trusted menu evidence digest is divergent");
  assert.equal(menuAuthority.entries.length, matrix.menuEvidenceCountPerEngine, "trusted menu evidence cardinality is divergent");
  assert.equal(menuAuthority.entries.reduce((sum, entry) => sum + entry.actionPhases.length, 0), matrix.actionCountPerEngine, "trusted action cardinality is divergent");
  const modules = realpathSync(request.trustedNodeModules);
  const metadata = lstatSync(modules);
  assert.equal(metadata.isDirectory(), true, "trusted node_modules root is not a directory");
  const runtime = readJson(request.runtimePath, "trusted Playwright runtime");
  process.env.PLAYWRIGHT_BROWSERS_PATH = runtime.container.browsersPath;
  const require = createRequire(join(modules, "..", "package.json"));
  const playwright = require("playwright");
  const installedVersion = readJson(join(modules, "playwright", "package.json"), "trusted Playwright package").version;
  const executablePaths = Object.fromEntries(runtime.playwright.engines.map((engine) => [engine, playwright[engine]?.executablePath?.()]));
  validateTrustedPlaywrightInstallation(runtime, installedVersion, executablePaths);
  assert.deepEqual(runtime.playwright.engines, matrix.engines, "trusted Playwright runtime engine set is divergent");
  const reports = [];
  for (const engine of matrix.engines) reports.push(await bounded(`engine ${engine}`, request.perEngineTimeoutMs, () => measureEngine(request, matrix, menuAuthority, playwright, engine)));
  for (const report of reports) {
    assert.equal(report.observations.length, matrix.observationCountPerEngine, `${report.engine}: trusted observation report is partial`);
    assert.equal(report.menuResults.length, matrix.menuEvidenceCountPerEngine, `${report.engine}: trusted menu report is partial`);
    assert.equal(report.actions.length, matrix.actionCountPerEngine, `${report.engine}: trusted action report is partial`);
    assert.ok(report.actions.every(({ status }) => status === "COMPLETED"), `${report.engine}: trusted action report is inconclusive`);
  }
  const conclusion = operationalConclusion(expectations, reports);
  return { complete: true, executionMode: "OPERATIONAL", conclusion, capabilityInventory: request.capabilityInventory, reports, evidence: reports.flatMap(({ evidence }) => evidence) };
}

export async function consumeTrustedMeasurement(request) {
  exactKeys(request, ["executionMode", "baseSha", "headSha", "candidateRoot", "candidatePayload", "capabilityInventory", "matrixPath", "expectationsPath", "runtimePath", "menuEvidencePath", "targetBaselinePath", "trustedNodeModules", "browserHome", "perEngineTimeoutMs", "matrixDigest", "payloadDigest"], "trusted consumer request");
  const matrixBytes = readFileSync(request.matrixPath);
  const expectationBytes = readFileSync(request.expectationsPath);
  assert.equal(sha256(matrixBytes), request.matrixDigest, "trusted consumer matrix digest is divergent");
  const matrix = JSON.parse(matrixBytes.toString("utf8"));
  const expectations = JSON.parse(expectationBytes.toString("utf8"));
  assert.equal(sha256(canonicalJson(request.candidatePayload)), request.payloadDigest, "trusted consumer candidate payload digest is divergent");
  if (request.executionMode === "SIMULATION") return consumeSimulation(request, matrix, expectations);
  assert.equal(request.executionMode, "OPERATIONAL", "trusted execution mode is invalid");
  return consumeOperational(request, matrix, expectations);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.equal(process.argv.length, 4, "trusted consumer requires exact request and response paths");
  const request = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const response = await consumeTrustedMeasurement(request);
  writeFileSync(process.argv[3], JSON.stringify(response), { encoding: "utf8", flag: "wx" });
}

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
const readJson = (path, label) => {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { assert.fail(`${label} is absent, unreadable or malformed`); }
};

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
  return { complete: true, executionMode: "SIMULATION", evidence };
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

async function measureMenuCase(page, origin, entry, dimensions, actions) {
  await navigate(page, origin, entry.route, entry.viewport, dimensions);
  const result = { focusReached: false, focusStyle: false, open: null, closed: null, closeButtonClosed: null, outsideClosed: null };
  const action = async (phase, operation) => {
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
      if (phase === "open") {
        result.open = await page.evaluate(() => {
          const drawer=document.querySelector('.mobile-drawer'), toggle=document.querySelector('.mobile-toggle'), main=document.querySelector('main');
          if (!drawer || !toggle) return { expanded:null, drawerInside:false, focusInside:false, bodyLocked:false, backgroundInert:false, closeTarget:null };
          const rect=drawer.getBoundingClientRect(), close=drawer.querySelector('.drawer-close,[data-drawer-close]');
          const closeRect=close?.getBoundingClientRect();
          return { expanded:toggle.getAttribute('aria-expanded'), drawerInside:rect.left>=-.5&&rect.right<=document.documentElement.clientWidth+.5, focusInside:drawer.contains(document.activeElement), bodyLocked:getComputedStyle(document.body).overflowY==='hidden'||getComputedStyle(document.body).overflow==='hidden', backgroundInert:!main||main.inert, closeTarget:closeRect?{width:closeRect.width,height:closeRect.height,name:close.getAttribute('aria-label')||close.textContent.trim()}:null, opened };
        });
      }
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

async function measureEngine(request, matrix, menuAuthority, playwright, engine) {
  const browserType = playwright[engine];
  assert.ok(browserType?.launch, `trusted Playwright engine is unavailable: ${engine}`);
  const browser = await browserType.launch({ headless: true, env: { HOME: request.browserHome, TMPDIR: request.browserHome, TEMP: request.browserHome, TMP: request.browserHome } });
  const context = await browser.newContext({ serviceWorkers: "block" });
  const blocked = [];
  const observations = [];
  const menuResults = [];
  const actions = [];
  const evidence = [];
  const consoleIssues = [];
  let server;
  try {
    server = await startTrustedStaticServer(request.candidateRoot, 4173);
    await context.route("**", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === server.origin) return route.continue();
      blocked.push(url.href);
      return route.abort("blockedbyclient");
    });
    assert.equal(typeof context.routeWebSocket, "function", `${engine}: trusted WebSocket blocker is unavailable`);
    await context.routeWebSocket("**", (socket) => {
      blocked.push(socket.url());
      socket.close({ code: 1008, reason: "external network blocked" });
    });
    await context.addInitScript(() => {
      const blockedRtc = class { constructor() { throw new Error("external network blocked"); } };
      Object.defineProperty(globalThis, "RTCPeerConnection", { value: blockedRtc, configurable: false, writable: false });
      Object.defineProperty(globalThis, "webkitRTCPeerConnection", { value: blockedRtc, configurable: false, writable: false });
    });
    const page = await context.newPage();
    page.on("console", (message) => { if (["error", "warning"].includes(message.type())) consoleIssues.push({ type: message.type(), text: message.text().slice(0, 300) }); });
    for (const [viewport, dimensions] of Object.entries(matrix.viewports)) {
      for (const route of matrix.routes) {
        await navigate(page, server.origin, route, viewport, dimensions);
        const raw = await page.evaluate(selectorMetrics);
        const observation = { route, viewport, conclusion: "CONCLUSIVE", ...raw };
        observations.push(observation);
        evidence.push(evidenceEnvelope(request, request.matrixDigest, engine, "observation", route, viewport, "measure-responsive", observation, raw.overflow || raw.smallTargets.length ? "FAIL" : "PASS"));
      }
    }
    for (const entry of menuAuthority.entries) {
      const result = await measureMenuCase(page, server.origin, entry, matrix.viewports[entry.viewport], actions);
      const semanticResult = menuPass(result) ? "PASS" : "FAIL";
      menuResults.push({ evidenceId: entry.evidenceId, route: entry.route, viewport: entry.viewport, actionSequence: entry.actionPhases, semanticResult, measuredResult: result });
      evidence.push(evidenceEnvelope(request, request.matrixDigest, engine, "menu", entry.route, entry.viewport, entry.actionPhases.join("+"), { actionSequence: entry.actionPhases, measuredResult: result }, semanticResult));
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await navigate(page, server.origin, "index.html", "390x844", matrix.viewports["390x844"]);
    const reducedMotion = await page.evaluate(() => {
      const element=document.querySelector('.mobile-drawer,.mobile-toggle'), style=element?getComputedStyle(element):null;
      const durations=(style?.transitionDuration||'0s').split(',').map((value)=>value.trim().endsWith('ms')?parseFloat(value):parseFloat(value)*1000);
      return { matches:matchMedia('(prefers-reduced-motion: reduce)').matches, maxDurationMs:Math.max(0,...durations.filter(Number.isFinite)) };
    });
    const probeUrl = "https://f2-gov-09.invalid/network-probe";
    const probePage = await context.newPage();
    await probePage.goto("about:blank");
    const probeResult = await probePage.evaluate(async (url) => { try { await fetch(url, { cache:"no-store" }); return "UNEXPECTED_SUCCESS"; } catch { return "BLOCKED"; } }, probeUrl);
    await probePage.close();
    assert.equal(probeResult, "BLOCKED", `${engine}: external browser probe was not blocked`);
    assert.ok(blocked.includes(probeUrl), `${engine}: external browser probe did not reach the trusted route blocker`);
    const summary = {
      overflowCount: observations.filter(({ overflow }) => overflow).length,
      smallTargetObservationCount: observations.filter(({ smallTargets }) => smallTargets.length).length,
      menuFailureCount: menuResults.filter(({ semanticResult }) => semanticResult !== "PASS").length,
      reducedMotionDurationMs: reducedMotion.maxDurationMs,
      consoleIssueCount: consoleIssues.length,
    };
    return { engine, version: browser.version(), observations, menuResults, actions, reducedMotion, networkIsolation: { probeUrl, probeResult, blockedCount: blocked.length }, consoleIssues, summary, evidence };
  } finally {
    if (server) await server.close();
    await context.close();
    await browser.close();
  }
}

function operationalConclusion(expectations, reports) {
  const total = (key) => reports.reduce((sum, report) => sum + report.summary[key], 0);
  const reducedPass = reports.every((report) => report.reducedMotion.matches === true && report.summary.reducedMotionDurationMs <= expectations.operational.readyMaximums.reducedMotionDurationMs);
  const networkPass = reports.every((report) => report.networkIsolation.probeResult === "BLOCKED");
  const ready = total("overflowCount") === 0 && total("smallTargetObservationCount") === 0 && total("menuFailureCount") === 0 && reducedPass && networkPass;
  const development = total("overflowCount") >= expectations.operational.developmentMinimums.overflowCount && total("smallTargetObservationCount") >= expectations.operational.developmentMinimums.smallTargetObservationCount && total("menuFailureCount") >= expectations.operational.developmentMinimums.menuFailureCount && reducedPass && networkPass;
  assert.ok(ready || development, "trusted measurement is neither the exact READY GREEN nor contracted semantic RED");
  return ready ? "READY_GREEN" : "EXPECTED_SEMANTIC_RED";
}

async function consumeOperational(request, matrix, expectations) {
  assert.deepEqual(matrix.engines, ["chromium", "firefox", "webkit"], "trusted engine matrix is divergent");
  assert.equal(matrix.routes.length * Object.keys(matrix.viewports).length, matrix.observationCountPerEngine, "trusted observation matrix cardinality is divergent");
  const menuAuthority = readJson(request.menuEvidencePath, "trusted menu evidence authority");
  assert.equal(sha256(canonicalJson(menuAuthority.entries.map(({ evidenceId, route, viewport, actionPhases, developmentSemanticStatus, developmentResult, developmentResultSha256 }) => ({ evidenceId, route, viewport, actionPhases, developmentSemanticStatus, developmentResult, developmentResultSha256 })))), menuAuthority.sha256, "trusted menu evidence digest is divergent");
  assert.equal(menuAuthority.entries.length, matrix.menuEvidenceCountPerEngine, "trusted menu evidence cardinality is divergent");
  assert.equal(menuAuthority.entries.reduce((sum, entry) => sum + entry.actionPhases.length, 0), matrix.actionCountPerEngine, "trusted action cardinality is divergent");
  const modules = realpathSync(request.trustedNodeModules);
  const metadata = lstatSync(modules);
  assert.equal(metadata.isDirectory(), true, "trusted node_modules root is not a directory");
  const require = createRequire(join(modules, "..", "package.json"));
  const playwright = require("playwright");
  const runtime = readJson(request.runtimePath, "trusted Playwright runtime");
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
  return { complete: true, executionMode: "OPERATIONAL", conclusion, reports, evidence: reports.flatMap(({ evidence }) => evidence) };
}

export async function consumeTrustedMeasurement(request) {
  exactKeys(request, ["executionMode", "baseSha", "headSha", "candidateRoot", "matrixPath", "expectationsPath", "runtimePath", "menuEvidencePath", "targetBaselinePath", "trustedNodeModules", "browserHome", "perEngineTimeoutMs", "matrixDigest", "payloadDigest"], "trusted consumer request");
  const matrixBytes = readFileSync(request.matrixPath);
  const expectationBytes = readFileSync(request.expectationsPath);
  assert.equal(sha256(matrixBytes), request.matrixDigest, "trusted consumer matrix digest is divergent");
  const matrix = JSON.parse(matrixBytes.toString("utf8"));
  const expectations = JSON.parse(expectationBytes.toString("utf8"));
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

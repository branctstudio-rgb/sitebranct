import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash, randomBytes } from "node:crypto";
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
const NETWORK_CONTROL_ACTIONS = Object.freeze([
  "fetch", "fetch-computed", "XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon",
  "serviceWorker.register", "script", "dynamic-import", "frame", "image", "window.open",
  "location.assign", "location.replace", "location.href", "resource-hint-preconnect",
  "resource-hint-dns-prefetch", "consent-loader", "form-submit",
]);
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
  if (action === "consent-loader") return { mechanism: "script", url: "https://connect.facebook.net/en_US/fbevents.js", route: "index.html" };
  if (action === "form-submit") return { mechanism: "fetch", url: "https://n8n.branct.com/webhook/site-lead", route: "contactos.html" };
  return { mechanism: action, url: target, route: action === "serviceWorker.register" ? "index.html" : "about:blank" };
}

function assertExpectedNetworkControl(observed, engine, action, probeId) {
  assert.equal(observed.length, 1, `${engine}: trusted control observation cardinality is divergent: ${action}`);
  const expected = expectedNetworkControl(action);
  assert.deepEqual(observed[0], {
    ...expected,
    origin: new URL(expected.url).origin,
    phase: "control-probe",
    engine,
    action,
    viewport: "control",
    disposition: "BLOCKED_BEFORE_EGRESS",
    probeId,
  }, `${engine}: trusted control observation is divergent: ${action}`);
}

export function assertNoObservedExternalAttempts(reports) {
  for (const report of reports) {
    const attempt = report.networkIsolation.flowAttempts[0];
    assert.equal(attempt, undefined, attempt ? externalAttemptMessage(attempt) : `${report.engine}: observed external network attempt`);
  }
}

async function installRuntimeNetworkPolicy(context, server, engine, channel, probeId = null) {
  assert.ok(["candidate-flow", "control-probe"].includes(channel), `${engine}: trusted network channel is invalid`);
  if (channel === "control-probe") assert.match(probeId ?? "", /^[0-9a-f]{64}$/, `${engine}: trusted control probe identity is absent`);
  else assert.equal(probeId, null, `${engine}: candidate flow cannot carry a control probe identity`);
  const flowAttempts = [];
  const controlAttempts = [];
  const localRequests = [];
  const localResponses = [];
  const localViolations = [];
  const reportToken = randomBytes(32).toString("hex");
  let scope = { phase: "initialization", action: "context-start", route: null, viewport: null };
  const setScope = (next) => { scope = { ...scope, ...next }; };
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

  await context.exposeBinding("__branctReportExternalAttempt", (_source, reportedToken, detail) => {
    assert.equal(reportedToken, reportToken, `${engine}: browser network report token is invalid`);
    assert.ok(detail && typeof detail === "object", `${engine}: browser network report is malformed`);
    assert.equal(typeof detail.mechanism, "string", `${engine}: browser network mechanism is absent`);
    assert.equal(typeof detail.url, "string", `${engine}: browser network URL is absent`);
    return record(detail);
  });
  await context.addInitScript((trusted) => {
    const reportedHints = new WeakSet();
    const report = (mechanism, input) => {
      let url;
      try { url = new URL(String(input), location.href); }
      catch { url = { href: String(input), origin: "INVALID" }; }
      if (url.origin === location.origin) return false;
      void globalThis.__branctReportExternalAttempt(trusted.reportToken, { mechanism, url: url.href });
      return true;
    };
    const blockedError = () => new TypeError("external network blocked by trusted consumer");
    const originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = (input, init) => {
      const value = typeof input === "string" || input instanceof URL ? input : input?.url;
      if (!report("fetch", value)) return originalFetch(input, init);
      return Promise.reject(blockedError());
    };
    const wrapConstructor = (name, mechanism) => {
      const Original = globalThis[name];
      if (typeof Original !== "function") return;
      globalThis[name] = new Proxy(Original, {
        construct(target, args, newTarget) {
          if (report(mechanism, args[0])) throw blockedError();
          return Reflect.construct(target, args, newTarget);
        },
      });
    };
    wrapConstructor("WebSocket", "WebSocket");
    wrapConstructor("EventSource", "EventSource");
    const OriginalXHR = globalThis.XMLHttpRequest;
    if (typeof OriginalXHR === "function") {
      globalThis.XMLHttpRequest = class TrustedXMLHttpRequest extends OriginalXHR {
        open(method, url, ...rest) {
          if (report("XMLHttpRequest", url)) throw blockedError();
          return super.open(method, url, ...rest);
        }
      };
    }
    if (typeof navigator.sendBeacon === "function") {
      const originalBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = (url, data) => report("sendBeacon", url) ? false : originalBeacon(url, data);
    }
    if (navigator.serviceWorker && typeof navigator.serviceWorker.register === "function") {
      const originalRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
      Object.defineProperty(navigator.serviceWorker, "register", {
        configurable: false,
        writable: false,
        value: (url, options) => report("serviceWorker.register", url) ? Promise.reject(blockedError()) : originalRegister(url, options),
      });
    }
    const originalOpen = globalThis.open.bind(globalThis);
    globalThis.open = (url, ...rest) => report("window.open", url) ? null : originalOpen(url, ...rest);
    for (const [constructorName, property, mechanism] of [
      ["HTMLScriptElement", "src", "script"], ["HTMLIFrameElement", "src", "frame"],
      ["HTMLImageElement", "src", "image"], ["HTMLMediaElement", "src", "media"],
      ["HTMLSourceElement", "src", "source"], ["HTMLLinkElement", "href", "link"],
    ]) {
      const Constructor = globalThis[constructorName];
      const descriptor = Constructor && Object.getOwnPropertyDescriptor(Constructor.prototype, property);
      if (!descriptor?.get || !descriptor?.set) continue;
      Object.defineProperty(Constructor.prototype, property, {
        configurable: false,
        enumerable: descriptor.enumerable,
        get() { return descriptor.get.call(this); },
        set(value) {
          const hint = constructorName === "HTMLLinkElement" && /(?:^|\s)(?:preconnect|dns-prefetch)(?:\s|$)/i.test(this.rel ?? "");
          if (hint) reportedHints.add(this);
          if (!report(hint ? "resource-hint" : mechanism, value)) descriptor.set.call(this, value);
        },
      });
    }
    const inspectHint = (node) => {
      if (!(node instanceof HTMLLinkElement) || reportedHints.has(node)) return;
      if (!/(?:^|\s)(?:preconnect|dns-prefetch)(?:\s|$)/i.test(node.rel ?? "")) return;
      reportedHints.add(node);
      report("resource-hint", node.href);
    };
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes") inspectHint(record.target);
        for (const node of record.addedNodes ?? []) {
          inspectHint(node);
          for (const nested of node.querySelectorAll?.('link[rel~="preconnect"],link[rel~="dns-prefetch"]') ?? []) inspectHint(nested);
        }
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["rel", "href"] });
    addEventListener("DOMContentLoaded", () => {
      for (const node of document.querySelectorAll('link[rel~="preconnect"],link[rel~="dns-prefetch"]')) inspectHint(node);
    }, { once: true });
  }, { reportToken });

  await context.route("**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === server.origin) {
      try {
        const validated = server.validateRequest(url.href);
        localRequests.push({ url: url.href, route: validated.route, resourceType: request.resourceType(), phase: scope.phase, action: scope.action });
        return route.continue();
      } catch (error) {
        localViolations.push({ url: url.href, reason: error.message, phase: scope.phase, action: scope.action });
        return route.abort("blockedbyclient");
      }
    }
    record({ mechanism: request.resourceType() === "document" ? "navigation" : request.resourceType(), url: url.href });
    return route.abort("blockedbyclient");
  });
  assert.equal(typeof context.routeWebSocket, "function", `${engine}: trusted WebSocket blocker is unavailable`);
  await context.routeWebSocket("**", (socket) => {
    record({ mechanism: "WebSocket", url: socket.url() });
    socket.close({ code: 1008, reason: "external network blocked" });
  });
  context.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === server.origin) {
      const route = url.pathname.replace(/^\/+/, "") || "index.html";
      localResponses.push({ url: url.href, route, status: response.status() });
      if (response.status() !== 200) localViolations.push({ url: url.href, reason: `trusted local response status ${response.status()}`, phase: scope.phase, action: scope.action });
    }
  });

  return { flowAttempts, controlAttempts, localRequests, localResponses, localViolations, setScope };
}

async function waitForControlAttempt(policy, action, before) {
  await bounded(`network control ${action}`, 3000, async () => {
    while (policy.controlAttempts.length === before) await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  });
  const observed = policy.controlAttempts.slice(before);
  assert.ok(observed.length > 0, `trusted network control was not observed: ${action}`);
  return observed;
}

async function runNetworkControl(page, policy, engine, action, origin, probeId) {
  const url = action === "WebSocket" ? "wss://f2-gov-09.invalid/socket" : `https://f2-gov-09.invalid/${encodeURIComponent(action)}`;
  policy.setScope({ phase: "control-probe", action, route: "about:blank", viewport: "control" });
  const before = policy.controlAttempts.length;
  if (action === "consent-loader") {
    policy.setScope({ phase: "control-probe", action, route: "index.html", viewport: "control" });
    await page.goto(`${origin}/index.html`, { waitUntil: "load" });
    await page.evaluate(() => localStorage.setItem("branct_consent", JSON.stringify({ status: "granted", version: "v1" })));
    await page.reload({ waitUntil: "load" }).catch(() => {});
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
    if (action === "serviceWorker.register") await page.goto(`${origin}/index.html`, { waitUntil: "load" });
    else await page.goto("about:blank");
  }
  if (["consent-loader", "form-submit"].includes(action)) {
    const observed = await waitForControlAttempt(policy, action, before);
    assertExpectedNetworkControl(observed, engine, action, probeId);
    await page.goto("about:blank");
    return { action, status: "BLOCKED_AND_RECORDED", probeId, observed };
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
  const observed = await waitForControlAttempt(policy, action, before);
  assertExpectedNetworkControl(observed, engine, action, probeId);
  return { action, status: "BLOCKED_AND_RECORDED", probeId, observed };
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
        const raw = await page.evaluate(selectorMetrics);
        const observation = { route, viewport, conclusion: "CONCLUSIVE", ...raw };
        observations.push(observation);
        evidence.push(evidenceEnvelope(request, request.matrixDigest, engine, "observation", route, viewport, "measure-responsive", observation, raw.overflow || raw.smallTargets.length ? "FAIL" : "PASS"));
      }
    }
    for (const entry of menuAuthority.entries) {
      networkPolicy.setScope({ phase: "measured-flow", action: "menu-sequence", route: entry.route, viewport: entry.viewport });
      const result = await measureMenuCase(page, server.origin, entry, matrix.viewports[entry.viewport], actions, networkPolicy.setScope);
      const semanticResult = menuPass(result) ? "PASS" : "FAIL";
      menuResults.push({ evidenceId: entry.evidenceId, route: entry.route, viewport: entry.viewport, actionSequence: entry.actionPhases, semanticResult, measuredResult: result });
      evidence.push(evidenceEnvelope(request, request.matrixDigest, engine, "menu", entry.route, entry.viewport, entry.actionPhases.join("+"), { actionSequence: entry.actionPhases, measuredResult: result }, semanticResult));
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    networkPolicy.setScope({ phase: "measured-flow", action: "reduced-motion", route: "index.html", viewport: "390x844" });
    await navigate(page, server.origin, "index.html", "390x844", matrix.viewports["390x844"]);
    const reducedMotion = await page.evaluate(() => {
      const element=document.querySelector('.mobile-drawer,.mobile-toggle'), style=element?getComputedStyle(element):null;
      const durations=(style?.transitionDuration||'0s').split(',').map((value)=>value.trim().endsWith('ms')?parseFloat(value):parseFloat(value)*1000);
      return { matches:matchMedia('(prefers-reduced-motion: reduce)').matches, maxDurationMs:Math.max(0,...durations.filter(Number.isFinite)) };
    });
    assertNoObservedExternalAttempts([{ engine, networkIsolation: { flowAttempts: networkPolicy.flowAttempts } }]);
    assert.deepEqual(networkPolicy.localViolations, [], `${engine}: trusted local request violation observed`);
    await page.goto("about:blank");
    await context.close();
    measuredContextClosed = true;
    const controls = [];
    for (const action of NETWORK_CONTROL_ACTIONS) {
      const probeId = sha256(canonicalJson({ baseSha: request.baseSha, headSha: request.headSha, payloadDigest: request.payloadDigest, engine, action }));
      const probeContext = await browser.newContext({ serviceWorkers: "block" });
      try {
        const probePolicy = await installRuntimeNetworkPolicy(probeContext, server, engine, "control-probe", probeId);
        const probePage = await probeContext.newPage();
        controls.push(await runNetworkControl(probePage, probePolicy, engine, action, server.origin, probeId));
        assert.deepEqual(probePolicy.localViolations, [], `${engine}: trusted control local request violation observed: ${action}`);
      } finally { await probeContext.close(); }
    }
    assert.deepEqual(controls.map(({ action, status }) => [action, status]), NETWORK_CONTROL_ACTIONS.map((action) => [action, "BLOCKED_AND_RECORDED"]), `${engine}: trusted runtime network controls are incomplete`);
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
  const networkPass = reports.every((report) => report.networkIsolation.controls.length === NETWORK_CONTROL_ACTIONS.length && report.networkIsolation.controls.every(({ status }) => status === "BLOCKED_AND_RECORDED") && report.networkIsolation.localI18nSuccessCount > 0);
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

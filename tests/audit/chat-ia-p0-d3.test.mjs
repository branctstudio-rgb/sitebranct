import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  createChatSession,
  isDevFeatureEnabled,
} from "../../docs/audit/phase-2/prototypes/chat-ia-p0-d3/chat-shell.mjs";
import {
  P0_D2_RESULTS,
  createMockGatewayAdapter,
} from "../../docs/audit/phase-2/prototypes/chat-ia-p0-d3/mock-adapter.mjs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const repository = fileURLToPath(root);
const prototypeRoot = join(repository, "docs", "audit", "phase-2", "prototypes", "chat-ia-p0-d3");
const evidenceRoot = join(dirname(dirname(repository)), "outputs", "chat-ia-p0-d3");

async function installExternalNetworkBlock(page, allowedOrigin, attempts) {
  await page.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== allowedOrigin) {
      attempts.push(requestUrl.href);
      await route.abort("blockedbyclient");
    } else await route.continue();
  });
}

test("feature flag is OFF by default and restricted to loopback DEV", () => {
  assert.equal(isDevFeatureEnabled(new URL("https://branct.com/")), false);
  assert.equal(isDevFeatureEnabled(new URL("http://localhost:4173/")), false);
  assert.equal(isDevFeatureEnabled(new URL("http://localhost:4173/?chat_ia_dev=1")), true);
  assert.equal(isDevFeatureEnabled(new URL("http://127.0.0.1:4173/?chat_ia_dev=1")), true);
  assert.equal(isDevFeatureEnabled(new URL("https://branct.com/?chat_ia_dev=1")), false);
});

test("mock adapter implements the narrow P0-D2 result envelope without network", async () => {
  const adapter = createMockGatewayAdapter({ latencyMs: 0 });
  const result = await adapter.send({ text: "Olá", history: [], locale: "pt-PT" });
  assert.equal(result.resultado, "resposta");
  assert.equal(result.resposta.autor, "chat_ia");
  assert.equal(result.resposta.locale, "pt-PT");
  assert.match(result.request_id, /^mock-/);
  assert.deepEqual(P0_D2_RESULTS, ["resposta", "recusa_seguranca", "entrada_inconclusiva", "timeout", "falha_provedor", "cancelado", "replay"]);
});

test("session history is memory-only and cancellation/error states are explicit", async () => {
  const adapter = createMockGatewayAdapter({ latencyMs: 25 });
  const session = createChatSession({ adapter, locale: "pt-BR" });
  const pending = session.send("mensagem sintética");
  assert.equal(session.snapshot().status, "loading");
  session.cancel();
  await pending;
  assert.equal(session.snapshot().status, "cancelled");
  assert.equal(session.snapshot().messages.length, 1);

  const failing = createChatSession({ adapter: createMockGatewayAdapter({ latencyMs: 0, fail: true }), locale: "pt-BR" });
  await failing.send("falha sintética");
  assert.equal(failing.snapshot().status, "error");
  assert.ok(failing.snapshot().fallback);
});

test("every P0-D2 non-response result maps to an explicit non-ready state", async () => {
  const expected = {
    recusa_seguranca: "blocked",
    entrada_inconclusiva: "inconclusive",
    timeout: "timeout",
    falha_provedor: "error",
    cancelado: "cancelled",
    replay: "replay",
  };
  for (const [resultado, status] of Object.entries(expected)) {
    const adapter = { send: async () => ({ request_id: "synthetic", resultado }) };
    const session = createChatSession({ adapter, locale: "pt-BR" });
    await session.send("mensagem sintética");
    assert.equal(session.snapshot().status, status, `${resultado} must not become ready`);
    assert.notEqual(session.snapshot().fallback, null, `${resultado} must expose a safe fallback`);
  }
  const unknown = createChatSession({ adapter: { send: async () => ({ request_id: "synthetic", resultado: "inventado" }) }, locale: "pt-BR" });
  await unknown.send("mensagem sintética");
  assert.equal(unknown.snapshot().status, "error");
});

test("contact consent is explicit, refusal persists for the session, and no CRM write exists", () => {
  const session = createChatSession({ adapter: createMockGatewayAdapter({ latencyMs: 0 }), locale: "pt-BR" });
  assert.equal(session.snapshot().contact.state, "not_asked");
  assert.throws(() => session.createLeadDraft({ name: "Pessoa Sintética" }), /consent/i);
  session.refuseContact();
  assert.equal(session.snapshot().contact.state, "refused");
  assert.equal(session.canAskForContact(), false);
  assert.throws(() => session.acceptContact(), /refused/i);

  const accepted = createChatSession({ adapter: createMockGatewayAdapter({ latencyMs: 0 }), locale: "pt-BR" });
  accepted.acceptContact();
  const draft = accepted.createLeadDraft({ name: "Pessoa Sintética", channel: "email-sintetico" });
  assert.equal(draft.decision, "PROPOSTA_LEAD");
  assert.equal(draft.destination, "edi-fronteira-simulada");
  assert.equal(draft.nenhum_lead_real_criado, true);
  accepted.withdrawContact();
  assert.equal(accepted.snapshot().leadDraft, null);
  assert.equal(accepted.canAskForContact(), false);
});

test("prototype markup and styles preserve accessibility, motion and zero-network constraints", async () => {
  const [html, css, shell, adapter, testSource] = await Promise.all([
    read("docs/audit/phase-2/prototypes/chat-ia-p0-d3/index.html"),
    read("docs/audit/phase-2/prototypes/chat-ia-p0-d3/chat-shell.css"),
    read("docs/audit/phase-2/prototypes/chat-ia-p0-d3/chat-shell.mjs"),
    read("docs/audit/phase-2/prototypes/chat-ia-p0-d3/mock-adapter.mjs"),
    read("tests/audit/chat-ia-p0-d3.test.mjs"),
  ]);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /data-chat-close/);
  assert.match(css, /min-(?:inline-size|width):\s*44px/);
  assert.match(css, /min-(?:block-size|height):\s*44px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /(?:src|href)=["']https?:/i);
  assert.doesNotMatch(css, /url\(\s*["']?https?:/i);
  assert.doesNotMatch(shell + adapter, /localStorage|sessionStorage|indexedDB|XMLHttpRequest|WebSocket|EventSource|sendBeacon|serviceWorker|fetch\s*\(|import\s*\(\s*["']https?:|window\.open|location\.(?:assign|replace)/);
  assert.doesNotMatch(shell + adapter, /console\.(?:log|info|debug).*message/i);
  assert.match(testSource, /page\.route\("\*\*\/\*"/);
  assert.match(testSource, /externalAttempts/);
});

test("contract records provenance and forbids real integration", async () => {
  const contract = JSON.parse(await read("fixtures/audit/chat-ia-p0-d3-contract.json"));
  assert.equal(contract.feature_flag.default, "OFF");
  assert.equal(contract.source.commit, "0e072a778bd6718d23340a5d576669fef78ae73b");
  assert.equal(contract.adapter.transport, "mock-local-only");
  assert.equal(contract.integrations.crm, "FORBIDDEN");
  assert.equal(contract.integrations.production, "FORBIDDEN");
  assert.equal(contract.storage.persistent, "FORBIDDEN");
});

test("real-browser responsive and accessibility matrix", { skip: process.env.CHAT_IA_BROWSER_QA !== "1", timeout: 180_000 }, async (context) => {
  const { chromium, firefox, webkit } = await import(process.env.CHAT_IA_PLAYWRIGHT_MODULE ?? "playwright");
  const contentTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".mjs": "text/javascript; charset=utf-8" };
  const server = createServer(async (request, response) => {
    try {
      const relative = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).replace(/^\/+/, "") || "index.html";
      const target = normalize(join(prototypeRoot, relative));
      if (!target.startsWith(prototypeRoot)) throw new Error("outside prototype");
      response.writeHead(200, { "content-type": contentTypes[extname(target)] ?? "application/octet-stream" });
      response.end(await readFile(target));
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const viewports = [
    { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 1024 },
    { width: 1024, height: 768 }, { width: 1440, height: 900 }, { width: 320, height: 568 },
  ];
  const allEngines = { chromium, firefox, webkit };
  const selectedEngine = process.env.CHAT_IA_ENGINE;
  const engines = selectedEngine ? { [selectedEngine]: allEngines[selectedEngine] } : allEngines;
  assert.ok(Object.values(engines).every(Boolean), `unknown browser engine: ${selectedEngine}`);
  await mkdir(evidenceRoot, { recursive: true });

  for (const [engineName, engine] of Object.entries(engines)) {
    const progress = (stage) => process.stderr.write(`[chat-ia-browser-qa] ${engineName} ${stage}\n`);
    progress("launch");
    const browser = await engine.launch({ headless: true });
    progress("launched");
    try {
      for (const viewport of viewports) {
      progress(`${viewport.width}x${viewport.height}:start`);
      const page = await browser.newPage({ viewport, reducedMotion: "reduce", serviceWorkers: "block" });
      const externalAttempts = [];
      await page.addInitScript(() => {
        window.__externalPolicyViolations = [];
        addEventListener("securitypolicyviolation", (event) => window.__externalPolicyViolations.push(event.blockedURI));
      });
      await installExternalNetworkBlock(page, new URL(baseUrl).origin, externalAttempts);
      await page.goto(baseUrl);
      assert.equal(await page.locator("[data-chat-root]").isHidden(), true, `${engineName}: flag must default OFF`);
      await page.goto(`${baseUrl}/?chat_ia_dev=1`);
      const launcher = page.locator("[data-chat-open]");
      await launcher.click();
      assert.equal(await page.locator("[data-chat-dialog]").isVisible(), true);
      assert.equal(await launcher.isDisabled(), true, `${engineName}: launcher must be disabled while modal is open`);
      assert.equal(await page.locator("main").evaluate((element) => element.inert), true);
      assert.equal(await page.locator("[data-chat-close]").evaluate((element) => element === document.activeElement), true);
      const dimensions = await page.locator("button").evaluateAll((buttons) => buttons.filter((button) => button.checkVisibility()).map((button) => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
      assert.ok(dimensions.every(({ width, height }) => width >= 44 && height >= 44), `${engineName} ${viewport.width}x${viewport.height}: touch target below 44px`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 0, `${engineName} ${viewport.width}x${viewport.height}: horizontal overflow ${overflow}`);
      assert.deepEqual(externalAttempts, [], `${engineName} ${viewport.width}x${viewport.height}: external request attempted`);
      assert.deepEqual(await page.evaluate(() => window.__externalPolicyViolations), [], `${engineName} ${viewport.width}x${viewport.height}: CSP recorded an external attempt`);
      await page.screenshot({ path: join(evidenceRoot, `${engineName}-${viewport.width}x${viewport.height}.png`), fullPage: true });
      await page.keyboard.press("Escape");
      assert.equal(await launcher.evaluate((element) => element === document.activeElement), true);
        await page.close();
        progress(`${viewport.width}x${viewport.height}:done`);
      }

      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
      const externalAttempts = [];
      await page.addInitScript(() => {
        window.__externalPolicyViolations = [];
        addEventListener("securitypolicyviolation", (event) => window.__externalPolicyViolations.push(event.blockedURI));
      });
      await installExternalNetworkBlock(page, new URL(baseUrl).origin, externalAttempts);
      await page.goto(`${baseUrl}/?chat_ia_dev=1`);
      await page.locator("[data-chat-open]").click();
      await page.locator("[data-contact-refuse]").click();
      assert.equal(await page.locator("[data-contact-consent]").isHidden(), true, `${engineName}: refused consent must persist`);
      await page.reload();
      await page.locator("[data-chat-open]").click();
      await page.locator("[data-contact-accept]").click();
      assert.equal(await page.locator("[data-contact-form]").isVisible(), true);
      assert.equal(await page.evaluate(() => document.activeElement?.checkVisibility()), true, `${engineName}: focus must move out of hidden consent subtree`);
      await page.locator("[data-contact-form] button[type=submit]").click();
      await assert.doesNotReject(() => page.locator("[data-lead-draft]").waitFor({ state: "visible" }));
      await page.locator("[data-contact-withdraw]").click();
      assert.equal(await page.locator("[data-lead-draft]").isHidden(), true);
      assert.deepEqual(externalAttempts, [], `${engineName}: consent flow attempted external network`);
      await page.evaluate(() => {
        const probe = document.createElement("img");
        probe.src = "https://network-control.invalid/pixel.png";
        document.body.append(probe);
      });
      await page.waitForTimeout(50);
      const policyViolations = await page.evaluate(() => window.__externalPolicyViolations);
      assert.deepEqual(externalAttempts, [], `${engineName}: CSP must block the control before routing`);
      assert.deepEqual(policyViolations, ["https://network-control.invalid/pixel.png"], `${engineName}: blocked external control was not recorded`);
      await page.close();

      const routeControl = await browser.newPage({ serviceWorkers: "block" });
      const routedControls = [];
      const routeFailures = [];
      routeControl.on("requestfailed", (request) => routeFailures.push({ url: request.url(), reason: request.failure()?.errorText ?? "" }));
      await installExternalNetworkBlock(routeControl, "null", routedControls);
      await routeControl.setContent('<img src="https://runtime-block-control.invalid/pixel.png" alt="">');
      await routeControl.waitForFunction(() => document.querySelector("img")?.complete === true);
      assert.deepEqual(routedControls, ["https://runtime-block-control.invalid/pixel.png"], `${engineName}: runtime interceptor did not observe the control`);
      assert.equal(routeFailures.length, 1, `${engineName}: runtime interceptor did not fail the control request exactly once`);
      assert.equal(routeFailures[0].url, routedControls[0]);
      assert.match(routeFailures[0].reason, /blocked|cancel/i, `${engineName}: runtime interceptor did not prove a local block`);
      await routeControl.close();
      progress("consent:done");
    } finally {
      await browser.close();
      progress("closed");
    }
  }
});

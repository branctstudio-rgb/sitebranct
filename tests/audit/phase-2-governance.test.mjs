import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const base = process.env.F2_DIFF_BASE ?? "59b060a871a0f55824c896caae6cb64188781f98";
const read = (path) => readFile(new URL(path, root), "utf8");
const readJson = async (path) => JSON.parse(await read(path));
const luminance = (hex) => {
  const channels = hex.slice(1).match(/../g).map((value) => parseInt(value, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};
const contrast = (a, b) => {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

test("operational memory separates evidence from future intent", async () => {
  const memory = await read("CLAUDE.md");
  for (const heading of ["Estado atual comprovado", "Decisões aprovadas", "Propostas futuras", "NOT_VERIFIED", "Funcionalidades inexistentes"]) {
    assert.match(memory, new RegExp(`## ${heading}`), heading);
  }
  assert.match(memory, /Nenhum agente pode tratar planos, protótipos ou documentação futura como funcionalidade existente/i);
  assert.doesNotMatch(memory, /Páginas antigas[^\n]*dark/i);
  assert.doesNotMatch(memory, /Home[^\n]*hero 3D/i);
  assert.doesNotMatch(memory, /blog\.html, servicos\.html\s+# Stubs/i);
  assert.doesNotMatch(memory, /Captura de leads via Supabase/i);
});

test("visual constitution exposes complete and non-contradictory tokens", async () => {
  const [contract, constitution, currentCss] = await Promise.all([
    readJson("docs/audit/phase-2/f2-00-contract.json"),
    read("docs/audit/phase-2/visual-constitution.md"),
    read("src/css/branct.css"),
  ]);
  assert.equal(contract.schemaVersion, 1);
  assert.deepEqual(contract.viewports, ["1440x900", "1024x768", "768x1024", "390x844", "360x800"]);
  for (const group of ["typography", "colorRoles", "spacing", "containers", "breakpoints", "radii", "borders", "shadows", "layers", "motion"]) {
    assert.ok(contract.tokens[group] && Object.keys(contract.tokens[group]).length >= 2, `missing token group ${group}`);
  }
  for (const [group, values] of Object.entries(contract.tokens)) {
    const keys = Object.keys(values);
    assert.equal(new Set(keys).size, keys.length, `duplicate token in ${group}`);
    for (const [key, value] of Object.entries(values)) assert.notEqual(String(value).trim(), "", `${group}.${key}`);
  }
  assert.equal(contract.accessibility.minimum, "WCAG 2.1 AA");
  assert.equal(contract.accessibility.target, "WCAG 2.2 AA");
  assert.equal(contract.motion.reducedMotionEquivalentContent, true);
  for (const key of ["weight-regular", "size-display", "leading-display", "tracking-display"]) assert.ok(contract.tokens.typography[key], key);
  assert.doesNotMatch(contract.tokens.typography["size-display"], /\s\/\s/, "typography properties must be independently consumable");
  for (const key of ["on-agency-action", "on-action-disabled", "agency-action-hover", "agency-action-disabled", "on-crm-action", "crm-action-hover", "crm-action-disabled", "success-surface", "warning-surface", "danger-surface"]) assert.ok(contract.tokens.colorRoles[key], key);
  assert.deepEqual(contract.tokenGovernance.currentAliases, {
    hairline:"--line", "radius-sm":"--r-sm", "radius-md":"--r-md", "radius-lg":"--r-lg", "radius-xl":"--r-xl",
    "duration-fast":"--dur-fast", "duration-standard":"--dur", "duration-emphasis":"--dur-slow",
    "navigation-wide-min":"literal 940px media query", "compact-min":"literal 720px media query",
  });
  for (const [foreground, background] of [["on-agency-action", "agency-action"], ["on-crm-action", "crm-action"], ["on-action-disabled", "agency-action-disabled"], ["success", "success-surface"], ["warning", "warning-surface"], ["danger", "danger-surface"]]) {
    assert.ok(contrast(contract.tokens.colorRoles[foreground], contract.tokens.colorRoles[background]) >= 4.5, `${foreground}/${background} contrast`);
  }
  for (const [key, pattern] of Object.entries({
    hairline:/--line:\s*#E8E6E1/i, "radius-sm":/--r-sm:\s*8px/i, "radius-md":/--r-md:\s*12px/i,
    "radius-lg":/--r-lg:\s*18px/i, "radius-xl":/--r-xl:\s*26px/i,
    "duration-fast":/--dur-fast:\s*150ms/i, "duration-standard":/--dur:\s*250ms/i, "duration-emphasis":/--dur-slow:\s*450ms/i,
  })) assert.match(currentCss, pattern, `current token mapping ${key}`);
  for (const value of Object.values(contract.tokens.typography).filter((value) => /^(clamp|[\d.]+(rem|em|px))/.test(value))) assert.match(value, /^(clamp\([^;{}]+\)|[\d.]+(rem|em|px))$/, value);
  for (const term of ["sem aparência de template", "imagens reais", "z-index", "prefers-reduced-motion", "3D", "orçamento de movimento"]) {
    assert.match(constitution, new RegExp(term, "i"), term);
  }
});

test("essential components define variants, states and safeguards", async () => {
  const [contract, catalog] = await Promise.all([
    readJson("docs/audit/phase-2/f2-00-contract.json"),
    read("docs/audit/phase-2/component-catalog.md"),
  ]);
  const required = ["header-navigation", "mobile-menu", "buttons-ctas", "cards", "forms", "media-frames", "pricing-offers", "tabs-accordions", "badges-status", "footer", "loading-empty-error-success-blocked"];
  assert.deepEqual(contract.components.map((item) => item.id), required);
  for (const component of contract.components) {
    for (const property of ["variants", "states", "accessibility", "responsive", "antiTemplate"]) {
      assert.ok(Array.isArray(component[property]) && component[property].length > 0, `${component.id}.${property}`);
    }
    assert.match(catalog, new RegExp(`## .*${component.name}`, "i"), component.name);
  }
  for (const state of ["loading", "empty", "error", "success", "blocked", "focus-visible", "disabled"]) assert.match(catalog, new RegExp(state, "i"));
  for (const current of ["consent-gate", "language-listbox", "services-disclosure", "case-preview", "lazy-video", "optional-effect"]) assert.match(catalog, new RegExp(current, "i"));
  assert.match(catalog, /três ou mais secções consecutivas/i);
});

test("governance reports unprotected main and leaves the A/B decision human", async () => {
  const [contract, governance] = await Promise.all([
    readJson("docs/audit/phase-2/f2-00-contract.json"),
    read("docs/audit/phase-2/governance-decision.md"),
  ]);
  assert.equal(contract.governance.mainTechnicallyProtected, false);
  assert.equal(contract.governance.decision, "PENDING_HUMAN_DECISION");
  assert.deepEqual(contract.governance.routes, ["A_TECHNICAL_PROTECTION", "B_COMPENSATING_PROCESS"]);
  for (const control of ["draft PR", "isolated branch and worktree", "no direct push to main", "green CI on exact head", "independent review", "human approval bound to head and base", "approval invalidated when head or base changes", "normal merge only", "preserve branch", "post-merge confirmation", "documented rollback", "deploy protection retained", "production blocked by default"]) {
    assert.ok(contract.governance.compensatingControls.includes(control), control);
  }
  assert.match(governance, /Branch not protected/i);
  assert.match(governance, /Via A/);
  assert.match(governance, /Via B/);
  assert.match(governance, /Conselho[^\n]*não escolhe|decisão[^\n]*pendente/i);
});

test("F2-01 is measurable, cross-viewport and explicitly not executed", async () => {
  const [contract, specification, plan] = await Promise.all([
    readJson("docs/audit/phase-2/f2-00-contract.json"),
    read("docs/audit/phase-2/f2-01-specification.md"),
    read("docs/audit/phase-2/f2-01-implementation-plan.md"),
  ]);
  assert.deepEqual(contract.nextMission.baseline, { routes:12, viewports:5, overflowRoutes:9, viewportWidth:390, observedWidth:417, mobileTargetsUnder44:{ min:3, max:28 } });
  for (const criterion of ["zero horizontal overflow on 12 routes", "interactive targets at least 44x44 CSS px", "keyboard-operable header and mobile menu", "visible focus", "aria-expanded synchronized", "Escape closes menu", "focus returns to trigger", "body scroll lock when required", "no hidden content", "no narrative changes", "no new console errors", "reduced motion support", "before and after reproducible evidence"]) {
    assert.ok(contract.nextMission.acceptanceCriteria.includes(criterion), criterion);
  }
  assert.deepEqual(contract.nextMission.browserStatus, { chromium:"REQUIRED", firefox:"NOT_VERIFIED", webkit:"NOT_VERIFIED" });
  assert.equal(contract.complianceDebt.status, "OPEN_NOT_VERIFIED");
  assert.deepEqual(contract.complianceDebt.liveClaimFiles, ["website-premium.html", "automacao-ia.html"]);
  for (const viewport of contract.viewports) assert.match(specification, new RegExp(viewport.replace("x", "[×x]")));
  assert.match(specification, /F2-01[^\n]*não[^\n]*autorizada|não autoriza[^\n]*execução/i);
  assert.match(plan, /RED→GREEN/);
  assert.match(plan, /rollback/i);
  assert.match(plan, /gate humano/i);
  assert.match(plan, /fronteira[^\n]*design system/i);
  for (const oracle of ["scrollWidth <= document.documentElement.clientWidth", "diff --word-diff=porcelain", "contraste ≥3:1", "Enter e Space", "prefers-reduced-motion: reduce"]) assert.match(specification, new RegExp(oracle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  assert.match(specification, /não pode ser fundida sob autoridade offline/i);
  assert.match(plan, /HTML\/CSS\/JS[^\n]*acionam FTP/i);
});

test("F2-00 stays offline and cannot mutate live or delivery paths", async () => {
  const contract = await readJson("docs/audit/phase-2/f2-00-contract.json");
  assert.deepEqual(contract.permissions, {
    livePages:false, liveAssets:false, deployWorkflow:false, publishManifest:false,
    workflowDispatch:false, ftp:false, secrets:false, production:false,
    integrations:false, phase2Implementation:false, merge:false,
  });
  const changed = execFileSync("git", ["diff", "--name-only", base], { encoding:"utf8" }).trim().split(/\r?\n/).filter(Boolean);
  assert.ok(changed.length > 0);
  const allowed = /^(CLAUDE\.md|docs\/audit\/phase-2\/.*|tests\/audit\/(phase-2-governance\.test|site-audit\.test)\.mjs)$/;
  assert.deepEqual(changed.filter((path) => !allowed.test(path)), []);
  for (const forbidden of [".github/workflows/deploy.yml", "deploy/publish-manifest.json"]) assert.ok(!changed.includes(forbidden));
});

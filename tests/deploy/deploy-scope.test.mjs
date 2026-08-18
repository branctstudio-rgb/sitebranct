import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../../.github/workflows/deploy.yml", import.meta.url);
const workflow = await readFile(workflowUrl, "utf8");

function pushPaths(yaml) {
  const lines = yaml.replace(/\r\n/g, "\n").split("\n");
  const push = lines.findIndex((line) => line === "  push:");
  if (push < 0) return [];
  const paths = lines.findIndex((line, index) => index > push && line === "    paths:");
  if (paths < 0) return null;
  const values = [];
  for (let index = paths + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^      - ["']?(.+?)["']?$/);
    if (!match) break;
    values.push(match[1]);
  }
  return values;
}

function matches(pattern, path) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("**", "\0").replaceAll("*", "[^/]*").replaceAll("\0", ".*");
  return new RegExp(`^${escaped}$`).test(path);
}

function automaticDeploy(paths) {
  const filters = pushPaths(workflow);
  if (filters === null) return true;
  return paths.some((path) => filters.reduce((included, filter) => filter.startsWith("!") ? (matches(filter.slice(1), path) ? false : included) : (matches(filter, path) ? true : included), false));
}

const truthTable = [
  ["somente documentação", ["docs/audit/report.md"], false],
  ["somente testes", ["tests/audit/site-audit.test.mjs"], false],
  ["somente evidências", ["fixtures/audit/baseline-results.json"], false],
  ["HTML", ["index.html"], true],
  ["CSS", ["src/css/branct.css"], true],
  ["JavaScript", ["src/js/branct.js"], true],
  ["imagem", ["src/img/crm-dashboard.webp"], true],
  ["fonte", ["src/fonts/manrope-latin.woff2"], true],
  ["i18n", ["src/i18n/pt.json"], true],
  ["documentação + vivo", ["docs/audit/report.md", "website-premium.html"], true],
  ["workflow de auditoria", [".github/workflows/audit-offline.yml"], false],
  ["workflow de deploy", [".github/workflows/deploy.yml"], false],
  ["asset fonte excluído", ["src/img/video.mp4"], false],
];

test("push automático segue a tabela de verdade positiva", () => {
  for (const [name, paths, expected] of truthTable) {
    assert.equal(automaticDeploy(paths), expected, name);
  }
});

test("deploy manual controlado permanece disponível", () => {
  assert.equal(/^  workflow_dispatch:\s*$/m.test(workflow), true, "workflow_dispatch must exist");
  assert.equal(/github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/.test(workflow), true, "manual deploy must be restricted to main");
});

test("payload FTP permanece byte-equivalente e Actions ficam pinadas", () => {
  const marker = "      # O repo";
  const protectedPayload = workflow.slice(workflow.indexOf(marker)).replace(/\r\n/g, "\n");
  assert.equal(createHash("sha256").update(protectedPayload).digest("hex"), "7c4c0839fe38865b61aa4cef463788f163d3e8f8adefdbe59b4e2d4b4e0264ea");
  assert.equal(/uses:\s+actions\/(checkout|setup-node)@v\d/.test(workflow), false, "Actions must use immutable SHAs");
});

test("workflow separa verificação de PR do job que pode publicar", () => {
  assert.equal(/^  pull_request:\s*$/m.test(workflow), true, "pull_request verification trigger must exist");
  assert.equal(/github\.event_name == 'pull_request'/.test(workflow), true, "verification job must be PR-only");
  assert.equal(/github\.event_name == 'push' \|\| \(github\.event_name == 'workflow_dispatch'/.test(workflow), true, "deploy job must reject pull_request events");
});

test("lista positiva cobre todos os ficheiros vivos atuais", () => {
  const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split(/\r?\n/);
  const live = tracked.filter((path) => /^(?:[^/]+\.html|\.htaccess|robots\.txt|sitemap\.xml|src\/(?:css|js|fonts|i18n)\/|src\/img\/(?!video\.mp4$))/.test(path));
  assert.ok(live.length > 20);
  for (const path of live) assert.equal(automaticDeploy([path]), true, `live path omitted: ${path}`);
});

test("artefactos offline não contêm expressões de secrets", async () => {
  const secretExpression = ["$", "{{", " secrets."].join("");
  const files = [new URL(import.meta.url), new URL("../../docs/deploy-protection/scope-matrix.md", import.meta.url)];
  for (const file of files) assert.equal((await readFile(file, "utf8")).includes(secretExpression), false);
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, lstat, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildPayload, EXPECTED_POLICY, readPushPaths } from "../../scripts/deploy/build-publish-payload.mjs";

const root = path.resolve(new URL("../..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const workflow = await readFile(path.join(root, ".github/workflows/deploy.yml"), "utf8");
const manifestPath = path.join(root, "deploy/publish-manifest.json");
const expected = JSON.parse(await readFile(manifestPath, "utf8")).files;

function matches(pattern, candidate) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("**", "\0").replaceAll("*", "[^/]*").replaceAll("\0", ".*");
  return new RegExp(`^${escaped}$`).test(candidate);
}

function automaticDeploy(paths) {
  return paths.some((candidate) => EXPECTED_POLICY.reduce((included, rule) => rule.startsWith("!")
    ? (matches(rule.slice(1), candidate) ? false : included)
    : (matches(rule, candidate) ? true : included), false));
}

function pullRequestPaths(yaml) {
  const lines = yaml.replace(/\r\n/g, "\n").split("\n");
  const pullRequest = lines.indexOf("  pull_request:");
  const paths = lines.findIndex((line, index) => index > pullRequest && line === "    paths:");
  const values = [];
  for (let index = paths + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^      - ["'](.+)["']$/);
    if (!match) break;
    values.push(match[1]);
  }
  return values;
}

function pullRequestVerification(changed) {
  const rules = pullRequestPaths(workflow);
  return changed.some((candidate) => rules.some((rule) => matches(rule, candidate)));
}

async function treeFiles(directory, prefix = "") {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await treeFiles(path.join(directory, entry.name), relative));
    else result.push(relative);
  }
  return result.sort();
}

async function withTempRepo(action) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "branct-deploy-test-"));
  const source = path.join(temp, "repo");
  const output = path.join(temp, "payload");
  await cp(root, source, { recursive: true, filter: (item) => path.basename(item) !== ".git" });
  try { await action({ source, output }); } finally { await rm(temp, { recursive: true, force: true }); }
}

test("gatilho automático segue a tabela de verdade", () => {
  const cases = [
    [["docs/audit/report.md"], false], [["tests/audit/test.mjs"], false], [["fixtures/audit/a.json"], false],
    [["index.html"], true], [["src/css/branct.css"], true], [["src/js/branct.js"], true],
    [["src/img/icon.svg"], true], [["src/fonts/manrope-latin.woff2"], true], [["unknown/file.bin"], false],
    [["docs/audit/report.md", "website-premium.html"], true], [[".github/workflows/audit-offline.yml"], false],
    [[".github/workflows/deploy.yml"], false], [["src/img/video.mp4"], false],
  ];
  for (const [paths, result] of cases) assert.equal(automaticDeploy(paths), result, paths.join(", "));
});

test("uma definição canónica governa gatilho e construtor", () => {
  assert.deepEqual(readPushPaths(workflow), EXPECTED_POLICY);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(workflow, /uses:\s+actions\/(?:checkout|setup-node)@v\d/);
});

test("staging real é exatamente o manifesto operacional", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "branct-payload-"));
  try {
    const actual = await buildPayload({ source: root, output: temp + "-out" });
    assert.deepEqual(actual, expected);
    assert.deepEqual(await treeFiles(temp + "-out"), expected);
    assert.equal((await lstat(temp + "-out")).isDirectory(), true);
  } finally {
    await rm(temp, { recursive: true, force: true });
    await rm(temp + "-out", { recursive: true, force: true });
  }
});

test("PR #2 projetada e caminhos internos ficam fora do payload", async () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/);
  const additions = ["tests/audit/site-audit.test.mjs", "fixtures/audit/baseline-results.json", "fixtures/audit/invalid-home-390x844.jpg", "docs/audit/report.md", ".github/workflows/audit-offline.yml", "node_modules/pkg/index.js", "unknown/private.txt"];
  await withTempRepo(async ({ source, output }) => {
    for (const relative of additions) {
      const target = path.join(source, relative);
      await writeFile(target, "offline", { recursive: false }).catch(async () => {
        await import("node:fs/promises").then(({ mkdir }) => mkdir(path.dirname(target), { recursive: true }));
        await writeFile(target, "offline");
      });
    }
    const actual = await buildPayload({ source, output, candidates: [...tracked, ...additions] });
    assert.deepEqual(actual, expected);
  });
});

test("falha fechada para ausências, duplicações e travessia", async () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/);
  await withTempRepo(async ({ source, output }) => {
    await assert.rejects(buildPayload({ source, output, candidates: tracked.filter((item) => item !== "index.html") }), /publish manifest mismatch/);
  });
  await withTempRepo(async ({ source, output }) => {
    await assert.rejects(buildPayload({ source, output, candidates: [...tracked, "index.html"] }), /duplicate path entry/);
  });
  await withTempRepo(async ({ source, output }) => {
    await assert.rejects(buildPayload({ source, output, candidates: [...tracked, "../escape.html"] }), /escapes repository/);
  });
});

test("falha fechada para qualquer symlink rastreado", async () => {
  if (process.platform === "win32") return;
  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/);
  await withTempRepo(async ({ source, output }) => {
    const link = path.join(source, "unknown-link.txt");
    await symlink(path.join(source, "robots.txt"), link);
    await assert.rejects(buildPayload({ source, output, candidates: [...tracked, "unknown-link.txt"] }), /symlink refused/);
  });
});

test("mirror usa apenas staging e preserva sincronização", () => {
  assert.match(workflow, /mirror --reverse --delete --verbose --parallel=5/);
  assert.match(workflow, /"\$\{RUNNER_TEMP\}\/branct-publish\/" \/domains\/branct\.com\/public_html\//);
  assert.doesNotMatch(workflow, /\s\.\/ \/domains\/branct\.com\/public_html\//);
  assert.match(workflow, /github\.event_name == 'pull_request'/);
  assert.match(workflow, /github\.event_name == 'push' \|\|/);
});

test("testes e documentação não contêm expressões de credenciais", async () => {
  const expression = ["$", "{{", " secrets."].join("");
  for (const file of [new URL(import.meta.url), new URL("../../docs/deploy-protection/scope-matrix.md", import.meta.url)]) {
    assert.equal((await readFile(file, "utf8")).includes(expression), false);
  }
});

test("ficheiro permitido novo exige atualização do manifesto", async () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/);
  await withTempRepo(async ({ source, output }) => {
    await writeFile(path.join(source, "novo.html"), "<!doctype html>");
    await assert.rejects(buildPayload({ source, output, candidates: [...tracked, "novo.html"] }), /manifest/i);
  });
});

test("remoção de ficheiro publicado exige atualização do manifesto", async () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/);
  await withTempRepo(async ({ source, output }) => {
    await rm(path.join(source, "src/css/main.css"));
    await assert.rejects(buildPayload({ source, output, candidates: tracked.filter((entry) => entry !== "src/css/main.css") }), /manifest/i);
  });
});

test("toda alteração viva isolada dispara verificação da PR", () => {
  const live = ["index.html", ".htaccess", "robots.txt", "sitemap.xml", "src/css/branct.css", "src/js/branct.js", "src/fonts/manrope-latin.woff2", "src/i18n/pt.json", "src/img/icon.svg", "src/img/video.mp4"];
  for (const candidate of live) assert.equal(pullRequestVerification([candidate]), true, candidate);
  assert.equal(pullRequestVerification(["deploy/publish-manifest.json"]), true, "operational manifest");
});

test("manifesto não pode autorizar caminho proibido nem duplicado", async () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/);
  await withTempRepo(async ({ source, output }) => {
    const manifestFile = path.join(source, "deploy/publish-manifest.json");
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    manifest.files.push("tests/deploy/deploy-scope.test.mjs");
    manifest.files.sort();
    await writeFile(manifestFile, JSON.stringify(manifest));
    await assert.rejects(buildPayload({ source, output, candidates: tracked }), /forbidden by policy/);
  });
  await withTempRepo(async ({ source, output }) => {
    const manifestFile = path.join(source, "deploy/publish-manifest.json");
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    manifest.files.push(manifest.files[0]);
    manifest.files.sort();
    await writeFile(manifestFile, JSON.stringify(manifest));
    await assert.rejects(buildPayload({ source, output, candidates: tracked }), /duplicate path/);
  });
});

test("manifesto ausente, ilegível ou com schema incorreto interrompe", async () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/);
  await withTempRepo(async ({ source, output }) => {
    await rm(path.join(source, "deploy/publish-manifest.json"));
    await assert.rejects(buildPayload({ source, output, candidates: tracked }), /manifest unreadable/);
  });
  await withTempRepo(async ({ source, output }) => {
    await writeFile(path.join(source, "deploy/publish-manifest.json"), "not-json");
    await assert.rejects(buildPayload({ source, output, candidates: tracked }), /manifest unreadable/);
  });
  await withTempRepo(async ({ source, output }) => {
    await writeFile(path.join(source, "deploy/publish-manifest.json"), JSON.stringify({ schemaVersion: 2, files: [] }));
    await assert.rejects(buildPayload({ source, output, candidates: tracked }), /schema invalid/);
  });
});

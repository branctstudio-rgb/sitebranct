import { execFileSync } from "node:child_process";
import { copyFile, lstat, mkdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_POLICY = Object.freeze([
  "*.html", ".htaccess", "robots.txt", "sitemap.xml",
  "src/css/**", "src/js/**", "src/fonts/**", "src/i18n/**",
  "src/img/**", "!src/img/video.mp4",
]);

export const REQUIRED_FILES = Object.freeze([
  ".htaccess", "index.html", "robots.txt", "sitemap.xml",
  "src/css/branct.css", "src/js/branct.js", "src/js/trial.js",
]);

export function readPushPaths(yaml) {
  const lines = yaml.replace(/\r\n/g, "\n").split("\n");
  const push = lines.indexOf("  push:");
  const paths = lines.findIndex((line, index) => index > push && line === "    paths:");
  if (push < 0 || paths < 0) throw new Error("missing push.paths policy");
  const values = [];
  for (let index = paths + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^      - ["'](.+)["']$/);
    if (!match) break;
    values.push(match[1]);
  }
  if (new Set(values).size !== values.length) throw new Error("duplicate canonical path rule");
  if (JSON.stringify(values) !== JSON.stringify(EXPECTED_POLICY)) throw new Error("canonical publish policy changed without builder approval");
  return values;
}

function matches(pattern, candidate) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("**", "\0").replaceAll("*", "[^/]*").replaceAll("\0", ".*");
  return new RegExp(`^${escaped}$`).test(candidate);
}

export function isPublished(rules, candidate) {
  return rules.reduce((included, rule) => rule.startsWith("!")
    ? (matches(rule.slice(1), candidate) ? false : included)
    : (matches(rule, candidate) ? true : included), false);
}

function normalizeCandidate(candidate) {
  if (typeof candidate !== "string" || candidate.includes("\0") || candidate.includes("\\")) throw new Error(`invalid path entry: ${candidate}`);
  const normalized = path.posix.normalize(candidate);
  if (!candidate || normalized !== candidate || path.posix.isAbsolute(candidate) || candidate === ".." || candidate.startsWith("../")) {
    throw new Error(`path escapes repository: ${candidate}`);
  }
  return normalized;
}

async function assertRegularInside(rootReal, relative) {
  let cursor = rootReal;
  for (const segment of relative.split("/")) {
    cursor = path.join(cursor, segment);
    const info = await lstat(cursor);
    if (info.isSymbolicLink()) throw new Error(`symlink refused: ${relative}`);
  }
  const resolved = await realpath(cursor);
  if (resolved !== rootReal && !resolved.startsWith(`${rootReal}${path.sep}`)) throw new Error(`path escapes repository: ${relative}`);
  const info = await lstat(resolved);
  if (!info.isFile()) throw new Error(`not a regular file: ${relative}`);
  return resolved;
}

export async function buildPayload({ source, output, candidates }) {
  const rootReal = await realpath(source);
  const outputAbsolute = path.resolve(output);
  if (outputAbsolute === rootReal || outputAbsolute.startsWith(`${rootReal}${path.sep}`)) throw new Error("output must be outside repository root");
  const workflow = await readFile(path.join(rootReal, ".github/workflows/deploy.yml"), "utf8");
  const rules = readPushPaths(workflow);
  const entries = candidates ?? execFileSync("git", ["-C", rootReal, "ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const normalized = entries.map(normalizeCandidate);
  const folded = normalized.map((entry) => entry.toLowerCase());
  if (new Set(folded).size !== folded.length) throw new Error("duplicate path entry");
  const resolvedFiles = new Map();
  for (const entry of normalized) resolvedFiles.set(entry, await assertRegularInside(rootReal, entry));
  const selected = normalized.filter((entry) => isPublished(rules, entry)).sort();
  for (const required of REQUIRED_FILES) if (!selected.includes(required)) throw new Error(`required publish file missing: ${required}`);
  await mkdir(outputAbsolute, { recursive: false });
  for (const relative of selected) {
    const sourceFile = resolvedFiles.get(relative);
    const destination = path.join(outputAbsolute, ...relative.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(sourceFile, destination);
  }
  return selected;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sourceIndex = process.argv.indexOf("--source");
  const outputIndex = process.argv.indexOf("--output");
  if (sourceIndex < 0 || outputIndex < 0) throw new Error("usage: --source <repo> --output <empty-path>");
  const payload = await buildPayload({ source: process.argv[sourceIndex + 1], output: process.argv[outputIndex + 1] });
  process.stdout.write(`${payload.join("\n")}\n`);
}

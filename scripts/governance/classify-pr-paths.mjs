import { appendFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const LIVE = new Set(["root-published", "html", "css", "javascript", "fonts", "translations", "images", "video"]);
const AUDIT_SAFE = (path) => /^(CLAUDE\.md|docs\/audit\/|fixtures\/audit\/|tests\/audit\/|\.github\/workflows\/(audit-offline|universal-pr-gate)\.yml$|scripts\/governance\/)/.test(path);
const GIT_STATUS = /^(?:A|M|D|T|[RC](?:100|0\d{2}))$/;

function assertSafePath(path) {
  if (typeof path !== "string" || !path || path.startsWith("/") || path.includes("\\") || path.includes("\0") || path.split("/").includes("..") || /^[A-Za-z]:/.test(path)) {
    throw new Error(`unsafe path: ${String(path)}`);
  }
}

function categoryOf(path) {
  if (/^(?:\.htaccess|robots\.txt|sitemap\.xml)$/.test(path)) return "root-published";
  if (/^docs\//.test(path) || /^(CLAUDE|AUDIT)\.md$/.test(path)) return "documentation";
  if (/^tests\//.test(path)) return "tests";
  if (/^fixtures\//.test(path)) return "fixtures";
  if (/^[^/]+\.html$/.test(path)) return "html";
  if (/^src\/css\//.test(path)) return "css";
  if (/^src\/js\//.test(path)) return "javascript";
  if (/^src\/fonts\//.test(path)) return "fonts";
  if (/^src\/i18n\//.test(path)) return "translations";
  if (/^src\/img\/.*\.(?:mp4|webm|mov)$/i.test(path)) return "video";
  if (/^src\/img\//.test(path)) return "images";
  if (/^\.github\/workflows\//.test(path)) return "workflow";
  if (path === "deploy/publish-manifest.json") return "manifest";
  if (/^(scripts\/deploy\/|tests\/deploy\/|docs\/deploy-protection\/)/.test(path)) return "deploy-internal";
  if (/^scripts\/governance\//.test(path)) return "gate-internal";
  return "unknown";
}

export function parseNameStatusZ(bytes) {
  const fields = Buffer.from(bytes).toString("utf8").split("\0");
  if (fields.at(-1) === "") fields.pop();
  const records = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (!GIT_STATUS.test(status)) throw new Error(`unsupported Git status: ${status}`);
    if (/^[RC]/.test(status)) {
      if (index + 1 >= fields.length) throw new Error(`malformed rename/copy record: ${status}`);
      records.push({ status, oldPath:fields[index++], path:fields[index++] });
    } else {
      if (index >= fields.length) throw new Error(`malformed path record: ${status}`);
      records.push({ status, path:fields[index++] });
    }
  }
  return records;
}

export function classifyRecords(records) {
  if (!Array.isArray(records) || records.length === 0) throw new Error("no changed paths");
  const seen = new Set();
  const paths = [];
  for (const record of records) {
    if (!record || !GIT_STATUS.test(record.status ?? "")) throw new Error(`unsupported Git status: ${record?.status}`);
    const recordPaths = /^[RC]/.test(record.status) ? [record.oldPath, record.path] : [record.path];
    for (const path of recordPaths) {
      assertSafePath(path);
      if (seen.has(path)) throw new Error(`duplicate path: ${path}`);
      seen.add(path);
      paths.push(path);
    }
  }
  const categories = [...new Set(paths.map(categoryOf))].sort();
  const unknownPaths = paths.filter((path) => categoryOf(path) === "unknown").sort();
  if (unknownPaths.length) return { checkEmitted:true, accepted:false, categories, suites:["fail-closed"], deploy:false, unknownPaths };
  const suites = new Set(["gate-contract", "governance-contracts", "deploy-protection"]);
  if (paths.every(AUDIT_SAFE)) suites.add("audit-contract");
  if (categories.some((category) => LIVE.has(category))) {
    suites.add("browser-baseline");
    suites.add("visual-evidence");
  }
  return { checkEmitted:true, accepted:true, categories, suites:[...suites].sort(), deploy:false, unknownPaths:[] };
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const input = arg("--input");
  if (!input) throw new Error("--input is required");
  const result = classifyRecords(parseNameStatusZ(await readFile(input)));
  const output = arg("--github-output");
  if (output) {
    const has = (suite) => result.suites.includes(suite) ? "true" : "false";
    await appendFile(output, [
      `accepted=${result.accepted}`,
      `run_audit=${has("audit-contract")}`,
      `run_browser=${has("browser-baseline")}`,
      `run_visual=${has("visual-evidence")}`,
      `classification=${JSON.stringify(result)}`,
      "",
    ].join("\n"));
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.accepted) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Universal gate classification failed: ${error.message}`);
    process.exitCode = 1;
  });
}

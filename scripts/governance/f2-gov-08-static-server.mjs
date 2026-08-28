import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { extname, resolve, sep } from "node:path";

const MIME = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
]);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function assertNoExternalResourceHints(bytes, route = "unknown") {
  const html = Buffer.isBuffer(bytes) ? bytes.toString("utf8") : String(bytes);
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = tag.match(/\brel\s*=\s*["']([^"']*)["']/i)?.[1]?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
    if (!rel.some((value) => value === "preconnect" || value === "dns-prefetch")) continue;
    const href = tag.match(/\bhref\s*=\s*["']([^"']*)["']/i)?.[1];
    assert.ok(href, `external resource hint is missing href: ${route}`);
    const parsed = new URL(href, "http://trusted-local.invalid/");
    assert.equal(parsed.origin, "http://trusted-local.invalid", `external resource hint before consent: ${route}`);
  }
}

function trustedTarget(root, route) {
  assert.equal(typeof route, "string", "trusted static route is absent");
  assert.ok(route.length > 0 && !route.includes("\0"), "trusted static route is invalid");
  assert.doesNotMatch(route, /(?:^|\/)\.\.?(?:\/|$)|\\|:|^\//, "trusted static route is unsafe");
  assert.match(route, /^[A-Za-z0-9._/-]+$/, "trusted static route is outside the portable grammar");
  const canonicalRoot = realpathSync(root);
  const target = resolve(canonicalRoot, ...route.split("/"));
  assert.ok(target.startsWith(`${canonicalRoot}${sep}`), "trusted static route escapes the candidate root");
  const metadata = lstatSync(target);
  assert.equal(metadata.isSymbolicLink(), false, "trusted static route is a symlink");
  assert.equal(metadata.isFile(), true, "trusted static route is not a regular file");
  return target;
}

export function readTrustedStaticRoute(root, route) {
  return readFileSync(trustedTarget(root, route), "utf8");
}

export function validateTrustedStaticRequest(requestUrl, origin, expectedFiles) {
  assert.equal(typeof requestUrl, "string", "trusted static request URL is absent");
  assert.equal(typeof origin, "string", "trusted static origin is absent");
  assert.ok(expectedFiles instanceof Map, "trusted candidate blob index is absent");
  assert.doesNotMatch(requestUrl, /\\|%(?:2e|2f|5c)|\/\.\.(?:\/|[?#]|$)/i, "trusted static request uses an encoded, traversal or non-portable path");
  const parsed = new URL(requestUrl);
  assert.equal(parsed.origin, origin, `trusted static request changed origin: ${parsed.origin}`);
  assert.equal(parsed.username, "", "trusted static request contains credentials");
  assert.equal(parsed.password, "", "trusted static request contains credentials");
  assert.equal(parsed.hash, "", "trusted static request fragment is forbidden");
  assert.doesNotMatch(parsed.pathname, /%/i, "trusted static request path must use canonical unencoded bytes");
  const route = parsed.pathname.replace(/^\/+/, "") || "index.html";
  const expected = expectedFiles.get(route);
  assert.ok(expected, `trusted static request is not an expected candidate blob: ${route}`);
  assert.match(expected.sha256 ?? "", /^[0-9a-f]{64}$/, `trusted candidate blob digest is invalid: ${route}`);
  return { route, expected, search: parsed.search };
}

export async function startTrustedStaticServer(root, expectedPayload, requestedPort = 4173) {
  const canonicalRoot = realpathSync(root);
  assert.ok(Array.isArray(expectedPayload) && expectedPayload.length > 0, "trusted candidate payload is absent");
  const expectedFiles = new Map();
  for (const entry of expectedPayload) {
    assert.ok(entry && typeof entry === "object", "trusted candidate payload entry is malformed");
    assert.equal(expectedFiles.has(entry.path), false, `trusted candidate payload path is duplicated: ${entry.path}`);
    expectedFiles.set(entry.path, { sha256: entry.sha256 });
  }
  const server = createServer((request, response) => {
    try {
      assert.equal(request.method, "GET", "trusted static server accepts GET only");
      const absolute = new URL(request.url, `http://${request.headers.host ?? "127.0.0.1"}`).href;
      const origin = `http://127.0.0.1:${server.address().port}`;
      const { route, expected } = validateTrustedStaticRequest(absolute, origin, expectedFiles);
      const target = trustedTarget(canonicalRoot, route);
      const body = readFileSync(target);
      assert.equal(sha256(body), expected.sha256, `trusted static candidate blob changed after materialization: ${route}`);
      if (extname(target).toLowerCase() === ".html") assertNoExternalResourceHints(body, route);
      response.writeHead(200, {
        "content-type": MIME.get(extname(target).toLowerCase()) ?? "application/octet-stream",
        "content-length": body.length,
        "cache-control": "no-store",
        "content-security-policy": "default-src 'self' data:; connect-src 'self'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; img-src 'self' data:; font-src 'self' data:; media-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
      });
      response.end(body);
    } catch (error) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      response.end(`blocked: ${error.message}`);
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object", "trusted static server address is unavailable");
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    validateRequest: (requestUrl) => validateTrustedStaticRequest(requestUrl, origin, expectedFiles),
    close: () => new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise())),
  };
}

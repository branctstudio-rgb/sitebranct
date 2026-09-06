import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
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

function trustedRangeError(message) {
  const error = new Error(`trusted byte range ${message}`);
  error.code = "ERR_TRUSTED_BYTE_RANGE";
  throw error;
}

export function resolveTrustedByteRange(header, size) {
  assert.ok(Number.isSafeInteger(size) && size > 0, "trusted byte range size is invalid");
  if (header === undefined) return null;
  if (typeof header !== "string") trustedRangeError("header is malformed");
  const match = /^bytes=([0-9]+)-([0-9]*)$/.exec(header);
  if (!match) trustedRangeError("syntax is invalid");
  const start = Number(match[1]);
  const end = match[2] === "" ? size - 1 : Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start || end >= size) trustedRangeError("is outside the verified blob");
  return { start, end, length: end - start + 1 };
}

function parseLinkAttributes(tag, route) {
  const opening = tag.match(/^<link\b/i);
  assert.ok(opening, `resource hint tag is malformed: ${route}`);
  const attributes = new Map();
  let cursor = opening[0].length;
  while (cursor < tag.length) {
    while (/\s/.test(tag[cursor] ?? "")) cursor += 1;
    if (tag[cursor] === ">") break;
    if (tag[cursor] === "/" && tag[cursor + 1] === ">") break;
    const nameStart = cursor;
    while (cursor < tag.length && !/[\s=/>]/.test(tag[cursor])) cursor += 1;
    assert.ok(cursor > nameStart, `resource hint attribute syntax is malformed: ${route}`);
    const name = tag.slice(nameStart, cursor).toLowerCase();
    while (/\s/.test(tag[cursor] ?? "")) cursor += 1;
    let value = "";
    if (tag[cursor] === "=") {
      cursor += 1;
      while (/\s/.test(tag[cursor] ?? "")) cursor += 1;
      assert.ok(cursor < tag.length && tag[cursor] !== ">", `resource hint attribute value is missing: ${route}`);
      const quote = tag[cursor] === '"' || tag[cursor] === "'" ? tag[cursor++] : null;
      const valueStart = cursor;
      if (quote) {
        while (cursor < tag.length && tag[cursor] !== quote) cursor += 1;
        assert.ok(cursor < tag.length, `resource hint quoted attribute is unterminated: ${route}`);
        value = tag.slice(valueStart, cursor);
        cursor += 1;
      } else {
        while (cursor < tag.length && !/[\s>]/.test(tag[cursor])) cursor += 1;
        value = tag.slice(valueStart, cursor);
        assert.ok(value.length > 0, `resource hint unquoted attribute value is missing: ${route}`);
      }
    }
    assert.equal(attributes.has(name), false, `resource hint attribute is duplicated: ${name} (${route})`);
    attributes.set(name, value);
  }
  return attributes;
}

export function assertNoExternalResourceHints(bytes, route = "unknown") {
  let html;
  try { html = Buffer.isBuffer(bytes) ? new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) : String(bytes); }
  catch { assert.fail(`resource hint HTML is not canonical UTF-8: ${route}`); }
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attributes = parseLinkAttributes(tag, route);
    const rawRel = attributes.get("rel") ?? "";
    assert.doesNotMatch(rawRel, /[&\0]/, `ambiguous resource hint rel is forbidden: ${route}`);
    const rel = rawRel.toLowerCase().split(/\s+/).filter(Boolean);
    if (!rel.some((value) => value === "preconnect" || value === "dns-prefetch")) continue;
    const href = attributes.get("href");
    assert.ok(href, `external resource hint is missing href: ${route}`);
    assert.doesNotMatch(href, /[&\0]/, `ambiguous resource hint href is forbidden: ${route}`);
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
  const requestLog = [];
  let activeWindow = null;
  const journalDigest = (records) => sha256(Buffer.from(JSON.stringify(records)));
  const continuationCookieName = "branct_trusted_continuation";
  const cookieValue = (header, name) => (header ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
  const windowRecords = (window) => requestLog.filter(({ windowId, authorized }) => windowId === window.windowId && authorized === true);
  const windowRejections = (window) => requestLog.filter(({ windowId, authorized }) => windowId === window.windowId && authorized === false);
  const server = createServer((request, response) => {
    const window = activeWindow;
    const headerAuthorized = window ? request.headers["x-branct-trusted-window-capability"] === window.capability : true;
    const continuationAuthorized = Boolean(window && !headerAuthorized && cookieValue(request.headers.cookie, continuationCookieName) === window.continuationCapability);
    const universe = window && (headerAuthorized || continuationAuthorized) ? (headerAuthorized ? "BROWSER_CORRELATED" : "SERVER_INTERNAL") : null;
    const record = {
      sequence: requestLog.length,
      windowId: window?.windowId ?? null,
      journalId: window ? sha256(Buffer.from(`${window.secret}:${requestLog.length}`)) : null,
      rejectionId: window ? sha256(Buffer.from(`${window.secret}:rejection:${requestLog.length}`)) : null,
      requestId: request.headers["x-branct-trusted-request-id"] ?? null,
      method: request.method,
      url: request.url,
      absoluteUrl: null,
      range: request.headers.range ?? null,
      rangeStart: null,
      rangeEnd: null,
      totalBytes: null,
      route: null,
      status: null,
      bytes: 0,
      finished: false,
      authorized: headerAuthorized || continuationAuthorized,
      universe,
      identityOwner: universe === "BROWSER_CORRELATED" ? "consumer" : universe === "SERVER_INTERNAL" ? "server" : null,
    };
    requestLog.push(record);
    try {
      if (window && ["SEALED", "VERIFIED", "REJECTED"].includes(window.state)) {
        window.state = "REJECTED";
        window.violation = `trusted server journal received a late request after seal: ${request.url}`;
        record.status = 409;
        response.once("finish", () => { record.finished = true; });
        response.writeHead(409, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
        response.end("blocked: trusted server journal is sealed");
        return;
      }
      const absolute = new URL(request.url, `http://${request.headers.host ?? "127.0.0.1"}`).href;
      record.absoluteUrl = absolute;
      const origin = `http://127.0.0.1:${server.address().port}`;
      const { route, expected } = validateTrustedStaticRequest(absolute, origin, expectedFiles);
      record.route = route;
      if (window && record.authorized !== true) {
        record.status = 403;
        response.once("finish", () => { record.finished = true; });
        response.writeHead(403, {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "x-branct-trusted-rejection-id": record.rejectionId,
        });
        response.end("blocked: trusted server request capability is absent or invalid");
        return;
      }
      if (window && universe === "SERVER_INTERNAL") record.requestId = sha256(Buffer.from(`${window.secret}:request:${record.sequence}:${absolute}:${record.range ?? ""}`));
      if (window && universe === "BROWSER_CORRELATED") assert.match(record.requestId ?? "", /^[0-9a-f]{64}$/, "trusted browser-correlated request identity is absent or malformed");
      assert.equal(request.method, "GET", "trusted static server accepts GET only");
      const target = trustedTarget(canonicalRoot, route);
      const body = readFileSync(target);
      assert.equal(sha256(body), expected.sha256, `trusted static candidate blob changed after materialization: ${route}`);
      if (extname(target).toLowerCase() === ".html") assertNoExternalResourceHints(body, route);
      const range = resolveTrustedByteRange(request.headers.range, body.length);
      const payload = range ? body.subarray(range.start, range.end + 1) : body;
      record.rangeStart = range?.start ?? null;
      record.rangeEnd = range?.end ?? null;
      record.totalBytes = body.length;
      record.status = range ? 206 : 200;
      record.bytes = payload.length;
      response.once("finish", () => { record.finished = true; });
      response.writeHead(record.status, {
        "content-type": MIME.get(extname(target).toLowerCase()) ?? "application/octet-stream",
        "content-length": payload.length,
        "accept-ranges": "bytes",
        ...(range ? { "content-range": `bytes ${range.start}-${range.end}/${body.length}` } : {}),
        "cache-control": "no-store",
        ...(record.journalId ? { "x-branct-trusted-journal-id": record.journalId } : {}),
        ...(record.requestId ? { "x-branct-trusted-request-id": record.requestId } : {}),
        ...(record.universe ? { "x-branct-trusted-universe": record.universe, "x-branct-trusted-identity-owner": record.identityOwner } : {}),
        ...(window ? { "set-cookie": `${continuationCookieName}=${window.continuationCapability}; Path=/; HttpOnly; SameSite=Strict` } : {}),
        "content-security-policy-report-only": "default-src 'self' data:; connect-src 'self'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; img-src 'self' data:; font-src 'self' data:; media-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
      });
      response.end(payload);
    } catch (error) {
      record.status = error?.code === "ERR_TRUSTED_BYTE_RANGE" ? 416 : 404;
      response.once("finish", () => { record.finished = true; });
      response.writeHead(record.status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
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
  const openJournalWindow = () => {
    if (activeWindow?.state === "VERIFIED") activeWindow = null;
    assert.equal(activeWindow, null, "trusted server journal window is already active");
    const window = {
      windowId: sha256(randomBytes(32)),
      secret: randomBytes(32).toString("hex"),
      capability: randomBytes(32).toString("hex"),
      continuationCapability: randomBytes(32).toString("hex"),
      state: "OPEN",
      violation: null,
      sealedCount: null,
      sealedDigest: null,
    };
    window.continuationCookie = Object.freeze({
      name: continuationCookieName,
      value: window.continuationCapability,
      url: origin,
      httpOnly: true,
      sameSite: "Strict",
    });
    activeWindow = window;
    const snapshot = () => ({
      windowId: window.windowId,
      state: window.state,
      violation: window.violation,
      records: structuredClone(windowRecords(window)),
      rejections: structuredClone(windowRejections(window)),
    });
    return {
      get windowId() { return window.windowId; },
      get continuationCookie() { return window.continuationCookie; },
      authorizeHeaders: (headers = {}) => ({ ...headers, "x-branct-trusted-window-capability": window.capability }),
      snapshot,
      beginQuiescence: () => {
        assert.equal(window.state, "OPEN", "trusted server journal cannot enter quiescence from its current state");
        window.state = "QUIESCING";
        return snapshot();
      },
      seal: () => {
        assert.equal(window.state, "QUIESCING", "trusted server journal cannot seal before quiescence");
        const records = windowRecords(window);
        window.sealedCount = records.length;
        window.sealedDigest = journalDigest(records);
        window.state = "SEALED";
        return snapshot();
      },
      verify: () => {
        assert.notEqual(window.state, "REJECTED", window.violation ?? "trusted server journal was rejected");
        assert.equal(window.state, "SEALED", "trusted server journal must be sealed before verification");
        const records = windowRecords(window);
        assert.equal(records.length, window.sealedCount, "trusted server journal changed after seal");
        assert.equal(journalDigest(records), window.sealedDigest, "trusted server journal content changed after seal");
        window.state = "VERIFIED";
        return snapshot();
      },
    };
  };
  return {
    origin,
    validateRequest: (requestUrl) => validateTrustedStaticRequest(requestUrl, origin, expectedFiles),
    getRequestLog: () => structuredClone(requestLog),
    openJournalWindow,
    close: () => new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise())),
  };
}

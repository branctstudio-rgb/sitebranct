import assert from "node:assert/strict";
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

export async function startTrustedStaticServer(root, requestedPort = 4173) {
  const canonicalRoot = realpathSync(root);
  const server = createServer((request, response) => {
    try {
      assert.equal(request.method, "GET", "trusted static server accepts GET only");
      const parsed = new URL(request.url, "http://127.0.0.1");
      assert.equal(parsed.search, "", "trusted static request query is forbidden");
      let route;
      try { route = decodeURIComponent(parsed.pathname.replace(/^\/+/, "") || "index.html"); }
      catch { assert.fail("trusted static route encoding is malformed"); }
      const target = trustedTarget(canonicalRoot, route);
      const body = readFileSync(target);
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
    close: () => new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise())),
  };
}

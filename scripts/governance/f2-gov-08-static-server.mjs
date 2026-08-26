import assert from "node:assert/strict";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

export function readTrustedStaticRoute(root, route) {
  assert.match(route ?? "", /^[a-z0-9-]+\.html$/, "trusted static route is invalid");
  const canonicalRoot = realpathSync(root);
  const target = resolve(canonicalRoot, route);
  assert.ok(target.startsWith(`${canonicalRoot}${sep}`), "trusted static route escapes the candidate root");
  const metadata = lstatSync(target);
  assert.equal(metadata.isSymbolicLink(), false, "trusted static route is a symlink");
  assert.equal(metadata.isFile(), true, "trusted static route is not a regular file");
  return readFileSync(target, "utf8");
}

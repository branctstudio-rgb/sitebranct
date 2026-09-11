#!/usr/bin/env bash
# NOT EXECUTED. Requires a separately authorized, dedicated Linux Docker host.
set -euo pipefail
[[ "${1:-}" == "--human-authorized-linux-11" ]] || { echo 'NOT_EXECUTED: human authorization required'; exit 64; }
stage="${2:-}"
[[ "$stage" == prepare || "$stage" == measure ]] || exit 64
[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] || exit 65
image='mcr.microsoft.com/playwright@sha256:02bbb2155cd7109e3e9c741941097ed1608cf8b6fa44ee2595896da2bdc1f471'
head='563f3c13665347b2a8578110e519ebaf13f356e8'
# Existing dedicated directory, never a Memory machine/volume or a system root.
root='/var/tmp/branct-website-linux-11'
[[ -d "$root/input" && ! -L "$root" && ! -L "$root/input" ]] || exit 65
[[ -f "$root/input/source.bundle" && -f "$root/input/SHA256SUMS" && -d "$root/input/package" ]] || exit 65
(cd "$root/input"; sha256sum --strict --check SHA256SUMS)
docker info --format '{{.OSType}}' | grep -qx linux
if [[ "$stage" == prepare ]]; then
 [[ ! -e "$root/source" && ! -e "$root/deps" && ! -e "$root/outputs" ]] || exit 65
 # Only this stage has downloads. Source code/scripts never execute during npm install.
 docker pull --platform linux/amd64 "$image"
 docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}' | grep -qx linux/amd64
 git -c core.autocrlf=false clone --no-checkout "$root/input/source.bundle" "$root/source"
 git -C "$root/source" bundle verify "$root/input/source.bundle"
 git -C "$root/source" -c core.autocrlf=false checkout --detach "$head"
 [[ "$(git -C "$root/source" rev-parse HEAD)" == "$head" ]] || exit 65
 # The repo historically tracks other node_modules files: never overlay them.
 [[ ! -e "$root/source/node_modules/playwright" && ! -e "$root/source/node_modules/playwright-core" ]] || exit 65
 mkdir "$root/source/node_modules/playwright" "$root/source/node_modules/playwright-core"
 mkdir "$root/deps" "$root/outputs"
 cp "$root/source/package.json" "$root/source/package-lock.json" "$root/deps/"
 docker run --name website-11-npm --platform linux/amd64 --user "$(id -u):$(id -g)" --cap-drop=ALL --security-opt=no-new-privileges --memory=2g --cpus=2 --pids-limit=256 --read-only --tmpfs /tmp:rw,nosuid,nodev,size=512m \
  --mount "type=bind,src=$root/deps,dst=/deps" --workdir /deps --env HOME=/tmp --env npm_config_cache=/tmp/npm --env PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
  "$image" npm ci --ignore-scripts --no-audit --no-fund
 # Container and outputs are retained; no rm/prune or privileged fallback.
 [[ -f "$root/deps/node_modules/playwright/package.json" ]] || exit 65
else
 [[ -d "$root/source/.git" && -d "$root/deps/node_modules" && -d "$root/outputs" && ! -e "$root/outputs/results" ]] || exit 65
 [[ "$(git -C "$root/source" rev-parse HEAD)" == "$head" ]] || exit 65
 [[ -z "$(git -C "$root/source" status --porcelain)" ]] || exit 65
 docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}' | grep -qx linux/amd64
 # Application stage: no external network, ports, credentials, host IPC or Docker socket.
 docker run --name website-11-measure --pull=never --platform linux/amd64 --network=none --init --user "$(id -u):$(id -g)" \
  --cap-drop=ALL --security-opt=no-new-privileges --memory=4g --cpus=2 --pids-limit=512 --shm-size=1g --read-only --tmpfs /tmp:rw,nosuid,nodev,size=1g \
  --mount "type=bind,src=$root/source,dst=/candidate,readonly" \
  --mount "type=bind,src=$root/deps/node_modules/playwright,dst=/candidate/node_modules/playwright,readonly" \
  --mount "type=bind,src=$root/deps/node_modules/playwright-core,dst=/candidate/node_modules/playwright-core,readonly" \
  --mount "type=bind,src=$root/input/package,dst=/package,readonly" \
  --mount "type=bind,src=$root/outputs,dst=/outputs" --workdir /candidate --env HOME=/tmp --env PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  "$image" node /package/linux-run.mjs
fi

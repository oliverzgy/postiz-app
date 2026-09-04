# Versioning (SemVer) + upstream Postiz

This fork follows [Semantic Versioning 2.0.0](https://semver.org/) and **keeps a visible link to the official Postiz release** it is built on.

## Two files

| File | Meaning | Example |
|------|---------|---------|
| [`UPSTREAM_VERSION`](../UPSTREAM_VERSION) | Official Postiz release SemVer (no `v`) that this branch last synced from | `2.23.0` ↔ tag `v2.23.0` |
| [`VERSION`](../VERSION) | **Product** SemVer shown in the UI / image tags | `2.23.0+gf.1` |

## How VERSION relates to official

Use **build metadata** (`+…`) so the core triple matches upstream:

```
{UPSTREAM_VERSION}+gf.{N}
```

| Piece | Role |
|-------|------|
| `2.23.0` | Same MAJOR.MINOR.PATCH as official `v2.23.0` — “compatible baseline” |
| `+gf.1` | GiggleFone fork revision on *that* upstream (ignored for SemVer precedence) |

Examples:

- First custom image on upstream `v2.23.0` → `2.23.0+gf.1`
- More fork-only fixes/features, still on `v2.23.0` → `2.23.0+gf.2`, `+gf.3`, …
- After `./scripts/sync-upstream.sh` lands official `v2.24.0` → set `UPSTREAM_VERSION=2.24.0`, reset or continue fork rev → `2.24.0+gf.1`

Optional: append git SHA for a single deploy artifact: `2.23.0+gf.1.82c6f28b` (still valid SemVer build metadata).

Do **not** invent a parallel `2.24.0` that is unrelated to upstream’s `v2.24.0` — that breaks the association.

## When to bump what

| Event | Action |
|-------|--------|
| Sync official main / new upstream tag | Update `UPSTREAM_VERSION`; set `VERSION={upstream}+gf.1` (or keep counting `gf.N` if you prefer continuous fork revs) |
| Fork-only feature or fix (no upstream bump) | Bump `+gf.N` only; leave the `X.Y.Z` part = `UPSTREAM_VERSION` |
| Upstream breaking release | Follow their MAJOR; then `+gf.1` again |

Prerelease (`-rc.1`) is for *your* release candidates, not for encoding upstream.

## Git association (source of truth in history)

1. Remotes: `origin` = `gitroomhq/postiz-app`, `fork` = your fork.
2. Keep `main` = fast-forward of `origin/main`.
3. Rebase feature with `./scripts/sync-upstream.sh` (or `--push`).
4. After sync, set versions from the new upstream tag:

```bash
# example after sync
git fetch origin --tags
UPSTREAM=$(git describe --tags --abbrev=0 origin/main | sed 's/^v//')
echo "$UPSTREAM" > UPSTREAM_VERSION
echo "${UPSTREAM}+gf.1" > VERSION
```

`git merge-base --is-ancestor origin/main HEAD` should stay true on the deploy branch.

## Build / deploy

```bash
VERSION=$(tr -d '[:space:]' < VERSION)          # e.g. 2.23.0+gf.1 (UI / SemVer)
IMAGE_TAG=${VERSION//+/-}                       # Docker forbids '+': 2.23.0-gf.1
SHA=$(git rev-parse --short HEAD)
docker build -f Dockerfile.dev \
  --build-arg "NEXT_PUBLIC_VERSION=${VERSION}" \
  -t "postiz-gigglefone:${IMAGE_TAG}" \
  -t "postiz-gigglefone:${SHA}" \
  -t postiz-gigglefone:latest .
```

Sidebar shows SemVer (`2.23.0+gf.1`). Compose pins the Docker-safe tag: `postiz-gigglefone:2.23.0-gf.1` (or the SHA).

## UI

`formatBuildVersion` accepts SemVer with optional leading `v`, prerelease, and build metadata. Non-SemVer strings are not shown.

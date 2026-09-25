# ADR-0001: Own backend only, no compatibility with upstream LiftLog

Status: accepted (2026-09-25)

## Context

This repo is an independently maintained fork of LiamMorrow/LiftLog, and it has no users yet. Upstream
compatibility used to constrain several designs. These wire formats are versioned, and older clients
reject newer versions:

- the encrypted feed (`SessionUserEvent`, which embeds `SessionJSON` v8)
- share links and the published current plan
- `.liftlogplan` files

On top of that, upstream backups get restored by running migrations on the old file. Keeping all of that
compatible would rule out changing session or blueprint JSON, and would force a permanent legacy-storage
layer.

## Decision

- The fork talks **only to its own backend** (self-hosted `backend/`). It doesn't interoperate with
  upstream clients or with the upstream-hosted service at `api.liftlog.online`.
- **No compatibility with upstream** is maintained or tested. That covers feed, share and plan wire
  formats, backup files from upstream builds, and on-device data from upstream installs.
- Changes aren't sent back upstream, and merging future upstream changes is not a goal.

## Consequences

- Session, blueprint and feed JSON versions can be bumped whenever a model changes, following the normal
  chain rules in `docs/Migrations.md`. Compatibility still matters **between versions of this fork's own
  app**, though. Any client that shares a feed must understand the payload version.
- When a session or blueprint version bumps, the generated schemas must be regenerated (`npm run
  json-schema`). The Android workout worker's Kotlin is generated from them and asserts the exact
  session version.
- Code and data migrations that only exist to import upstream-era data can be deleted. That includes
  the legacy key-value/protobuf imports, the legacy current-session lift and the protobuf backup
  restore.
- Follow-up, not yet done: the built-in backend still defaults to `api.liftlog.online`
  (`services/api-consts.ts`, `store/backends/index.ts`). The upstream-branded docs still reference it
  too (`docs/Backends.md`, `docs/FeedProcess.md`). All of these need repointing to the fork's backend.
- The app remains AGPL-3.0, so distributed builds and a hosted modified backend must offer their source.

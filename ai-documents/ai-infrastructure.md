**Type:** AI-assisted Infrastructure Guide
**Author:** Tomasz Mosur
**Date:** 2026-04-18
**Status:** Ready for use

---

# AI Infrastructure for Chat Server Implementation

## Overview

This document describes the Claude Code setup built into `04/project-starter/`. The AI infrastructure files (`.claude/`, `CLAUDE.md`, `api-definition.yaml`) are already in place — no copy step needed. Open the project, run `docker compose up -d`, and start coding from Slice 1.

**Total setup time: ~2 minutes** (start Docker, verify `/docker-health` passes).

---

## File Structure

```
project-root/
├── CLAUDE.md                          project conventions and gotchas
└── .claude/
    ├── settings.json                  permissions + auto-format hook
    └── commands/
        ├── test-slice.md              /test-slice — run integration tests
        ├── docker-health.md           /docker-health — check all 4 containers
        └── build-check.md            /build-check — gradle build without tests
```

---

## What Each File Does

### CLAUDE.md
Loaded automatically at the start of every Claude Code session. Contains:
- Full stack description (Kotlin + Spring Boot + React + PostgreSQL)
- Exact build/run commands
- Slice gate rule (tests must pass before moving to next slice)
- Concrete gotchas captured during design (stale closure, ChannelInterceptor, ConcurrentHashMap, etc.)
- Testing conventions (Testcontainers, @AfterEach cleanup, no @Transactional rollback)

Keeps the agent aligned across all 11 slices without re-explaining context each time.

### .claude/settings.json
Two responsibilities:
1. **Permission pre-authorization** — allows `./gradlew`, `docker compose`, `npm`, `git` commands without interactive prompts. Eliminates ~50 permission dialogs over the 2-day sprint.
2. **Auto-format hook** — runs `ktlint` (Kotlin) and `prettier` (TypeScript/TSX) automatically after every file edit. Keeps code clean with no manual intervention.

### /test-slice command
Run as `/test-slice` or `/test-slice SliceN` to execute the full integration test suite. Outputs pass/fail with failure details. The agent is instructed to stop and report failures rather than continuing to the next slice.

### /docker-health command
Run as `/docker-health` to verify all four Docker Compose services (frontend, backend, postgres, mailhog) are healthy before starting a session or after `docker compose up`. Catches startup ordering issues early.

### /build-check command
Run as `/build-check` to verify the Gradle build compiles cleanly without running tests. Useful as a fast feedback loop after schema or API changes before committing.

---

## Usage Pattern Per Slice

```
1. /docker-health          verify services are up
2. /build-check            verify clean compile
3. implement slice N       write entities, endpoints, STOMP handlers, tests
4. /test-slice             gate check — all slice N tests must pass
5. git commit              only after gate clears
6. move to slice N+1
```

---

## What Was Deliberately Excluded

| Excluded | Reason |
|----------|--------|
| MCP servers | Built-in Bash, Read, Glob, Grep tools are sufficient for local work |
| Subagents / /loop | Single-agent synchronous workflow matches slice-by-slice sprint |
| Fast mode | Not time-constrained per-response; adds cost without benefit |
| Complex multi-hook pipelines | Two hooks (auto-format + permission auth) cover 90% of friction |
| Scheduled tasks | This is a synchronous sprint, not ongoing automation |

---

## Updating CLAUDE.md During the Sprint

After each slice, append any newly discovered gotchas to `CLAUDE.md` under the **Discovered Gotchas** section. Examples from the design phase already included:
- Spring Security 6: use `ChannelInterceptor`, not `HandshakeInterceptor`, for STOMP auth
- `@Transactional` rollback does not work in `RANDOM_PORT` integration tests — use `@AfterEach` cleanup
- Presence map must be `ConcurrentHashMap` (written from WS thread, read from scheduler thread)
- `setMessages(prev => [...prev, msg])` functional update is mandatory — stale closure otherwise
- Flyway migration files must never be edited after first run — schema changes need new files

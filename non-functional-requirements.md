# Non-Functional Requirements

These requirements address production-readiness concerns that are orthogonal to feature correctness.
Each has a corresponding NF slice with an automated test gate.

---

## NFR-1: Presence Accuracy Under Browser Reality

### Problem

The 30-second heartbeat timer (`setInterval`) stops firing when a browser hibernates an inactive tab
(common on mobile and low-memory desktops). The tab's JavaScript is suspended, so the user's status
stays ONLINE indefinitely even after the machine goes to sleep.

A timer-only approach also means a user who just started typing must wait up to 30 seconds before
their presence flips from AFK/OFFLINE to ONLINE.

### Requirements

| ID | Requirement |
|----|-------------|
| NFR-1.1 | Activity signals are event-driven: `pointermove`, `keydown`, `click` trigger a heartbeat send, throttled to at most 1 STOMP send per 2 seconds |
| NFR-1.2 | `document.visibilitychange → hidden`: send `/app/presence.afk` immediately (optimistic — don't wait for the server scheduler) |
| NFR-1.3 | `document.visibilitychange → visible`: send `/app/presence.activity` immediately (instant ONLINE recovery) |
| NFR-1.4 | Multi-tab coordination: use `BroadcastChannel("presence")`. The active tab broadcasts activity; other tabs stay silent but listen on the channel. Only one tab drives STOMP heartbeats at a time |
| NFR-1.5 | Browser hibernation safety net: if the client sends no heartbeat for 60 s, the server-side AFK scheduler transitions the user to AFK regardless of browser state |

### Measurable Target

After a tab goes hidden for ≥ 2 s, friends observe AFK status within 3 s (server push latency < 2 s per req 2.7.2).

### Test Gate

`e2e/nf1.spec.ts` — simulates `visibilitychange` via `page.evaluate`; asserts friend's presence dot
changes to AFK within 3 s.

---

## NFR-2: Message Gap Recovery on STOMP Reconnect

### Problem

STOMP auto-reconnects after a network drop. Messages sent by other users during the gap (typically
5–30 s) are never received by the reconnected client. The user sees a silent hole in the conversation
with no indication that messages were missed.

### Watermark Concept (from architect)

Each room's messages have monotonically increasing IDs. The client tracks `highWatermark[roomId]` =
the largest message ID it has seen (via REST history load or STOMP delivery). On reconnect, the client
fetches `GET /api/messages/{roomId}?after={watermark}` to fill any gap. If the returned list is
non-empty, the messages were missed; they are prepended in order.

This also detects reordering: if `after=` returns a message the client already has, deduplication by
ID prevents duplicates.

### Requirements

| ID | Requirement |
|----|-------------|
| NFR-2.1 | Backend: `GET /api/messages/{roomId}?after={messageId}&limit=100` — returns messages with `id > messageId`, ordered ascending, max 100 |
| NFR-2.2 | Frontend: `StompContext` maintains `highWatermark: Record<roomId, number>` updated on every STOMP delivery and REST load |
| NFR-2.3 | On STOMP `onConnect` (fires on every reconnect): for each active room subscription, fetch `after={watermark}`, insert any gap messages into the room's message list, deduplicated by ID |
| NFR-2.4 | UI: show a non-intrusive "Reconnected" toast/banner when gap fill runs; dismiss automatically after 3 s |

### What Is NOT Implemented

- Per-user server-side message queues (would grow unboundedly for offline users — architect's concern)
- Acknowledged delivery receipts
- Persistent offline message storage

### Test Gate

`e2e/nf2.spec.ts` — opens two browser contexts, disconnects one via WebSocket route interception,
sends 3 messages from the other, reconnects, verifies all 3 appear with correct order.

---

## NFR-3: Large Message History Performance

### Problem (architect)

A 3-year-old chat room may contain 100 000+ messages. Users must be able to scroll progressively
from newest to oldest without the app hanging, crashing, or losing scroll position.

### Requirements

| ID | Requirement |
|----|-------------|
| NFR-3.1 | `GET /api/messages/{roomId}?before={id}&limit=50` responds in < 200 ms at 100 K row depth (keyset pagination on indexed ID — already implemented) |
| NFR-3.2 | Frontend infinite scroll preserves scroll position when prepending older messages: capture `scrollHeight` before prepend, restore `scrollTop += newScrollHeight - oldScrollHeight` after |
| NFR-3.3 | No duplicate message IDs across all loaded pages |
| NFR-3.4 | Messages render in strictly ascending chronological order (oldest top, newest bottom) at all times |

### Memory Note

At 100 K messages × ~200 bytes each = ~20 MB JS heap. Acceptable for desktop browsers without a
virtual window. A virtual window (render only ±200 messages) is recommended if mobile support is added.

### Test Gate

`e2e/nf3.spec.ts` — seeds a room with 10 000 messages via `e2e/seed/largeRoom.ts`, then scrolls
from newest to page 20 (1 000 messages back), verifying: no duplicate IDs, correct order, each page
fetch completes within 1 s.

---

## NFR-4: Resource Lifecycle — Cleanup Jobs

### Problem

Several tables accumulate stale rows indefinitely:

- `sessions`: rows past `expires_at` are never deleted. A user who logged in once 2 years ago and
  never returned still has a row counted in the sessions list.
- `password_reset_tokens`: used (`used_at IS NOT NULL`) or expired rows are never purged.

For small deployments this is minor, but it represents unbounded table growth and wasted query work.

### Requirements

| ID | Requirement |
|----|-------------|
| NFR-4.1 | Daily scheduled job (3 AM UTC): delete `sessions WHERE expires_at < NOW()` |
| NFR-4.2 | Daily scheduled job (3 AM UTC): delete `password_reset_tokens WHERE expires_at < NOW() OR used_at IS NOT NULL` |
| NFR-4.3 | `GET /api/admin/stats` returns `{ expiredSessions, expiredTokens, totalUsers, totalRooms, totalMessages }` — no auth gate (sprint convenience) |

### Test Gate

`NF4CleanupTest.kt` — inserts 5 expired sessions and 5 used tokens, calls the scheduled method
directly, asserts both tables have 0 stale rows.

---

## NFR-5: Attachment Batch Loading (Eliminate N+1)

### Problem

`MessageService.getHistory()` calls `attachmentRepository.findAllByMessageIdIn(listOf(singleId))`
inside a per-message loop. A page of 50 messages with attachments issues 50 separate DB round-trips
for attachments instead of 1.

### Requirements

| ID | Requirement |
|----|-------------|
| NFR-5.1 | Attachments for a history page are loaded in a single `findAllByMessageIdIn(allMessageIds)` query |
| NFR-5.2 | Results are grouped by `messageId` in memory; `MessageResponse` assembly uses the in-memory map |

### Test Gate

`NF5AttachmentBatchTest.kt` — creates 50 messages each with 1 attachment, calls `getHistory`, asserts
response contains all 50 attachments and that the Hibernate statistics counter shows ≤ 3 queries total
(messages + attachments + members/room check).

---

## NFR-6: Login Brute-Force Protection

### Problem

`POST /api/auth/login` has no rate limiting. An attacker can attempt millions of passwords per minute
with no server-side defence.

### Requirements

| ID | Requirement |
|----|-------------|
| NFR-6.1 | After 10 failed login attempts from the same IP within 60 s, respond with 429 `{ "error": "RATE_LIMITED" }` |
| NFR-6.2 | The attempt counter resets after 60 s (sliding window) |
| NFR-6.3 | A successful login does NOT reset the counter (prevents bypass via interleaved valid credentials) |
| NFR-6.4 | IP is read from `X-Real-IP` header first (set by nginx), falling back to `request.remoteAddr` |

### Implementation Note

Use Bucket4j in-memory rate limiter (`com.bucket4j:bucket4j-core`). No Redis required for single-node
deployment. Each bucket is keyed by IP and stored in a `ConcurrentHashMap<String, Bucket>`.

### Test Gate

`NF6RateLimitTest.kt` — sends 11 login attempts with wrong password from the same simulated IP;
first 10 return 401, 11th returns 429.

---

## Summary Table

| NFR | Area | Severity | Slice |
|-----|------|----------|-------|
| NFR-1 | Presence accuracy (hibernation, cursor, multi-tab) | High | NF1 |
| NFR-2 | Message gap recovery on reconnect | High | NF2 |
| NFR-3 | Large history pagination performance | Medium | NF3 |
| NFR-4 | Resource lifecycle (session/token cleanup) | Low | NF4 |
| NFR-5 | Attachment N+1 query | Medium | NF5 |
| NFR-6 | Login brute-force protection | High | NF6 |

**Type:** AI-assisted Architecture Proposal
**Author:** Tomasz Mosur
**Date:** 2026-04-18
**Status:** Revised v3 — requirements gap review incorporated

---

# Architecture Proposal: Online Chat Server (Case Study 04)

## Context and Constraints

Classic web-based chat application to be implemented in ~2 days and deployed locally via `docker compose up`. The design targets simplicity and buildability over scalability headroom.

**Key constraints:**
- 300 simultaneous users maximum; rooms up to 1000 members
- Single-node Docker Compose deployment (no cloud, no horizontal scaling)
- Local file storage only (no object store)
- WebSocket-first real-time transport; Jabber/XMPP federation is the stretch goal

**Stack:**
- Backend: Kotlin + Spring Boot 3.x (Spring WebSocket/STOMP, Spring Security, Spring Data JPA, Flyway)
- Frontend: React 18 + Vite + TypeScript + TailwindCSS + `@stomp/stompjs`
- Database: PostgreSQL 16
- Authentication: JWT in httpOnly cookies (access 15 min; refresh 7 days / 30 days with "Keep me signed in")
- Email: MailHog (SMTP catcher, no real email delivery)
- Jabber (optional, separate stretch plan): Smack (JVM XMPP) + Prosody containers

---

## Container Architecture

Four services in `docker-compose.yml`:

```
frontend  nginx serving React SPA    :3000   proxies /api and /ws to backend
backend   Spring Boot fat JAR         :8080   REST + STOMP WebSocket
postgres  PostgreSQL 16               :5432 (host: 5433 to avoid local PG conflicts)
mailhog   SMTP catch-all dev server   :1025 (SMTP) + :8025 (web UI)
```

**Startup ordering:** backend must declare `depends_on` with a PostgreSQL health check — Docker Compose does not wait for the DB to be ready otherwise, and Flyway will crash on cold start:

```yaml
postgres:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U $POSTGRES_USER"]
    interval: 5s
    timeout: 3s
    retries: 10
backend:
  depends_on:
    postgres:
      condition: service_healthy
```

**Volume mounts:**
- Named volume `uploads_data:/app/uploads` (named volume avoids host-side permission issues when the container runs as non-root)
- Named volume `postgres_data:/var/lib/postgresql/data`

**MailHog Spring Boot configuration** (`application.yml`):
```yaml
spring.mail.host: mailhog
spring.mail.port: 1025
```
Spring Boot defaults to port 25; without the explicit port the forgot-password flow silently fails.

**nginx WebSocket proxy** — requires explicit headers or nginx drops the upgrade:
```nginx
location /ws {
    proxy_pass http://backend:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
}
```
`proxy_read_timeout` must exceed the STOMP heartbeat interval (30 s) by a large margin; the default 60 s is only barely sufficient.

**Flyway rule:** migration files must never be edited after first `docker compose up`. Schema changes during development require new numbered migration files. Editing an existing file causes a checksum mismatch and Spring Boot will refuse to start.

Optional Jabber services (separate `docker-compose.xmpp.yml` profile):
```
xmpp-a    Prosody XMPP server    :5222  server A
xmpp-b    Prosody XMPP server    :5232  server B (federation test)
```

**Rationale for no Redis / no external message queue:**
Spring's in-memory STOMP `SimpleBroker` uses an async `ExecutorSubscribableChannel` (thread pool, `nCPU × 2` core threads). Fan-out is parallel and non-blocking. Capacity ceiling: ~1,000 concurrent users or ~10,000 msg/s broadcast; 300 users at 50 msg/s burst = 45 MB/s outbound — handled by Tomcat NIO without thread-per-socket. An external STOMP relay is only needed for multiple backend replicas. This deployment has one.

---

## Data Model

```
users               id BIGSERIAL PK, email TEXT UNIQUE NOT NULL, username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL, created_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ

sessions            id BIGSERIAL PK, user_id BIGINT REFERENCES users ON DELETE CASCADE,
                    token_hash TEXT NOT NULL,
                    browser_info TEXT, ip TEXT, created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ

friendships         id BIGSERIAL PK, requester_id BIGINT REFERENCES users ON DELETE CASCADE,
                    addressee_id BIGINT REFERENCES users ON DELETE CASCADE,
                    status TEXT NOT NULL CHECK (status IN ('PENDING','ACCEPTED')),
                    message TEXT, created_at TIMESTAMPTZ
                    UNIQUE(requester_id, addressee_id)

user_bans           id BIGSERIAL PK, banner_id BIGINT REFERENCES users ON DELETE CASCADE,
                    banned_id BIGINT REFERENCES users ON DELETE CASCADE, created_at TIMESTAMPTZ
                    UNIQUE(banner_id, banned_id)

rooms               id BIGSERIAL PK, name TEXT UNIQUE NOT NULL, description TEXT,
                    visibility TEXT NOT NULL CHECK (visibility IN ('PUBLIC','PRIVATE','DM')),
                    owner_id BIGINT REFERENCES users ON DELETE SET NULL, created_at TIMESTAMPTZ

room_members        id BIGSERIAL PK, room_id BIGINT REFERENCES rooms ON DELETE CASCADE,
                    user_id BIGINT REFERENCES users ON DELETE CASCADE,
                    role TEXT NOT NULL CHECK (role IN ('MEMBER','ADMIN')),
                    joined_at TIMESTAMPTZ
                    UNIQUE(room_id, user_id)

room_bans           id BIGSERIAL PK, room_id BIGINT REFERENCES rooms ON DELETE CASCADE,
                    user_id BIGINT REFERENCES users ON DELETE CASCADE,
                    banned_by_id BIGINT REFERENCES users ON DELETE SET NULL, created_at TIMESTAMPTZ
                    UNIQUE(room_id, user_id)

messages            id BIGSERIAL PK, room_id BIGINT REFERENCES rooms ON DELETE CASCADE,
                    sender_id BIGINT REFERENCES users ON DELETE SET NULL,  -- SET NULL preserves history; render as "Deleted User"
                    content TEXT NOT NULL, parent_message_id BIGINT REFERENCES messages,
                    created_at TIMESTAMPTZ, edited_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ

attachments         id UUID PK DEFAULT gen_random_uuid(),
                    message_id BIGINT REFERENCES messages ON DELETE CASCADE,
                    storage_path TEXT NOT NULL,   -- {roomId}/{uuid} only, no original filename
                    original_filename TEXT NOT NULL,
                    mime_type TEXT NOT NULL,
                    size_bytes BIGINT NOT NULL,
                    comment TEXT

room_read_cursors   room_id BIGINT REFERENCES rooms ON DELETE CASCADE,
                    user_id BIGINT REFERENCES users ON DELETE CASCADE,
                    last_read_message_id BIGINT,
                    updated_at TIMESTAMPTZ
                    PRIMARY KEY (room_id, user_id)

password_reset_tokens
                    id BIGSERIAL PK, user_id BIGINT REFERENCES users ON DELETE CASCADE,
                    token_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
                    used_at TIMESTAMPTZ, created_at TIMESTAMPTZ
```

**FK cascade strategy:** `ON DELETE CASCADE` on all child tables of `rooms` and `messages` handles DB-level cleanup. Files on disk must be deleted by the application before the room record is deleted (application-managed, outside the DB transaction). The sequence: delete files from disk → DELETE room → CASCADE removes messages, attachments, room_members, room_bans, room_read_cursors automatically.

**Account deletion:** removes the `users` row. Sequence: (1) delete all owned rooms (with their files on disk first — see room deletion flow), (2) delete the `users` row. FK cascade strategy on user delete: `sessions`, `friendships`, `user_bans`, `room_members`, `room_read_cursors` → CASCADE (deleted). `messages.sender_id` → SET NULL (history preserved; render as "Deleted User" in UI). `rooms.owner_id` → SET NULL (owned rooms are deleted in step 1 so this should never trigger, but the constraint is safe). `room_bans.banned_by_id` → SET NULL (ban record persists; who-banned becomes unknown). Files the deleted user uploaded to rooms they did not own are NOT deleted — `attachments` row persists; room members retain access.

**Friend request acceptance:** updating `friendships.status` from `PENDING` to `ACCEPTED` must use an idempotent pattern — `UPDATE ... WHERE status = 'PENDING'` (no-op if already ACCEPTED). Concurrent acceptances are safe: the first UPDATE wins; subsequent ones match zero rows and are no-ops. No `INSERT ... ON CONFLICT` needed — the row already exists.

**DM room uniqueness:** no DB-level `UNIQUE` constraint exists across two-member DM rooms (too complex to express with a partial index). Enforced in application logic: `SELECT ... WHERE visibility='DM' AND :u1 IN members AND :u2 IN members` — if found, return existing room ID. The SELECT must happen inside a serialized transaction or use advisory locks to prevent a race where two simultaneous "start DM" calls both see no room and both INSERT. Implementation: `INSERT ... ON CONFLICT DO NOTHING` with a follow-up SELECT, or `SELECT ... FOR UPDATE` on a per-user-pair lock row.

**Attachment public ID:** UUID (`gen_random_uuid()`) — not a sequential integer. Sequential IDs leak upload volume and allow existence enumeration via 403 oracle. UUID public IDs make probing infeasible.

**Storage path:** `{roomId}/{uuid}` only. `original_filename` is stored in the DB column and used only for the `Content-Disposition` header at download time. This prevents path traversal from client-supplied filenames.

### Required Indexes

```sql
-- Core message history query: WHERE room_id = ? AND id < ? AND deleted_at IS NULL
CREATE INDEX idx_messages_room_id ON messages(room_id, id DESC) WHERE deleted_at IS NULL;

-- Unread count query: WHERE room_id = ? AND id > ? AND deleted_at IS NULL
-- Covered by idx_messages_room_id; explicit index for clarity:
CREATE INDEX idx_messages_unread ON messages(room_id, id) WHERE deleted_at IS NULL;

-- Membership hot path (checked on every message send, history fetch, file download)
-- UNIQUE constraint above already creates this index implicitly.

-- Friend lookup
CREATE INDEX idx_friendships_addressee ON friendships(addressee_id, status);
CREATE INDEX idx_friendships_requester ON friendships(requester_id, status);

-- Session validation
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash) WHERE expires_at > NOW();
```

**Presence** is kept in-memory only (not persisted):
```kotlin
ConcurrentHashMap<Long, ConcurrentHashMap<String, Instant>>
// userId → (socketSessionId → lastActivityAt)
```
`ConcurrentHashMap` is required — the presence map is written from the WS event thread and read by the heartbeat scheduler on a separate thread. Plain `HashMap` produces data races.

Aggregate: ONLINE if any session has `lastActivityAt` within the last 60 s (strictly: `now - lastActivity < 60s`); AFK if all sessions are idle (≥ 60 s since last activity); OFFLINE if map empty. Requirement states "more than 1 minute" — the 60 s threshold satisfies this: at 60 s the user is still ONLINE, at 60 s + ε they become AFK. Heartbeat interval (30 s) means two missed heartbeats → AFK.

---

## Security

### JWT Cookie Attributes
Cookies must be set with:
```
Set-Cookie: access_token=...; HttpOnly; Secure; SameSite=Lax; Path=/
Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/refresh
```
`SameSite=Lax` prevents cross-site POST CSRF on all REST endpoints for browsers that send cookies on same-site navigations only. `Secure` prevents transmission over plain HTTP (localhost exempt in most browsers).

### STOMP CSRF
The STOMP `ChannelInterceptor` validates the JWT on the `CONNECT` frame — this is the explicit CSRF substitute for the WebSocket transport. CSRF token headers are not used. The `SameSite` cookie policy covers REST. Both protections are documented here explicitly.

### File Upload
- Size limits: images ≤ 3 MB, other files ≤ 20 MB (enforced before writing to disk; return **413** for size violations, not 400)
- MIME type validation: use Apache Tika to inspect magic bytes. Do not trust `Content-Type` header from the client — it is trivially spoofed. Two-tier check:
  - **Image uploads:** must match an explicit allowlist: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
  - **General file uploads:** reject the following explicit blocklist (return 415):
    `application/x-executable`, `application/x-msdownload`, `application/x-dosexec`,
    `application/x-sh`, `text/x-shellscript`, `application/x-bat`,
    `application/java-archive`, `application/x-java-class`,
    `application/x-object`, `application/x-sharedlib`,
    `application/octet-stream` (Tika fallback for unknown binaries — reject to be safe; legitimate binary types such as `.zip` or `.pdf` produce specific MIME types)
  - Return 415 Unsupported Media Type for all rejections
- Upload directory (`/app/uploads`) must not be served directly by nginx (no `location /uploads` alias). All downloads go through the authenticated Spring endpoint.

### Content-Disposition Header
Sanitize `original_filename` before embedding in the header: strip `"`, `\r`, `\n`. Use RFC 5987 encoding for non-ASCII filenames:
```
Content-Disposition: attachment; filename*=UTF-8''{encoded_filename}
```

### Password Reset Token
Generated with `SecureRandom` (128-bit minimum). Stored as a bcrypt hash in a `password_reset_tokens` table (separate from `sessions`). TTL: 15 minutes. Token invalidated on first use.

### Rate Limiting
Known gap for a 2-day build. Login, register, and forgot-password endpoints have no rate limiting. In a production deployment, Bucket4j or an nginx `limit_req_zone` would be added. For local dev this is acceptable.

### IDOR Mitigation
Attachment IDs are UUIDs (see Data Model). All other resources are accessed through room-scoped or user-scoped paths that include room/user IDs already checked for membership.

---

## WebSocket Protocol (STOMP)

**Client subscribes to:**
- `/topic/room.{roomId}` — messages and membership events for a room
- `/user/queue/presence` — presence updates for the user's friends only (not global broadcast)
- `/user/queue/notifications` — per-user: friend requests, friendship events, invitations, bans

**Client sends to:**
- `/app/chat.send` → `{ roomId, content, parentMessageId?, tempId }`
- `/app/chat.edit` → `{ messageId, content }`
- `/app/chat.delete` → `{ messageId }`
- `/app/presence.activity` — heartbeat, sent every 30 s from an active tab
- `/app/presence.afk` — explicit AFK signal when all tabs idle

**Server emits:**
- `MessageEvent { type: NEW|EDITED|DELETED, message }` → `/topic/room.{id}`
- `MemberEvent { type: JOINED|LEFT|BANNED, userId, roomId }` → `/topic/room.{id}`
- `RoomEvent { type: DELETED, roomId }` → `/topic/room.{id}` — emitted before the room record is removed
- `PresenceEvent { userId, status: ONLINE|AFK|OFFLINE }` → `/user/queue/presence` per friend
- `NotificationEvent { type: FRIEND_REQUEST|FRIEND_ACCEPTED|INVITE|ROOM_BANNED|DM_BANNED, payload }` → `/user/queue/notifications`

**Presence scoping:** on each state change, the server iterates the user's accepted friends list and calls `SimpMessagingTemplate.convertAndSendToUser(friendUsername, "/queue/presence", event)` for each friend. At 300 users with ~50 contacts each, worst case is 50 sends per event — manageable and correct. A global `/topic/presence` broadcast would send every change to all 300 users regardless of relationship (up to 90,000 fan-out events/s at steady state) and leak status to strangers.

**Room ban WS revocation:** on ban, the server sends `NotificationEvent { type: ROOM_BANNED, roomId }` to the banned user's `/user/queue/notifications`. The React client handles this for its own userId: unsubscribes from `/topic/room.{roomId}` and navigates away. The server-side membership check on all subsequent API calls enforces the ban independently.

---

## REST API

```
POST   /api/auth/register
POST   /api/auth/login                         body: { email, password, keepSignedIn: bool }
POST   /api/auth/logout
POST   /api/auth/refresh                       silent token refresh from client
POST   /api/auth/change-password               body: { currentPassword, newPassword }
POST   /api/auth/forgot-password               body: { email }; always returns 200 (no enumeration)
POST   /api/auth/reset-password                body: { token, newPassword }; 200 on success; 400 on invalid/expired/used token
GET    /api/auth/sessions
DELETE /api/auth/sessions/{id}

GET    /api/rooms?q={partial_name}             public catalog; optional search by partial name (case-insensitive ILIKE);
                                               returns name, description, memberCount, unreadCount;
                                               single query with CTEs — no N+1
GET    /api/rooms/me                           all rooms the user is a member of (PUBLIC + PRIVATE + DM);
                                               returns roomId, name, visibility, unreadCount, lastMessageAt;
                                               this drives the sidebar — not the public catalog
POST   /api/rooms
PATCH  /api/rooms/{id}                         body: { name?, description?, visibility? }; DM rooms cannot change visibility → 400
DELETE /api/rooms/{id}
GET    /api/rooms/{id}/members                 requires active membership; 403 for non-members and banned users
POST   /api/rooms/{id}/members                 join (public) or accept invite (private)
DELETE /api/rooms/{id}/members/{userId}        remove = ban; atomically writes room_bans row in same tx
GET    /api/rooms/{id}/bans                    admin only
POST   /api/rooms/{id}/bans                    explicit ban
DELETE /api/rooms/{id}/bans/{userId}           unban
PATCH  /api/rooms/{id}/members/{userId}        body: { role: "ADMIN"|"MEMBER" }; owner only; promotes or demotes
POST   /api/rooms/{id}/invitations

GET    /api/messages/{roomId}?before={id}&limit=50
       Requires active room membership → 403 for non-members and banned users
       Query: WHERE room_id=? AND id < :before AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 50
       Also updates room_read_cursors: SET last_read_message_id = MAX(id) WHERE room_id=? AND user_id=?
       (single UPDATE statement using a subquery — avoids read-then-write race)

GET    /api/friends
GET    /api/friends/requests                   list pending requests (both sent and received)
POST   /api/friends/requests                   body: { username, message? }
PATCH  /api/friends/requests/{id}              body: { action: "ACCEPT"|"REJECT" }
DELETE /api/friends/{userId}
POST   /api/users/{id}/ban
DELETE /api/users/{id}/ban
DELETE /api/users/me                           account deletion; owned rooms + their files deleted first;
                                               response clears both cookies (access_token + refresh_token via Set-Cookie: max-age=0); returns 204

POST   /api/files/upload                       Tika MIME check before write; size checked before write
GET    /api/files/{id}                         UUID id; checks room membership AND user-to-user ban for DM rooms
                                               Returns 404 (not 403) for IDs the user has no access to
```

**`GET /api/rooms` unread + member count:** fetched with a single query using window functions or CTEs to avoid N+1:
```sql
SELECT r.*,
  COUNT(DISTINCT rm.user_id) AS member_count,
  COUNT(m.id) FILTER (WHERE m.id > COALESCE(rc.last_read_message_id, 0) AND m.deleted_at IS NULL) AS unread_count
FROM rooms r
LEFT JOIN room_members rm ON rm.room_id = r.id
LEFT JOIN messages m ON m.room_id = r.id
LEFT JOIN room_read_cursors rc ON rc.room_id = r.id AND rc.user_id = :userId
WHERE r.visibility = 'PUBLIC'
GROUP BY r.id, rc.last_read_message_id
```

**Unread count update:** single `INSERT ... ON CONFLICT DO UPDATE` to avoid duplicate rows and the read-then-write race:
```sql
INSERT INTO room_read_cursors (room_id, user_id, last_read_message_id, updated_at)
VALUES (:roomId, :userId,
        (SELECT MAX(id) FROM messages WHERE room_id = :roomId AND deleted_at IS NULL),
        NOW())
ON CONFLICT (room_id, user_id)
DO UPDATE SET last_read_message_id = EXCLUDED.last_read_message_id, updated_at = NOW()
```

---

## Key Flows

**Authentication:** Login body includes `keepSignedIn`. Refresh token lifetime: 30 days if true, 7 days otherwise. JWT pair issued as two httpOnly `SameSite=Lax` cookies. The `ChannelInterceptor` (not `HandshakeInterceptor`) reads the access token from the STOMP `CONNECT` frame and calls `SecurityContextHolder.setContext()` — this is the correct Spring Security 6 integration point for `@MessageMapping` handlers.

**JWT expiry during active WS session:** React client tracks access token expiry and calls `POST /api/auth/refresh` (HTTP) before expiry. On success, the new cookie is set; the existing WS session remains open. On failure, the client disconnects WS and redirects to login.

**Multi-tab presence:**
1. Each tab opens a WS → socket ID added to the `ConcurrentHashMap` entry for the user.
2. Active tab sends `/app/presence.activity` heartbeat every 30 s.
3. Server recomputes aggregate; if state changed, pushes `PresenceEvent` to each friend's `/user/queue/presence`.
4. On WS disconnect: remove socket entry. If map becomes empty → push OFFLINE to friends.

**File upload:**
1. Tika detects MIME type from magic bytes — reject if not on allowlist.
2. Size checked against type-specific limit before write.
3. Stored at `/app/uploads/{roomId}/{uuid}` (no original filename in path).
4. `original_filename`, `mime_type`, `comment` stored in DB. Returns UUID `attachmentId`.
5. Download: membership + (for DM rooms) user-ban check → stream with sanitized `Content-Disposition`.

**Message soft-delete with attachments:** when a message is soft-deleted (`deleted_at` set), any attached files are deleted from disk and their `attachments` rows are hard-deleted. The message row itself is soft-deleted (content replaced with a tombstone or left as-is). This prevents unbounded disk growth and is consistent with "deleted messages are not recoverable."

**Room deletion:** server emits `RoomEvent { type: DELETED }` to `/topic/room.{id}` → clients navigate away → server deletes files from disk → DELETE room row → CASCADE removes all child rows. **Error handling:** if disk deletion throws, abort — do NOT delete the room row. Orphaned files on disk are preferable to orphaned DB references. Log the error and surface as 500. This means room deletion is not fully atomic across disk + DB; a cleanup job scanning for DB-less files can be added later.

---

## Architecture Principles

1. **Single fat JAR** — no microservices.
2. **STOMP `ChannelInterceptor` for auth** — correct Spring Security 6 integration point.
3. **DMs as rooms** — `visibility = DM`; one data model covers all conversation types.
4. **Remove = ban** — `DELETE /api/rooms/{id}/members/{userId}` atomically writes `room_bans`.
5. **Files via authenticated HTTP only** — upload directory never web-accessible directly; Tika validates content.
6. **Presence scoped to friends** — per-user push, not global broadcast.
7. **UUID attachment IDs** — no sequential IDOR oracle.
8. **Integration tests as gates** — each slice must pass its tests before the next begins.

---

## React / Frontend Implementation Notes

These are concrete patterns required for a correct STOMP + React implementation.

**STOMP client lifecycle:**
```typescript
const clientRef = useRef<Client | null>(null);

useEffect(() => {
  const client = new Client({
    webSocketFactory: () => new SockJS('/ws'),
    onConnect: () => {
      // ALL subscriptions must be registered here, inside onConnect.
      // onConnect fires on every reconnect — subscriptions registered outside
      // onConnect are silently dropped after reconnect.
      client.subscribe('/user/queue/presence', handlePresence);
      client.subscribe('/user/queue/notifications', handleNotification);
    },
  });
  clientRef.current = client;
  client.activate();
  return () => { client.deactivate(); };
}, []); // empty deps — create once
```

**Room subscription:** managed inside the room component, subscribed on mount, unsubscribed on unmount. Presence and notification subscriptions live in a top-level `StompProvider` context — not inside room components. If subscribed per room, changing rooms accumulates duplicate subscriptions, causing double-delivery of all events.

**Functional update for messages** (mandatory — avoids stale closure):
```typescript
client.subscribe(`/topic/room.${roomId}`, (frame) => {
  const event: MessageEvent = JSON.parse(frame.body);
  setMessages(prev => [...prev, event.message]); // functional update — never close over `messages`
});
```

**Infinite scroll + scroll position preservation:**
1. `IntersectionObserver` on a sentinel div at the top of the message list.
2. On intersection: record `scrollHeight` before fetch, fetch previous page, prepend to list.
3. After DOM update (`useLayoutEffect`): restore scroll with `container.scrollTop += newScrollHeight - prevScrollHeight`.

**No-autoscroll when reading history:**
Track "user is at bottom" with a scroll listener: `isAtBottom = scrollTop + clientHeight >= scrollHeight - 50`. On new message arrival, only auto-scroll if `isAtBottom` is true. Update `isAtBottom` on every scroll event (throttled to ~100 ms).

---

## Advanced: Jabber/XMPP Extension (Stretch Goal)

Delivered as a separate `docker-compose.xmpp.yml` profile, not part of the main 11-slice roadmap.

1. Spring backend registers as an external Smack component to `xmpp-a` via XEP-0114.
2. Room messages bridged: STOMP event → Spring → Smack → Prosody → federation → Prosody-B.
3. Jabber clients connect directly to Prosody on port 5222.
4. Admin dashboard at `/admin/xmpp`: connections + federation traffic via Prosody HTTP API.

**Federation load test:** 50 Smack bot threads on server A + 50 on server B; measure throughput and round-trip latency.

---

## Implementation Roadmap — Vertical Slices

| Slice | Scope | Gate |
|-------|-------|------|
| 1 | Scaffold: Gradle, Docker Compose with health check, nginx WS config, Flyway schema + indexes | `docker compose up` healthy; Flyway applies all migrations |
| 2 | Auth: register, login (keepSignedIn), logout, sessions, change-password, forgot/reset password | Slice 2 tests pass |
| 3 | STOMP backbone: broker, ChannelInterceptor auth, subscribe/publish | Slice 3 tests pass |
| 4 | Room management: CRUD, catalog, join/leave, remove=ban (atomic), invitations | Slice 4 tests pass |
| 5 | Real-time messaging: send/edit/delete, history pagination, replies | Slice 5 tests pass |
| 6 | Presence: heartbeat, AFK, multi-tab, friend-scoped push | Slice 6 tests pass |
| 7 | Friends and DMs: request flow (with message text), user bans, DM rooms | Slice 7 tests pass |
| 8 | File attachments: Tika validation, upload, UUID IDs, download + DM-ban check, paste upload | Slice 8 tests pass |
| 9 | Notifications and unread counts (room_read_cursors upsert) | Slice 9 tests pass |
| 10 | Moderation: promote/demote admin, ban list, room deletion event | Slice 10 tests pass |
| 11 | React UI: full wireframe, StompProvider context, scroll management | Manual browser walkthrough |

---

## Testing Strategy

**Philosophy:** integration tests only. Tests are machine-verifiable acceptance criteria for the AI coding agent.

| Layer | Tool | Scope |
|-------|------|-------|
| HTTP integration | `@SpringBootTest` + `WebTestClient` + Testcontainers (real PG) | All REST flows |
| WebSocket integration | `StompClient` + `@SpringBootTest(webEnvironment=RANDOM_PORT)` | STOMP events, presence |
| Frontend | Manual browser walkthrough in Docker | Slice 11 only |

**Testcontainers setup:** single shared `PostgreSQLContainer` via `@TestConfiguration` + `DynamicPropertySource`. Flyway runs all migrations on start. Tests use explicit `@AfterEach` cleanup — **not** `@Transactional` rollback, which does not work in `RANDOM_PORT` tests (server runs on a separate thread; transactions are committed before the test client receives the response).

**Gate rule:** a slice is complete only when all its tests below pass.

---

## Complete Test Suite

### Slice 2 — Authentication
- Register with valid data → 201, user in DB
- Register duplicate email → 409
- Register duplicate username → 409
- Login with correct credentials → 200, JWT cookies set with `HttpOnly; SameSite=Lax`
- Login with `keepSignedIn=true` → refresh cookie max-age 30 days; `false` → 7 days
- Login with wrong password → 401
- Access protected endpoint without cookie → 401
- Access protected endpoint with valid cookie → 200
- Logout → session invalidated; same token rejected on next request
- Change password (correct current password) → 200; old password rejected after
- Change password with wrong current password → 400
- List active sessions → returns current session with browser/IP info
- Delete a specific session → that session's token rejected
- Forgot password → email captured in MailHog (`GET :8025/api/v2/messages` contains reset link)
- Reset password with valid token → login with new password succeeds
- Reset password with same valid token a second time → 400 (token invalidated on first use; `used_at` set)
- Reset password with expired token (> 15 minutes) → 400 (requires `expires_at` check in application code)
- Reset password with invalid/unknown token → 400

### Slice 3 — WebSocket backbone
- Connect STOMP with valid JWT cookie → handshake succeeds; `@MessageMapping` handler receives correct principal
- Connect STOMP without cookie → rejected (401)
- Subscribe to topic → `chat.send` → `MessageEvent{NEW}` received on subscription
- Reconnect after disconnect → subscriptions re-established via `onConnect`; no duplicate delivery
- JWT refresh during active session → new cookie set via `POST /api/auth/refresh`; existing WS connection remains open WITHOUT reconnecting (no `onConnect` re-fire; subscriptions intact); message sent immediately after refresh is received by subscribers
- JWT refresh failure → client disconnects WS and redirects to login (tested by simulating expired access token with no valid refresh token)

### Slice 4 — Room management
- Create public room → appears in `GET /api/rooms` with `memberCount` and `unreadCount`
- Create private room → does NOT appear in catalog
- Duplicate room name → 409
- Join public room → member appears in member list
- Join public room when room-banned → 403
- Join private room without invite → 403
- `GET /api/rooms/{id}/members` by non-member → 403
- `GET /api/rooms/{id}/members` by room-banned user → 403
- Leave room → member removed
- Owner attempts to leave own room → 403
- `DELETE /api/rooms/{id}/members/{userId}` → member removed AND `room_bans` row written atomically; `MemberEvent{BANNED}` emitted
- Admin attempting to ban the room owner → 403 (owner is immune to admin actions)
- Removed member cannot rejoin → 403
- Delete room by owner → `RoomEvent{DELETED}` emitted on topic; room gone; messages gone; cascade confirmed
- Delete room by non-owner → 403
- Invite user to private room → user can join
- Catalog search by partial name → returns matching rooms only
- Public → private visibility change → room no longer in catalog
- Private → public visibility change → room reappears in catalog; existing members retain access
- Existing members retain access after room turns private (membership is not revoked by visibility change)
- Non-member attempts to join after room turns private → 403
- `PATCH /api/rooms/{id}` on a DM room with `{ visibility: "PUBLIC" }` → 400 (DM visibility is immutable)
- `GET /api/rooms/me` returns all rooms the user is a member of including DM rooms and private rooms; unreadCount correct for each

### Slice 5 — Messaging
- Send message → `MessageEvent{NEW}` received by all room subscribers
- Message persisted; history endpoint returns it
- `GET /api/messages/{roomId}` by non-member → 403
- `GET /api/messages/{roomId}` by room-banned user → 403
- History returns messages in stable chronological order (≥10 messages, including ≥2 with identical `created_at`); secondary sort by `id` ensures deterministic order for same-timestamp messages
- Soft-deleted message does NOT appear in history (`deleted_at IS NULL` filter confirmed)
- Edit own message → `MessageEvent{EDITED}`; `edited_at` set; content updated
- Edit another user's message → 403
- Delete own message → `MessageEvent{DELETED}`; soft-deleted
- Delete by admin → `MessageEvent{DELETED}` broadcast
- Delete by non-author non-admin → 403
- Reply to message → payload includes `parentMessage` summary
- History first page: 50 messages in order
- History `before` cursor: correct preceding page returned
- Message > 3 KB → 400 (3 KB = 3072 bytes; enforce as `content.toByteArray(Charsets.UTF_8).size > 3072`)
- Message sent while recipient is offline → persisted in DB; when recipient calls `GET /api/messages/{roomId}`, message appears in history (offline delivery is read-on-reconnect; no push queue needed)

### Slice 6 — Presence
- WS connect → `PresenceEvent{ONLINE}` delivered to friends' `/user/queue/presence` only
- Non-friend does NOT receive the presence event
- Heartbeat within 60 s → stays ONLINE
- No heartbeat for >60 s → `PresenceEvent{AFK}` pushed to friends
- Last session disconnects → `PresenceEvent{OFFLINE}` pushed to friends
- Two sessions same user: close one → still ONLINE
- Both sessions idle → AFK; one sends heartbeat → ONLINE
- Close both → OFFLINE

### Slice 7 — Friends and personal messaging
- Send friend request with message text → request in DB with text; `NotificationEvent{FRIEND_REQUEST}` payload includes message
- Accept request → friendship created; `NotificationEvent{FRIEND_ACCEPTED}` pushed to requester in real-time
- Concurrent acceptance (two simultaneous PATCH requests to accept the same request) → both return 200; exactly one `friendships` row created (idempotent via `INSERT ... ON CONFLICT DO NOTHING`)
- Reject request → no friendship
- Remove friend → friendship deleted
- Duplicate request to existing friend → 409
- Start DM with friend → `visibility=DM` room created; exactly 2 members
- Second DM attempt → returns existing room (no duplicate)
- Concurrent DM creation (two simultaneous requests for same user pair) → exactly one DM room created; both callers receive the same room ID
- Send DM to non-friend → 403
- User A bans User B → ban record; friendship terminated; `NotificationEvent{DM_BANNED}` pushed to B
- Banned user sends DM → 403; banner sends DM → 403
- DM history after ban: both parties can read via GET; `chat.send` returns 403
- `DELETE /api/users/me` → 204; response contains `Set-Cookie: access_token=; max-age=0` AND `Set-Cookie: refresh_token=; max-age=0` (both cookies cleared); owned rooms deleted with their files on disk; memberships in other rooms removed; files uploaded by deleted user to rooms they did not own remain accessible; subsequent request with the old token → 401

### Slice 8 — File attachments
- Upload image ≤ 3 MB → 201; UUID `attachmentId` returned
- Upload image > 3 MB → 413
- Upload file ≤ 20 MB → 201
- Upload file > 20 MB → 413
- Upload image with spoofed `Content-Type: image/png` that is actually a shell script → Tika detects `text/x-shellscript` → 415
- Upload a `.jar` file (Tika detects `application/java-archive`) → 415
- Upload a file Tika cannot identify (returns `application/octet-stream`) → 415
- Upload a `.pdf` (Tika detects `application/pdf`) → 201 (legitimate binary, specific MIME type)
- Upload with optional comment → comment persisted; returned in `MessageEvent` attachment payload
- Send message with `attachmentId` → subscribers receive message with `originalFilename`, `mimeType`, `comment`
- Download as room member → 200; `Content-Disposition` contains sanitized filename
- Download as non-member → 404 (not 403 — avoids leaking that the attachment exists)
- Download with a valid UUID that belongs to a room the requesting user is not a member of → 404 (IDOR guard regression test)
- Uploader banned from room → download returns 404
- Download file in DM room after user-to-user ban → 404 for both parties
- Room deleted → file removed from disk; download returns 404
- Upload without auth → 401
- Storage path on disk does NOT contain original filename (assert path = `{roomId}/{uuid}`)
- Paste image from clipboard → same `POST /api/files/upload` endpoint via `FormData`; UUID returned; `originalFilename` defaults to `paste-{timestamp}.png` if none provided
- Delete message that has an attachment → attachment file removed from disk; `GET /api/files/{id}` returns 404; `attachments` row deleted

### Slice 9 — Notifications and unread counts
- Message sent while user is offline → `room_read_cursors` shows unread count > 0
- `GET /api/messages/{roomId}` → cursor upserted to `MAX(id)`; subsequent call shows unread = 0
- `GET /api/rooms` returns correct `unreadCount` per room in a single query (assert query count ≤ 3 for N rooms)
- Friend request → `NotificationEvent{FRIEND_REQUEST}` with message text on `/user/queue/notifications`
- Room invitation → `NotificationEvent{INVITE}` on `/user/queue/notifications`
- Concurrent message inserts while cursor updates → unread count is non-negative and accurate (no double-count)

### Slice 10 — Moderation
- Admin bans member → member removed; `room_bans` row with banner and timestamp; `MemberEvent{BANNED}` on room topic
- `NotificationEvent{ROOM_BANNED, roomId}` delivered to banned user's personal queue
- Banned member tries to join → 403
- Admin views ban list → all bans with who-banned and when
- Admin unbans → member can rejoin
- Non-admin attempts to ban → 403
- Admin attempts to ban the room owner → 403 (owner immune)
- Admin deletes message → `MessageEvent{DELETED}`; soft-deleted
- `PATCH /api/rooms/{id}/members/{userId}` `{ role: "ADMIN" }` by owner → promoted user can now ban others
- `PATCH /api/rooms/{id}/members/{userId}` `{ role: "MEMBER" }` by owner → demoted user loses admin privileges
- `PATCH /api/rooms/{id}/members/{userId}` by non-owner → 403
- Owner attempts to demote themselves via the endpoint → 403

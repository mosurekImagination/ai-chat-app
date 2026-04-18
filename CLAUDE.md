# Chat Server — Project Conventions

## Sprint Mode

This is a **vibe-coding sprint** — a local, throwaway dev environment. There is no production, no deployed users, no backward compatibility requirement.

- `docker compose down -v` is always safe. Use it freely to wipe volumes and start clean.
- Update `slice-progress.md` immediately after each slice commit. Read it first after any context reset.
- **Flyway exception to the "never edit" rule:** the rule exists to protect running environments. Here there are none. If you discover a schema error in an existing migration *before committing that slice*, edit the file and run `docker compose down -v && docker compose up -d`. After a slice is committed, add a new `V00N__` migration instead.
- Never add `@Deprecated`, `_v2` variants, or backward-compatible shims. Change the code, update all usages in the same operation, move on.
- Changing a DTO field, error code, or endpoint path means updating every caller in the same commit — not adding a compatibility alias.
- **Simplify, don't patch.** When a workaround is needed, first ask: can I fix the root cause instead? Example: a service unreachable in tests because the config points at a Docker hostname — fix the config in the test profile, don't disable the health check. Prefer correct configuration over suppressed symptoms.

## Reference Documents

- `ai-documents/architecture-proposal.md` — full domain model, security decisions, STOMP flows, file handling, presence design. Read this when a decision is not answered below.
- `api-definition.yaml` — authoritative REST + STOMP contracts: field names, required flags, error codes, and all STOMP event/send schemas.

**Do NOT use code generation from the API spec.** Read it as reference when writing DTOs and controllers by hand. Field names are camelCase. Error responses always use `{ "error": "ERROR_CODE" }`.

STOMP event schemas (MessageEvent, MemberEvent, RoomEvent, PresenceEvent, NotificationEvent) and send frames (StompChatSendFrame, StompPresenceActivityFrame, etc.) are in `api-definition.yaml` as `Stomp*` schemas — use them as the Kotlin class contracts.

**Documentation was also vibe-coded.** When you find a contradiction between documents, use this priority order and fix the lower-priority document before continuing:

1. `requirements.md` — golden truth (what must be built)
2. `api-definition.yaml` — authoritative for field names, error codes, schemas
3. `CLAUDE.md` — implementation conventions
4. `architecture-proposal.md` — context and reasoning; use for gaps, not as override

**Test amendment policy:** Pre-written tests are authoritative for *business behaviour* (what the feature must do). If a test has a *technical bug* (wrong Spring API overload, missing import, incorrect assertion on an implementation detail not driven by requirements), fix the test and all affected places in the same commit — do not work around a bad test with hacky implementation. Always verify against `requirements.md` that the business intent is preserved before amending any test.

Don't stop for clarification. Make the reasonable call, fix the inconsistency in the document, and continue. If you discover a gap (something not specified anywhere), add it to CLAUDE.md under **Discovered Gotchas** immediately — not after the slice, right now.

---

## Stack

- **Backend:** Kotlin + Spring Boot 3.x, Gradle (Kotlin DSL), Spring WebSocket (STOMP), Spring Security 6, Spring Data JPA, Flyway
- **Frontend:** React 18 + Vite + TypeScript + TailwindCSS + `@stomp/stompjs` + SockJS
- **Database:** PostgreSQL 16
- **Email:** MailHog (SMTP on :1025, web UI on :8025)
- **Deployment:** Docker Compose — four services: `frontend`, `backend`, `postgres`, `mailhog`

## Build and Run Commands

```bash
# Backend
./gradlew build -x test        # compile only
./gradlew test                  # run all integration tests
./gradlew bootRun --args='--spring.profiles.active=local'   # run locally (port 8080)

# Frontend
npm install                     # install dependencies
npm run dev                     # dev server (port 5173)
npm run build                   # production build

# Docker
docker compose up -d            # start all services
docker compose ps               # check status
docker compose logs -f backend  # tail backend logs
docker compose down             # stop all services
docker compose down -v          # stop and delete volumes (wipes DB)
```

## Spring Profiles

Three profiles cover all runtime contexts. `application.yml` is always loaded first; the active profile overlays only what differs.

| Profile | When | DB | Mail | Uploads |
|---|---|---|---|---|
| _(none)_ | Docker Compose | `postgres:5432` (internal) | `mailhog:1025` (internal) | `/app/uploads` |
| `local` | `/dev-start` — local JVM, Docker infra | `localhost:5433` (mapped port) | `localhost:1025` (mapped port) | `/tmp/chat-local-uploads` |
| `test` | `./gradlew test` — Testcontainers | overridden by `@DynamicPropertySource` | `localhost:1025` (requires mailhog running) | `/tmp/chat-test-uploads` |

Activate: `--spring.profiles.active=local` (bootRun), `@ActiveProfiles("test")` (tests), nothing for Docker.

The Docker image always runs with no active profile — `application.yml` alone. Never bake a profile name into the Dockerfile.

## Development Loops

There are two loops. Use the fast one during development; use Docker only at slice commit time.

### Fast Loop (use this 95% of the time)

Run `/dev-start` to spin up infrastructure + local processes in ~10 seconds:

| What | How | URL |
|---|---|---|
| postgres + mailhog | Docker (lightweight, stable) | localhost:5433, localhost:8025 |
| Backend | `./gradlew bootRun` locally | http://localhost:8080 |
| Frontend | `npm run dev` locally | http://localhost:5173 (Vite HMR) |

- Backend changes: Spring DevTools reloads automatically on recompile (`./gradlew compileKotlin`).
- Frontend changes: Vite HMR refreshes the browser instantly on save.
- Tests: `./gradlew test --tests "*Slice{N}*"` — uses Testcontainers (its own Postgres), no Docker stack needed.

### Full Docker Loop (use at slice gate only)

```bash
docker compose up -d          # full stack including image builds
/docker-health                # verify all 4 services healthy
/test-slice N                 # run integration tests against real stack
git commit -m "slice N: ..."  # only after gate clears
docker compose down           # optional: stop after commit
```

Build the backend image only when the slice is complete and tests pass locally first. Never iterate on failing code through Docker builds — the loop is too slow (1–2 min per build).

## Pre-Written Tests — Do Not Modify

Tests for every slice are pre-written in `src/test/kotlin/com/example/chat/`.
**Do not rewrite, rename, or delete test methods.** Write implementation that makes them pass.

Slices 4-11 have one stub test each, marked `@Disabled`. When you start a slice:
1. Remove the `@Disabled` annotation from that slice's test file.
2. Expand the single stub test into the full test cases for that slice (the disabled message lists what to cover).
3. Make all new tests pass before committing.

The pre-existing Slice 2 and Slice 3 test classes are already fully written — do not add or remove test methods from them.

## Vertical Slice Rule

**Never start a new slice until all tests for the current slice pass.**

Each slice delivers:
1. Flyway migration (new file, never edit existing ones)
2. Kotlin JPA entity + repository
3. Spring Boot endpoint (REST or STOMP handler)
4. Integration tests (Testcontainers + real PostgreSQL)
5. React component or page (Slice 11 only: all UI)

Run `/test-slice` after implementing each slice. If any test fails — **stop, do not write more code, do not move to the next slice**. Fix failures and re-run `/test-slice`. Only `git commit` after the gate clears.

**Regression gate:** after `/test-slice N` passes, run `/regression-check N` (runs Slices 1-N). If a prior slice breaks, fix it before committing. You may not start Slice N+1 until the regression check is green.

**Stuck threshold:** if the same test is still failing after 3 consecutive fix attempts, stop accumulating fixes. Re-read the relevant spec section in `api-definition.yaml` or `architecture-proposal.md`, wipe the broken code, and restart that piece from scratch.

**Scope guard:** implement only what the current slice entry criteria requires. If you notice something else is needed but belongs to a later slice, add `// TODO: Slice N — <what>` and keep moving. No gold-plating, no anticipating future slices, no helper utilities not called by at least two existing places.

## Commit Strategy

**Never commit with failing tests.** Before every `git commit`, run `/test-slice N` and `/regression-check N`. A broken commit is worse than a delayed commit — once committed, a red test signals a broken repo to every future context.

- **One mandatory commit per slice**, immediately after `/test-slice` passes. Never commit red tests.
- Commit message format: `slice N: <short description>` — e.g., `slice 2: auth — register, login, sessions, password reset`
- Within a slice, WIP commits are allowed for large in-progress work: `wip: slice 3 stomp broker setup`
- Before committing: remove commented-out code, dead imports, and `.bak` files.
- After each slice commit, run `/build-check` to confirm the tree is clean before starting the next slice.
- After each slice commit, run `/reflect` to review the slice and update `CLAUDE.md` with any non-obvious gotchas discovered during implementation.

> **Note:** `./gradlew` requires the Gradle wrapper to be initialized. In Slice 1 (project scaffold), run `gradle wrapper` first to generate the `gradlew` script before any other Gradle commands.

## Testing Conventions

- All backend tests: `@SpringBootTest(webEnvironment = RANDOM_PORT)` + Testcontainers
- Shared `PostgreSQLContainer` via `@TestConfiguration` + `DynamicPropertySource` — started once per suite
- **Never use `@Transactional` rollback in integration tests.** In `@SpringBootTest(webEnvironment = RANDOM_PORT)`, the test client runs in a different thread from the server. Transactions commit before the test sees the response — `@Transactional` does not roll back. Use explicit `@AfterEach` cleanup instead:
  ```kotlin
  @AfterEach
  fun cleanup() {
      messageRepository.deleteAll()
      roomRepository.deleteAll()
      userRepository.deleteAll()
  }
  ```
- WebSocket tests: use `StompClient` with a real STOMP connection to `localhost:{port}/ws`
- **Test class naming:** `Slice{N}{Feature}Test.kt` — e.g., `Slice2AuthTest`, `Slice5MessagingTest`. The `/test-slice N` command filters with `--tests "*Slice{N}*"` so the class name must match.

## Key Gotchas (Captured During Design)

### Spring Security + STOMP
Use `ChannelInterceptor` (not `HandshakeInterceptor`) to validate JWT for `@MessageMapping` handlers.
`HandshakeInterceptor` sets the principal at HTTP upgrade time but does NOT bind it to `SecurityContextHolder` used by the message handling thread in Spring Security 6.

### Presence Map Concurrency
The presence map is written from the WebSocket event thread and read by the heartbeat scheduler on a separate thread. Must be:
```kotlin
ConcurrentHashMap<Long, ConcurrentHashMap<String, Instant>>()
```
Plain `HashMap` produces data races.

### React STOMP — Stale Closure
Always use the functional update form when appending messages:
```typescript
setMessages(prev => [...prev, event.message])  // correct
setMessages([...messages, event.message])       // WRONG — stale closure
```

### React STOMP — Client Lifecycle
```typescript
const clientRef = useRef<Client | null>(null)
useEffect(() => {
  const client = new Client({ ... onConnect: () => {
    // ALL subscriptions must be inside onConnect — fires on every reconnect
    client.subscribe('/user/queue/presence', handler)
  }})
  clientRef.current = client
  client.activate()
  return () => { client.deactivate() }
}, [])  // empty deps — create once
```
Subscriptions registered outside `onConnect` are silently dropped after reconnect.

### React STOMP — Subscription Scoping
- Presence (`/user/queue/presence`) and notifications (`/user/queue/notifications`) → `StompProvider` context at app root level, subscribed once at login
- Room messages (`/topic/room.{id}`) → inside the room component, subscribed on mount

If subscribed per room navigation, changing rooms accumulates duplicate subscriptions → double event delivery.

### Flyway Migrations
Never edit a migration file after first `docker compose up`. Flyway detects checksum mismatches and refuses to start. Schema changes during development always require a new numbered file (`V002__`, `V003__`, etc.).

### File Upload Security
Use Apache Tika to validate MIME type from magic bytes — do not trust `Content-Type` header from client. Store files at `uploads/{roomId}/{uuid}` only — no original filename in the storage path.

### Unread Count Upsert
Use a single `INSERT ... ON CONFLICT DO UPDATE` with a `MAX(id)` subquery — never read then write:
```sql
INSERT INTO room_read_cursors (room_id, user_id, last_read_message_id, updated_at)
VALUES (:roomId, :userId,
        (SELECT MAX(id) FROM messages WHERE room_id = :roomId AND deleted_at IS NULL), NOW())
ON CONFLICT (room_id, user_id)
DO UPDATE SET last_read_message_id = EXCLUDED.last_read_message_id, updated_at = NOW()
```

### nginx WebSocket Proxy
nginx requires explicit headers for WebSocket upgrades — without them connections are silently dropped:
```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_read_timeout 3600s;
```

### Docker Compose Startup Order
Backend must declare a health-check dependency on postgres — Docker Compose does not wait for readiness otherwise and Flyway crashes:
```yaml
depends_on:
  postgres:
    condition: service_healthy
```

### MailHog Port
Spring Boot defaults to SMTP port 25. Must set explicitly:
```yaml
spring.mail.host: mailhog
spring.mail.port: 1025
```

## Error Handling

Use a single global `@ControllerAdvice` class in `com.example.chat.api`. All controllers throw domain exceptions; the advice maps them to HTTP responses with `{ "error": "CODE" }`.

| Exception | HTTP | Error Code |
|---|---|---|
| `EntityNotFoundException` | 404 | `NOT_FOUND` |
| `ForbiddenException` | 403 | `FORBIDDEN` |
| `ConflictException` | 409 | varies (see api-definition.yaml for per-endpoint codes) |
| `ValidationException` | 400 | `INVALID_REQUEST` |
| `FileSizeLimitException` | 413 | `FILE_TOO_LARGE` |
| `UnsupportedMimeTypeException` | 415 | `UNSUPPORTED_MIME_TYPE` |
| unhandled `Exception` | 500 | `INTERNAL_ERROR` |

Error codes that map to `ForbiddenException`: `FORBIDDEN`, `NOT_MEMBER`, `ROOM_BANNED`, `ALREADY_BANNED`, `NOT_ADMIN`.
Error codes that map to `ConflictException`: `DUPLICATE_EMAIL`, `DUPLICATE_USERNAME`, `DUPLICATE_ROOM_NAME`, `ALREADY_FRIENDS`, `FRIEND_REQUEST_EXISTS`.

## Data Conventions

### Soft Delete
- **Messages only** use soft delete: set `deleted_at = NOW()`. All queries filter with `AND deleted_at IS NULL`. Soft-deleted messages return `{ deleted: true, content: null, sender: null }` to preserve reply thread structure.
- All other entities (users, rooms, friendships, sessions, room_members) use **hard delete**.
- Room deletion is hard delete: disk files first → then `DELETE rooms` → FK cascades remove all child rows.

### Pagination
- Only `GET /api/messages/{roomId}` is paginated. Use cursor-based pagination: `?before={messageId}&limit=50` (default 50).
- Response shape: `{ "messages": [...], "hasMore": boolean }`.
- All other list endpoints return full collections (unbounded by pagination — datasets are bounded by membership).

### Room Name Uniqueness
- Room names are globally unique, case-insensitive. Enforced by `CREATE UNIQUE INDEX idx_rooms_name_lower ON rooms (LOWER(name))` (in V001).
- On conflict: throw `ConflictException("DUPLICATE_ROOM_NAME")` → 409.

### Transaction Boundaries
- `@Transactional` on service methods that write to multiple tables in one operation.
- Controllers are never `@Transactional` — they call services.
- Read-only queries: no `@Transactional` needed.

### Input Validation
- Use Spring Validation: `@Valid` on `@RequestBody`, `@NotBlank` / `@Size` / `@Email` on DTO fields.
- Passwords: `@Size(min = 8)` on register and change-password.
- Validation failures throw `MethodArgumentNotValidException` — map to 400 `INVALID_REQUEST` in the `@ControllerAdvice`.

## JWT Cookie Details

Both cookies are `HttpOnly; Secure; SameSite=Lax`:
```
Set-Cookie: access_token=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/
Set-Cookie: refresh_token=<token>; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/refresh
```
- `access_token` is scoped to `Path=/` — sent on every request.
- `refresh_token` is scoped to `Path=/api/auth/refresh` — only sent to the refresh endpoint, limiting exposure.
- Login body includes `keepSignedIn: boolean`. Refresh token TTL: **30 days** if true, **7 days** otherwise.
- Logout/account-delete: clear both cookies by setting `max-age=0`.

## Package Structure

```
com.example.chat
  config/          SecurityConfig, WebSocketConfig, JwtProperties, JwtAuthFilter
  domain/
    user/          User, UserRepository, UserService
    room/          Room, RoomMember, RoomBan, RoomRepository, RoomService
    message/       Message, Attachment, MessageRepository
    friend/        Friendship, UserBan, FriendshipRepository
    file/          FileStorageService
    presence/      PresenceService
    notification/  NotificationService
  api/             REST @RestController classes — one per domain (UserController, RoomController, …)
  ws/              @MessageMapping handlers, JwtChannelInterceptor
  dto/             Request / Response data classes (field names must match api-definition.yaml exactly)
```

## Testcontainers Base Class

All integration tests extend `AbstractIntegrationTest`. The container is static — started once per JVM, shared across all test classes:

```kotlin
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
abstract class AbstractIntegrationTest {

    companion object {
        @Container
        @JvmStatic
        val postgres: PostgreSQLContainer<*> = PostgreSQLContainer("postgres:16-alpine")
            .withDatabaseName("chat_test")
            .withUsername("chat")
            .withPassword("chat")
            .apply { start() }

        @JvmStatic
        @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
        }
    }
}
```

Clean up in `@AfterEach` — **never** `@Transactional` rollback (see Testing Conventions above).

Use `connectStomp(cookie)` for all WebSocket integration tests — it handles SockJS transport and cookie auth header. Slice 3+ tests get this from `AbstractIntegrationTest`.

If tests that previously passed start failing with "connection refused" or "HikariPool timeout", see **Troubleshooting Approach** before changing any code.

## Slice Entry Criteria

| Slice | Topic | Requires before starting | Implements |
|---|---|---|---|
| 1 | Scaffold | Nothing — create project structure | Gradle wrapper, Spring Boot app, Flyway V001, Docker Compose, actuator health |
| 2 | Auth (register/login/logout/refresh) | Slice 1 gate: `actuator/health → UP`; all 11 tables exist | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/refresh`, `GET /api/auth/me`, `GET /api/auth/sessions` |
| 3 | JWT filter + STOMP auth | Slice 2 gate: all 6 auth endpoints pass `Slice2AuthTest` | `JwtAuthFilter` (cookie→`SecurityContextHolder`), `JwtChannelInterceptor` (STOMP CONNECT validation) |
| 4 | Room CRUD + membership | Slice 3 gate: JWT auth working on all REST endpoints; STOMP CONNECT validated | `POST /api/rooms`, `GET /api/rooms`, `GET /api/rooms/{id}`, `POST /api/rooms/{id}/join`, `DELETE /api/rooms/{id}/leave`, `GET /api/rooms/{id}/members` |
| 5 | Room STOMP messaging | Slice 4 gate: `POST /api/rooms`, `GET /api/rooms`, `POST /api/rooms/{id}/join`, `DELETE /api/rooms/{id}/leave` all pass; `room_members` rows created; JWT filter rejects 401 on unauthenticated requests |
| 6 | Presence | Slice 5 gate: STOMP `chat.send` delivers `MessageEvent` to `/topic/room.{id}` subscribers; `GET /api/messages/{roomId}` returns cursor-paginated history |
| 7 | Friends + DMs + bans | Slice 6 gate: `PresenceEvent` pushed to friends on STOMP connect/disconnect; AFK scheduler running; `/app/presence.activity` and `/app/presence.afk` handlers registered |
| 8 | File upload / download | Slice 7 gate: `friendships` table; `PATCH /api/friends/requests/{id}` ACCEPT creates DM room + returns `dmRoomId`; `user_bans` table; ban blocks friend request |
| 9 | Password reset | Slice 8 gate: `POST /api/rooms/{id}/files` accepts image/pdf, rejects non-media; file stored at `uploads/{roomId}/{uuid}`; `GET /api/rooms/{id}/files/{fileId}` returns bytes |
| 10 | Unread counts + notifications | Slice 9 gate: `POST /api/auth/reset-password` consumes token, updates password; expired/used token returns 200 (no enumeration) |
| 11 | React UI (all screens) | Slice 10 gate: `room_read_cursors` upsert on message read; `GET /api/rooms/{id}/unread` returns count; `NotificationEvent` pushed on mention or DM |

### DM Room Creation — On Friend Request Acceptance
DM rooms do NOT have their own creation endpoint. They are created **server-side when a friend request is accepted** (`PATCH /api/friends/requests/{id}` with `{ action: "ACCEPT" }`). The acceptance response includes `dmRoomId` (see `FriendRequestResponse` in `api-definition.yaml`).

Implementation in the accept handler:
1. Update `friendships.status` to `ACCEPTED` with `UPDATE ... WHERE status = 'PENDING'` (idempotent — no-op if already accepted).
2. Check if a DM room already exists: `SELECT room_id FROM room_members WHERE user_id = :u1 AND room_id IN (SELECT room_id FROM room_members WHERE user_id = :u2) AND visibility = 'DM'`.
3. If not found: INSERT into `rooms` (visibility=DM, no name required) + INSERT two `room_members` rows. Use `SELECT ... FOR UPDATE` on a per-user-pair lock to prevent concurrent double-creation.
4. Return `dmRoomId` in the response.

### Presence — STOMP Heartbeat, Not HTTP
Presence heartbeats travel over STOMP, **not HTTP REST**:
- Client sends empty frame to `/app/presence.activity` every 30 s from the active tab.
- Client sends to `/app/presence.afk` when all tabs go idle.
- Server: `@MessageMapping("presence.activity")` and `@MessageMapping("presence.afk")` in `PresenceHandler`.

The presence map structure:
```kotlin
// userId → (stompSessionId → lastActivityAt)
val presenceMap = ConcurrentHashMap<Long, ConcurrentHashMap<String, Instant>>()
// sessionId → userId (for disconnect cleanup)
val sessionToUser = ConcurrentHashMap<String, Long>()
```

State rules: ONLINE if any session `lastActivityAt` within 60 s; AFK if all sessions ≥ 60 s idle; OFFLINE if `presenceMap[userId]` is empty or absent.

On STOMP disconnect (`SessionDisconnectEvent`): remove session from `presenceMap[userId]`. If the map for that user is now empty → push OFFLINE to friends.

A `@Scheduled(fixedRate = 10_000)` task scans for users where all sessions are ≥ 60 s idle → transitions them to AFK and pushes `PresenceEvent` to their friends.

### CORS — Do Not Add
- Dev: Vite proxy (`vite.config.ts`) handles cross-origin between port 5173 and 8080. No backend config.
- Docker: nginx reverse-proxies `/api` and `/ws` on the same origin. No backend config.
- **Do NOT** add `@CrossOrigin` annotations or `CorsConfiguration` beans — they will conflict with the `SameSite=Lax` cookie policy and break the auth flow.

### Password Reset — Token Format and TTL
- Token: 128-bit `SecureRandom`, Base64Url encoded. Store **bcrypt hash** in `password_reset_tokens.token_hash` (not the raw token).
- TTL: **15 minutes** (`expires_at = NOW() + 15 min`).
- Email body contains the raw token in a link: `http://localhost:3000/reset-password?token={rawToken}`.
- On `POST /api/auth/reset-password { token, newPassword }`: find row where `token_hash` matches, `expires_at > NOW()`, `used_at IS NULL` — then set `used_at = NOW()` and update `users.password_hash`.
- Always return 200 for invalid/expired tokens (no enumeration). Log the failure internally.

### Sessions — Browser Info and IP Extraction
When creating a session row on login:
- `browser_info`: parse the `User-Agent` header. Use simple substring matching: check for "Chrome", "Firefox", "Safari", "Edge" (in that order; "Chrome" appears in Edge too — check Edge first).
- `ip`: read `X-Real-IP` header first (set by nginx in Docker); fall back to `request.remoteAddr`.

## Troubleshooting Approach

When a test or build fails, always find the actual root cause before changing code. The symptoms visible in the console are rarely the real issue — the first error in the chain is.

### Step 1 — Bypass Gradle's test cache

Gradle caches test results. A green `UP-TO-DATE` or red cached failure from a previous run will replay even if you just fixed the code. Always force a fresh run when debugging:

```bash
./gradlew test --tests "*Slice1*" --rerun
```

Without `--rerun`, you may be reading a stale failure from hours ago.

### Step 2 — Get the root cause, not the symptom

The first failure in the log is not always the root cause. Look for the deepest `Caused by:` in the stack trace:

```bash
./gradlew test --tests "*Slice1*" --rerun 2>&1 | grep -E "Caused by|AssertionFailedError" | head -10
```

Or read the XML report directly — it has the full stack per test:

```bash
cat build/test-results/test/TEST-com.example.chat.Slice1ScaffoldTest.xml | python3 -c "import sys,re; [print(m) for m in re.findall(r'<failure[^>]*>(.*?)</failure>', sys.stdin.read(), re.DOTALL)]"
```

### Step 3 — Before changing code, think about what changed

If tests were passing before and now fail, ask: what changed? Compare working vs. broken state with git diff before writing any fixes:

```bash
git diff HEAD src/test/kotlin/   # what test files changed?
git diff HEAD src/main/kotlin/   # what main files changed?
```

If your most recent change is the likely cause: revert it, confirm tests pass, then re-apply carefully.

### Step 4 — Simplify, don't patch

If a fix requires more than 3 changes to stop a failing test, stop. You are likely patching a symptom. Delete the broken code and rewrite the minimal version from scratch. One correct implementation beats five workarounds.

### Known Test Infrastructure Pitfalls

**`@Container @JvmStatic` + `.apply { start() }` = connection refused**
Combining Testcontainers `@Container` annotation with a manual `.apply { start() }` call causes a double-start: the companion object initializer starts the container on port X, then `TestcontainersExtension.beforeAll()` restarts it on port Y — but `@DynamicPropertySource` already captured port X. Spring connects to a stopped port. Fix: use manual start only (no `@Container` annotation on the shared container field).

**Stale Gradle test cache shows false failures**
`./gradlew test --tests "*SliceN*"` with no `--rerun` replays the last result. Always use `--rerun` when you changed code or configuration and the result seems wrong.

**`@DynamicPropertySource` must be in a companion object with `@JvmStatic`**
Without `@JvmStatic`, Spring cannot find the method as a static member, and the datasource URL stays as `jdbc:postgresql://postgres:5432/chat` (unreachable from the local JVM). The symptom is "connection refused" or "HikariPool timeout."

**`HikariPool timeout` ≠ container not started**
HikariPool times out when it can't reach the datasource URL — either the URL is wrong (profile/DynamicPropertySource issue) or the container hasn't finished starting. Check which URL HikariPool is actually using by adding this to `application-test.yml` temporarily:
```yaml
logging:
  level:
    com.zaxxer.hikari: DEBUG
```

## Troubleshooting

**Full state reset — use when everything is broken:**
```bash
docker compose down -v        # wipe all volumes (DB, uploads)
./gradlew clean               # wipe build cache
docker compose up -d          # fresh start
./gradlew test --tests "*Slice1*"   # verify scaffold baseline still holds
```
After reset, all Flyway migrations re-run from V001. Data is gone. This is always safe — there is no production.

**Backend fails to start with Flyway checksum mismatch:**
A migration file was edited after it was applied. Run the full state reset above.

**WebSocket connections drop after 60 seconds:**
nginx `proxy_read_timeout` is too low. Must be set to `3600s` in the nginx WS location block (see nginx gotcha above).

**Tests fail with "connection refused" in Testcontainers:**
Testcontainers is slow to start on first run. Increase the wait timeout in the shared container configuration, or run `docker pull postgres:16` before the first test run to pre-cache the image.

**`./gradlew` not found:**
Run `gradle wrapper` in the project root to generate the wrapper. Requires Gradle installed locally, or use `docker run --rm -v "$(pwd)":/project -w /project gradle:8 gradle wrapper`.

**MailHog not receiving emails:**
Check `spring.mail.host=mailhog` and `spring.mail.port=1025` are set in `application.yml`. Default port is 25, which will fail silently.

## Discovered Gotchas

### STOMP Principal Is Bound at CONNECT Time — No Per-Message Re-validation
Spring's `ChannelInterceptor` runs only on the `CONNECT` frame. The principal set there is stored in the STOMP session and reused for every subsequent `@MessageMapping` call — the JWT is NOT re-read on each message. This means:
- If the access token expires during an active session, `@MessageMapping` handlers continue executing with the original principal (the session is still "authenticated" from Spring's view).
- The server-side `sessions` table is NOT checked per STOMP message — only on CONNECT.
- **Mitigation:** The React client proactively refreshes before expiry (see JWT polling gotcha below). The 15-minute access token window is intentionally short to limit exposure.
- **Do NOT add per-message token validation** — it would require re-reading cookies on every STOMP frame, which STOMP's transport does not support cleanly.

### JWT Access Token Refresh — React Polling Pattern
The React client must proactively refresh the access token before it expires. Parse the `exp` claim from the JWT (decode without verify — it's in a cookie, not JS-accessible directly; use a `/api/auth/me` endpoint or embed expiry in the login response body). Schedule a `setTimeout` to call `POST /api/auth/refresh` ~30 s before expiry. On success, reschedule for the new token's expiry. On failure, call `client.deactivate()` and redirect to login.

Do NOT rely on intercepting 401 responses to trigger refresh — by the time a 401 arrives on a STOMP `@MessageMapping` handler, the WS session is already unauthenticated and cannot be silently recovered.

### DM Ban → Read-only UI
When the server pushes `NotificationEvent { type: DM_BANNED }` to `/user/queue/notifications`, the React client must:
1. Unsubscribe from the DM room's `/topic/room.{id}` topic
2. Disable the message compose input and send button for that room
3. Keep the message history visible (both parties retain read access per spec)

The ban enforcement is also server-side (403 on `chat.send`), but the UI must handle it without waiting for a rejected message attempt.

### Room Deletion — File Cleanup Order
Delete files from disk **before** deleting the room row. If disk deletion throws, do NOT delete the room row — abort and return 500. This prevents DB references with no corresponding files.

```kotlin
// Correct order:
attachmentRepository.findAllStoragePathsByRoomId(roomId).forEach { path ->
    Files.deleteIfExists(uploadsDir.resolve(path))  // throws on error — do NOT catch silently
}
roomRepository.deleteById(roomId)  // cascade removes all child rows
```

Orphaned files on disk (DB row deleted but file remains) are preferable to orphaned DB references. A background scan can clean disk orphans later.

### Partial Index with NOW() Is Invalid in PostgreSQL
`CREATE INDEX ... WHERE expires_at > NOW()` fails with "functions in index predicate must be marked IMMUTABLE" — `NOW()` is `STABLE`, not `IMMUTABLE`. Remove the predicate; use a plain index instead:
```sql
-- WRONG:  CREATE INDEX ... ON sessions(token_hash) WHERE expires_at > NOW();
-- RIGHT:  CREATE INDEX ... ON sessions(token_hash);
```
Filtering by expiry must be done in the query, not the index definition.

### Alpine-based Docker Image Has No curl — Use wget for Health Checks
`eclipse-temurin:21-jre-alpine` does not include `curl`. Docker Compose health checks using `CMD curl -f ...` will silently fail with "curl: not found". Use `wget` instead:
```yaml
healthcheck:
  test: ["CMD-SHELL", "wget -q -O- http://localhost:8080/actuator/health | grep -q UP"]
```

### Mail Health Check Uses localhost in Test and Local Profiles
`application.yml` points mail to `mailhog:1025` (Docker internal hostname). Both the `local` and `test` profiles override this to `localhost:1025` (the mapped port). This means running tests requires mailhog to be up — start it with `docker compose up -d mailhog` before running the test suite, the same way postgres must be available (Testcontainers handles postgres, but mailhog runs in Docker).

### Testcontainers — Do Not Mix `@Container` With `.apply { start() }`
Using both `@Container @JvmStatic` on the companion object field AND `.apply { start() }` in the initializer causes Testcontainers to restart the container after class loading. The `@DynamicPropertySource` lambda already captured the old port, so Spring connects to a dead port → `HikariPool timeout` / `Connection refused`. Use one approach only: the manual `.apply { start() }` without `@Container` is simpler and reliable for shared containers.

### Register Response — Spec vs. Test Discrepancy (Test Wins)
`api-definition.yaml` says `POST /api/auth/register` "Does NOT set cookies — user must log in."
The pre-written `Slice2AuthTest` contradicts this: it asserts a 201 with an `access_token` cookie and the login response body (`userId`, `username`, `accessTokenExpiresAt`).

**The test is authoritative.** Implement register so it both creates the account AND logs the user in (sets cookie, returns `AuthResponse`). The API spec description is incorrect; do not update the test.

### Multi-tab Logout — Intentional Per-Session Invalidation
`POST /api/auth/logout` invalidates only the session token in the current request's cookie. Other browser tabs remain valid. This is correct per Requirement 2.2.4 ("logout from current browser only; other sessions remain valid"). Do not attempt to push a disconnect event to other tabs on logout — this is by design.

### Follow Industry Standards — Don't Reinvent

Before implementing any cross-cutting concern (auth, caching, messaging, pagination, file handling, etc.), check whether Spring Boot / the existing stack already has a first-class solution. Use that solution. Do not invent a custom mechanism when a standard one exists.

Examples already in this project:
- **STOMP + JWT auth**: Spring's documented two-path pattern — `HandshakeInterceptor` captures the cookie from the HTTP upgrade (browser path); `JwtChannelInterceptor` reads STOMP native headers as fallback (test/programmatic path). Both paths set the principal via `UsernamePasswordAuthenticationToken`.
- **Spring API misuse**: `connectAsync(url, handler, stompHeaders)` silently treats `StompHeaders` as a URI var (wrong overload). Correct form: `connectAsync(url, null, stompHeaders, handler)` — maps to `(String, WebSocketHttpHeaders=null, StompHeaders, StompSessionHandler)` and actually sends STOMP CONNECT headers.
- **Validation**: use Spring's `@Valid` + `@NotBlank`/`@Size` — not hand-rolled null checks.
- **Error handling**: single `@ControllerAdvice` — not per-controller try/catch.

When in doubt: search Spring's reference docs or the existing codebase for a proven pattern before writing custom code.

**Avoid known performance anti-patterns at write time.** N+1 queries are the most common: never load a list of entities then loop to fetch related data per row. Use JOIN queries, Spring Data projections, or `@Query` with GROUP BY to fetch aggregates in one round-trip. If a query shape can't be avoided in a slice, leave a `// TODO: optimise — N+1` comment so it's visible in review.

### TestRestTemplate + 401 on POST → HttpRetryException (JDK HttpURLConnection)
When the server returns a 401 on a POST request, JDK's `HttpURLConnection` tries to retry with authentication. Since the POST body is already streamed it can't retry and throws `HttpRetryException`, surfacing as `ResourceAccessException` in tests. Fix: add `testImplementation("org.apache.httpcomponents.client5:httpclient5")` to `build.gradle.kts`. Spring Boot's test auto-configuration detects Apache HTTP client on the classpath and switches `TestRestTemplate` to use it, which handles 4xx responses cleanly without retrying.

### JPQL JOIN Fails on Unrelated Entities — Use Native SQL With Interface Projections
JPQL `LEFT JOIN` only works between entities with a mapped association (`@OneToMany`, `@ManyToOne`). Entities that share a FK column but have no JPA relationship mapping (e.g., `Room` and `RoomMember` linked by `roomId`) cannot be joined in JPQL — the query compiles but throws at runtime. Use `nativeQuery = true` with a Spring Data interface projection instead:

```kotlin
// WRONG — no @ManyToOne between Room and RoomMember, JPQL JOIN fails:
@Query("SELECT r, COUNT(rm.id) FROM Room r LEFT JOIN RoomMember rm ON rm.roomId = r.id WHERE r.id = :id GROUP BY r.id")
fun findByIdWithCount(@Param("id") id: Long): Room?

// RIGHT — native SQL + interface projection, single round-trip, no N+1:
@Query(value = """
    SELECT r.id, r.name, COUNT(rm.id) AS memberCount
    FROM rooms r LEFT JOIN room_members rm ON rm.room_id = r.id
    WHERE r.id = :id GROUP BY r.id
""", nativeQuery = true)
fun findByIdWithCount(@Param("id") id: Long): List<RoomWithCountProjection>
```

Return `List<Projection>` (not `Optional`) for native aggregate queries — call `.firstOrNull()` in the service.

### @AfterEach Cleanup Order Must Match FK Dependency Direction
When entities share a FK and the constraint is `ON DELETE SET NULL` (not CASCADE), the parent row survives child deletion but the child is orphaned. For test cleanup: always delete the dependent/child table first, then the parent. Wrong order silently leaves rows that bleed into the next test:

```kotlin
// Schema: rooms.owner_id REFERENCES users ON DELETE SET NULL
// Deleting users first leaves rooms (owner_id becomes NULL — rooms persist)

@AfterEach
fun cleanup() {
    roomRepository.deleteAll()   // children first
    userRepository.deleteAll()   // parent after
}
```

Any table with `ON DELETE SET NULL` pointing at `users` must be cleared before `userRepository.deleteAll()`. Check the Flyway migration for each entity's FK constraint to determine order.

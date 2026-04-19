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
2. When other documents contradict each other: investigate the topic, apply industry best practice, then reconcile **all** documents to the chosen approach. Do not blindly favour `api-definition.yaml` over `architecture-proposal.md` or vice versa — both were vibe-coded and can be wrong. The right answer comes from requirements + industry standards.
3. `CLAUDE.md` — implementation conventions (updated as decisions are made)

**When inconsistencies are found:** Always check `requirements.md` first. Then investigate the contradiction using industry standards. Pick the better option, implement it, and update every document to match — do not leave contradictions in place. Fix them in the same commit as the code change that exposed them.

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

### Frontend E2E Tests (Playwright)

Run from `frontend/` with the fast loop active (backend on :8080, frontend dev server on :5173):

```bash
# Run one slice's tests
npx playwright test e2e/sliceF4.spec.ts --project=chromium

# Run regression (all prior slices + current)
npx playwright test e2e/sliceF2.spec.ts e2e/sliceF3.spec.ts e2e/sliceF4.spec.ts --project=chromium

# Run a single test by name grep
npx playwright test e2e/sliceF4.spec.ts --project=chromium --grep "T-F4-08"
```

**When a test times out on an element that should be visible:**
1. Check for a JS crash first — it's usually `global is not defined` (SockJS polyfill missing) or a React render error. The page renders blank; all selectors time out.
2. Verify the dev server is running on :5173 and commands are run from `frontend/`.
3. Use a quick Node snippet to check what the page actually renders:
   ```bash
   node -e "
   const { chromium } = require('@playwright/test');
   (async () => {
     const b = await chromium.launch();
     const p = await b.newPage();
     p.on('pageerror', e => console.log('PAGE ERROR:', e.message));
     await p.goto('http://localhost:5173/register');
     await p.waitForTimeout(2000);
     console.log('email inputs:', await p.locator('input[type=email]').count());
     await b.close();
   })();
   "
   ```
4. `workers: 1` is required (set in `playwright.config.ts`) — multiple workers cause STOMP timing failures and ID collisions. Never remove it.

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

**Frontend regression gate:** Before committing a frontend slice, run all prior frontend E2E specs in addition to the current slice's spec:
```bash
cd frontend && npx playwright test e2e/sliceF2.spec.ts e2e/sliceF3.spec.ts  # example for after F3
```
Or run all at once: `npx playwright test e2e/`. Never commit if any prior slice's E2E tests regress.

- **One mandatory commit per slice**, immediately after `/test-slice` passes. Never commit red tests.
- Commit message format: `slice N: <short description>` — e.g., `slice 2: auth — register, login, sessions, password reset`
- Within a slice, WIP commits are allowed for large in-progress work: `wip: slice 3 stomp broker setup`
- Before committing: remove commented-out code, dead imports, and `.bak` files.
- Before committing a completed slice, run `/reflect` to review the slice and update `CLAUDE.md` with any non-obvious gotchas — then commit everything together.
- After each slice commit, run `/build-check` to confirm the tree is clean before starting the next slice.

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
- Only `GET /api/messages/{roomId}` is paginated. Use cursor-based pagination: `?before={messageId}&limit=50` (default 50, max 100).
- Response shape: **plain `List<MessageResponse>` JSON array** — no wrapper object. The client infers `hasMore` by checking `length < limit`. (CLAUDE.md previously said `{ messages, hasMore }` — that was wrong; api-definition.yaml is authoritative.)
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
- Token: 128-bit `SecureRandom`, Base64Url encoded. Store **SHA-256 hash** (Base64Url) in `password_reset_tokens.token_hash` (not the raw token). Do NOT use bcrypt — bcrypt produces a different salt each call so the stored hash can never be matched by re-hashing the raw token at lookup time. SHA-256 is correct for high-entropy random tokens.
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

### StompSession.send() Rejects Kotlin Maps With Nullable Values
`StompSession.send(StompHeaders, Object)` is a Java method that expects non-nullable `Object`. A Kotlin `mapOf("key" to nullableValue)` infers `Map<String, Any?>` — the nullable `Any?` fails to satisfy `Any` at the call site, causing a compile error. Cast the map to `Any` explicitly:

```kotlin
// WRONG — compile error: "Type mismatch: inferred type is Any? but Any was expected"
session.send(headers, mapOf("roomId" to roomId, "parentMessageId" to parentId))

// RIGHT — cast the whole map to Any before passing
session.send(headers, mapOf("roomId" to roomId, "parentMessageId" to parentId) as Any)
```

This applies whenever any map value is nullable (e.g., obtained from another `Map<*, *>` lookup).

### STOMP Subscription Registration Is Asynchronous — Sleep Before Sending
After `session.subscribe(destination, handler)` returns, the subscription frame has been enqueued but may not yet be acknowledged by the broker. If you send a message immediately after subscribing, the event can arrive before the subscription is registered and is silently dropped — no error, no delivery. Always add a brief sleep between subscribing and sending in STOMP tests:

```kotlin
val ref = subscribeAndCapture(session, "/topic/room.$roomId")
Thread.sleep(200) // mandatory — subscription registers asynchronously
session.send(sendHeaders, payload as Any)
```

200 ms is sufficient for the in-process SimpleBroker. Use an `AtomicReference` + polling loop (`awaitValue`) rather than a `CountDownLatch` when you cannot predict the exact message count.

### @MessageMapping Exceptions Do Not Propagate to Subscribers — Test by Absence
When a `@MessageMapping` handler throws (e.g., `ForbiddenException` for a non-member), Spring does **not** broadcast an ERROR frame to room subscribers — it silently swallows the exception (or disconnects only the offending session via `StompSubProtocolErrorHandler`). To assert authorization enforcement in STOMP tests, verify that the expected event was **not** delivered rather than catching an error frame:

```kotlin
sendStomp(nonMemberSession, mapOf("roomId" to roomId, "content" to "intruder"))
Thread.sleep(600) // give it time to arrive if it were going to
assertThat(roomEventRef.get()).isNull() // correct assertion pattern
```

### convertAndSendToUser Requires the Principal to Implement java.security.Principal
`SimpMessagingTemplate.convertAndSendToUser(name, destination, payload)` routes by matching `name` against every active session's `session.user.name`. The `name` comes from `AbstractAuthenticationToken.getName()`, which delegates to `principal.getName()` only if the principal implements `java.security.Principal`. If it doesn't, it falls back to `principal.toString()` — and `convertAndSendToUser("1", "/queue/presence", event)` silently delivers to nobody. Fix: make your principal class implement the interface:

```kotlin
// WRONG — toString() is used as name; routing silently fails
data class ChatPrincipal(val userId: Long, val sessionId: Long)

// RIGHT — getName() = "1" (userId.toString()), matches convertAndSendToUser argument
data class ChatPrincipal(val userId: Long, val sessionId: Long) : java.security.Principal {
    override fun getName() = userId.toString()
}
```

Use the userId (not username) as the routing key so `convertAndSendToUser(friendId.toString(), ...)` and subscriptions work consistently without a username → session lookup.

### @Scheduled Task Testing — Call the Method Directly, Don't Wait for the Timer
`@Scheduled(fixedRate = 10_000)` fires every 10 s. Waiting for a real scheduler tick makes tests slow and flaky. Instead, make the scheduled method `public` and call it directly in tests after manipulating state. Pair with a configurable timeout property so you can set a short value in the test profile:

```kotlin
// Service
@Value("\${chat.presence.afk-timeout-seconds:60}")
var afkTimeoutSeconds: Long = 60

@Scheduled(fixedRate = 10_000)
fun runAfkScan() { /* ... */ }

// application-test.yml
chat:
  presence:
    afk-timeout-seconds: 2

// Test
Thread.sleep(2500)           // let the short timeout expire
presenceService.runAfkScan() // call directly — no timer wait
val event = awaitEvent(ref)
assertThat(event["status"]).isEqualTo("AFK")
```

### Native SQL Interface Projection — 500 Error When Column Aliases Don't Match Getter Names
When a Spring Data native SQL query returns a result that cannot be mapped to an interface projection (column name mismatch, wrong type), Spring throws at deserialization time and the endpoint returns a 500. The symptom in tests is a `MismatchedInputException` (Jackson tried to deserialize a JSON object as a List). Underscore column names like `requester_id` do **not** auto-map to camelCase getters like `getRequesterId()` reliably in native queries. Always use explicit camelCase aliases, or avoid the projection entirely and use two simpler queries:

```kotlin
// FRAGILE — requester_id column may not map to getRequesterId() in all Spring Data versions
@Query("SELECT f.requester_id, f.addressee_id ... FROM friendships f ...", nativeQuery = true)
fun findFriendsWithDetails(...): List<ComplexProjection>

// SAFE — two simple queries, no projection mapping risk
val friendIds = friendshipRepository.findAcceptedFriendIds(userId)   // returns List<Long>
val usersById = userRepository.findAllById(friendIds).associateBy { it.id }
```

### Making a Column Nullable Is a 5-Layer Cascade
When you change a DB column from `NOT NULL` to nullable, five things must change together or you get a runtime crash that's hard to trace: (1) Flyway migration, (2) JPA entity field (`var name: String?`), (3) every JPA projection interface getter (`fun getName(): String?`), (4) every DTO field, and (5) every native SQL query that applies a function to that column (e.g., `LOWER(name) LIKE ...` — add `AND name IS NOT NULL` guard). Missing the projection interface is the sneakiest: Spring's proxy returns `null` but the non-nullable Kotlin getter causes a `NullPointerException` deep in Spring's reflection layer with no pointer to your code.

```kotlin
// WRONG — name is nullable in DB; Spring proxy returns null; Kotlin throws NPE in reflection
interface RoomWithCountProjection {
    fun getName(): String   // non-nullable return type on a nullable column
}

// RIGHT — all four layers updated together
interface RoomWithCountProjection {
    fun getName(): String?  // matches DB nullability
}
// AND in native SQL query:
// WHERE r.visibility = 'PUBLIC'
//   AND r.name IS NOT NULL        ← explicit guard even if visibility already filters DM rooms
//   AND LOWER(r.name) LIKE ...
```

### User Ban Enforces DM Read-Only via room_bans, Not user_bans Check
`MessageService.chat.send` only checks `room_bans` — it does not know about `user_bans`. When `POST /api/users/{id}/ban` runs, it must explicitly insert a `room_bans` row for the DM room (if one exists) to make the DM read-only for the banned user. If you forget this step, the banned user can still send DM messages even though the user ban exists.

```kotlin
// In FriendService.banUser — explicit room_bans insert required:
val dmRoomId = roomMemberRepository.findDmRoomId(bannerId, bannedId)
if (dmRoomId != null && !roomBanRepository.existsByRoomIdAndUserId(dmRoomId, bannedId)) {
    roomBanRepository.save(RoomBan(roomId = dmRoomId, userId = bannedId, bannedById = bannerId))
    notificationService.push(bannedId, "DM_BANNED", mapOf("roomId" to dmRoomId))
}
// MessageService already checks: roomBanRepository.existsByRoomIdAndUserId(roomId, senderId)
// No change to MessageService needed — the chain is: user ban → room ban → existing check
```

### Multipart Upload in TestRestTemplate — ByteArrayResource Must Override `getFilename()`
When testing multipart uploads with `TestRestTemplate`, adding a plain `ByteArrayResource` to `LinkedMultiValueMap` produces a part with no `filename` in the `Content-Disposition` header — Spring's `MultipartFile.originalFilename` is then null and some controllers or validation may fail silently. You must override `getFilename()`. Also override `contentLength()` to avoid Spring having to buffer the stream just to compute it.

```kotlin
// WRONG — no filename in part header; MultipartFile.originalFilename is null in the controller
body.add("file", ByteArrayResource(content))

// RIGHT — override both methods
body.add("file", object : ByteArrayResource(content) {
    override fun getFilename() = "photo.jpg"
    override fun contentLength() = content.size.toLong()
})
```

### `MaxUploadSizeExceededException` Is Thrown Before the Controller — Handle It in `@ControllerAdvice`
When a multipart upload exceeds `spring.servlet.multipart.max-file-size`, Spring rejects the request at the servlet filter layer and throws `MaxUploadSizeExceededException` before the controller is invoked. You cannot catch it in the controller. Without a `@ControllerAdvice` handler it returns 500. The handler must be in `GlobalExceptionHandler`:

```kotlin
// In GlobalExceptionHandler — required alongside FileSizeLimitException handler:
@ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException::class)
fun handleMultipartSize(e: MaxUploadSizeExceededException): ResponseEntity<Map<String, String>> =
    ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(mapOf("error" to "FILE_TOO_LARGE"))
```

Application-level size checks (e.g., image 3 MB limit) throw a domain exception that IS caught normally; only the servlet-level limit (20 MB in `application.yml`) takes this path.

### Upload-First Flow Requires Nullable FK on the Attachment Table
Any "upload a resource, then reference it later" flow means the linking FK must be nullable at upload time. If `attachments.message_id` is `NOT NULL`, the upload endpoint cannot insert the row until a message is created — breaking the intended two-step flow. Make the FK nullable in V001 and set it in the second step:

```kotlin
// Attachment inserted at upload time with message_id = null
attachmentRepository.save(Attachment(id = uuid, messageId = null, ...))

// Linked when message is created via chat.send
val att = attachmentRepository.findByIdAndMessageIdIsNull(cmd.attachmentId)
att.messageId = msg.id
attachmentRepository.save(att)
```

This pattern applies to any "stage then commit" resource flow (file → message, draft → post, etc.).

### bcrypt Cannot Be Used for Token Lookup — Use SHA-256 for High-Entropy Random Tokens
bcrypt is designed so that the same input produces a different output each call (random salt embedded in the result), making it impossible to find a stored hash by re-hashing a candidate value. This is correct for passwords but wrong for any token that must be looked up in a DB column. Use SHA-256 (Base64Url) for high-entropy random tokens (sessions, password reset, email verification) — the randomness of the token itself provides security; SHA-256 only prevents recovering the raw token if the DB leaks.

```kotlin
// WRONG — bcrypt can never match; lookup always returns null
fun sha256(input: String) = BCrypt.hashpw(input, BCrypt.gensalt())
val token = tokenRepository.findByTokenHash(sha256(rawToken))  // always null

// RIGHT — deterministic hash, lookup works
private fun sha256(input: String): String {
    val hash = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
    return Base64.getUrlEncoder().withoutPadding().encodeToString(hash)
}
val token = tokenRepository.findByTokenHash(sha256(rawToken))  // matches
```

### No-Enumeration Policy Returns 200 for All Invalid Token States
The architecture proposal specifies 400 for expired/used/unknown password reset tokens. The pre-written test (`Slice9PasswordResetTest`) is authoritative and expects 200 in all invalid cases — this is the correct security posture (no enumeration: an attacker cannot distinguish "token expired" from "no account with that email"). Always return 200 and log the failure internally. The same pattern applies to any future token-consuming endpoint (email verification, invite links).

```kotlin
// WRONG — leaks whether the token existed at all
if (token == null) return ResponseEntity.badRequest().body(mapOf("error" to "INVALID_TOKEN"))

// RIGHT — always return 200, log internally
if (token == null || token.expiresAt.isBefore(Instant.now()) || token.usedAt != null) {
    log.info("Password reset attempted with invalid/expired/used token")
    return  // caller @ResponseStatus defaults to 200
}
```

### Test Injection Pattern for Hashed-Token Flows
When the raw token is generated server-side and stored only as a hash, tests cannot recover the raw token after the fact. Inject a known raw token directly into the DB with its pre-computed hash instead of going through the email flow:

```kotlin
// In test — bypass email by inserting a row with a known hash
val knownRaw = "test-reset-token-12345"
passwordResetTokenRepository.save(
    PasswordResetToken(
        userId = userId,
        tokenHash = sha256Hex(knownRaw),   // same algorithm as service
        expiresAt = Instant.now().plusSeconds(900),
    )
)
val resp = post("/api/auth/reset-password", mapOf("token" to knownRaw, "newPassword" to "newPass1!"))
```

Duplicate the same SHA-256 helper in the test class (keep it private) so tests never depend on the service's internal method.

### `@Modifying` Native Upsert Requires `@Transactional` on the Calling Method
Spring Data's `@Modifying @Query(nativeQuery = true)` throws `TransactionRequiredException` if called outside an active transaction. This catches out `@Transactional(readOnly = true)` service methods and non-transactional helpers. Always make the calling service method `@Transactional` (or `@Transactional(readOnly = false)` explicitly):

```kotlin
// WRONG — TransactionRequiredException at runtime
fun getHistory(roomId: Long, userId: Long, ...): List<MessageResponse> {
    roomReadCursorRepository.upsertReadCursor(roomId, userId)  // throws!
    ...
}

// RIGHT — @Transactional on the method that calls @Modifying
@Transactional
fun getHistory(roomId: Long, userId: Long, ...): List<MessageResponse> {
    roomReadCursorRepository.upsertReadCursor(roomId, userId)  // works
    ...
}
```

### SQL `id > NULL` Is Always False — Use COALESCE for Missing Read Cursors
When a user has never read a room, there is no `room_read_cursors` row, so `last_read_message_id` is `NULL`. In SQL, `id > NULL` evaluates to `NULL` (unknown), not `TRUE` — so `COUNT(*) WHERE id > NULL` returns 0 even if there are 100 unread messages. Always wrap the subquery result in `COALESCE(..., 0)`:

```sql
-- WRONG — returns 0 unread for users with no cursor row (id > NULL = NULL)
SELECT COUNT(*) FROM messages WHERE id > (
    SELECT last_read_message_id FROM room_read_cursors WHERE room_id = :r AND user_id = :u
)

-- RIGHT — COALESCE converts NULL to 0, so all messages count as unread
SELECT COUNT(*) FROM messages
WHERE room_id = :roomId AND deleted_at IS NULL
  AND id > COALESCE(
      (SELECT last_read_message_id FROM room_read_cursors WHERE room_id = :r AND user_id = :u),
      0)
```

### JPA `@EmbeddedId` Requires the Embeddable to Implement `Serializable`
Composite PKs in JPA must be serializable — Hibernate validates this at startup and throws `MappingException` if the `@Embeddable` class does not implement `java.io.Serializable`. This applies to any entity that uses `@EmbeddedId` or `@IdClass`.

```kotlin
// WRONG — Hibernate throws MappingException at startup
@Embeddable
data class RoomReadCursorId(val roomId: Long = 0, val userId: Long = 0)

// RIGHT — implements Serializable
@Embeddable
data class RoomReadCursorId(
    val roomId: Long = 0,
    val userId: Long = 0,
) : java.io.Serializable
```

### getMyRooms N+1 — Intentional Deferral
The `getMyRooms()` implementation uses one query per room to fetch `unreadCount` — an N+1 pattern. The architecture proposal (line 318) recommends a single CTE/window-function query. For this sprint the N+1 is acceptable (bounded dataset), but it should be addressed before any load testing. See `// TODO: optimise — N+1` comment in `RoomService.getMyRooms()`.

### TanStack Start Has No `index.html` or `main.tsx` — Must Create Both for Plain Vite SPA
TanStack Start generates the HTML entry point server-side via `shellComponent` in `__root.tsx` and the Vite plugin — there is no `index.html` or `src/main.tsx` in the repo. Stripping TanStack Start requires creating both files manually; without them `vite build` fails with "Could not resolve entry module".

```tsx
// src/main.tsx — required for plain Vite SPA
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import "./styles.css";

const router = getRouter();
createRoot(document.getElementById("root")!).render(
  <StrictMode><RouterProvider router={router} /></StrictMode>
);
```

### TanStack Start `__root.tsx` Uses SSR-Only APIs — Remove All of Them for SPA
`createRootRoute` in TanStack Start accepts `head()`, `shellComponent`, and `scripts` options that are resolved server-side. In a plain Vite SPA these fields don't exist on the type and will cause a TypeScript error. Also, the CSS URL import (`import appCss from "../styles.css?url"`) is a TanStack Start convention — in SPA mode, import CSS directly in `main.tsx` instead.

```tsx
// WRONG — TanStack Start fields, won't compile in plain TanStack Router
export const Route = createRootRoute({
  head: () => ({ meta: [...], links: [{ rel: "stylesheet", href: appCss }] }),
  shellComponent: RootShell,   // SSR-only
  component: RootComponent,
});

// RIGHT — plain TanStack Router root
export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});
// CSS imported in main.tsx: import "./styles.css";
```

### `@lovable.dev/vite-tanstack-config` Bundles Everything — Replace With Explicit Plugins
The Lovable config package bundles `tanstackStart`, `cloudflare`, TailwindCSS, tsconfig paths, and the TanStack Router codegen plugin as a single opaque export. Replacing it requires manually listing each plugin: `@vitejs/plugin-react`, `@tailwindcss/vite`, `TanStackRouterVite` from `@tanstack/router-plugin/vite`, and `vite-tsconfig-paths`. The `routesDirectory` and `generatedRouteTree` options must be passed explicitly to `TanStackRouterVite`.

```ts
// RIGHT — explicit plugin list after stripping Lovable config
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

plugins: [
  TanStackRouterVite({ routesDirectory: "src/routes", generatedRouteTree: "src/routeTree.gen.ts" }),
  react(),
  tailwindcss(),
  tsconfigPaths(),
]
```

### TanStack Router `beforeLoad` Cannot Access React Context — Use `useEffect` AuthGuard
`beforeLoad` and `loader` in TanStack Router run outside the React rendering tree, before providers mount. Calling `useContext(AuthContext)` inside them throws "Cannot read properties of undefined". AuthGuard must live inside the route component as a `useEffect` that redirects when `!loading && !user`:

```tsx
// WRONG — AuthContext not available outside React tree
export const Route = createFileRoute('/rooms')({
  beforeLoad: ({ context }) => {
    const { user } = useAuth(); // runtime error: hooks outside component
    if (!user) throw redirect({ to: '/login' });
  }
});

// RIGHT — useEffect AuthGuard inside the component
function RoomsLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !user) navigate({ to: '/login' });
  }, [loading, user]);
  if (loading || !user) return <LoadingSpinner />;
  return <Outlet />;
}
```
Also add a loading/!user early return to prevent rendering protected content before the redirect fires.

### Lovable Route Files Include `head()` SSR Export — Remove for SPA
Lovable's TanStack Start scaffold adds a `head()` export to every route file via `createFileRoute`. In plain TanStack Router (SPA mode), `createFileRoute` does not accept `head` and TypeScript errors. Remove all `head()` calls from every route file created by Lovable before running `npm run build`.

```tsx
// WRONG — TanStack Start only
export const Route = createFileRoute('/login')({
  head: () => ({ meta: [{ title: 'Login' }] }),
  component: LoginPage,
});

// RIGHT — plain TanStack Router
export const Route = createFileRoute('/login')({
  component: LoginPage,
});
```

### `logout()` Must Clear State in `finally` — Network Error Still Invalidates Client
If the `POST /api/auth/logout` request fails (network error, 500), the client should still clear the local user state. A `try/catch` that only clears on success leaves users stuck in a ghost-authenticated state. Always use `finally`:

```tsx
// WRONG — user state survives a failed logout call
const logout = async () => {
  await authService.logout();
  setUser(null);  // never reached on network error
};

// RIGHT — clear state regardless of network outcome
const logout = async () => {
  try { await authService.logout(); }
  finally { setUser(null); clearTimeout(refreshTimerRef.current); }
};
```

### MailHog API for E2E Email Testing
To retrieve emails in Playwright tests, poll `http://localhost:8025/api/v2/messages`. The API is always available regardless of whether mail was sent (returns `{ items: [] }` if empty). Latest message is `items[0]`. Extract tokens from `Content.Body` (plain text, URL-encoded):

```typescript
const mailResp = await request.get("http://localhost:8025/api/v2/messages");
const mailJson = await mailResp.json();
const body: string = mailJson.items[0]?.Content?.Body ?? "";
const tokenMatch = body.match(/token=([A-Za-z0-9_-]+)/);
const token = tokenMatch?.[1];
test.skip(!token, "Could not extract reset token from MailHog");
```

### `validateSearch` Is Required to Read Query Params in TanStack Router
TanStack Router does not expose raw query strings via `useSearch()` without a `validateSearch` schema on the route. Without it, `useSearch()` returns an empty object. Use `validateSearch` with a Zod schema or manual validator:

```tsx
export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) ?? '',
  }),
  component: ResetPasswordPage,
});

// Inside the component:
const { token } = Route.useSearch();
```

### Playwright `request` Fixture Doesn't Share Browser Cookies — Use `page.request` for Authenticated API Calls
The `request` fixture in Playwright tests is an isolated `APIRequestContext` with no shared state. Calling `request.post('/api/rooms', ...)` against an authenticated endpoint returns 401 even if the browser tab is logged in. Use `page.request.post(...)` instead — it shares the same cookie store as the browser context.

```typescript
// WRONG — isolated context, 401 on protected endpoints
test("...", async ({ page, request }) => {
  await register(page, ...);
  await request.post("http://localhost:8080/api/rooms", { ... }); // 401
});

// RIGHT — shares browser cookies
test("...", async ({ page }) => {
  await register(page, ...);
  await page.request.post("http://localhost:8080/api/rooms", { ... }); // 201
});
```

### Playwright Assertions for Rooms Must Be Scoped to `main` or `aside`
Room names appear in both the catalog (`main`) and the user's sidebar (`aside`). An unscoped `page.locator('text=roomName')` fails with "strict mode violation: resolved to 2 elements". Always scope assertions to the relevant container:

```typescript
// WRONG — strict mode violation if room appears in both sidebar and main
await expect(page.locator(`text=${roomName}`)).toBeVisible();

// RIGHT — scoped to main content area
await expect(page.locator("main").locator(`text=${roomName}`)).toBeVisible();
// or: await expect(page.locator("aside").locator(`text=${roomName}`)).toBeVisible();
```

### React Sidebar Accordion State Doesn't Reset on Navigation Within Layout
`useState(!inRoom)` only initializes once when the component mounts. If a user navigates from `/rooms` (inRoom=false, accordion expanded) to `/rooms/123` (inRoom=true), `inRoom` changes but the `useState` value stays at the initialized value. Requires `useEffect` to sync:

```tsx
// WRONG — state only initializes once; navigation doesn't collapse accordion
const [roomsOpen, setRoomsOpen] = useState(!inRoom);

// RIGHT — useEffect collapses/expands on navigation
const [roomsOpen, setRoomsOpen] = useState(!inRoom);
useEffect(() => { setRoomsOpen(!inRoom); }, [inRoom]);
```

### SockJS Requires `global` Polyfill in Vite — Add `define: { global: "globalThis" }` to vite.config.ts
SockJS references `global` (a Node.js global) at module load time. In a browser bundle this throws `ReferenceError: global is not defined` which crashes the entire React app silently — the page loads a blank body with no error visible in the UI. Add the polyfill to the Vite config:

```ts
// vite.config.ts
export default defineConfig({
  define: {
    global: "globalThis",  // required for SockJS
  },
  // ...
});
```

Without this, all routes render blank and Playwright tests fail with "waiting for locator(...)" timeouts — not an obvious connection to SockJS.

### Backend `UserSummary` Uses `id`, Not `userId` — Frontend Types Must Match Exactly
The backend `UserSummary` DTO has field `id: Long` (not `userId`). The frontend `Message.sender` type must mirror this. If typed as `{ userId: number }`, `message.sender?.userId` is always `undefined` — `isMine` is always false, the Edit button never renders, and delete permissions are wrong for all users.

```typescript
// WRONG — sender.userId is always undefined; isMine is always false
interface Message {
  sender: { userId: number; username: string } | null;
}

// RIGHT — matches UserSummary DTO
interface Message {
  sender: { id: number; username: string } | null;
}
// Usage in component:
const isMine = message.sender?.id === user?.userId;
```

### React State Hover Is Unreliable in Playwright Headless — Use CSS `group-hover`
Playwright's `.hover()` triggers CSS `:hover` pseudo-class but does NOT reliably fire React `onMouseEnter` / `onMouseLeave` events in headless Chromium under load. If action buttons (Reply, Edit, Delete) are hidden via `{hover && ...}` React state, Playwright tests that hover and then click the button fail intermittently. Switch to Tailwind's CSS-based approach — the parent div already has `group` class:

```tsx
// WRONG — React state hover; unreliable in Playwright headless
const [hover, setHover] = useState(false);
<div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
  {hover && <div className="... flex">...</div>}
</div>

// RIGHT — CSS group-hover; reliable in all Playwright modes
<div className="group ...">
  <div className="hidden group-hover:flex ...">...</div>
</div>
```

### Playwright E2E Tests Must Run With `workers: 1` for STOMP-Dependent Tests
Running E2E tests with multiple Playwright workers (the default) puts parallel load on the backend, which causes STOMP WebSocket connections to establish slowly. A test that sends a STOMP message and then immediately checks for the echoed response can fail with "element not found" when the STOMP subscription races with the send. Additionally, two workers starting at the same millisecond will generate identical `Date.now()`-based unique IDs (causing duplicate email errors). Fix both by setting `workers: 1` in `playwright.config.ts` and using `crypto.randomBytes` in `uniqueUser()`:

```ts
// playwright.config.ts
export default defineConfig({
  workers: 1,  // serial execution — prevents STOMP timing races and ID collisions
  // ...
});

// e2e/helpers.ts
import crypto from "crypto";
export function uniqueUser() {
  const id = `${Date.now()}${crypto.randomBytes(3).toString("hex")}`;
  return { email: `testuser${id}@example.com`, username: `tu${id}`, password: "TestPass123!" };
}
```

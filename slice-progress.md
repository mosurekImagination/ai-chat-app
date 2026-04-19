# Slice Progress

Update at every slice commit. Read this file first after any context reset.

| Slice | Status | Commit | Notes |
|---|---|---|---|
| 1 | ✅ | — | scaffold |
| 2 | ✅ | — | auth |
| 3 | ✅ | — | JWT filter + STOMP auth |
| 4 | ✅ | — | room CRUD + membership |
| 5 | ✅ | — | room STOMP messaging |
| 6 | ✅ | — | presence |
| 7 | ✅ | — | friends + DMs + bans |
| 8 | ✅ | — | file upload/download |
| 9 | ✅ | — | password reset + change-password |
| 10 | ✅ | — | unread counts + notifications |
| 11 | ⬜ | — | React UI |
| F1 | ✅ | — | frontend scaffold (strip TanStack Start, vite config, nginx, Dockerfile) |
| F2 | ✅ | 692a56d | auth — register, login, logout, password reset, AuthContext, 12 E2E tests pass |
| F3 | ✅ | c2fdc20 | layout + room list (sidebar, catalog, create/join, members) — 12 E2E pass |
| F4 | ✅ | — | STOMP messaging — send/edit/delete/reply, file upload, infinite scroll — 14 E2E pass |
| F5 | ✅ | — | presence, notifications, unread counts — 6 E2E pass |
| F6 | ✅ | ec23aef | room management — ban/unban, roles, invitations, delete, leave, admin msg delete — 11 E2E pass |
| F7 | ⬜ | — | friends, DMs, account settings, sessions |

Legend: ✅ done · 🔄 in progress · ⬜ not started · ❌ blocked

## Discovered Gotchas

Add entries here immediately when discovered — then copy to CLAUDE.md `## Discovered Gotchas`.

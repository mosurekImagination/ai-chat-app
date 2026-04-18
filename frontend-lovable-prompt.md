
## Project: Chat Application Frontend

### Existing scaffold (do not modify these files)
- `package.json` — React 18, react-router-dom v6, @stomp/stompjs v7, sockjs-client, TypeScript, Tailwind CSS, Vite
- `vite.config.ts` — already proxies `/api` → `http://localhost:8080` and `/ws` → ws://localhost:8080
- `tailwind.config.ts` — basic Tailwind setup

### Add these packages
```
npx shadcn@latest init
npx shadcn@latest add button input textarea dialog dropdown-menu avatar badge scroll-area separator tabs tooltip sheet
npm install emoji-mart @emoji-mart/data @emoji-mart/react
npm install msw --save-dev
```

---

### Design system

**Dark theme — Discord-inspired. All components use these tokens:**

```
Background:      bg-gray-950   (page root)
Sidebar:         bg-gray-900
Chat area:       bg-[#1e2124]  (custom — not standard Tailwind)
Message input:   bg-gray-800
Surface / card:  bg-gray-800
Border:          border-gray-700
Text primary:    text-gray-100
Text secondary:  text-gray-400
Text muted:      text-gray-500

Accent (links, active states, buttons): indigo-500 / indigo-600
Danger (delete, ban): red-500
Success: green-500

Presence:
  Online dot:  bg-green-400 (filled circle)
  AFK dot:     bg-amber-400 (filled circle)
  Offline dot: border-2 border-gray-500 bg-transparent (ring only, hollow)

Unread badge: bg-red-500 text-white text-xs rounded-full px-1.5 min-w-[1.25rem] text-center
"Edited" label: text-gray-500 text-xs ml-1
Deleted message: text-gray-500 italic text-sm
```

**Typography:** System font stack, no Google Fonts.

**Scrollbars:** Thin styled scrollbar on sidebar and message list (`scrollbar-thin scrollbar-thumb-gray-700`).

**Focus states:** All interactive elements must have a visible focus ring: `focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none`.

**Loading states:** Show a spinner (`animate-spin`) or skeleton placeholder while async data loads. Never show a blank area.

**Empty states:** When a list is empty, show a centered muted message:
- No rooms: "No rooms yet. Create one to get started."
- No contacts: "No friends yet. Send a friend request."
- No messages: "No messages yet. Say hello!"
- No banned users: "No banned users."

**Error toasts:** Use a fixed toast container (bottom-right, `z-50`). On any API error, show `{ "error": "ERROR_CODE" }` as a readable message (e.g., `DUPLICATE_ROOM_NAME` → "A room with that name already exists"). Auto-dismiss after 4 s. Style: `bg-red-900 text-red-100 rounded px-4 py-2 shadow-lg`.

**Skeleton loaders:** For MessageList and MembersPanel, show 3–5 gray animated skeleton rows while loading.

---

### Application layout (desktop-first, no mobile needed)

**Classic web chat style — resembles IRC/old-school chat, NOT Discord/Slack.**
Requirements §4.1.1: *"Rooms and contacts are displayed on the right. After entering a room, the room list becomes compacted in accordion style. Room members are shown on the right side."*

```
┌─────────────────────────────────────────────────────────────────┐
│  TOPBAR: Logo | [Public Rooms] [nav links] | [profile ▾]       │
├────────────────────────────────────────┬────────────────────────┤
│  CHAT AREA (flex-1)                    │  RIGHT SIDEBAR (260px) │
│                                        │                        │
│  ┌── Room header ──────────────────┐   │  ▶ ROOMS (accordion)  │
│  │  #general  [info] [manage]      │   │    ▼ Public            │
│  └─────────────────────────────────┘   │      #general ● (2)   │
│                                        │      #random          │
│  Message list                          │    ▶ Private           │
│  (infinite scroll, newest at bottom)   │                        │
│                                        │  ▶ CONTACTS           │
│  [alice]  10:01  hey everyone!         │    alice ●            │
│  [bob]    10:02  hi there 👋           │    bob ◐              │
│                                        │  ─────────────────    │
│  ─────────────────────────────────     │  MEMBERS (when in room)│
│  [reply indicator if replying]         │    alice ● ADMIN      │
│  [ message input          ] [📎][😊]  │    bob ◐              │
│  [ Send ]                              │    carol ○            │
└────────────────────────────────────────┴────────────────────────┘
```

**Right sidebar behaviour:**
- When no room is open: shows full ROOMS list + CONTACTS list (non-accordion)
- When inside a room: ROOMS and CONTACTS collapse to accordion headers (click to expand); MEMBERS section appears below showing current room members with presence dots
- The sidebar is always visible (no toggle needed)
- Unread badge appears next to each room name that has unread messages

---

### Routes (React Router v6)

```
/login                — Login page (unauthenticated only)
/register             — Register page
/forgot-password      — Send reset email
/reset-password       — Reset with token (?token=...) — read token from URL query param
/                     — Redirect to /rooms if authenticated, else /login
/rooms                — Empty state ("Select a room to start chatting")
/rooms/:id            — Active chat room (main layout with sidebar + room panel)
/rooms/catalog        — Public rooms catalog with search
```

DM rooms use the same `/rooms/:id` route — they are just rooms with `visibility: "DM"`. Display the other participant's username as the DM room name (since `MyRoomResponse.name` is null for DMs — use the other member's username fetched from the members list).

Protect all `/rooms/*` routes: redirect unauthenticated users to `/login`.

**On app load (`App.tsx`):** Call `GET /api/auth/me`. If 200 → set user in context and proceed. If 401 → redirect to `/login`. Show a full-page spinner while this check is in flight.

---

### Component tree

```
App
├── AuthLayout (no sidebar)
│   ├── LoginPage
│   ├── RegisterPage
│   ├── ForgotPasswordPage
│   └── ResetPasswordPage
└── MainLayout (authenticated, includes STOMP provider)
    ├── Topbar
    ├── ChatArea (flex-1, left portion)
    │   └── Outlet
    │       ├── EmptyState (/rooms — no room selected)
    │       ├── RoomsCatalogPage (/rooms/catalog — public room search)
    │       └── ChatPage (/rooms/:id)
    │           ├── ChatHeader (room name + Manage button + Join button if not member)
    │           ├── MessageList (infinite scroll)
    │           │   └── MessageItem
    │           │       ├── Avatar + username + timestamp
    │           │       ├── MessageContent (text, reply quote, attachments, deleted tombstone)
    │           │       └── MessageActions (reply, edit, delete — on hover, own messages only)
    │           └── MessageInput (disabled with "You cannot send messages here" if banned or not member)
    │               ├── ReplyIndicator (quoted message + ✕)
    │               ├── Textarea (multiline, Enter=send, Shift+Enter=newline, paste=file upload)
    │               ├── EmojiPickerButton
    │               ├── AttachmentButton
    │               └── SendButton
    └── RightSidebar (260px, always visible)
        ├── RoomsAccordion
        │   ├── AccordionItem "ROOMS"
        │   │   ├── RoomGroup "Public" (with unread badges, DMs shown as other user's name)
        │   │   └── RoomGroup "Private"
        │   └── AccordionItem "CONTACTS" (friends with PresenceDot + unread DM badge)
        └── MembersPanel (shown only when a room is active)
            ├── MemberItem (username + PresenceDot + role badge ADMIN/MEMBER)
            └── [Manage Room button → ManageRoomModal] (visible only to room owner / admins)
```

**Modals (rendered via Dialog at app root):**
- `CreateRoomModal` — name, description, visibility toggle (Public / Private, default Public)
- `ManageRoomModal` — tabs: Members | Admins | Banned | Invitations | Settings (see detailed spec below)
- `SendFriendRequestModal` — username input
- `SessionsModal` — list sessions, current session highlighted, revoke per session (see detailed spec below)
- `AccountSettingsModal` — Change Password form + Delete Account button (see detailed spec below)
- `PublicRoomCatalog` — searchable list of public rooms with Join button

---

### Auth flow

1. **App load:** `GET /api/auth/me`. If 200 → store `{userId, username}` in `AuthContext`. If 401 → redirect to `/login`. Show full-page spinner until resolved.
2. Login response sets two httpOnly cookies (`access_token`, `refresh_token`) — the browser sends them automatically on every request.
3. Login response body: `{ userId, username, accessTokenExpiresAt }` (ISO-8601 UTC string).
4. After login, store `{ userId, username, accessTokenExpiresAt }` in React context (NOT in localStorage — cookies handle the actual auth).
5. **Token refresh:** Schedule a `setTimeout` to call `POST /api/auth/refresh` ~60 seconds before `accessTokenExpiresAt`. On success, update `accessTokenExpiresAt` and reschedule. On 401 failure, clear user context, call `client.deactivate()` on the STOMP client, and redirect to `/login`.
6. **Login page:** email input + password input + "Keep me signed in" checkbox (maps to `keepSignedIn: boolean` in the request body). Default unchecked. Show field-level validation errors inline below each input.
7. **Register page:** email + username + password inputs. Show API error codes as human-readable messages below the form.

---

### STOMP / WebSocket

**Setup (inside `StompProvider` context, wrapping MainLayout):**

```typescript
// src/providers/StompProvider.tsx
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'

const client = new Client({
  webSocketFactory: () => new SockJS('/ws'),
  reconnectDelay: 5000,
  onConnect: () => {
    // ALL app-level subscriptions go here:
    client.subscribe('/user/queue/presence', handlePresenceEvent)
    client.subscribe('/user/queue/notifications', handleNotificationEvent)
    setConnected(true)
  },
  onDisconnect: () => setConnected(false),
})
client.activate()
```

**Room subscription (inside ChatPage, on roomId change):**
```typescript
useEffect(() => {
  if (!connected) return
  const sub = client.subscribe(`/topic/room.${roomId}`, handleRoomEvent)
  return () => sub.unsubscribe()   // cleanup on room change or unmount
}, [roomId, connected])
```

**handleRoomEvent — handle all event types:**
```typescript
function handleRoomEvent(frame) {
  const event = JSON.parse(frame.body)
  switch (event.type) {
    case 'NEW':
      // If tempId matches a pending message → replace it (optimistic update)
      // Otherwise → append to bottom; auto-scroll only if user was at bottom
      setMessages(prev => {
        const idx = prev.findIndex(m => m.tempId === event.message.tempId)
        if (idx !== -1) {
          const next = [...prev]
          next[idx] = event.message
          return next
        }
        return [...prev, event.message]
      })
      // If this room is not the active room → increment unreadCount in sidebar state
      break
    case 'EDITED':
      setMessages(prev => prev.map(m => m.id === event.message.id ? event.message : m))
      break
    case 'DELETED':
      setMessages(prev => prev.map(m => m.id === event.message.id ? event.message : m))
      // Show tombstone: message.deleted === true, content === null
      break
    case 'MEMBER_JOINED':
    case 'MEMBER_LEFT':
    case 'MEMBER_BANNED':
      // Refresh member list for this room
      fetchMembers(roomId)
      break
    case 'ROOM_DELETED':
      // Unsubscribe, remove room from sidebar state, navigate to /rooms
      sub.unsubscribe()
      removeRoomFromState(event.roomId)
      navigate('/rooms')
      break
  }
}
```

**Sending messages:**
```typescript
client.publish({
  destination: '/app/chat.send',
  body: JSON.stringify({ roomId, content, parentMessageId, tempId }),
})
```

**Presence heartbeat:**
```typescript
// Send every 30s while window has focus
setInterval(() => client.publish({ destination: '/app/presence.activity', body: '' }), 30_000)
// On window blur: client.publish({ destination: '/app/presence.afk', body: '' })
window.addEventListener('blur', () => client.publish({ destination: '/app/presence.afk', body: '' }))
window.addEventListener('focus', () => client.publish({ destination: '/app/presence.activity', body: '' }))
```

**handleNotificationEvent — all notification types:**
```typescript
function handleNotificationEvent(frame) {
  const notif = JSON.parse(frame.body)
  switch (notif.type) {
    case 'FRIEND_REQUEST':
      showToast('New friend request received')
      // Increment friend request badge count in Topbar
      break
    case 'FRIEND_ACCEPTED':
      showToast(`${notif.payload.username} accepted your friend request`)
      // Add friend to contacts list + navigate to their DM room if desired
      fetchFriends()
      break
    case 'ROOM_BANNED':
      showToast(`You were banned from the room`, 'error')
      removeRoomFromState(notif.payload.roomId)
      if (currentRoomId === notif.payload.roomId) navigate('/rooms')
      break
    case 'DM_BANNED':
      showToast('You can no longer send messages in this conversation', 'error')
      // Disable the message input for this DM room
      markRoomReadOnly(notif.payload.roomId)
      break
    case 'MENTION':
      showToast(`You were mentioned in a message`, 'info')
      // Increment unread on that room
      break
    case 'DM_MESSAGE':
      // Increment unread badge on that DM in the sidebar
      incrementUnread(notif.payload.roomId)
      break
    case 'INVITE':
      showToast('You were invited to a room')
      fetchMyRooms()
      break
  }
}
```

**Critical rule — stale closures:** Always use functional updates:
```typescript
setMessages(prev => [...prev, newMessage])  // ✓
setMessages([...messages, newMessage])       // ✗ stale closure
```

---

### API — complete endpoint reference

All requests include cookies automatically. All error responses: `{ "error": "ERROR_CODE" }`.

#### Auth
| Method | Path | Body | Success | Error codes |
|--------|------|------|---------|-------------|
| GET | `/api/auth/me` | — | 200 `{userId, username}` | 401 |
| POST | `/api/auth/register` | `{email, username, password}` | 201 `{userId, username, accessTokenExpiresAt}` + cookies | `DUPLICATE_EMAIL`, `DUPLICATE_USERNAME` |
| POST | `/api/auth/login` | `{email, password, keepSignedIn}` | 200 `{userId, username, accessTokenExpiresAt}` + cookies | `INVALID_CREDENTIALS` |
| POST | `/api/auth/logout` | — | 204, clears cookies | — |
| POST | `/api/auth/refresh` | — | 200 `{userId, username, accessTokenExpiresAt}` | 401 |
| GET | `/api/auth/sessions` | — | 200 `[{id, browserInfo, ip, createdAt, current}]` | — |
| DELETE | `/api/auth/sessions/:id` | — | 204 | — |
| POST | `/api/auth/change-password` | `{currentPassword, newPassword}` | 200 | `WRONG_CURRENT_PASSWORD` |
| POST | `/api/auth/forgot-password` | `{email}` | 200 (always, no enumeration) | — |
| POST | `/api/auth/reset-password` | `{token, newPassword}` | 200 (always, no enumeration) | — |

#### Rooms
| Method | Path | Body/Query | Success | Error codes |
|--------|------|-----------|---------|-------------|
| GET | `/api/rooms?q=` | search query | 200 `RoomResponse[]` (PUBLIC only) | — |
| GET | `/api/rooms/me` | — | 200 `MyRoomResponse[]` (all joined rooms inc. DMs) | — |
| GET | `/api/rooms/:id` | — | 200 `RoomResponse` | 404 |
| POST | `/api/rooms` | `{name, description?, visibility}` | 201 `RoomResponse` | `DUPLICATE_ROOM_NAME` |
| PATCH | `/api/rooms/:id` | `{name?, description?, visibility?}` | 200 `RoomResponse` | `DUPLICATE_ROOM_NAME`, `DM_VISIBILITY_IMMUTABLE` |
| DELETE | `/api/rooms/:id` | — | 204 | 403 |
| POST | `/api/rooms/:id/join` | — | 201 | `ROOM_BANNED`, `INVITE_REQUIRED` |
| DELETE | `/api/rooms/:id/leave` | — | 204 | `OWNER_CANNOT_LEAVE` |
| GET | `/api/rooms/:id/members` | — | 200 `MemberResponse[]` | `NOT_MEMBER` |
| PATCH | `/api/rooms/:id/members/:userId` | `{role: "ADMIN"\|"MEMBER"}` | 200 | 403 |
| GET | `/api/rooms/:id/bans` | — | 200 `RoomBanResponse[]` | 403 |
| POST | `/api/rooms/:id/bans` | `{userId}` | 201 | `ALREADY_BANNED` |
| DELETE | `/api/rooms/:id/bans/:userId` | — | 204 | — |
| POST | `/api/rooms/:id/invitations` | `{userId}` | 201 | — |
| GET | `/api/rooms/:id/unread` | — | 200 `{unreadCount: N}` | — |
| POST | `/api/rooms/:id/read` | — | 204 | — |

#### Messages
| Method | Path | Query | Success |
|--------|------|-------|---------|
| GET | `/api/messages/:roomId` | `before?, limit?` | 200 `MessageResponse[]` DESC order, max 100 per page |

#### Friends
| Method | Path | Body | Success |
|--------|------|------|---------|
| GET | `/api/friends` | — | 200 `FriendResponse[]` |
| GET | `/api/friends/requests` | — | 200 `FriendRequestResponse[]` (pending incoming + outgoing) |
| POST | `/api/friends/requests` | `{username}` | 201 `FriendRequestResponse` |
| PATCH | `/api/friends/requests/:id` | `{action: "ACCEPT"\|"REJECT"}` | 200 `{dmRoomId: number}` — navigate to dmRoomId on ACCEPT |
| DELETE | `/api/friends/:userId` | — | 204 |

#### Files & Users
| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/files/upload` | multipart/form-data: fields `file` (binary) + `roomId` (string). Returns `{attachmentId, originalFilename, mimeType, sizeBytes}` |
| GET | `/api/files/:id` | Returns binary stream with correct Content-Type. Use as `<img src>` or `<a href>` directly. On 404, show broken-file icon. |
| POST | `/api/users/:id/ban` | Ban a user (blocks DMs). Show "Ban User" in DM room context menu. | 
| DELETE | `/api/users/:id/ban` | Unban a user. |
| DELETE | `/api/users/me` | Delete own account. Requires confirmation dialog. After 204: clear context, redirect to `/login`. |

---

### Response schemas

```typescript
interface RoomResponse {
  id: number
  name: string | null      // null for DM rooms — display other participant's username instead
  description: string | null
  visibility: 'PUBLIC' | 'PRIVATE' | 'DM'
  ownerId: number | null
  memberCount: number
  unreadCount: number
  createdAt: string
}

interface MyRoomResponse {
  id: number
  name: string | null      // null for DM rooms
  visibility: 'PUBLIC' | 'PRIVATE' | 'DM'
  unreadCount: number
}

interface MessageResponse {
  id: number
  roomId: number
  sender: { userId: number; username: string } | null  // null if sender account deleted
  content: string | null       // null if message was soft-deleted
  parentMessage: {
    id: number
    sender: { userId: number; username: string } | null
    content: string | null     // null if parent was deleted — show "Original message deleted"
  } | null
  attachments: Array<{
    id: string          // UUID — use in /api/files/:id
    originalFilename: string
    mimeType: string
    sizeBytes: number
  }>
  createdAt: string
  editedAt: string | null
  deleted: boolean             // true = show tombstone "This message was deleted"
  tempId: string | null        // echo of client tempId — used for optimistic update matching
}

interface FriendResponse {
  userId: number
  username: string
  status: 'ONLINE' | 'AFK' | 'OFFLINE'
}

interface MemberResponse {
  userId: number
  username: string
  role: 'MEMBER' | 'ADMIN'
  joinedAt: string
}

interface RoomBanResponse {
  userId: number
  username: string
  bannedBy: { id: number; username: string } | null
  createdAt: string
}

interface SessionResponse {
  id: number
  browserInfo: string
  ip: string
  createdAt: string
  current: boolean   // true = this is the session making the request
}

interface FriendRequestResponse {
  id: number
  fromUserId: number
  fromUsername: string
  toUserId: number
  toUsername: string
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED'
  dmRoomId: number | null   // populated after ACCEPT
}
```

---

### Key UX behaviours

**Message list:**
- Newest messages at bottom. API returns DESC order — reverse the array before rendering.
- **Infinite scroll:** attach `IntersectionObserver` to a sentinel div at the top of the list. When visible, fetch `?before={oldestMessageId}&limit=50`. To preserve scroll position after prepend: record `scrollHeight` before prepend, then set `scrollTop = newScrollHeight - oldScrollHeight` after React renders.
- New incoming STOMP `MessageEvent{type:"NEW"}` → append to bottom. Auto-scroll only if `scrollTop + clientHeight >= scrollHeight - 20` (user is near bottom). Otherwise, show "↓ New messages" button.
- `MessageEvent{type:"EDITED"}` → replace in list by id. Keep position.
- `MessageEvent{type:"DELETED"}` → replace with tombstone: `message.deleted === true`, render `"This message was deleted"` in `text-gray-500 italic text-sm`.
- **Soft-deleted parent message:** when `parentMessage.content === null`, show `"Original message deleted"` in muted style inside the quote block.

**Read cursor:**
- When the user navigates to a room, call `POST /api/rooms/:id/read` immediately. Update `unreadCount` to 0 in local state optimistically (don't wait for response).
- When a `MessageEvent{type:"NEW"}` arrives for a room the user is NOT currently viewing, increment its `unreadCount` in local state by 1.

**Optimistic message send:**
1. Generate a `tempId` (`crypto.randomUUID()`).
2. Immediately append a local message: `{ id: 0, tempId, content, sender: currentUser, attachments: [], createdAt: new Date().toISOString(), deleted: false, editedAt: null, parentMessage: replyingTo }`.
3. Publish to STOMP. When `MessageEvent{type:"NEW", message.tempId === tempId}` arrives, replace the pending entry with the real message object.

**Reply / quote:**
- Clicking "Reply" on a message sets `replyingTo` state in `MessageInput`.
- Show a quoted strip above the textarea: sender name in `text-indigo-400` + truncated content (max 80 chars) + ✕ cancel button.
- Send with `parentMessageId` set to `replyingTo.id`.
- Render `parentMessage` as a left-bordered block (`border-l-2 border-indigo-500 pl-2 mb-1 text-sm text-gray-400`) above the message body.

**Edited indicator:**
- Append `<span class="text-gray-500 text-xs ml-1">(edited)</span>` immediately after the message text when `editedAt != null`.

**Presence dots:**
```
Online  → bg-green-400 rounded-full w-2.5 h-2.5 (filled)
AFK     → bg-amber-400 rounded-full w-2.5 h-2.5 (filled)
Offline → border-2 border-gray-500 rounded-full w-2.5 h-2.5 (ring only)
```
Update via STOMP `PresenceEvent{userId, status}` — find friend in state, update status field using functional state update.

**DM room naming:** `MyRoomResponse.name` is `null` for DMs. When rendering a DM in the sidebar or chat header, show the other participant's `username` (fetch from `GET /api/rooms/:id/members`, find the member whose `userId !== currentUser.userId`).

**Read-only rooms:** If the user is banned from a room or banned by the other DM participant (`DM_BANNED` notification received), the `MessageInput` is replaced with a gray disabled bar: `"You cannot send messages in this conversation"`. History remains visible.

**File attachments:**
- Upload button → hidden `<input type="file">` click trigger. Also handle clipboard paste (`paste` event on textarea — check `e.clipboardData.files`).
- On file select: `POST /api/files/upload` (multipart: `file` + `roomId`). While uploading: show a progress spinner inside the input area; disable Send button.
- On success: store `attachmentId` in component state. Send STOMP message with `attachmentId` field alongside content.
- **Images** (`mimeType.startsWith('image/')`): render `<img src="/api/files/{id}" class="max-h-48 rounded cursor-pointer">`. Click → open full-size in a modal lightbox.
- **Other files:** render a download chip: `📎 filename.pdf (42 KB)` as `<a href="/api/files/{id}" download>`.
- On `GET /api/files/:id` 404: show a gray broken-file icon with "File unavailable".

**Notifications visual treatment:**
- Toast style: `bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-4 py-3 shadow-xl`.
- Error toasts: `border-red-700`. Info toasts: `border-indigo-600`. Stack up to 3 toasts at once.

---

### Modal specifications

#### ManageRoomModal (tabs)

**Tab: Settings**
- Name input (pre-filled, required, max 50 chars)
- Description textarea (pre-filled, optional)
- Visibility toggle: `PUBLIC ↔ PRIVATE`. Locked/disabled for DM rooms — show `"DM rooms cannot change visibility"`.
- Save button (indigo) — calls `PATCH /api/rooms/:id`. On `DUPLICATE_ROOM_NAME` → show error inline.
- Delete Room button (red, bottom of form). On click → show confirmation dialog: "Are you sure? This will permanently delete the room and all its messages." Confirm → `DELETE /api/rooms/:id` → remove from sidebar, navigate to `/rooms`.
- Visible only to room owner.

**Tab: Members**
- Search input (filter list client-side by username).
- List: avatar + username + role badge (`ADMIN` / `MEMBER`) + action buttons.
- Actions (shown based on requester's role):
  - For MEMBER rows: "Make Admin" button → `PATCH /api/rooms/:id/members/:userId {role: "ADMIN"}`.
  - For ADMIN rows: "Remove Admin" → `PATCH /api/rooms/:id/members/:userId {role: "MEMBER"}`. Hidden for owner row.
  - "Ban" button (red) → `POST /api/rooms/:id/bans {userId}` → removes user from list.
- Owner row shows "(owner)" badge; no action buttons on own row.

**Tab: Admins**
- Read-only list of members with role `ADMIN`, including the owner.
- Shows username + "(owner)" or "(admin)" label.
- Owner cannot be demoted. Admins can remove other admins (same "Remove Admin" action as Members tab, if requester is owner).

**Tab: Banned**
- List: username + "Banned by: {username}" + date + "Unban" button.
- "Unban" → `DELETE /api/rooms/:id/bans/:userId` → removes from list.
- Empty state: "No banned users."

**Tab: Invitations**
- Username input + "Send Invite" button → `POST /api/rooms/:id/invitations {userId}`.
- To find userId: add a helper to search users by username (use the friends list or a search endpoint if available; fall back to showing an input and resolving on send — if user not found, show error toast).

#### SessionsModal

- Fetch `GET /api/auth/sessions` on open.
- List each session: `{browserInfo} · {ip} · joined {createdAt formatted}`.
- Current session marked with green "Current" badge.
- "Revoke" button on each non-current session → `DELETE /api/auth/sessions/:id` → remove from list.
- No revoke button on current session row.
- Loading skeleton while fetching.

#### AccountSettingsModal

Two sections:

**Change Password**
- Current password input + New password input (min 8 chars) + Confirm new password input (client-side match validation).
- Submit → `POST /api/auth/change-password {currentPassword, newPassword}`.
- On `WRONG_CURRENT_PASSWORD` → show error below current password field.
- On success → show success toast "Password changed successfully".

**Delete Account**
- Red "Delete my account" button.
- On click → confirmation dialog: "This cannot be undone. All your data will be permanently deleted."
- Confirm → `DELETE /api/users/me` → on 204: clear auth context, redirect to `/login`.

#### SendFriendRequestModal

- Username input (required).
- On submit → `POST /api/friends/requests {username}`.
- On success → show toast "Friend request sent to {username}". Close modal.
- On error (user not found, already friends, request exists) → show error message below input.

#### PublicRoomCatalog (page at `/rooms/catalog`)

- Search input at top. On type → `GET /api/rooms?q={query}` (debounce 300ms).
- Cards showing: room name, description, member count.
- "Join" button on each card → `POST /api/rooms/:id/join`.
  - If `ROOM_BANNED` → show "You are banned from this room".
  - If `INVITE_REQUIRED` → show "This room is invite-only".
  - On success (201) → navigate to `/rooms/:id`.
- Already-joined rooms show "Open" button instead of "Join".
- Empty state when no results: "No public rooms found."

---

### MSW mock setup

Create `src/mocks/handlers.ts` with realistic mock data, and `src/mocks/browser.ts` to start MSW.

**Seed data for mocks:**
```
Users:
  alice  (id:1, email: alice@example.com, password: s3cr3tP@ss)
  bob    (id:2, email: bob@example.com)
  carol  (id:3, email: carol@example.com)

Rooms:
  #general (id:1, PUBLIC, ownerId:1, memberCount:3)
  #random  (id:2, PUBLIC, ownerId:1, memberCount:2)
  #dev     (id:3, PRIVATE, ownerId:1, memberCount:1)
  DM alice↔bob (id:4, DM, name:null)

Messages: 15 seeded messages across rooms (mix of plain text, replies, one with attachment)

Friends:
  alice ↔ bob  (bob status: ONLINE)
  alice ↔ carol (carol status: OFFLINE)

Friend requests: 1 pending incoming to alice from carol

Sessions:
  [{id:1, browserInfo:"Chrome", ip:"127.0.0.1", createdAt:"...", current:true}]

Bans: none initially (allow banning in-memory via POST handler)
```

**Mock all endpoints listed above.** Mutations (POST/PATCH/DELETE) must update in-memory state so the UI reflects changes without page reload. Specifically:
- `POST /api/rooms/:id/join` → adds alice to that room's members array in mock state.
- `PATCH /api/friends/requests/:id {action: "ACCEPT"}` → returns `{ dmRoomId: 4 }`.
- `POST /api/auth/login` with `alice@example.com` + `s3cr3tP@ss` → returns a valid auth response (set a mock cookie or return `{ userId: 1, username: "alice", accessTokenExpiresAt: <15min from now> }`).
- `GET /api/auth/me` → returns `{ userId: 1, username: "alice" }` when "logged in" (use a module-level `loggedIn = true` flag toggled by login/logout handlers).

**STOMP mock** (since MSW can't intercept WebSockets):
Create `src/mocks/stompMock.ts` that exports a `MockStompClient` implementing the same interface as `@stomp/stompjs` Client. It:
- Returns `connected = true` immediately on `activate()`.
- `subscribe(destination, handler)` registers handlers by destination in a `Map<string, handler[]>`.
- `publish(destination, body)` dispatches:
  - `/app/chat.send` → after 300ms, fire `MessageEvent{type:"NEW", message:{...parsed body, id: Date.now(), sender:{userId:1,username:"alice"}, attachments:[], deleted:false, editedAt:null}}` to all `/topic/room.{roomId}` subscribers.
  - `/app/presence.activity` and `/app/presence.afk` → no-op (presence is faked by the timer below).
- Every 10s: fire a `PresenceEvent{userId: 2, status: <toggle ONLINE/AFK>}` to all `/user/queue/presence` subscribers (simulates bob going AFK).
- Every 20s: fire a `NotificationEvent{type:"MENTION", payload:{roomId:1, messageId:99}}` to `/user/queue/notifications` subscribers (demo notification).

Export a `MOCK_MODE = true` flag. In `StompProvider`, import `MOCK_MODE` and use `MockStompClient` when true, real `Client` when false.

---

### File structure to create

```
src/
  api/                    ← typed fetch wrappers (one file per domain)
    auth.ts
    rooms.ts
    messages.ts
    friends.ts
    files.ts
    users.ts
  providers/
    AuthProvider.tsx       ← currentUser context + startup /me check + token refresh scheduler
    StompProvider.tsx      ← STOMP client context + presence + notification handlers
  hooks/
    useRooms.ts            ← GET /api/rooms/me, sidebar state, unread management
    useMessages.ts         ← paginated message loading, optimistic send, STOMP message events
    useFriends.ts          ← friends list, requests, friend request badge count
    usePresence.ts         ← presence state map by userId, updated via STOMP
  pages/
    LoginPage.tsx          ← email + password + keepSignedIn checkbox
    RegisterPage.tsx
    ForgotPasswordPage.tsx
    ResetPasswordPage.tsx  ← reads ?token= from URL query params
    ChatPage.tsx
    RoomsCatalogPage.tsx   ← /rooms/catalog
  components/
    layout/
      Topbar.tsx           ← logo, catalog link, profile dropdown (sessions, settings, logout)
      RightSidebar.tsx     ← accordion + contacts + members panel
      RoomsAccordion.tsx
      MembersPanel.tsx     ← fetches GET /api/rooms/:id/members on roomId change
    chat/
      MessageList.tsx      ← infinite scroll, scroll position preservation, auto-scroll
      MessageItem.tsx      ← tombstone for deleted, (edited) label, reply quote block
      MessageInput.tsx     ← multiline, Enter=send, Shift+Enter=newline, paste=upload
      ReplyIndicator.tsx
    modals/
      CreateRoomModal.tsx
      ManageRoomModal.tsx  ← tabs: Members, Admins, Banned, Invitations, Settings
      SendFriendRequestModal.tsx
      SessionsModal.tsx    ← list + revoke, highlight current session
      AccountSettingsModal.tsx  ← change password + delete account
    common/
      PresenceDot.tsx      ← renders Online/AFK/Offline dot
      Toast.tsx            ← toast container + individual toast
      ConfirmDialog.tsx    ← reusable "are you sure?" dialog
      SkeletonRow.tsx      ← animated gray placeholder row
    ui/                    ← shadcn components live here
  mocks/
    handlers.ts
    browser.ts
    stompMock.ts
  router.tsx               ← React Router setup with protected routes
  App.tsx                  ← Wrap with AuthProvider + StompProvider
  main.tsx                 ← Start MSW before React renders
```

---

### main.tsx bootstrap with MSW

```typescript
// src/main.tsx
async function bootstrap() {
  if (import.meta.env.DEV) {
    const { worker } = await import('./mocks/browser')
    await worker.start({ onUnhandledRequest: 'bypass' })
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><App /></React.StrictMode>
  )
}
bootstrap()
```

---

### What NOT to do
- Do not modify `vite.config.ts`, `package.json`, or `tailwind.config.ts`
- Do not add a backend — all data comes from MSW mocks or the real `/api` proxy
- Do not add authentication with Supabase or any third-party auth service
- Do not use localStorage for auth state — cookies handle it; only store non-sensitive UI state (e.g., sidebar collapsed)
- Do not use React Query or SWR — plain `useEffect` + `useState` + custom hooks is sufficient
- Do not implement mobile / responsive layouts — desktop-first (min-width: 1024px)
- Do not use `bg-gray-850` — it does not exist in Tailwind; use `bg-[#1e2124]` instead
- Do not trust `MyRoomResponse.name` for DM rooms — it is `null`; resolve the DM display name from the members list

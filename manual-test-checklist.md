# Manual Test Checklist

Workflow: if something fails → report what you observed → write failing test first → then fix.

---

## Auth & Sessions

- [ ] **Register** — fill form, submit → lands on `/rooms`, username visible in top-right
- [ ] **Login** — logout first, log back in → session persists across page reload (F5)
- [ ] **Keep me signed in** — login with checkbox ON, close/reopen browser tab → still logged in
- [ ] **Forgot password** — request reset, open MailHog (http://localhost:8025), click link in email, set new password, login with new password
- [ ] **Sessions page** — open in second browser, both sessions show; revoke one → that tab gets 401 and redirects to login
- [ ] **Delete account** → redirect to login; login attempt with deleted account → rejected

---

## Rooms

- [ ] **Create room** — create PUBLIC, appears in sidebar and in catalog search immediately
- [ ] **Create PRIVATE room** — does NOT appear in public catalog
- [ ] **Join room** — log in as user B, find public room in catalog, join → room appears in B's sidebar
- [ ] **Leave room** — leave a room you joined → removed from sidebar, no Leave button for owner
- [ ] **Duplicate room name** → error message, not submitted

---

## Messaging

- [ ] **Send message** → appears immediately, no page refresh needed
- [ ] **Real-time receive** — two tabs in same room, send from one → appears in other within 2s
- [ ] **Reply** — hover message, click Reply → quoted preview in input; send → reply chain visible
- [ ] **Edit message** — hover own message, click Edit → inline edit, save → "(edited)" label
- [ ] **Delete own message** → replaced with deleted placeholder, thread structure preserved if it had replies
- [ ] **Non-member can't send** — view public room without joining → input disabled with "Join this room to send messages"
- [ ] **Infinite scroll** — scroll to very top of a room with many messages → older messages load, scroll position doesn't jump

---

## File Upload

- [ ] **Upload image** — attach an image file → thumbnail visible in message
- [ ] **Download file** — click download icon on an attachment → file downloads
- [ ] **Paste image** — Cmd+V a screenshot into input → attachment pending badge appears
- [ ] **Wrong file type** — try to attach a `.exe` → rejected with error

---

## Presence

- [ ] **Friend online indicator** — add a friend (two tabs), both on `/rooms` → green dot visible in Contacts
- [ ] **AFK on tab hide** — hide the tab (click another app window) → friend sees yellow dot within 5s
- [ ] **Back online** — switch back to tab → green dot restores within 3s

---

## Unread Counts

- [ ] **Unread badge** — user B sends message to a room, user A is elsewhere → badge appears on room in A's sidebar
- [ ] **Badge clears** — user A opens the room → badge disappears
- [ ] **@mention badge** — B mentions `@A` in a message → A sees bold notification indicator

---

## Friends & DMs

- [ ] **Send friend request** — search by username in "Add Friend" modal → request appears in B's sidebar as pending
- [ ] **Accept request** — B accepts → both see each other in Contacts; DM room auto-created
- [ ] **Open DM** — click friend in Contacts → opens DM chat room
- [ ] **Remove friend** → removed from each other's Contacts; DM room still accessible
- [ ] **Ban friend** → DM input disabled for both parties; banned user removed from Contacts

---

## Room Management

- [ ] **Invite to private room** — enter username in Invite tab → invited user sees room in sidebar
- [ ] **Ban member** — ban a member from a room → they're kicked and can't rejoin; ban appears in Banned tab with unban button
- [ ] **Promote to admin** → user gets admin controls (can delete any message, ban members)
- [ ] **Delete room** (as owner) → all members' tabs navigate away; room gone from all sidebars within 5s

---

## Account Settings

- [ ] **Change password** → old password rejected; new password accepted on next login

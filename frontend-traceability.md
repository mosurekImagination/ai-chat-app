# Frontend Requirements Traceability Matrix

Maps every requirement from `requirements.md` to the frontend slice and Playwright test that covers it.

| Req ID | Requirement Summary | Slice | Test ID | Test File |
|--------|---------------------|-------|---------|-----------|
| 2.1.1 | Registration with email, password, unique username | F2 | T-F2-01 | e2e/sliceF2.spec.ts |
| 2.1.2 | Email unique; username unique; username immutable | F2 | T-F2-02, T-F2-03 | e2e/sliceF2.spec.ts |
| 2.1.3 | Sign in with email+password; sign out current session only; persistent login | F2 | T-F2-04, T-F2-05, T-F2-06, T-F2-09, T-F2-10 | e2e/sliceF2.spec.ts |
| 2.1.4 | Password reset via email; password change for logged-in users | F2, F7 | T-F2-07, T-F2-08, T-F7-11 | e2e/sliceF2.spec.ts, e2e/sliceF7.spec.ts |
| 2.1.5 | Delete account removes user + owned rooms | F7 | T-F7-12 | e2e/sliceF7.spec.ts |
| 2.2.1 | Show online / AFK / offline presence states | F5 | T-F5-01 | e2e/sliceF5.spec.ts |
| 2.2.2 | AFK after all tabs inactive for >1 min | F5 | T-F5-02 | e2e/sliceF5.spec.ts |
| 2.2.3 | Multi-tab: online if any tab active; AFK only if all idle; offline when all tabs closed | F5 | T-F5-03 | e2e/sliceF5.spec.ts |
| 2.2.4 | View active sessions with browser/IP; logout selected session (current browser only) | F7 | T-F7-08, T-F7-09, T-F7-10 | e2e/sliceF7.spec.ts |
| 2.3.1 | Personal contact/friend list | F7 | T-F7-01 | e2e/sliceF7.spec.ts |
| 2.3.2 | Send friend request by username; from room user list | F7 | T-F7-02, T-F7-03 | e2e/sliceF7.spec.ts |
| 2.3.3 | Friend request requires confirmation by recipient | F7 | T-F7-04 | e2e/sliceF7.spec.ts |
| 2.3.4 | Remove friend from list | F7 | T-F7-05 | e2e/sliceF7.spec.ts |
| 2.3.5 | Ban user: blocks contact, freezes DM history as read-only | F5, F7 | T-F5-06, T-F7-06 | e2e/sliceF5.spec.ts, e2e/sliceF7.spec.ts |
| 2.3.6 | Personal messaging only between mutual non-banned friends | F7 | T-F7-07 | e2e/sliceF7.spec.ts |
| 2.4.1 | Any registered user may create a room | F3 | T-F3-03 | e2e/sliceF3.spec.ts |
| 2.4.2 | Room properties: name, description, visibility, owner, admins, members, banned list; names unique | F3 | T-F3-04 | e2e/sliceF3.spec.ts |
| 2.4.3 | Public catalog: name, description, member count, search; join freely unless banned | F3 | T-F3-01, T-F3-02, T-F3-05 | e2e/sliceF3.spec.ts |
| 2.4.4 | Private rooms not in catalog; join by invitation only | F6 | T-F6-06 | e2e/sliceF6.spec.ts |
| 2.4.5 | Join public freely; leave freely; owner cannot leave | F3, F6 | T-F3-05, T-F6-07 | e2e/sliceF3.spec.ts, e2e/sliceF6.spec.ts |
| 2.4.6 | Room deletion removes all messages and files | F6 | T-F6-08 | e2e/sliceF6.spec.ts |
| 2.4.7 | Owner always admin; admin powers (ban/remove/etc.); owner can remove any admin | F6 | T-F6-01, T-F6-02, T-F6-03, T-F6-04, T-F6-11 | e2e/sliceF6.spec.ts |
| 2.4.8 | Removal = ban; banned user cannot rejoin unless unbanned; loses access to messages+files | F6 | T-F6-05, T-F6-09, T-F6-10 | e2e/sliceF6.spec.ts |
| 2.4.9 | Invite users to private rooms | F6 | T-F6-06 | e2e/sliceF6.spec.ts |
| 2.5.1 | Personal messages same as room messages from UI perspective | F4 | T-F4-13 | e2e/sliceF4.spec.ts |
| 2.5.2 | Messages: plain text, multiline, emoji, attachments, reply; max 3 KB | F4 | T-F4-01, T-F4-02, T-F4-03 | e2e/sliceF4.spec.ts |
| 2.5.3 | Reply shows quoted/outlined reference to replied-to message | F4 | T-F4-07 | e2e/sliceF4.spec.ts |
| 2.5.4 | Edit own message; "edited" grey indicator shown | F4 | T-F4-08 | e2e/sliceF4.spec.ts |
| 2.5.5 | Delete by author or room admin | F4 | T-F4-09, T-F4-10 | e2e/sliceF4.spec.ts |
| 2.5.6 | Chronological order; infinite scroll; offline messages delivered on reconnect | F4, F5 | T-F4-04, T-F4-14, T-F5-05 | e2e/sliceF4.spec.ts, e2e/sliceF5.spec.ts |
| 2.6.1 | Send images and arbitrary file types | F4 | T-F4-11 | e2e/sliceF4.spec.ts |
| 2.6.2 | Upload via button; copy-paste | F4 | T-F4-11, T-F4-12 | e2e/sliceF4.spec.ts |
| 2.6.3 | Preserve original filename; optional comment on attachment | F4 | T-F4-11 | e2e/sliceF4.spec.ts |
| 2.6.4 | Files accessible only by room members; losing room access removes file access | F6 | T-F6-09 | e2e/sliceF6.spec.ts |
| 2.6.5 | File persists after uploader loses access but cannot be seen/downloaded | F6 | T-F6-09 | e2e/sliceF6.spec.ts |
| 2.7.1 | Unread indicator near room/contact name; cleared on open | F5 | T-F5-04, T-F5-05 | e2e/sliceF5.spec.ts |
| 2.7.2 | Presence updates with low latency (<2 s) | F5 | T-F5-01 | e2e/sliceF5.spec.ts |
| 3.2 | Message delivered within 3 s; presence update <2 s; usable with 10k messages | F4, F5 | T-F4-06, T-F5-01 | e2e/sliceF4.spec.ts, e2e/sliceF5.spec.ts |
| 3.5 | No auto-logout; login persists across browser close; works across multiple tabs | F2, F5 | T-F2-06, T-F5-03 | e2e/sliceF2.spec.ts, e2e/sliceF5.spec.ts |
| 4.1 | Top menu, center message area, bottom input, side rooms+contacts list | F3 | T-F3-06, T-F3-09 | e2e/sliceF3.spec.ts |
| 4.1.1 | Side layout collapsible; accordion after entering room; members on right with status | F3, F5 | T-F3-07, T-F3-08, T-F3-12, T-F5-01 | e2e/sliceF3.spec.ts, e2e/sliceF5.spec.ts |
| 4.2 | Auto-scroll to new messages when at bottom; no forced scroll when reading old; infinite scroll | F4 | T-F4-04, T-F4-05, T-F4-14 | e2e/sliceF4.spec.ts |
| 4.3 | Input: multiline, emoji, attachment, reply | F4 | T-F4-02, T-F4-03, T-F4-07, T-F4-11 | e2e/sliceF4.spec.ts |
| 4.4 | Unread count near room names and contact names | F5 | T-F5-04 | e2e/sliceF5.spec.ts |
| 4.5 | Admin actions via menus + modal dialogs (ban/unban, remove member, manage admins, view banned, delete messages, delete room) | F6 | T-F6-01 … T-F6-11 | e2e/sliceF6.spec.ts |

---

## Test ID Quick Reference

### Slice F2 — Authentication (`e2e/sliceF2.spec.ts`)
| Test ID | Description |
|---------|-------------|
| T-F2-01 | Register with valid credentials → authenticated, redirected to /rooms |
| T-F2-02 | Register duplicate email → error shown |
| T-F2-03 | Register duplicate username → error shown |
| T-F2-04 | Login valid credentials → redirect to /rooms |
| T-F2-05 | Login wrong password → error, stays on /login |
| T-F2-06 | After login, reload page → still authenticated |
| T-F2-07 | Forgot password → confirmation + MailHog receives email |
| T-F2-08 | Reset password with valid token → new password works |
| T-F2-09 | Logout → redirected to /login; /rooms redirects to /login |
| T-F2-10 | Logout current session only; other browser context remains authenticated |
| T-F2-11 | Unauthenticated /rooms access redirects to /login |
| T-F2-12 | "Keep me signed in" checkbox exists on login page |

### Slice F3 — Layout + Room List (`e2e/sliceF3.spec.ts`)
| Test ID | Description |
|---------|-------------|
| T-F3-01 | Catalog shows name, description, member count |
| T-F3-02 | Catalog search filters by name |
| T-F3-03 | Create room → appears in sidebar |
| T-F3-04 | Duplicate room name → error shown |
| T-F3-05 | Join public room via catalog → room in sidebar, navigate to room |
| T-F3-06 | App shell: top menu, center area, bottom input, right sidebar |
| T-F3-07 | Sidebar collapse/expand works |
| T-F3-08 | Entering room compacts room list in accordion style |
| T-F3-09 | Top nav items: Logo, Public Rooms, Private Rooms, Contacts, Sessions, Profile, Sign out |
| T-F3-10 | Sidebar has Public Rooms + Private Rooms accordion sections |
| T-F3-11 | Sidebar has Search field + Create room button |
| T-F3-12 | Members panel shows member count + list with presence dots |

### Slice F4 — Chat + STOMP (`e2e/sliceF4.spec.ts`)
| Test ID | Description |
|---------|-------------|
| T-F4-01 | Send plain text → [HH:MM] Username: text format |
| T-F4-02 | Multiline: Shift+Enter adds newline |
| T-F4-03 | Emoji button present in input area |
| T-F4-04 | Messages chronological; auto-scroll when at bottom |
| T-F4-05 | No forced scroll when reading old messages |
| T-F4-06 | Real-time: message in tab A appears in tab B within 3 s |
| T-F4-07 | Reply: input indicator shown; sent reply shows quoted reference |
| T-F4-08 | Edit: grey "edited" indicator appears |
| T-F4-09 | Author can delete own message |
| T-F4-10 | Non-author has no delete action |
| T-F4-11 | Upload image → original filename shown in attachment container |
| T-F4-12 | Paste image → attachment ready to send |
| T-F4-13 | DM chat has same features as room chat |
| T-F4-14 | Infinite scroll: older messages load on scroll up; position preserved |

### Slice F5 — Presence + Notifications (`e2e/sliceF5.spec.ts`)
| Test ID | Description |
|---------|-------------|
| T-F5-01 | Friend online → ● dot in contacts; change visible within 2 s |
| T-F5-02 | All tabs idle >1 min → ◐ (AFK) dot |
| T-F5-03 | Two tabs: one active → ●; both idle → ◐ |
| T-F5-04 | Unread count shown as "room (N)"; cleared when room opened |
| T-F5-05 | Offline message: appears as unread when recipient logs in |
| T-F5-06 | DM_BANNED: MessageInput disabled; history visible |

### Slice F6 — Room Management (`e2e/sliceF6.spec.ts`)
| Test ID | Description |
|---------|-------------|
| T-F6-01 | Manage room modal has 5 tabs: Members, Admins, Banned, Invitations, Settings |
| T-F6-02 | Admin sees correct actions per member role |
| T-F6-03 | Owner row: no remove/ban actions |
| T-F6-04 | Admins tab: owner labeled "(cannot lose admin rights)" |
| T-F6-05 | Ban member → kicked; cannot rejoin via catalog |
| T-F6-06 | Invite to private room → invitee sees it in Private Rooms |
| T-F6-07 | Owner: no Leave room option; other members can leave |
| T-F6-08 | Delete room → removed from all members' sidebars |
| T-F6-09 | Banned user: 403 on file download; file still stored; restored after unban+rejoin |
| T-F6-10 | Banned tab shows Username, Banned by, Date/time, Unban button |
| T-F6-11 | Admin can delete any message in room |

### Slice F7 — Friends + Account (`e2e/sliceF7.spec.ts`)
| Test ID | Description |
|---------|-------------|
| T-F7-01 | Contacts section shows accepted friends with presence dots |
| T-F7-02 | Send friend request by username → recipient sees it |
| T-F7-03 | Send friend request from room member list |
| T-F7-04 | Request requires acceptance; before acceptance: not in contacts |
| T-F7-05 | Remove friend → not in contacts |
| T-F7-06 | Ban friend → removed from contacts; DM read-only |
| T-F7-07 | Non-friend cannot open DM chat |
| T-F7-08 | Sessions screen shows browser info + IP |
| T-F7-09 | Revoke session → that session gets 401 |
| T-F7-10 | Logout current session only; other browser context unaffected |
| T-F7-11 | Change password → old rejected; new accepted |
| T-F7-12 | Delete account → redirect to /login; login rejected |

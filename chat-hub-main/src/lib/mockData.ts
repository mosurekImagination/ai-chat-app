import type {
  Friend,
  FriendRequest,
  Member,
  Message,
  Room,
  RoomBan,
  Session,
  User,
} from "./types";

export const currentUser: User = {
  userId: 1,
  username: "alice",
  email: "alice@example.com",
};

export const users: Record<number, User> = {
  1: { userId: 1, username: "alice", email: "alice@example.com" },
  2: { userId: 2, username: "bob", email: "bob@example.com" },
  3: { userId: 3, username: "carol", email: "carol@example.com" },
  4: { userId: 4, username: "dave", email: "dave@example.com" },
};

export const rooms: Room[] = [
  {
    id: 1,
    name: "general",
    description: "Town square. Say hi.",
    visibility: "PUBLIC",
    ownerId: 1,
    memberCount: 3,
    unreadCount: 0,
    createdAt: "2025-04-10T10:00:00Z",
  },
  {
    id: 2,
    name: "random",
    description: "Off-topic chatter.",
    visibility: "PUBLIC",
    ownerId: 1,
    memberCount: 2,
    unreadCount: 2,
    createdAt: "2025-04-11T10:00:00Z",
  },
  {
    id: 3,
    name: "dev",
    description: "Engineering only.",
    visibility: "PRIVATE",
    ownerId: 1,
    memberCount: 1,
    unreadCount: 0,
    createdAt: "2025-04-12T10:00:00Z",
  },
  {
    id: 4,
    name: null,
    description: null,
    visibility: "DM",
    ownerId: null,
    memberCount: 2,
    unreadCount: 1,
    createdAt: "2025-04-13T10:00:00Z",
  },
  {
    id: 5,
    name: "design-crit",
    description: "Critique each other's work.",
    visibility: "PUBLIC",
    ownerId: 2,
    memberCount: 12,
    unreadCount: 0,
    createdAt: "2025-04-14T10:00:00Z",
  },
  {
    id: 6,
    name: "music",
    description: "Share what you're listening to.",
    visibility: "PUBLIC",
    ownerId: 3,
    memberCount: 47,
    unreadCount: 0,
    createdAt: "2025-04-15T10:00:00Z",
  },
];

/** DM other-participant lookup (for DM display name resolution) */
export const dmCounterparts: Record<number, number> = {
  4: 2, // DM room 4 → other participant is bob
};

export const roomMembers: Record<number, Member[]> = {
  1: [
    { userId: 1, username: "alice", role: "ADMIN", presence: "ONLINE", joinedAt: "2025-04-10T10:00:00Z" },
    { userId: 2, username: "bob", role: "MEMBER", presence: "ONLINE", joinedAt: "2025-04-10T10:05:00Z" },
    { userId: 3, username: "carol", role: "MEMBER", presence: "OFFLINE", joinedAt: "2025-04-10T10:10:00Z" },
  ],
  2: [
    { userId: 1, username: "alice", role: "ADMIN", presence: "ONLINE", joinedAt: "2025-04-11T10:00:00Z" },
    { userId: 2, username: "bob", role: "MEMBER", presence: "ONLINE", joinedAt: "2025-04-11T10:05:00Z" },
  ],
  3: [
    { userId: 1, username: "alice", role: "ADMIN", presence: "ONLINE", joinedAt: "2025-04-12T10:00:00Z" },
  ],
  4: [
    { userId: 1, username: "alice", role: "MEMBER", presence: "ONLINE", joinedAt: "2025-04-13T10:00:00Z" },
    { userId: 2, username: "bob", role: "MEMBER", presence: "ONLINE", joinedAt: "2025-04-13T10:00:00Z" },
  ],
};

export const messages: Record<number, Message[]> = {
  1: [
    {
      id: 101,
      roomId: 1,
      sender: { userId: 2, username: "bob" },
      content: "Morning everyone — anyone up for coffee?",
      parentMessage: null,
      attachments: [],
      createdAt: "2025-04-18T08:01:00Z",
      editedAt: null,
      deleted: false,
      tempId: null,
    },
    {
      id: 102,
      roomId: 1,
      sender: { userId: 3, username: "carol" },
      content: "Sure, give me 10.",
      parentMessage: {
        id: 101,
        sender: { userId: 2, username: "bob" },
        content: "Morning everyone — anyone up for coffee?",
      },
      attachments: [],
      createdAt: "2025-04-18T08:03:00Z",
      editedAt: null,
      deleted: false,
      tempId: null,
    },
    {
      id: 103,
      roomId: 1,
      sender: { userId: 1, username: "alice" },
      content: "On my way ☕",
      parentMessage: null,
      attachments: [],
      createdAt: "2025-04-18T08:04:00Z",
      editedAt: "2025-04-18T08:05:00Z",
      deleted: false,
      tempId: null,
    },
    {
      id: 104,
      roomId: 1,
      sender: { userId: 2, username: "bob" },
      content: null,
      parentMessage: null,
      attachments: [],
      createdAt: "2025-04-18T08:06:00Z",
      editedAt: null,
      deleted: true,
      tempId: null,
    },
    {
      id: 105,
      roomId: 1,
      sender: { userId: 3, username: "carol" },
      content: "Here's the agenda for today",
      parentMessage: null,
      attachments: [
        {
          id: "att-1",
          originalFilename: "agenda.pdf",
          mimeType: "application/pdf",
          sizeBytes: 42_000,
        },
      ],
      createdAt: "2025-04-18T09:12:00Z",
      editedAt: null,
      deleted: false,
      tempId: null,
    },
    {
      id: 106,
      roomId: 1,
      sender: { userId: 1, username: "alice" },
      content: "Quick mockup of the landing hero — thoughts?",
      parentMessage: null,
      attachments: [
        {
          id: "att-2",
          originalFilename: "hero-mock.png",
          mimeType: "image/png",
          sizeBytes: 184_000,
        },
      ],
      createdAt: "2025-04-18T09:30:00Z",
      editedAt: null,
      deleted: false,
      tempId: null,
    },
  ],
  2: [
    {
      id: 201,
      roomId: 2,
      sender: { userId: 2, username: "bob" },
      content: "Anyone watching the game tonight?",
      parentMessage: null,
      attachments: [],
      createdAt: "2025-04-18T07:20:00Z",
      editedAt: null,
      deleted: false,
      tempId: null,
    },
    {
      id: 202,
      roomId: 2,
      sender: { userId: 1, username: "alice" },
      content: "Maybe — what time?",
      parentMessage: null,
      attachments: [],
      createdAt: "2025-04-18T07:22:00Z",
      editedAt: null,
      deleted: false,
      tempId: null,
    },
  ],
  3: [],
  4: [
    {
      id: 401,
      roomId: 4,
      sender: { userId: 2, username: "bob" },
      content: "hey, got a sec?",
      parentMessage: null,
      attachments: [],
      createdAt: "2025-04-18T11:00:00Z",
      editedAt: null,
      deleted: false,
      tempId: null,
    },
    {
      id: 402,
      roomId: 4,
      sender: { userId: 1, username: "alice" },
      content: "yeah what's up",
      parentMessage: null,
      attachments: [],
      createdAt: "2025-04-18T11:01:00Z",
      editedAt: null,
      deleted: false,
      tempId: null,
    },
  ],
};

export const friends: Friend[] = [
  { userId: 2, username: "bob", status: "ONLINE" },
  { userId: 3, username: "carol", status: "OFFLINE" },
  { userId: 4, username: "dave", status: "AFK" },
];

export const friendRequests: FriendRequest[] = [
  {
    id: 1,
    fromUserId: 3,
    fromUsername: "carol",
    toUserId: 1,
    toUsername: "alice",
    status: "PENDING",
    dmRoomId: null,
    direction: "INCOMING",
  },
];

export const sessions: Session[] = [
  {
    id: 1,
    browserInfo: "Chrome 124 · macOS",
    ip: "127.0.0.1",
    createdAt: "2025-04-18T09:00:00Z",
    current: true,
  },
  {
    id: 2,
    browserInfo: "Safari 17 · iPhone",
    ip: "10.0.0.5",
    createdAt: "2025-04-15T22:30:00Z",
    current: false,
  },
];

export const bans: Record<number, RoomBan[]> = {
  1: [],
  2: [
    {
      userId: 4,
      username: "dave",
      bannedBy: { id: 1, username: "alice" },
      createdAt: "2025-04-16T13:00:00Z",
    },
  ],
};

/** Display name for a room — resolves DM rooms to the other user's username */
export function roomDisplayName(room: { id: number; name: string | null; visibility: string }): string {
  if (room.name) return room.name;
  const otherId = dmCounterparts[room.id];
  if (otherId && users[otherId]) return users[otherId].username;
  return "Direct Message";
}

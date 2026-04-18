export type Visibility = "PUBLIC" | "PRIVATE" | "DM";
export type Presence = "ONLINE" | "AFK" | "OFFLINE";
export type Role = "MEMBER" | "ADMIN";

export interface User {
  userId: number;
  username: string;
  email?: string;
}

export interface Room {
  id: number;
  name: string | null;
  description: string | null;
  visibility: Visibility;
  ownerId: number | null;
  memberCount: number;
  unreadCount: number;
  createdAt: string;
}

export interface Attachment {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  /** Optional preview URL for image attachments (mock only) */
  previewUrl?: string;
}

export interface Message {
  id: number;
  roomId: number;
  sender: { userId: number; username: string } | null;
  content: string | null;
  parentMessage: {
    id: number;
    sender: { userId: number; username: string } | null;
    content: string | null;
  } | null;
  attachments: Attachment[];
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  tempId: string | null;
}

export interface Friend {
  userId: number;
  username: string;
  status: Presence;
}

export interface Member {
  userId: number;
  username: string;
  role: Role;
  presence: Presence;
  joinedAt: string;
}

export interface RoomBan {
  userId: number;
  username: string;
  bannedBy: { id: number; username: string } | null;
  createdAt: string;
}

export interface Session {
  id: number;
  browserInfo: string;
  ip: string;
  createdAt: string;
  current: boolean;
}

export interface FriendRequest {
  id: number;
  fromUserId: number;
  fromUsername: string;
  toUserId: number;
  toUsername: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  dmRoomId: number | null;
  direction: "INCOMING" | "OUTGOING";
}

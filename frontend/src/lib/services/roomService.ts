import { api } from "@/lib/api";

export interface MyRoomResponse {
  id: number;
  name: string | null;
  visibility: "PUBLIC" | "PRIVATE" | "DM";
  unreadCount: number;
  lastMessageAt: string | null;
  otherUserId: number | null;
  otherUsername: string | null;
}

export interface RoomResponse {
  id: number;
  name: string | null;
  description: string | null;
  visibility: "PUBLIC" | "PRIVATE" | "DM";
  ownerId: number | null;
  memberCount: number;
  unreadCount: number;
  createdAt: string;
}

export interface MemberResponse {
  userId: number;
  username: string;
  role: "MEMBER" | "ADMIN";
  joinedAt: string;
}

export function roomDisplayName(room: Pick<MyRoomResponse, "name" | "visibility" | "otherUsername">): string {
  if (room.name) return room.name;
  if (room.visibility === "DM" && room.otherUsername) return room.otherUsername;
  return "Direct Message";
}

export const roomService = {
  getMyRooms: () => api.get<MyRoomResponse[]>("/api/rooms/me"),

  listPublic: (q?: string) => {
    const params = q ? `?q=${encodeURIComponent(q)}` : "";
    return api.get<RoomResponse[]>(`/api/rooms${params}`);
  },

  getRoom: (id: number) => api.get<RoomResponse>(`/api/rooms/${id}`),

  createRoom: (data: { name: string; description?: string; visibility: "PUBLIC" | "PRIVATE" }) =>
    api.post<RoomResponse>("/api/rooms", data),

  joinRoom: (id: number) => api.post<void>(`/api/rooms/${id}/join`),

  leaveRoom: (id: number) => api.delete<void>(`/api/rooms/${id}/leave`),

  getMembers: (id: number) => api.get<MemberResponse[]>(`/api/rooms/${id}/members`),
};

import { api } from "@/lib/api";

export interface FriendResponse {
  userId: number;
  username: string;
  presence: string;
}

export interface FriendRequestItem {
  id: number;
  requester: { id: number; username: string };
  addressee: { id: number; username: string };
  status: "PENDING" | "ACCEPTED";
  createdAt: string;
  dmRoomId: number | null;
}

export const friendService = {
  getFriends: () => api.get<FriendResponse[]>("/api/friends"),

  getPending: () => api.get<FriendRequestItem[]>("/api/friends/requests"),

  sendRequest: (username: string) =>
    api.post<FriendRequestItem>("/api/friends/requests", { username }),

  respond: (id: number, action: "ACCEPT" | "REJECT") =>
    api.patch<FriendRequestItem>(`/api/friends/requests/${id}`, { action }),
};

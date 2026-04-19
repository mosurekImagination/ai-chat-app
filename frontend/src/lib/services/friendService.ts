import { api } from "@/lib/api";

export interface FriendResponse {
  userId: number;
  username: string;
  presence: string;
  dmRoomId: number | null;
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

  removeFriend: (friendId: number) => api.delete<void>(`/api/friends/${friendId}`),

  banUser: (userId: number) => api.post<void>(`/api/users/${userId}/ban`),
};

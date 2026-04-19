import { api } from "@/lib/api";
import type { Message } from "@/lib/types";

export const messageService = {
  getHistory: (roomId: number, params?: { before?: number; limit?: number }): Promise<Message[]> => {
    const q = new URLSearchParams();
    if (params?.before) q.set("before", String(params.before));
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString() ? `?${q}` : "";
    return api.get<Message[]>(`/api/messages/${roomId}${qs}`);
  },
};

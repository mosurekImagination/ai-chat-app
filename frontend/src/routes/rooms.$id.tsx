import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Hash, Lock, Info, UserPlus2, MessageSquare } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { MessageList } from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";
import { roomService, roomDisplayName } from "@/lib/services/roomService";
import { messageService } from "@/lib/services/messageService";
import { fileService } from "@/lib/services/fileService";
import { useAuth } from "@/contexts/AuthContext";
import { useStormp } from "@/contexts/StompContext";
import type { Message } from "@/lib/types";

export const Route = createFileRoute("/rooms/$id")({
  notFoundComponent: () => (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <h2 className="text-xl font-semibold text-foreground">Room not found</h2>
      <Button asChild className="mt-4"><Link to="/rooms">Back to rooms</Link></Button>
    </div>
  ),
  component: ChatPage,
});

function ChatPage() {
  const { id } = Route.useParams();
  const roomId = Number(id);
  const { user } = useAuth();
  const { subscribe, send } = useStormp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: room, isLoading } = useQuery({
    queryKey: ["room", roomId],
    queryFn: () => roomService.getRoom(roomId),
  });

  const { data: members = [] } = useQuery({
    queryKey: ["members", roomId],
    queryFn: () => roomService.getMembers(roomId),
    enabled: !!room,
  });

  const joinMutation = useMutation({
    mutationFn: () => roomService.joinRoom(roomId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myRooms"] });
      queryClient.invalidateQueries({ queryKey: ["members", roomId] });
    },
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // Load initial history on mount
  useEffect(() => {
    if (!room) return;
    messageService.getHistory(roomId).then((msgs) => {
      // API returns newest-first; reverse to oldest-first for display
      setMessages([...msgs].reverse());
    }).catch(() => {});
  }, [roomId, room]);

  // Subscribe to room STOMP topic
  useEffect(() => {
    const unsubscribe = subscribe(`/topic/room.${roomId}`, (frame) => {
      const event = JSON.parse(frame.body);

      if (event.message) {
        const msg: Message = event.message;
        if (event.type === "NEW") {
          setMessages((prev) => {
            // Deduplicate: if same tempId already exists, replace it
            if (msg.tempId) {
              const idx = prev.findIndex((m) => m.tempId === msg.tempId);
              if (idx !== -1) {
                const next = [...prev];
                next[idx] = msg;
                return next;
              }
            }
            return [...prev, msg];
          });
        } else if (event.type === "EDITED" || event.type === "DELETED") {
          setMessages((prev) => prev.map((m) => m.id === msg.id ? msg : m));
        }
      } else if (event.type === "DELETED" && event.roomId) {
        // Room was deleted
        queryClient.invalidateQueries({ queryKey: ["myRooms"] });
        navigate({ to: "/rooms" });
      }
    });
    return unsubscribe;
  }, [roomId, subscribe, navigate, queryClient]);

  const loadOlder = useCallback(async (beforeId: number): Promise<Message[]> => {
    const older = await messageService.getHistory(roomId, { before: beforeId });
    const chronological = [...older].reverse();
    if (chronological.length > 0) {
      setMessages((prev) => [...chronological, ...prev]);
    }
    return chronological;
  }, [roomId]);

  const handleSend = useCallback((content: string, attachmentId?: string) => {
    const tempId = crypto.randomUUID();
    const payload: Record<string, unknown> = { roomId, content, tempId };
    if (replyingTo) payload.parentMessageId = replyingTo.id;
    if (attachmentId) payload.attachmentId = attachmentId;
    send("/app/chat.send", payload);
    setReplyingTo(null);
  }, [roomId, replyingTo, send]);

  const handleEdit = useCallback((messageId: number, newContent: string) => {
    send("/app/chat.edit", { messageId, content: newContent });
  }, [send]);

  const handleDelete = useCallback((messageId: number) => {
    send("/app/chat.delete", { messageId });
  }, [send]);

  const handleUploadFile = useCallback(async (file: File): Promise<string | undefined> => {
    try {
      const resp = await fileService.upload(file, roomId);
      return resp.attachmentId;
    } catch {
      return undefined;
    }
  }, [roomId]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h2 className="text-xl font-semibold text-foreground">Room not found</h2>
        <Button asChild className="mt-4"><Link to="/rooms">Back to rooms</Link></Button>
      </div>
    );
  }

  const isMember = members.some((m) => m.userId === user?.userId);
  const isAdmin = members.some((m) => m.userId === user?.userId && m.role === "ADMIN");
  const displayName = roomDisplayName({ name: room.name, visibility: room.visibility, otherUsername: null });
  const VisibilityIcon = room.visibility === "PRIVATE" ? Lock : room.visibility === "DM" ? MessageSquare : Hash;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-chat px-4">
        <div className="flex min-w-0 items-center gap-2">
          <VisibilityIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h1 className="truncate text-base font-semibold text-foreground">{displayName}</h1>
          {room.description && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="truncate text-sm text-muted-foreground">{room.description}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!isMember && room.visibility === "PUBLIC" && (
            <Button size="sm" onClick={() => joinMutation.mutate()} disabled={joinMutation.isPending}>
              <UserPlus2 className="mr-1.5 h-3.5 w-3.5" />
              Join
            </Button>
          )}
          <Button size="icon" variant="ghost" aria-label="Room info">
            <Info className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <MessageList
        messages={messages}
        onReply={setReplyingTo}
        onEdit={handleEdit}
        onDelete={handleDelete}
        isAdmin={isAdmin}
        loadOlder={loadOlder}
        onEnter={() => {}}
      />
      <MessageInput
        roomName={`#${displayName}`}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onSend={handleSend}
        onUploadFile={handleUploadFile}
        disabled={!isMember}
        disabledReason={
          room.visibility === "PUBLIC"
            ? "Join this room to send messages."
            : "You are not a member of this room."
        }
      />
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { Hash, Lock, Info, Settings2, UserPlus2, MessageSquare } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { MessageList } from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";
import { roomService, roomDisplayName } from "@/lib/services/roomService";
import { useAuth } from "@/contexts/AuthContext";
import type { Message } from "@/lib/types";

export const Route = createFileRoute("/rooms/$id")({
  notFoundComponent: () => (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <h2 className="text-xl font-semibold text-foreground">Room not found</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This room doesn't exist or you don't have access.
      </p>
      <Button asChild className="mt-4">
        <Link to="/rooms">Back to rooms</Link>
      </Button>
    </div>
  ),
  component: ChatPage,
});

function ChatPage() {
  const { id } = Route.useParams();
  const roomId = Number(id);
  const { user } = useAuth();
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

  // Keep mock messages in state until F4 wires real messaging
  const [list, setList] = useState<Message[]>([]);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  const loadOlder = useCallback(async (_beforeId: number) => {
    return [] as Message[];
  }, []);

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
        <p className="mt-2 text-sm text-muted-foreground">
          This room doesn't exist or you don't have access.
        </p>
        <Button asChild className="mt-4">
          <Link to="/rooms">Back to rooms</Link>
        </Button>
      </div>
    );
  }

  const isMember = members.some((m) => m.userId === user?.userId);
  const isAdmin = members.some((m) => m.userId === user?.userId && m.role === "ADMIN");
  const displayName = roomDisplayName({ name: room.name, visibility: room.visibility, otherUsername: null });

  const VisibilityIcon = room.visibility === "PRIVATE" ? Lock : room.visibility === "DM" ? MessageSquare : Hash;

  const handleSend = (content: string) => {
    // TODO: F4 — wire to real STOMP messaging
    const newMsg: Message = {
      id: Date.now(),
      roomId,
      sender: user ? { userId: user.userId, username: user.username } : null,
      content,
      parentMessage: replyingTo
        ? { id: replyingTo.id, sender: replyingTo.sender, content: replyingTo.content }
        : null,
      attachments: [],
      createdAt: new Date().toISOString(),
      editedAt: null,
      deleted: false,
      tempId: crypto.randomUUID(),
    };
    setList((prev) => [...prev, newMsg]);
    setReplyingTo(null);
  };

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
            <Button
              size="sm"
              onClick={() => joinMutation.mutate()}
              disabled={joinMutation.isPending}
            >
              <UserPlus2 className="mr-1.5 h-3.5 w-3.5" />
              Join
            </Button>
          )}
          {isAdmin && room.visibility !== "DM" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate({ to: "/rooms" })}
            >
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              Manage
            </Button>
          )}
          <Button size="icon" variant="ghost" aria-label="Room info">
            <Info className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <MessageList
        messages={list}
        onReply={setReplyingTo}
        loadOlder={loadOlder}
        onEnter={() => {}}
      />
      <MessageInput
        roomName={`#${displayName}`}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onSend={handleSend}
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

import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Hash, Lock, Info, Settings2, UserPlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageList } from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";
import {
  rooms,
  messages as seededMessages,
  roomMembers,
  roomDisplayName,
  currentUser,
} from "@/lib/mockData";
import type { Message } from "@/lib/types";

/** Mock: generate a page of older messages before a given id. Returns [] after 3 pages. */
function makeOlderPage(roomId: number, beforeId: number, page: number): Message[] {
  if (page > 3) return [];
  const base = beforeId - 1;
  const senders = [
    { userId: 2, username: "bob" },
    { userId: 3, username: "carol" },
    { userId: 1, username: "alice" },
  ];
  const samples = [
    "earlier in the day…",
    "anyone remember what we decided?",
    "I'll dig up the link",
    "lol",
    "shipping the fix now",
    "back from lunch",
    "👀",
    "let's pair on this later",
  ];
  const out: Message[] = [];
  for (let i = 0; i < 20; i++) {
    const id = base - i;
    const minutesAgo = page * 60 + i * 3;
    out.push({
      id,
      roomId,
      sender: senders[(id + i) % senders.length],
      content: samples[(id + i) % samples.length],
      parentMessage: null,
      attachments: [],
      createdAt: new Date(Date.now() - minutesAgo * 60_000 - page * 3_600_000).toISOString(),
      editedAt: null,
      deleted: false,
      tempId: null,
    });
  }
  // Oldest first.
  return out.reverse();
}

export const Route = createFileRoute("/rooms/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Room — Relay` },
      { name: "description", content: `Chat in room ${params.id} on Relay.` },
    ],
  }),
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
  const room = rooms.find((r) => r.id === roomId);
  const initial = seededMessages[roomId] ?? [];

  const [list, setList] = useState<Message[]>(initial);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [pageCount, setPageCount] = useState(0);

  const loadOlder = useCallback(
    async (beforeId: number) => {
      // Simulate network latency.
      await new Promise((r) => setTimeout(r, 500));
      const next = pageCount + 1;
      const older = makeOlderPage(roomId, beforeId, next);
      if (older.length > 0) {
        setList((prev) => [...older, ...prev]);
        setPageCount(next);
      }
      return older;
    },
    [pageCount, roomId],
  );

  const handleEnter = useCallback(() => {
    // Simulates POST /api/rooms/:id/read — clears unread cursor optimistically.
    if (room) room.unreadCount = 0;
  }, [room]);


  const members = roomMembers[roomId] ?? [];
  const isMember = members.some((m) => m.userId === currentUser.userId);
  const isAdmin = members.some(
    (m) => m.userId === currentUser.userId && m.role === "ADMIN",
  );

  const displayName = useMemo(
    () => (room ? roomDisplayName(room) : `room ${id}`),
    [room, id],
  );

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

  const VisibilityIcon = room.visibility === "PRIVATE" ? Lock : Hash;

  const handleSend = (content: string) => {
    const newMsg: Message = {
      id: Date.now(),
      roomId,
      sender: { userId: currentUser.userId, username: currentUser.username },
      content,
      parentMessage: replyingTo
        ? {
            id: replyingTo.id,
            sender: replyingTo.sender,
            content: replyingTo.content,
          }
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
      {/* Room header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-chat px-4">
        <div className="flex min-w-0 items-center gap-2">
          <VisibilityIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h1 className="truncate text-base font-semibold text-foreground">
            {displayName}
          </h1>
          {room.description && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="truncate text-sm text-muted-foreground">{room.description}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!isMember && room.visibility === "PUBLIC" && (
            <Button size="sm">
              <UserPlus2 className="mr-1.5 h-3.5 w-3.5" />
              Join
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" variant="ghost">
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
        onEnter={handleEnter}
      />
      <MessageInput
        roomName={`#${displayName}`}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onSend={handleSend}
        disabled={!isMember}
        disabledReason="Join this room to send messages."
      />
    </div>
  );
}

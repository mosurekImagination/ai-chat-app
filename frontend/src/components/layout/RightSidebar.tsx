import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, Hash, Lock, MessageSquare, Plus, Search, UserPlus, UserMinus, ShieldOff } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { roomService, roomDisplayName } from "@/lib/services/roomService";
import type { MyRoomResponse } from "@/lib/services/roomService";
import { friendService } from "@/lib/services/friendService";
import type { FriendResponse } from "@/lib/services/friendService";
import { PresenceDot } from "@/components/common/PresenceDot";
import { useStormp } from "@/contexts/StompContext";
import { MembersPanel } from "./MembersPanel";

interface RightSidebarProps {
  onCreateRoom: () => void;
  onAddFriend: (username?: string) => void;
  onManageRoom: () => void;
}

export function RightSidebar({ onCreateRoom, onAddFriend, onManageRoom }: RightSidebarProps) {
  const params = useParams({ strict: false });
  const activeRoomId = (params as { id?: string }).id ? Number((params as { id?: string }).id) : null;
  const inRoom = activeRoomId !== null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [roomsOpen, setRoomsOpen] = useState(!inRoom);
  const [contactsOpen, setContactsOpen] = useState(!inRoom);

  useEffect(() => {
    setRoomsOpen(!inRoom);
    setContactsOpen(!inRoom);
  }, [inRoom]);

  const [roomSearch, setRoomSearch] = useState("");
  const { getPresence, seedPresence } = useStormp();
  const seededRef = useRef<Set<number>>(new Set());

  const { data: myRooms = [] } = useQuery({
    queryKey: ["myRooms"],
    queryFn: roomService.getMyRooms,
  });

  const { data: friends = [] } = useQuery({
    queryKey: ["friends"],
    queryFn: friendService.getFriends,
  });

  const { data: pendingRequests = [] } = useQuery({
    queryKey: ["pendingRequests"],
    queryFn: friendService.getPending,
    refetchInterval: 15_000,
  });

  // Incoming requests (where current user is the addressee)
  const incomingRequests = pendingRequests.filter((r) => r.status === "PENDING");

  const respondMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "ACCEPT" | "REJECT" }) =>
      friendService.respond(id, action),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["pendingRequests"] });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      queryClient.invalidateQueries({ queryKey: ["myRooms"] });
      if (data.dmRoomId) {
        navigate({ to: "/rooms/$id", params: { id: String(data.dmRoomId) } });
      }
    },
  });

  const removeFriendMutation = useMutation({
    mutationFn: (friendId: number) => friendService.removeFriend(friendId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["friends"] }),
  });

  const banFriendMutation = useMutation({
    mutationFn: (userId: number) => friendService.banUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      queryClient.invalidateQueries({ queryKey: ["myRooms"] });
    },
  });

  // Seed initial presence from API (overwritten by STOMP events)
  useEffect(() => {
    friends.forEach((f) => {
      if (!seededRef.current.has(f.userId)) {
        seededRef.current.add(f.userId);
        seedPresence(f.userId, f.presence);
      }
    });
  }, [friends, seedPresence]);

  const q = roomSearch.toLowerCase();
  const filteredRooms = q
    ? myRooms.filter((r) => roomDisplayName(r).toLowerCase().includes(q))
    : myRooms;

  const publicRooms = filteredRooms.filter((r) => r.visibility === "PUBLIC");
  const privateRooms = filteredRooms.filter((r) => r.visibility === "PRIVATE");
  const dmRooms = filteredRooms.filter((r) => r.visibility === "DM");

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-l border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {/* ROOMS */}
        <Section
          title="Rooms"
          open={roomsOpen}
          onToggle={() => setRoomsOpen((v) => !v)}
          action={
            <button
              onClick={(e) => { e.stopPropagation(); onCreateRoom(); }}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Create room"
            >
              <Plus className="h-4 w-4" />
            </button>
          }
        >
          {roomsOpen && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={roomSearch}
                  onChange={(e) => setRoomSearch(e.target.value)}
                  placeholder="Search rooms…"
                  className="h-7 pl-8 text-xs"
                  aria-label="Search rooms"
                />
              </div>
              <RoomGroup label="Public">
                {publicRooms.length === 0 ? (
                  <EmptyHint text="No public rooms" />
                ) : (
                  publicRooms.map((r) => (
                    <RoomLink key={r.id} room={r} icon={<Hash className="h-3.5 w-3.5" />} active={activeRoomId === r.id} />
                  ))
                )}
              </RoomGroup>
              <RoomGroup label="Private">
                {privateRooms.length === 0 ? (
                  <EmptyHint text="No private rooms" />
                ) : (
                  privateRooms.map((r) => (
                    <RoomLink key={r.id} room={r} icon={<Lock className="h-3.5 w-3.5" />} active={activeRoomId === r.id} />
                  ))
                )}
              </RoomGroup>
              <RoomGroup label="Direct Messages">
                {dmRooms.length === 0 ? (
                  <EmptyHint text="No DMs yet" />
                ) : (
                  dmRooms.map((r) => (
                    <RoomLink key={r.id} room={r} icon={<MessageSquare className="h-3.5 w-3.5" />} active={activeRoomId === r.id} />
                  ))
                )}
              </RoomGroup>
            </div>
          )}
        </Section>

        {/* CONTACTS */}
        <Section
          title={incomingRequests.length > 0 ? `Contacts (${incomingRequests.length} pending)` : "Contacts"}
          open={contactsOpen}
          onToggle={() => setContactsOpen((v) => !v)}
          action={
            <button
              onClick={(e) => { e.stopPropagation(); onAddFriend(); }}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Add friend"
            >
              <UserPlus className="h-4 w-4" />
            </button>
          }
        >
          {contactsOpen && (
            <div className="space-y-0.5">
              {/* Pending incoming requests */}
              {incomingRequests.map((req) => (
                <div
                  key={req.id}
                  className="rounded-md border border-border bg-card/50 px-2 py-2 text-xs"
                  aria-label={`Friend request from ${req.requester.username}`}
                >
                  <div className="mb-1.5 font-medium">{req.requester.username} wants to be friends</div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      className="h-6 flex-1 px-2 text-[11px]"
                      onClick={() => respondMutation.mutate({ id: req.id, action: "ACCEPT" })}
                      disabled={respondMutation.isPending}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 flex-1 px-2 text-[11px]"
                      onClick={() => respondMutation.mutate({ id: req.id, action: "REJECT" })}
                      disabled={respondMutation.isPending}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
              {/* Friends list */}
              {friends.length === 0 && incomingRequests.length === 0 ? (
                <EmptyHint text="No friends yet. Send a friend request." />
              ) : (
                friends.map((f) => (
                  <FriendLink
                    key={f.userId}
                    friend={f}
                    presence={getPresence(f.userId)}
                    onRemove={() => removeFriendMutation.mutate(f.userId)}
                    onBan={() => banFriendMutation.mutate(f.userId)}
                  />
                ))
              )}
            </div>
          )}
        </Section>

        {/* MEMBERS — only when in a room */}
        {inRoom && (
          <div className="border-t border-sidebar-border">
            <MembersPanel roomId={activeRoomId!} onManage={onManageRoom} onAddFriend={onAddFriend} />
          </div>
        )}
      </div>
    </aside>
  );
}

function Section({
  title, open, onToggle, action, children,
}: {
  title: string; open: boolean; onToggle: () => void; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="border-b border-sidebar-border px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={onToggle}
          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {title}
        </button>
        {action}
      </div>
      {children}
    </div>
  );
}

function RoomGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function RoomLink({ room, icon, active }: { room: MyRoomResponse; icon: React.ReactNode; active: boolean }) {
  const name = roomDisplayName(room);
  return (
    <Link
      to="/rooms/$id"
      params={{ id: String(room.id) }}
      className={cn(
        "flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors",
        active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1 truncate">{name}</span>
      {room.unreadCount > 0 && (
        <span className="min-w-[1.25rem] rounded-full bg-destructive px-1.5 text-center text-[10px] font-semibold leading-5 text-destructive-foreground">
          {room.unreadCount}
        </span>
      )}
    </Link>
  );
}

function FriendLink({
  friend, presence, onRemove, onBan,
}: {
  friend: FriendResponse; presence: string; onRemove: () => void; onBan: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div
      className="group flex items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent"
    >
      <PresenceDot status={presence as import("@/lib/types").Presence} />
      <span
        className={cn("flex-1 truncate", friend.dmRoomId && "cursor-pointer hover:text-foreground")}
        onClick={() => friend.dmRoomId && navigate({ to: "/rooms/$id", params: { id: String(friend.dmRoomId) } })}
      >
        {friend.username}
      </span>
      <div className="hidden gap-0.5 group-hover:flex">
        <button
          onClick={onRemove}
          className="rounded p-0.5 hover:bg-destructive/20 hover:text-destructive"
          aria-label={`Remove friend ${friend.username}`}
          title="Remove friend"
        >
          <UserMinus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onBan}
          className="rounded p-0.5 hover:bg-destructive/20 hover:text-destructive"
          aria-label={`Ban ${friend.username}`}
          title="Ban user"
        >
          <ShieldOff className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="px-2 py-1 text-xs italic text-muted-foreground">{text}</div>;
}

export { Button, PresenceDot };

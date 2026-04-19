import { Link, useParams } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Hash, Lock, MessageSquare, Plus, Search, UserPlus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { roomService, roomDisplayName } from "@/lib/services/roomService";
import type { MyRoomResponse } from "@/lib/services/roomService";
import { PresenceDot } from "@/components/common/PresenceDot";
import { MembersPanel } from "./MembersPanel";

interface RightSidebarProps {
  onCreateRoom: () => void;
  onAddFriend: () => void;
  onManageRoom: () => void;
}

export function RightSidebar({ onCreateRoom, onAddFriend, onManageRoom }: RightSidebarProps) {
  const params = useParams({ strict: false });
  const activeRoomId = (params as { id?: string }).id ? Number((params as { id?: string }).id) : null;
  const inRoom = activeRoomId !== null;

  const [roomsOpen, setRoomsOpen] = useState(!inRoom);
  const [contactsOpen, setContactsOpen] = useState(!inRoom);

  useEffect(() => {
    setRoomsOpen(!inRoom);
    setContactsOpen(!inRoom);
  }, [inRoom]);

  const [roomSearch, setRoomSearch] = useState("");

  const { data: myRooms = [] } = useQuery({
    queryKey: ["myRooms"],
    queryFn: roomService.getMyRooms,
  });

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
              onClick={(e) => {
                e.stopPropagation();
                onCreateRoom();
              }}
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
                    <RoomLink
                      key={r.id}
                      room={r}
                      icon={<Hash className="h-3.5 w-3.5" />}
                      active={activeRoomId === r.id}
                    />
                  ))
                )}
              </RoomGroup>
              <RoomGroup label="Private">
                {privateRooms.length === 0 ? (
                  <EmptyHint text="No private rooms" />
                ) : (
                  privateRooms.map((r) => (
                    <RoomLink
                      key={r.id}
                      room={r}
                      icon={<Lock className="h-3.5 w-3.5" />}
                      active={activeRoomId === r.id}
                    />
                  ))
                )}
              </RoomGroup>
              <RoomGroup label="Direct Messages">
                {dmRooms.length === 0 ? (
                  <EmptyHint text="No DMs yet" />
                ) : (
                  dmRooms.map((r) => (
                    <RoomLink
                      key={r.id}
                      room={r}
                      icon={<MessageSquare className="h-3.5 w-3.5" />}
                      active={activeRoomId === r.id}
                    />
                  ))
                )}
              </RoomGroup>
            </div>
          )}
        </Section>

        {/* CONTACTS */}
        <Section
          title="Contacts"
          open={contactsOpen}
          onToggle={() => setContactsOpen((v) => !v)}
          action={
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddFriend();
              }}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Add friend"
            >
              <UserPlus className="h-4 w-4" />
            </button>
          }
        >
          {contactsOpen && (
            <div className="space-y-0.5">
              <EmptyHint text="No friends yet. Send a friend request." />
            </div>
          )}
        </Section>

        {/* MEMBERS — only when in a room */}
        {inRoom && (
          <div className="border-t border-sidebar-border">
            <MembersPanel roomId={activeRoomId!} onManage={onManageRoom} />
          </div>
        )}
      </div>
    </aside>
  );
}

function Section({
  title,
  open,
  onToggle,
  action,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
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
        active
          ? "bg-primary/15 text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
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

function EmptyHint({ text }: { text: string }) {
  return <div className="px-2 py-1 text-xs italic text-muted-foreground">{text}</div>;
}

export { Button, PresenceDot };

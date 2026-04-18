import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { roomMembers, rooms, currentUser } from "@/lib/mockData";
import { PresenceDot } from "@/components/common/PresenceDot";
import { Badge } from "@/components/ui/badge";

interface MembersPanelProps {
  roomId: number;
  onManage: () => void;
}

export function MembersPanel({ roomId, onManage }: MembersPanelProps) {
  const members = roomMembers[roomId] ?? [];
  const room = rooms.find((r) => r.id === roomId);
  const isOwnerOrAdmin = members.some(
    (m) => m.userId === currentUser.userId && m.role === "ADMIN",
  );

  return (
    <div className="px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Members — {members.length}
        </span>
        {room && isOwnerOrAdmin && room.visibility !== "DM" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={onManage}
          >
            <Settings2 className="mr-1 h-3.5 w-3.5" />
            Manage
          </Button>
        )}
      </div>
      <div className="space-y-0.5">
        {members.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs italic text-muted-foreground">
            No members.
          </div>
        ) : (
          members.map((m) => (
            <div
              key={m.userId}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors hover:bg-accent"
            >
              <PresenceDot status={m.presence} />
              <span className="flex-1 truncate">{m.username}</span>
              {m.role === "ADMIN" && (
                <Badge
                  variant="outline"
                  className="h-4 border-primary/40 px-1 text-[9px] uppercase text-primary"
                >
                  Admin
                </Badge>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
